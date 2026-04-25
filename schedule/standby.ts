import { login, logout } from "../api/requests/auth";
import { getSchedule, bookClass } from "../api/requests/schedule";
import { loadState, saveState, removeStandbyEntry } from "./state";
import type { Config } from "./config";
import type { Notifier } from "./notify";
import { toLocalDate } from "./utils";

export async function runStandbyJob(
  config: Config,
  notifier: Notifier
): Promise<void> {
  const state = loadState();
  if (state.standby.length === 0) return;

  const {
    data: { token },
  } = await login({ email: config.email, password: config.password });

  try {
    const today = toLocalDate(new Date());
    let stateChanged = false;

    for (const entry of [...state.standby]) {
      // Class has passed — clean up
      if (entry.date < today) {
        removeStandbyEntry(state, entry.scheduleId);
        stateChanged = true;
        try {
          await notifier.sendExpiredEmail(entry);
        } catch (err) {
          console.error("[standby] Failed to send email notification:", err);
        }
        console.log(
          `[standby] Expired entry for series ${entry.seriesId} on ${entry.date}`
        );
        continue;
      }

      // Re-fetch class state for this specific day
      const { data: items } = await getSchedule(token, {
        from: entry.date,
        to: entry.date,
        locations_box_id: config.locationId,
        boxes_id: config.boxId,
      });

      const item = items.find((i) => i.id === entry.scheduleId);
      if (!item) continue;

      // A standby slot opened for this user
      if (item.availability_id != null) {
        try {
          await bookClass(token, {
            schedule_id: item.id,
            membership_user_id: config.membershipId,
            availability_id: item.availability_id,
          });
          removeStandbyEntry(state, entry.scheduleId);
          stateChanged = true;
          try {
            await notifier.sendConfirmedEmail(entry);
          } catch (err) {
            console.error("[standby] Failed to send email notification:", err);
          }
          console.log(
            `[standby] Confirmed standby for series ${entry.seriesId} on ${entry.date}`
          );
        } catch (err) {
          // availability_id may have expired — leave in state for next cycle
          console.error(
            `[standby] Failed to confirm series ${entry.seriesId}, retrying next cycle:`,
            err
          );
        }
        continue;
      }

      // No longer on standby and not booked — slot was lost
      if (item.user_in_standby == null && item.user_booked == null) {
        removeStandbyEntry(state, entry.scheduleId);
        stateChanged = true;
        try {
          await notifier.sendStandbyLostEmail(entry);
        } catch (err) {
          console.error("[standby] Failed to send email notification:", err);
        }
        console.log(
          `[standby] Lost standby for series ${entry.seriesId} on ${entry.date}`
        );
      }
    }

    if (stateChanged) saveState(state);
  } finally {
    await logout(token);
  }
}
