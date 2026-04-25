/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runBookingJob } from "../schedule/booking";
import { login, logout } from "../api/requests/auth";
import { getSchedule, bookClass, joinStandBy } from "../api/requests/schedule";
import { addStandbyEntry } from "../schedule/state";
import { makeScheduleItem, makeConfig } from "./helpers/factories";
import type { Notifier, LessonOutcome } from "../schedule/notify";

vi.mock("../api/requests/auth");
vi.mock("../api/requests/schedule");
vi.mock("../schedule/state");

const TOKEN = "test-token";

function makeNotifier(): Notifier {
  return {
    sendBookingSessionSummary: vi.fn().mockResolvedValue(undefined),
    sendConfirmedEmail: vi.fn().mockResolvedValue(undefined),
    sendStandbyLostEmail: vi.fn().mockResolvedValue(undefined),
    sendExpiredEmail: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(login).mockResolvedValue({ data: { token: TOKEN } } as any);
  vi.mocked(logout).mockResolvedValue(undefined);
  vi.mocked(bookClass).mockResolvedValue(undefined);
  vi.mocked(joinStandBy).mockResolvedValue(undefined);
  vi.mocked(addStandbyEntry).mockImplementation(() => undefined);
});

describe("runBookingJob", () => {
  it("Scenario 1: Ideal Case — books both primary and secondary when spots are available", async () => {
    const config = makeConfig();
    const notifier = makeNotifier();

    vi.mocked(getSchedule).mockResolvedValue({
      data: [
        makeScheduleItem({
          series_fk: 101,
          id: 1001,
          free: 3,
          date: "2026-05-04",
          time: "07:00",
        }),
        makeScheduleItem({
          series_fk: 202,
          id: 1002,
          free: 2,
          date: "2026-05-06",
          time: "08:00",
        }),
      ],
    } as any);

    await runBookingJob(config, notifier);

    expect(vi.mocked(bookClass)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(bookClass)).toHaveBeenCalledWith(TOKEN, {
      schedule_id: 1001,
      membership_user_id: config.membershipId,
    });
    expect(vi.mocked(bookClass)).toHaveBeenCalledWith(TOKEN, {
      schedule_id: 1002,
      membership_user_id: config.membershipId,
    });
    expect(vi.mocked(joinStandBy)).not.toHaveBeenCalled();
    expect(vi.mocked(addStandbyEntry)).not.toHaveBeenCalled();

    const [outcomes] = vi.mocked(notifier.sendBookingSessionSummary).mock
      .calls[0] as [LessonOutcome[]];
    expect(outcomes).toHaveLength(2);
    expect(outcomes[0].status).toBe("booked");
    expect(outcomes[1].status).toBe("booked");
    expect(vi.mocked(logout)).toHaveBeenCalledWith(TOKEN);
  });

  it("Scenario 2: One Booked, One Standby — primary booked, secondary full enters standby", async () => {
    const config = makeConfig();
    const notifier = makeNotifier();

    vi.mocked(getSchedule).mockResolvedValue({
      data: [
        makeScheduleItem({
          series_fk: 101,
          id: 1001,
          free: 2,
          date: "2026-05-04",
          time: "07:00",
        }),
        makeScheduleItem({
          series_fk: 202,
          id: 1002,
          free: 0,
          stand_by: 1,
          date: "2026-05-06",
          time: "08:00",
        }),
      ],
    } as any);

    await runBookingJob(config, notifier);

    expect(vi.mocked(bookClass)).toHaveBeenCalledOnce();
    expect(vi.mocked(joinStandBy)).toHaveBeenCalledOnce();
    expect(vi.mocked(joinStandBy)).toHaveBeenCalledWith(TOKEN, {
      schedule_id: 1002,
      membership_user_id: config.membershipId,
    });
    expect(vi.mocked(addStandbyEntry)).toHaveBeenCalledWith({
      scheduleId: 1002,
      seriesId: 202,
      date: "2026-05-06",
      className: "CrossFit",
      time: "08:00",
      endTime: "08:00",
    });

    const [outcomes] = vi.mocked(notifier.sendBookingSessionSummary).mock
      .calls[0] as [LessonOutcome[]];
    expect(outcomes[0].status).toBe("booked");
    expect(outcomes[1].status).toBe("standby");
    expect(outcomes[1].standbyPosition).toBe(2); // stand_by is 1, position = stand_by + 1
  });

  it("Scenario 3: Both Classes Full — both enter standby, two standby entries saved", async () => {
    const config = makeConfig();
    const notifier = makeNotifier();

    vi.mocked(getSchedule).mockResolvedValue({
      data: [
        makeScheduleItem({
          series_fk: 101,
          id: 1001,
          free: 0,
          stand_by: 0,
          date: "2026-05-04",
          time: "07:00",
        }),
        makeScheduleItem({
          series_fk: 202,
          id: 1002,
          free: 0,
          stand_by: 3,
          date: "2026-05-06",
          time: "08:00",
        }),
      ],
    } as any);

    await runBookingJob(config, notifier);

    expect(vi.mocked(bookClass)).not.toHaveBeenCalled();
    expect(vi.mocked(joinStandBy)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(addStandbyEntry)).toHaveBeenCalledTimes(2);

    const [outcomes] = vi.mocked(notifier.sendBookingSessionSummary).mock
      .calls[0] as [LessonOutcome[]];
    expect(outcomes).toHaveLength(2);
    expect(outcomes[0].status).toBe("standby");
    expect(outcomes[1].status).toBe("standby");
  });

  it("Scenario 4: No Classes Available — series not in schedule, sends summary with 0 lessons", async () => {
    const config = makeConfig();
    const notifier = makeNotifier();

    // Schedule contains only an unrelated series
    vi.mocked(getSchedule).mockResolvedValue({
      data: [makeScheduleItem({ series_fk: 999, id: 3001, free: 5 })],
    } as any);

    await runBookingJob(config, notifier);

    expect(vi.mocked(bookClass)).not.toHaveBeenCalled();
    expect(vi.mocked(joinStandBy)).not.toHaveBeenCalled();
    expect(vi.mocked(addStandbyEntry)).not.toHaveBeenCalled();

    expect(notifier.sendBookingSessionSummary).toHaveBeenCalledOnce();
    const [outcomes] = vi.mocked(notifier.sendBookingSessionSummary).mock
      .calls[0] as [LessonOutcome[]];
    expect(outcomes).toHaveLength(0);
    expect(vi.mocked(logout)).toHaveBeenCalled();
  });

  it("stops at exactly 2 slots — does not book a third series even when available", async () => {
    const config = makeConfig({
      primarySeriesIds: [101],
      secondarySeriesIds: [202, 303],
    });
    const notifier = makeNotifier();

    vi.mocked(getSchedule).mockResolvedValue({
      data: [
        makeScheduleItem({ series_fk: 101, id: 1001, free: 5 }),
        makeScheduleItem({ series_fk: 202, id: 1002, free: 5 }),
        makeScheduleItem({ series_fk: 303, id: 1003, free: 5 }),
      ],
    } as any);

    await runBookingJob(config, notifier);

    expect(vi.mocked(bookClass)).toHaveBeenCalledTimes(2);
  });

  it("counts already-booked class toward the quota without re-booking it", async () => {
    const config = makeConfig();
    const notifier = makeNotifier();

    vi.mocked(getSchedule).mockResolvedValue({
      data: [
        makeScheduleItem({
          series_fk: 101,
          id: 1001,
          free: 0,
          user_booked: 123,
        }),
        makeScheduleItem({ series_fk: 202, id: 1002, free: 5 }),
      ],
    } as any);

    await runBookingJob(config, notifier);

    expect(vi.mocked(bookClass)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(bookClass)).toHaveBeenCalledWith(
      TOKEN,
      expect.objectContaining({ schedule_id: 1002 })
    );
  });

  it("always calls logout even when getSchedule throws", async () => {
    const config = makeConfig();
    const notifier = makeNotifier();

    vi.mocked(getSchedule).mockRejectedValue(new Error("network failure"));

    await expect(runBookingJob(config, notifier)).rejects.toThrow(
      "network failure"
    );
    expect(vi.mocked(logout)).toHaveBeenCalledWith(TOKEN);
  });
});
