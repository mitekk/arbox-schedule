import { login, logout } from "../api/requests/auth";
import { getSchedule, bookClass, joinStandBy } from "../api/requests/schedule";
import { addStandbyEntry } from "./state";
import type { Config } from "./config";
import type { Notifier, LessonOutcome } from "./notify";
import { toLocalDate } from "./utils";

function toISODateZ(d: Date): string {
  return toLocalDate(d) + "T00:00:00.000Z";
}

export async function runBookingJob(
  config: Config,
  notifier: Notifier
): Promise<void> {
  const {
    data: { token },
  } = await login({ email: config.email, password: config.password });

  try {
    // Window: next Sunday (day after today=Saturday) through following Saturday
    const now = new Date();
    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + 1);
    nextSunday.setHours(0, 0, 0, 0);

    const nextSaturday = new Date(nextSunday);
    nextSaturday.setDate(nextSunday.getDate() + 6);
    nextSaturday.setHours(23, 59, 59, 0);

    const from = toISODateZ(nextSunday);
    const to = toISODateZ(nextSaturday);

    const { data: items } = await getSchedule(token, {
      from,
      to,
      locations_box_id: config.locationId,
      boxes_id: config.boxId,
    });

    const priorityList = [
      ...config.primarySeriesIds,
      ...config.secondarySeriesIds,
    ];
    let slotsFilled = 0;
    const outcomes: LessonOutcome[] = [];

    for (const seriesId of priorityList) {
      if (slotsFilled >= 2) break;

      const item = items.find((i) => i.series_fk === seriesId);
      if (!item) continue;

      if (item.user_booked !== null || item.user_in_standby !== null) {
        slotsFilled++;
        continue;
      }

      if (item.free > 0) {
        await bookClass(token, {
          schedule_id: item.id,
          membership_user_id: config.membershipId,
        });
        outcomes.push({
          className: item.box_categories.name,
          coachName: item.coach.full_name,
          date: item.date,
          time: item.time,
          status: "booked",
        });
        console.log(
          `[booking] Booked ${item.box_categories.name} on ${item.date} at ${item.time}`
        );
      } else {
        await joinStandBy(token, {
          schedule_id: item.id,
          membership_user_id: config.membershipId,
        });
        addStandbyEntry({ scheduleId: item.id, seriesId, date: item.date });
        outcomes.push({
          className: item.box_categories.name,
          coachName: item.coach.full_name,
          date: item.date,
          time: item.time,
          status: "standby",
          standbyPosition: item.stand_by + 1,
        });
        console.log(
          `[booking] Joined standby for ${item.box_categories.name} on ${item.date} (position ${item.stand_by + 1})`
        );
      }

      slotsFilled++;
    }

    try {
      await notifier.sendBookingSessionSummary(outcomes);
    } catch (err) {
      console.error("[booking] Failed to send email notification:", err);
    }

    if (slotsFilled < 2) {
      console.log(`[booking] Only ${slotsFilled}/2 slots filled.`);
    }
  } finally {
    await logout(token);
  }
}
