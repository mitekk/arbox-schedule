import type { ScheduleItem } from "../../../api/types/schedule";

export interface BookingIntent {
  action: "book" | "standby";
  scheduleId: number;
  seriesId: number;
  date: string;
  className: string;
  time: string;
  endTime: string;
  coachName: string;
  position?: number; // standby position (1-based)
}

/**
 * Pure selection: walk PRIMARY then SECONDARY series in order, filling up to 2
 * slots. A class you're already booked into / on standby for counts toward the
 * 2 but yields no intent. Mirrors the original booking job exactly.
 */
export function decide(
  items: ScheduleItem[],
  primary: number[],
  secondary: number[]
): BookingIntent[] {
  const priority = [...primary, ...secondary];
  const intents: BookingIntent[] = [];
  let filled = 0;

  for (const seriesId of priority) {
    if (filled >= 2) break;
    const item = items.find((i) => i.series_fk === seriesId);
    if (!item) continue;

    if (item.user_booked !== null || item.user_in_standby !== null) {
      filled++; // already secured — counts, but nothing to do
      continue;
    }

    const base = {
      scheduleId: item.id,
      seriesId,
      date: item.date,
      className: item.box_categories.name,
      time: item.time,
      endTime: item.end_time,
      coachName: item.coach.full_name,
    };

    if (item.free > 0) {
      intents.push({ action: "book", ...base });
    } else {
      intents.push({ action: "standby", ...base, position: item.stand_by + 1 });
    }
    filled++;
  }

  return intents;
}
