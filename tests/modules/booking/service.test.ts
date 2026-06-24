/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import { decide } from "../../../src/modules/booking/service";
import { makeScheduleItem } from "../../helpers/factories";

describe("booking decide", () => {
  it("books available and joins standby for full, stopping at 2", () => {
    const items = [
      makeScheduleItem({ id: 1, series_fk: 101, free: 5 }),
      makeScheduleItem({ id: 2, series_fk: 202, free: 0, stand_by: 2 }),
      makeScheduleItem({ id: 3, series_fk: 303, free: 5 }),
    ];
    const intents = decide(items, [101, 202], [303]);
    expect(intents).toHaveLength(2);
    expect(intents[0]).toMatchObject({
      action: "book",
      scheduleId: 1,
      seriesId: 101,
    });
    expect(intents[1]).toMatchObject({
      action: "standby",
      scheduleId: 2,
      position: 3,
    });
  });

  it("counts already-booked/standby slots toward the 2 without acting", () => {
    const items = [
      makeScheduleItem({ id: 1, series_fk: 101, free: 5, user_booked: 99 }),
      makeScheduleItem({ id: 2, series_fk: 202, free: 5, user_in_standby: 7 }),
      makeScheduleItem({ id: 3, series_fk: 303, free: 5 }),
    ];
    const intents = decide(items, [101, 202], [303]);
    expect(intents).toHaveLength(0); // both slots already secured
  });

  it("skips series missing from the schedule and honors priority order", () => {
    const items = [makeScheduleItem({ id: 9, series_fk: 303, free: 5 })];
    const intents = decide(items, [101, 202], [303]);
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({ action: "book", seriesId: 303 });
  });
});
