import * as cron from "node-cron";
import type { Pool } from "pg";
import { withTx } from "./db";
import { emit } from "./outbox";
import { addDays, toLocalDate } from "./clock";
import type { Dispatcher } from "./dispatcher";
import { logError, log } from "./logger";

/** The week the Friday booking targets: the day after the Friday it fires on,
 *  matching the original job's window (Sat..Fri). */
export function bookingWeekOf(now: Date): string {
  return addDays(toLocalDate(now), 1);
}

/** Register the cron schedules. Each callback ONLY emits a command — the
 *  dispatcher runs the actual work. Cron is an event source, nothing more. */
export function startCron(
  pool: Pool,
  dispatcher: Pick<Dispatcher, "wake">,
  standby: { isWatching(): boolean }
): void {
  cron.schedule(
    "0 21 * * 5",
    () => {
      const weekOf = bookingWeekOf(new Date());
      log("cron", `Booking trigger -> BookingRequested ${weekOf}`);
      withTx(pool, (tx) => emit(tx, "BookingRequested", { weekOf }))
        .then(() => dispatcher.wake())
        .catch((e) => logError("cron", "failed to emit BookingRequested:", e));
    },
    { timezone: "Asia/Jerusalem" }
  );

  // Standby checks exist only to catch a spot opening up, and Arbox gives a
  // 30-minute window to confirm one (docs/api.md), so 10 minutes leaves room
  // for three attempts. With nothing on a waitlist this costs no query at all,
  // which is what lets the database scale to zero between bookings.
  cron.schedule("*/10 * * * *", () => {
    if (!standby.isWatching()) return;
    withTx(pool, (tx) => emit(tx, "StandbyTickRequested", {}))
      .then(() => dispatcher.wake())
      .catch((e) =>
        logError("cron", "failed to emit StandbyTickRequested:", e)
      );
  });
}
