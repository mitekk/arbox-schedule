import {
  getSchedule,
  bookClass,
  cancelClass,
  joinStandBy,
} from "../../../api/requests/schedule";
import type { ScheduleItem } from "../../../api/types/schedule";
import type { Config } from "../../platform/config";
import type { ArboxSession } from "./session";

function dateZ(date: string): string {
  return `${date}T00:00:00.000Z`;
}

export interface ArboxClient {
  getDaySchedule(date: string): Promise<ScheduleItem[]>;
  getWeekSchedule(from: string, to: string): Promise<ScheduleItem[]>;
  bookSlot(
    scheduleId: number,
    opts?: { availabilityId?: number }
  ): Promise<void>;
  joinStandby(scheduleId: number): Promise<void>;
  cancelBooking(scheduleId: number, scheduleUserId: number): Promise<void>;
}

/**
 * The single point that talks to Arbox (via api/*). Every method runs through
 * the shared session so the whole process holds at most one login.
 */
export function createArboxClient(
  session: ArboxSession,
  config: Pick<Config, "boxId" | "locationId" | "membershipId">
): ArboxClient {
  function range(from: string, to: string): Promise<ScheduleItem[]> {
    return session.withSession(async (token) => {
      const { data } = await getSchedule(token, {
        from: dateZ(from),
        to: dateZ(to),
        locations_box_id: config.locationId,
        boxes_id: config.boxId,
      });
      return data;
    });
  }

  return {
    getDaySchedule: (date) => range(date, date),
    getWeekSchedule: (from, to) => range(from, to),
    bookSlot: (scheduleId, opts) =>
      session.withSession(async (token) => {
        await bookClass(token, {
          schedule_id: scheduleId,
          membership_user_id: config.membershipId,
          availability_id: opts?.availabilityId,
        });
      }),
    joinStandby: (scheduleId) =>
      session.withSession(async (token) => {
        await joinStandBy(token, {
          schedule_id: scheduleId,
          membership_user_id: config.membershipId,
        });
      }),
    cancelBooking: (scheduleId, scheduleUserId) =>
      session.withSession(async (token) => {
        await cancelClass(token, {
          schedule_user_id: scheduleUserId,
          schedule_id: scheduleId,
          late_cancel: false,
        });
      }),
  };
}
