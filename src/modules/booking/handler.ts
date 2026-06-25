import type { Pool } from "pg";
import { withTx } from "../../platform/db";
import { emit } from "../../platform/outbox";
import { addDays } from "../../platform/clock";
import { log } from "../../platform/logger";
import type { Config } from "../../platform/config";
import type { BookingOutcome } from "../../platform/events";
import type { ArboxClient } from "../arbox/client";
import { acquireLease, completeLease, releaseLease } from "../arbox/effects";
import { buildCancelUrl } from "../cancellation/tokens";
import { decide } from "./service";
import { ensureRun, recordLesson, finishRun } from "./repo";

export interface Booking {
  handleBookingRequested(weekOf: string): Promise<void>;
}

type BookingConfig = Pick<
  Config,
  "primarySeriesIds" | "secondarySeriesIds" | "cancelSecret" | "baseUrl"
>;

export function createBooking(deps: {
  pool: Pool;
  client: ArboxClient;
  config: BookingConfig;
}): Booking {
  const { pool, client, config } = deps;

  async function handleBookingRequested(weekOf: string): Promise<void> {
    const items = await client.getWeekSchedule(weekOf, addDays(weekOf, 6));
    const intents = decide(
      items,
      config.primarySeriesIds,
      config.secondarySeriesIds
    );
    const runId = await ensureRun(pool, weekOf);
    const outcomes: BookingOutcome[] = [];

    for (const intent of intents) {
      const key = {
        effectType:
          intent.action === "book"
            ? ("book" as const)
            : ("standby-join" as const),
        scheduleId: intent.scheduleId,
        forDate: intent.date,
        attemptKey: weekOf,
      };
      // Already handled by a prior run (the lease is the gate) -> skip.
      if (!(await acquireLease(pool, key))) continue;

      try {
        if (intent.action === "book") await client.bookSlot(intent.scheduleId);
        else await client.joinStandby(intent.scheduleId);
      } catch (err) {
        await releaseLease(pool, key); // no effect happened -> allow retry
        log(
          "booking",
          `${intent.action} failed for series ${intent.seriesId} on ${intent.date}:`,
          err instanceof Error ? err.message : err
        );
        continue;
      }

      // Lease completion + audit + the fact emit commit together.
      await withTx(pool, async (tx) => {
        await completeLease(tx, key);
        await recordLesson(tx, runId, intent);
        if (intent.action === "book") {
          await emit(tx, "LessonBooked", {
            scheduleId: intent.scheduleId,
            seriesId: intent.seriesId,
            date: intent.date,
            className: intent.className,
            time: intent.time,
            endTime: intent.endTime,
            coachName: intent.coachName,
          });
        } else {
          await emit(tx, "StandbyJoined", {
            scheduleId: intent.scheduleId,
            seriesId: intent.seriesId,
            date: intent.date,
            className: intent.className,
            time: intent.time,
            endTime: intent.endTime,
            position: intent.position,
          });
        }
      });

      if (intent.action === "book") {
        outcomes.push({
          className: intent.className,
          coachName: intent.coachName,
          date: intent.date,
          time: intent.time,
          endTime: intent.endTime,
          status: "booked",
          cancelUrl: buildCancelUrl(intent.scheduleId, intent.date, config),
        });
      } else {
        outcomes.push({
          className: intent.className,
          coachName: intent.coachName,
          date: intent.date,
          time: intent.time,
          endTime: intent.endTime,
          status: "standby",
          standbyPosition: intent.position,
        });
      }
    }

    await finishRun(pool, runId, outcomes.length);
    await withTx(pool, (tx) =>
      emit(tx, "BookingSessionCompleted", { weekOf, outcomes })
    );
  }

  return { handleBookingRequested };
}
