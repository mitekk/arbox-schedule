/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import { classify } from "../../../src/modules/standby/service";
import { makeScheduleItem, makeStandbyEntry } from "../../helpers/factories";

const TODAY = "2026-06-25";
const FUTURE = "2099-12-31";
const PAST = "2020-01-01";

const entry = (date: string) => ({
  ...makeStandbyEntry({ date }),
  status: "watching",
});

describe("standby classify", () => {
  it("expires a past-dated entry regardless of the schedule item", () => {
    expect(classify(entry(PAST), TODAY, undefined).kind).toBe("expired");
  });

  it("is 'gone' when the item is missing from the day's schedule", () => {
    expect(classify(entry(FUTURE), TODAY, undefined).kind).toBe("gone");
  });

  it("confirms when an availability_id is present", () => {
    const item = makeScheduleItem({ availability_id: 555 } as any);
    const d = classify(entry(FUTURE), TODAY, item);
    expect(d).toEqual({ kind: "confirm", availabilityId: 555 });
  });

  it("is 'lost' when no longer on standby and not booked", () => {
    const item = makeScheduleItem({
      availability_id: null,
      user_in_standby: null,
      user_booked: null,
    } as any);
    expect(classify(entry(FUTURE), TODAY, item).kind).toBe("lost");
  });

  it("is 'waiting' while still on the standby list", () => {
    const item = makeScheduleItem({
      availability_id: null,
      user_in_standby: 3,
      user_booked: null,
    } as any);
    expect(classify(entry(FUTURE), TODAY, item).kind).toBe("waiting");
  });
});
