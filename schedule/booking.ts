import { login, logout } from "../api/requests/auth";
import { getSchedule, bookClass, joinStandBy } from "../api/requests/schedule";
import { addStandbyEntry } from "./state";
import type { Config } from "./config";
import type { Notifier } from "./notify";
import { toLocalDate } from "./utils";

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

    const from = toLocalDate(nextSunday);
    const to = toLocalDate(nextSaturday);

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
    const unfilled: number[] = [];

    for (const seriesId of priorityList) {
      if (slotsFilled >= 2) break;

      const item = items.find((i) => i.series_fk === seriesId);
      if (!item) {
        unfilled.push(seriesId);
        continue;
      }

      if (item.free > 0) {
        await bookClass(token, {
          schedule_id: item.id,
          membership_user_id: config.membershipId,
        });
        try {
          await notifier.sendBookedEmail({
            seriesId,
            date: item.date,
            time: item.time,
          });
        } catch (err) {
          console.error("[booking] Failed to send email notification:", err);
        }
        console.log(
          `[booking] Booked series ${seriesId} on ${item.date} at ${item.time}`
        );
      } else {
        await joinStandBy(token, {
          schedule_id: item.id,
          membership_user_id: config.membershipId,
        });
        addStandbyEntry({ scheduleId: item.id, seriesId, date: item.date });
        try {
          await notifier.sendStandbyEmail({
            seriesId,
            date: item.date,
            time: item.time,
            position: item.stand_by + 1,
          });
        } catch (err) {
          console.error("[booking] Failed to send email notification:", err);
        }
        console.log(
          `[booking] Joined standby for series ${seriesId} on ${item.date} (position ${item.stand_by + 1})`
        );
      }

      slotsFilled++;
    }

    if (slotsFilled < 2) {
      try {
        await notifier.sendFailureEmail({ slotsFilled, unfilled });
      } catch (err) {
        console.error("[booking] Failed to send email notification:", err);
      }
      console.log(
        `[booking] Only ${slotsFilled}/2 slots filled. Unfilled series: ${unfilled.join(", ")}`
      );
    }
  } finally {
    await logout(token);
  }
}
