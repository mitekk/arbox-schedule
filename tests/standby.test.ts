/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runStandbyJob } from "../schedule/standby";
import { login, logout } from "../api/requests/auth";
import { getSchedule, bookClass } from "../api/requests/schedule";
import { loadState, saveState, removeStandbyEntry } from "../schedule/state";
import {
  makeScheduleItem,
  makeConfig,
  makeStandbyEntry,
} from "./helpers/factories";
import type { Notifier } from "../schedule/notify";

vi.mock("../api/requests/auth");
vi.mock("../api/requests/schedule");
vi.mock("../schedule/state");

const TOKEN = "test-token";

// String-compare safe: 2099-12-31 is never "in the past" during any CI run
const FUTURE_DATE = "2099-12-31";
// A date that is definitely in the past
const PAST_DATE = "2020-01-01";

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
  vi.mocked(saveState).mockImplementation(() => undefined);
  vi.mocked(removeStandbyEntry).mockImplementation((state, scheduleId) => {
    state.standby = state.standby.filter((e) => e.scheduleId !== scheduleId);
  });
});

describe("runStandbyJob", () => {
  it("exits early without login when state.json has no standby entries", async () => {
    vi.mocked(loadState).mockReturnValue({ standby: [] });
    const notifier = makeNotifier();

    await runStandbyJob(makeConfig(), notifier);

    expect(vi.mocked(login)).not.toHaveBeenCalled();
    expect(vi.mocked(saveState)).not.toHaveBeenCalled();
  });

  it("Scenario 6: Process Restart with Active Standby — resumes monitoring both entries without any email", async () => {
    const entry1 = makeStandbyEntry({
      scheduleId: 1001,
      seriesId: 101,
      date: FUTURE_DATE,
    });
    const entry2 = makeStandbyEntry({
      scheduleId: 1002,
      seriesId: 202,
      date: FUTURE_DATE,
    });
    vi.mocked(loadState).mockReturnValue({ standby: [entry1, entry2] });

    vi.mocked(getSchedule)
      .mockResolvedValueOnce({
        data: [
          makeScheduleItem({
            id: 1001,
            user_in_standby: 42,
            availability_id: null,
            date: FUTURE_DATE,
          }),
        ],
      } as any)
      .mockResolvedValueOnce({
        data: [
          makeScheduleItem({
            id: 1002,
            user_in_standby: 43,
            availability_id: null,
            date: FUTURE_DATE,
          }),
        ],
      } as any);

    const notifier = makeNotifier();
    await runStandbyJob(makeConfig(), notifier);

    // Both entries still alive — no emails, no state changes
    expect(vi.mocked(login)).toHaveBeenCalled();
    expect(notifier.sendConfirmedEmail).not.toHaveBeenCalled();
    expect(notifier.sendExpiredEmail).not.toHaveBeenCalled();
    expect(notifier.sendStandbyLostEmail).not.toHaveBeenCalled();
    expect(vi.mocked(saveState)).not.toHaveBeenCalled();
  });

  it("Scenario 2b: Standby Confirmed — availability_id opens, books immediately, removes from state", async () => {
    const entry = makeStandbyEntry({
      scheduleId: 1001,
      seriesId: 101,
      date: FUTURE_DATE,
    });
    vi.mocked(loadState).mockReturnValue({ standby: [entry] });

    vi.mocked(getSchedule).mockResolvedValue({
      data: [
        makeScheduleItem({ id: 1001, availability_id: 555, date: FUTURE_DATE }),
      ],
    } as any);

    const notifier = makeNotifier();
    await runStandbyJob(makeConfig(), notifier);

    expect(vi.mocked(bookClass)).toHaveBeenCalledWith(TOKEN, {
      schedule_id: 1001,
      membership_user_id: makeConfig().membershipId,
      availability_id: 555,
    });
    expect(vi.mocked(removeStandbyEntry)).toHaveBeenCalledWith(
      expect.objectContaining({}),
      1001
    );
    expect(vi.mocked(saveState)).toHaveBeenCalled();
    expect(notifier.sendConfirmedEmail).toHaveBeenCalledWith(entry);
  });

  it("Scenario 5: Standby Slot Lost — user removed from waitlist without being booked, sends lost email", async () => {
    const entry = makeStandbyEntry({
      scheduleId: 1001,
      seriesId: 101,
      date: FUTURE_DATE,
    });
    vi.mocked(loadState).mockReturnValue({ standby: [entry] });

    vi.mocked(getSchedule).mockResolvedValue({
      data: [
        makeScheduleItem({
          id: 1001,
          availability_id: null,
          user_in_standby: null,
          user_booked: null,
          date: FUTURE_DATE,
        }),
      ],
    } as any);

    const notifier = makeNotifier();
    await runStandbyJob(makeConfig(), notifier);

    expect(vi.mocked(bookClass)).not.toHaveBeenCalled();
    expect(notifier.sendStandbyLostEmail).toHaveBeenCalledWith(entry);
    expect(vi.mocked(removeStandbyEntry)).toHaveBeenCalledWith(
      expect.any(Object),
      1001
    );
    expect(vi.mocked(saveState)).toHaveBeenCalled();
  });

  it("Scenario 3b: Standby Expired — class date has passed, removes from state without fetching schedule", async () => {
    const entry = makeStandbyEntry({
      scheduleId: 1001,
      seriesId: 101,
      date: PAST_DATE,
    });
    vi.mocked(loadState).mockReturnValue({ standby: [entry] });

    const notifier = makeNotifier();
    await runStandbyJob(makeConfig(), notifier);

    // Expired before getSchedule — no schedule call needed
    expect(vi.mocked(getSchedule)).not.toHaveBeenCalled();
    expect(notifier.sendExpiredEmail).toHaveBeenCalledWith(entry);
    expect(vi.mocked(removeStandbyEntry)).toHaveBeenCalledWith(
      expect.any(Object),
      1001
    );
    expect(vi.mocked(saveState)).toHaveBeenCalled();
  });

  it("Scenario 3b + 2b mixed: one entry confirmed, one expired — both handled in single poll, state saved once", async () => {
    const confirmedEntry = makeStandbyEntry({
      scheduleId: 1001,
      seriesId: 101,
      date: FUTURE_DATE,
    });
    const expiredEntry = makeStandbyEntry({
      scheduleId: 1002,
      seriesId: 202,
      date: PAST_DATE,
    });
    vi.mocked(loadState).mockReturnValue({
      standby: [confirmedEntry, expiredEntry],
    });

    vi.mocked(getSchedule).mockResolvedValue({
      data: [
        makeScheduleItem({ id: 1001, availability_id: 777, date: FUTURE_DATE }),
      ],
    } as any);

    const notifier = makeNotifier();
    await runStandbyJob(makeConfig(), notifier);

    expect(notifier.sendConfirmedEmail).toHaveBeenCalledWith(confirmedEntry);
    expect(notifier.sendExpiredEmail).toHaveBeenCalledWith(expiredEntry);
    expect(vi.mocked(saveState)).toHaveBeenCalledOnce();
  });

  it("leaves state unchanged when entry is still on standby (user_in_standby set)", async () => {
    const entry = makeStandbyEntry({ scheduleId: 1001, date: FUTURE_DATE });
    vi.mocked(loadState).mockReturnValue({ standby: [entry] });

    vi.mocked(getSchedule).mockResolvedValue({
      data: [
        makeScheduleItem({
          id: 1001,
          availability_id: null,
          user_in_standby: 7,
          user_booked: null,
          date: FUTURE_DATE,
        }),
      ],
    } as any);

    const notifier = makeNotifier();
    await runStandbyJob(makeConfig(), notifier);

    expect(notifier.sendConfirmedEmail).not.toHaveBeenCalled();
    expect(notifier.sendStandbyLostEmail).not.toHaveBeenCalled();
    expect(vi.mocked(saveState)).not.toHaveBeenCalled();
  });

  it("retries next cycle when bookClass throws during confirmation — entry left in state", async () => {
    const entry = makeStandbyEntry({ scheduleId: 1001, date: FUTURE_DATE });
    vi.mocked(loadState).mockReturnValue({ standby: [entry] });
    vi.mocked(getSchedule).mockResolvedValue({
      data: [
        makeScheduleItem({ id: 1001, availability_id: 555, date: FUTURE_DATE }),
      ],
    } as any);
    vi.mocked(bookClass).mockRejectedValue(
      new Error("availability_id expired")
    );

    const notifier = makeNotifier();
    await runStandbyJob(makeConfig(), notifier);

    // Entry not removed — retried next cycle
    expect(vi.mocked(removeStandbyEntry)).not.toHaveBeenCalled();
    expect(vi.mocked(saveState)).not.toHaveBeenCalled();
    expect(vi.mocked(logout)).toHaveBeenCalled();
  });
});
