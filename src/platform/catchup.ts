import type { Pool } from "pg";
import { withTx } from "./db";
import { emit } from "./outbox";
import { addDays, toLocalDate } from "./clock";
import { hasRun } from "../modules/booking/repo";
import { log } from "./logger";

/** Most recent Friday (local) at 00:00 on or before `now`. */
export function mostRecentFriday(now: Date): Date {
  const d = new Date(now);
  const daysSinceFriday = (d.getDay() - 5 + 7) % 7; // Fri = 5
  d.setDate(d.getDate() - daysSinceFriday);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** The weekOf the most recent Friday booking targets (Friday + 1). */
export function catchupWeekOf(now: Date): string {
  return addDays(toLocalDate(mostRecentFriday(now)), 1);
}

/** True only within the booking weekend: Fri after 21:00, Sat, or Sun. */
export function isCatchupDue(now: Date): boolean {
  const friday = mostRecentFriday(now);
  const daysSince = Math.floor((now.getTime() - friday.getTime()) / 86_400_000);
  if (daysSince > 2) return false;
  if (daysSince === 0) return now.getHours() >= 21;
  return true;
}

/**
 * node-cron is in-memory wall-clock, so a redeploy across Friday 21:00 would
 * silently skip the weekly booking. On boot, if we're within the booking
 * weekend and no run exists for that week, emit BookingRequested.
 * booking_run.week_of UNIQUE + the effect-lease make a double catch-up harmless.
 * (Server-local time; the ~2-day window absorbs the offset vs Asia/Jerusalem.)
 */
export async function runStartupCatchup(pool: Pool): Promise<void> {
  const now = new Date();
  if (!isCatchupDue(now)) return;

  const weekOf = catchupWeekOf(now);
  if (await hasRun(pool, weekOf)) return;

  await withTx(pool, (tx) => emit(tx, "BookingRequested", { weekOf }));
  log("catchup", `Missed Friday booking -> emitted BookingRequested ${weekOf}`);
}
