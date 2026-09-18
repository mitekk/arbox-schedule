import type { Pool } from "pg";
import { withTx } from "../../platform/db";
import { emit } from "../../platform/outbox";
import { toLocalDate } from "../../platform/clock";
import { log } from "../../platform/logger";
import type { Routes } from "../../platform/events";
import type { ArboxClient } from "../arbox/client";
import { acquireLease, completeLease, releaseLease } from "../arbox/effects";
import {
  listWatching,
  listAll,
  upsertWatch,
  setStatus,
  type WatchEntry,
} from "./repo";
import { classify, hasEnded } from "./service";

export interface SyncResult {
  added: WatchEntry[];
  tracked: WatchEntry[];
}

export interface Standby {
  /** Confirm/expire/lose watched standby entries. Serialized by an advisory
   *  lock so two overlapping ticks can't double-confirm. */
  handleStandbyTick(): Promise<void>;
  /** Discover the user's current Arbox waitlist entries and register untracked
   *  ones. Synchronous (the gateway returns the result). */
  handleStandbySync(): Promise<SyncResult>;
  /** True while at least one entry may still be on a waitlist. Answered from
   *  memory so that a cron tick with nothing to watch costs no query at all. */
  isWatching(): boolean;
  /** Consumes StandbyJoined (booking joined a waitlist) -> writes watch row. */
  routes(): Routes;
}

export function createStandby(deps: {
  pool: Pool;
  client: ArboxClient;
}): Standby {
  const { pool, client } = deps;

  // Start optimistic: a wrong guess here costs one extra tick after a restart,
  // never a missed spot. The first tick replaces it with the truth.
  let watching = true;

  /** Returns whether the entry is still live and worth checking again. */
  async function processEntry(entry: WatchEntry, now: Date): Promise<boolean> {
    // Over before any network call (mirrors the original behavior).
    if (hasEnded(entry, now)) {
      await withTx(pool, async (tx) => {
        await setStatus(tx, entry.scheduleId, "expired");
        await emit(tx, "StandbyExpired", {
          scheduleId: entry.scheduleId,
          seriesId: entry.seriesId,
          date: entry.date,
        });
      });
      return false;
    }

    const items = await client.getDaySchedule(entry.date);
    const item = items.find((i) => i.id === entry.scheduleId);
    const decision = classify(entry, now, item);

    if (decision.kind === "gone" || decision.kind === "waiting") {
      if (decision.kind === "waiting") {
        log(
          "standby",
          `Still waiting for series ${entry.seriesId} on ${entry.date}`
        );
      }
      return true;
    }

    if (decision.kind === "expired") {
      await withTx(pool, async (tx) => {
        await setStatus(tx, entry.scheduleId, "expired");
        await emit(tx, "StandbyExpired", {
          scheduleId: entry.scheduleId,
          seriesId: entry.seriesId,
          date: entry.date,
        });
      });
      return false;
    }

    if (decision.kind === "lost") {
      await withTx(pool, async (tx) => {
        await setStatus(tx, entry.scheduleId, "lost");
        await emit(tx, "StandbyLost", {
          scheduleId: entry.scheduleId,
          seriesId: entry.seriesId,
          date: entry.date,
        });
      });
      return false;
    }

    // decision.kind === "confirm": a slot opened.
    const key = {
      effectType: "confirm" as const,
      scheduleId: entry.scheduleId,
      forDate: entry.date,
    };
    // Another path owns it; stay live so its outcome is picked up next tick.
    if (!(await acquireLease(pool, key))) return true;
    try {
      await client.bookSlot(entry.scheduleId, {
        availabilityId: decision.availabilityId,
      });
    } catch (err) {
      // availability may have expired — release so the next tick retries.
      await releaseLease(pool, key);
      log(
        "standby",
        `Confirm failed for series ${entry.seriesId} on ${entry.date}, retrying next cycle:`,
        err instanceof Error ? err.message : err
      );
      return true;
    }
    await completeLease(pool, key);
    await withTx(pool, async (tx) => {
      await setStatus(tx, entry.scheduleId, "confirmed");
      await emit(tx, "StandbyConfirmed", {
        scheduleId: entry.scheduleId,
        seriesId: entry.seriesId,
        date: entry.date,
        className: entry.className,
        time: entry.time,
        endTime: entry.endTime,
      });
    });
    return false;
  }

  async function handleStandbyTick(): Promise<void> {
    const lock = await pool.connect();
    try {
      await lock.query("BEGIN");
      const { rows } = await lock.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_xact_lock(hashtext('standby-tick')) AS locked"
      );
      if (!rows[0].locked) {
        await lock.query("ROLLBACK");
        return; // a tick is already running
      }
      const entries = await listWatching(pool);
      const now = new Date();
      let live = 0;
      for (const entry of entries) {
        if (await processEntry(entry, now)) live++;
      }
      // The tick has just seen the whole watchlist — no extra query needed to
      // know whether the next cron fire has anything to do.
      watching = live > 0;
      await lock.query("COMMIT");
    } catch (err) {
      try {
        await lock.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw err;
    } finally {
      lock.release();
    }
  }

  async function handleStandbySync(): Promise<SyncResult> {
    const from = toLocalDate(new Date());
    const end = new Date();
    end.setDate(end.getDate() + 14);
    const to = toLocalDate(end);

    const items = await client.getWeekSchedule(from, to);
    const added: WatchEntry[] = [];
    for (const item of items) {
      if (item.user_in_standby == null || item.user_booked != null) continue;
      const entry = {
        scheduleId: item.id,
        seriesId: item.series_fk,
        date: item.date,
        className: item.box_categories.name,
        time: item.time,
        endTime: item.end_time,
      };
      if (await upsertWatch(pool, entry)) {
        added.push({ ...entry, status: "watching" });
      }
    }
    const tracked = await listAll(pool);
    watching = tracked.some((e) => e.status === "watching");
    return { added, tracked };
  }

  function routes(): Routes {
    return {
      StandbyJoined: [
        {
          consumer: "standby",
          handle: async (m) => {
            if (m.name !== "StandbyJoined") return;
            const added = await upsertWatch(pool, {
              scheduleId: m.payload.scheduleId,
              seriesId: m.payload.seriesId,
              date: m.payload.date,
              className: m.payload.className,
              time: m.payload.time,
              endTime: m.payload.endTime,
            });
            if (added) watching = true;
          },
        },
      ],
    };
  }

  return {
    handleStandbyTick,
    handleStandbySync,
    isWatching: () => watching,
    routes,
  };
}
