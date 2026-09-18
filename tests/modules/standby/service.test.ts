/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import { classify, hasEnded } from "../../../src/modules/standby/service";
import { makeScheduleItem, makeStandbyEntry } from "../../helpers/factories";

const NOW = new Date(2026, 5, 25, 12, 0); // 2026-06-25 12:00 local
const FUTURE = "2099-12-31";
const PAST = "2020-01-01";

const entry = (date: string, endTime?: string) => ({
  ...makeStandbyEntry({ date }),
  endTime,
  status: "watching",
});

describe("standby classify", () => {
  it("expires a past-dated entry regardless of the schedule item", () => {
    expect(classify(entry(PAST), NOW, undefined).kind).toBe("expired");
  });

  it("is 'gone' when the item is missing from the day's schedule", () => {
    expect(classify(entry(FUTURE), NOW, undefined).kind).toBe("gone");
  });

  it("confirms when an availability_id is present", () => {
    const item = makeScheduleItem({ availability_id: 555 } as any);
    const d = classify(entry(FUTURE), NOW, item);
    expect(d).toEqual({ kind: "confirm", availabilityId: 555 });
  });

  it("is 'lost' when no longer on standby and not booked", () => {
    const item = makeScheduleItem({
      availability_id: null,
      user_in_standby: null,
      user_booked: null,
    } as any);
    expect(classify(entry(FUTURE), NOW, item).kind).toBe("lost");
  });

  it("is 'waiting' while still on the standby list", () => {
    const item = makeScheduleItem({
      availability_id: null,
      user_in_standby: 3,
      user_booked: null,
    } as any);
    expect(classify(entry(FUTURE), NOW, item).kind).toBe("waiting");
  });

  it("expires a class that ended earlier today, without consulting the item", () => {
    const item = makeScheduleItem({
      availability_id: null,
      user_in_standby: 3,
    } as any);
    // Still on the standby list, but the class finished at 11:00.
    expect(classify(entry("2026-06-25", "11:00"), NOW, item).kind).toBe(
      "expired"
    );
  });
});

describe("standby hasEnded", () => {
  it("is false while today's class is still ahead", () => {
    expect(hasEnded(entry("2026-06-25", "13:00"), NOW)).toBe(false);
  });

  it("is true once today's class has finished", () => {
    expect(hasEnded(entry("2026-06-25", "11:00"), NOW)).toBe(true);
  });

  it("is true exactly at the end time", () => {
    expect(hasEnded(entry("2026-06-25", "12:00"), NOW)).toBe(true);
  });

  it("accepts an end time with seconds", () => {
    expect(hasEnded(entry("2026-06-25", "11:00:00"), NOW)).toBe(true);
    expect(hasEnded(entry("2026-06-25", "13:00:00"), NOW)).toBe(false);
  });

  it("falls back to the date when the row has no end time", () => {
    expect(hasEnded(entry("2026-06-25", undefined), NOW)).toBe(false);
    expect(hasEnded(entry("2026-06-24", undefined), NOW)).toBe(true);
  });

  it("falls back to the date when the end time is unparseable", () => {
    expect(hasEnded(entry("2026-06-25", "not-a-time"), NOW)).toBe(false);
    expect(hasEnded(entry("2026-06-24", "not-a-time"), NOW)).toBe(true);
  });
});
