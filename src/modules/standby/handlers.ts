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
import { classify } from "./service";

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
  /** Consumes StandbyJoined (booking joined a waitlist) -> writes watch row. */
  routes(): Routes;
}

export function createStandby(deps: {
  pool: Pool;
  client: ArboxClient;
}): Standby {
  const { pool, client } = deps;

  async function processEntry(entry: WatchEntry, today: string): Promise<void> {
    // Expired before any network call (mirrors the original behavior).
    if (entry.date < today) {
      await withTx(pool, async (tx) => {
        await setStatus(tx, entry.scheduleId, "expired");
        await emit(tx, "StandbyExpired", {
          scheduleId: entry.scheduleId,
          seriesId: entry.seriesId,
          date: entry.date,
        });
      });
      return;
    }

    const items = await client.getDaySchedule(entry.date);
    const item = items.find((i) => i.id === entry.scheduleId);
    const decision = classify(entry, today, item);

    if (decision.kind === "gone" || decision.kind === "waiting") {
      if (decision.kind === "waiting") {
        log(
          "standby",
          `Still waiting for series ${entry.seriesId} on ${entry.date}`
        );
      }
      return;
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
      return;
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
      return;
    }

    // decision.kind === "confirm": a slot opened.
    const key = {
      effectType: "confirm" as const,
      scheduleId: entry.scheduleId,
      forDate: entry.date,
    };
    if (!(await acquireLease(pool, key))) return; // another path owns it
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
      return;
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
      const today = toLocalDate(new Date());
      for (const entry of entries) {
        await processEntry(entry, today);
      }
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
    return { added, tracked: await listAll(pool) };
  }

  function routes(): Routes {
    return {
      StandbyJoined: [
        {
          consumer: "standby",
          handle: async (m) => {
            if (m.name !== "StandbyJoined") return;
            await upsertWatch(pool, {
              scheduleId: m.payload.scheduleId,
              seriesId: m.payload.seriesId,
              date: m.payload.date,
              className: m.payload.className,
              time: m.payload.time,
              endTime: m.payload.endTime,
            });
          },
        },
      ],
    };
  }

  return { handleStandbyTick, handleStandbySync, routes };
}
