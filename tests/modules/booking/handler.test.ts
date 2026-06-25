/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import type { Pool } from "pg";
import { startTestDb, truncateAll, type TestDb } from "../../helpers/testDb";
import { createBooking } from "../../../src/modules/booking/handler";
import { getLeaseStatus } from "../../../src/modules/arbox/effects";
import type { ArboxClient } from "../../../src/modules/arbox/client";
import { makeScheduleItem } from "../../helpers/factories";

let db: TestDb;
let pool: Pool;

beforeAll(async () => {
  db = await startTestDb();
  pool = db.pool;
}, 180_000);

afterAll(async () => {
  await db.stop();
});

beforeEach(async () => {
  await truncateAll(pool);
});

const WEEK = "2099-12-27";
const config = {
  primarySeriesIds: [101],
  secondarySeriesIds: [202],
  cancelSecret: "s",
  baseUrl: "http://x",
};

function mockClient(over: Partial<ArboxClient> = {}): ArboxClient {
  return {
    getDaySchedule: vi.fn(),
    getWeekSchedule: vi.fn().mockResolvedValue([
      makeScheduleItem({
        id: 1001,
        series_fk: 101,
        free: 5,
        date: "2099-12-28",
      }),
      makeScheduleItem({
        id: 1002,
        series_fk: 202,
        free: 0,
        stand_by: 2,
        date: "2099-12-29",
        user_booked: null,
        user_in_standby: null,
      }),
    ]),
    bookSlot: vi.fn().mockResolvedValue(undefined),
    joinStandby: vi.fn().mockResolvedValue(undefined),
    cancelBooking: vi.fn(),
    ...over,
  };
}

function outbox() {
  return pool
    .query("SELECT name, payload FROM platform.outbox ORDER BY id")
    .then((r) => r.rows);
}

describe("booking handler", () => {
  it("books one, joins standby for the other, records, and emits", async () => {
    const client = mockClient();
    await createBooking({ pool, client, config }).handleBookingRequested(WEEK);

    expect(client.bookSlot).toHaveBeenCalledWith(1001);
    expect(client.joinStandby).toHaveBeenCalledWith(1002);

    const rows = await outbox();
    expect(rows.map((r) => r.name)).toEqual([
      "LessonBooked",
      "StandbyJoined",
      "BookingSessionCompleted",
    ]);

    const session = rows.find((r) => r.name === "BookingSessionCompleted")!;
    expect(session.payload.outcomes).toHaveLength(2);
    expect(session.payload.outcomes[0]).toMatchObject({ status: "booked" });
    expect(session.payload.outcomes[0].cancelUrl).toContain(
      "http://x/cancel?token="
    );
    expect(session.payload.outcomes[1]).toMatchObject({
      status: "standby",
      standbyPosition: 3,
    });

    const run = await pool.query(
      "SELECT slots_filled FROM booking.booking_run WHERE week_of=$1",
      [WEEK]
    );
    expect(run.rows[0].slots_filled).toBe(2);
    const lessons = await pool.query(
      "SELECT COUNT(*)::int AS n FROM booking.booked_lesson"
    );
    expect(lessons.rows[0].n).toBe(2);

    expect(
      await getLeaseStatus(pool, {
        effectType: "book",
        scheduleId: 1001,
        forDate: "2099-12-28",
        attemptKey: WEEK,
      })
    ).toBe("done");
    expect(
      await getLeaseStatus(pool, {
        effectType: "standby-join",
        scheduleId: 1002,
        forDate: "2099-12-29",
        attemptKey: WEEK,
      })
    ).toBe("done");
  });

  it("is idempotent across re-runs (the lease blocks a second booking)", async () => {
    const client = mockClient();
    const booking = createBooking({ pool, client, config });
    await booking.handleBookingRequested(WEEK);
    await booking.handleBookingRequested(WEEK);
    expect(client.bookSlot).toHaveBeenCalledTimes(1);
    expect(client.joinStandby).toHaveBeenCalledTimes(1);
  });

  it("releases the lease and skips when an Arbox booking fails", async () => {
    const client = mockClient({
      bookSlot: vi.fn().mockRejectedValue(new Error("boom")),
    });
    await createBooking({ pool, client, config }).handleBookingRequested(WEEK);

    const names = (await outbox()).map((r) => r.name);
    expect(names).not.toContain("LessonBooked");
    expect(names).toContain("StandbyJoined"); // the other slot still proceeds
    expect(
      await getLeaseStatus(pool, {
        effectType: "book",
        scheduleId: 1001,
        forDate: "2099-12-28",
        attemptKey: WEEK,
      })
    ).toBeNull(); // released -> retryable
  });
});
