import * as cron from "node-cron";
import type { Pool } from "pg";
import { withTx } from "./db";
import { emit } from "./outbox";
import { addDays, toLocalDate } from "./clock";
import { logError, log } from "./logger";

/** The week the Friday booking targets: the day after the Friday it fires on,
 *  matching the original job's window (Sat..Fri). */
export function bookingWeekOf(now: Date): string {
  return addDays(toLocalDate(now), 1);
}

/** Register the cron schedules. Each callback ONLY emits a command — the
 *  dispatcher runs the actual work. Cron is an event source, nothing more. */
export function startCron(pool: Pool): void {
  cron.schedule(
    "0 21 * * 5",
    () => {
      const weekOf = bookingWeekOf(new Date());
      log("cron", `Booking trigger -> BookingRequested ${weekOf}`);
      withTx(pool, (tx) => emit(tx, "BookingRequested", { weekOf })).catch(
        (e) => logError("cron", "failed to emit BookingRequested:", e)
      );
    },
    { timezone: "Asia/Jerusalem" }
  );

  cron.schedule("*/5 * * * *", () => {
    withTx(pool, (tx) => emit(tx, "StandbyTickRequested", {})).catch((e) =>
      logError("cron", "failed to emit StandbyTickRequested:", e)
    );
  });
}
