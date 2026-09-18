import type { ScheduleItem } from "../../../api/types/schedule";
import { toLocalDate } from "../../platform/clock";
import type { WatchEntry } from "./repo";

export type StandbyDecision =
  | { kind: "expired" }
  | { kind: "gone" } // not in the day's schedule — leave watching
  | { kind: "confirm"; availabilityId: number }
  | { kind: "lost" }
  | { kind: "waiting" };

/** `date` + `endTime` as a local Date, or null when the row carries no usable
 *  time — `end_time` is nullable and arrives as either "09:00" or "09:00:00". */
function classEnd(entry: WatchEntry): Date | null {
  if (!entry.endTime) return null;
  const [y, mo, d] = entry.date.split("-").map(Number);
  const [h, mi] = entry.endTime.split(":").map(Number);
  if ([y, mo, d, h, mi].some(Number.isNaN)) return null;
  return new Date(y, mo - 1, d, h, mi);
}

/**
 * True once the class is over and there is nothing left to win from it.
 * Falls back to the calendar date when the row has no end time.
 *
 * Server-local, like the rest of the date handling here (see `runStartupCatchup`).
 * The container runs UTC and the gym is Asia/Jerusalem (UTC+2/+3), so a stale
 * entry is retired a few hours late rather than early — it over-polls slightly
 * instead of abandoning a spot that could still open.
 */
export function hasEnded(entry: WatchEntry, now: Date): boolean {
  const end = classEnd(entry);
  return end ? now.getTime() >= end.getTime() : entry.date < toLocalDate(now);
}

/**
 * Pure classification of a watched standby entry against the live schedule
 * item, mirroring the original standby job's decision order.
 */
export function classify(
  entry: WatchEntry,
  now: Date,
  item: ScheduleItem | undefined
): StandbyDecision {
  if (hasEnded(entry, now)) return { kind: "expired" };
  if (!item) return { kind: "gone" };
  if (item.availability_id != null) {
    return { kind: "confirm", availabilityId: item.availability_id };
  }
  if (item.user_in_standby == null && item.user_booked == null) {
    return { kind: "lost" };
  }
  return { kind: "waiting" };
}
