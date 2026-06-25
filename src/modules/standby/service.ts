import type { ScheduleItem } from "../../../api/types/schedule";
import type { WatchEntry } from "./repo";

export type StandbyDecision =
  | { kind: "expired" }
  | { kind: "gone" } // not in the day's schedule — leave watching
  | { kind: "confirm"; availabilityId: number }
  | { kind: "lost" }
  | { kind: "waiting" };

/**
 * Pure classification of a watched standby entry against the live schedule
 * item, mirroring the original standby job's decision order.
 */
export function classify(
  entry: WatchEntry,
  today: string,
  item: ScheduleItem | undefined
): StandbyDecision {
  if (entry.date < today) return { kind: "expired" };
  if (!item) return { kind: "gone" };
  if (item.availability_id != null) {
    return { kind: "confirm", availabilityId: item.availability_id };
  }
  if (item.user_in_standby == null && item.user_booked == null) {
    return { kind: "lost" };
  }
  return { kind: "waiting" };
}
