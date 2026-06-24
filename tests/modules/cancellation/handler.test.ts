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
import { createCancellationHandler } from "../../../src/modules/cancellation/handler";
import { buildCancelUrl } from "../../../src/modules/cancellation/tokens";
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

const SECRET = "s";
const SCHEDULE_ID = 5555;
const SCHEDULE_USER_ID = 7777;
const DATE = "2026-05-27";

function token(): string {
  const url = buildCancelUrl(SCHEDULE_ID, DATE, {
    cancelSecret: SECRET,
    baseUrl: "http://x",
  })!;
  return new URL(url).searchParams.get("token")!;
}

function mockClient(over: Partial<ArboxClient> = {}): ArboxClient {
  return {
    getDaySchedule: vi.fn().mockResolvedValue([
      makeScheduleItem({
        id: SCHEDULE_ID,
        date: DATE,
        user_booked: SCHEDULE_USER_ID,
      }),
    ]),
    getWeekSchedule: vi.fn(),
    bookSlot: vi.fn(),
    joinStandby: vi.fn(),
    cancelBooking: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

async function outboxNames(): Promise<string[]> {
  const r = await pool.query("SELECT name FROM platform.outbox ORDER BY id");
  return r.rows.map((x) => x.name);
}

describe("cancellation handler", () => {
  it("cancels, marks the lease done, and emits BookingCancelled", async () => {
    const client = mockClient();
    const h = createCancellationHandler({ pool, client, cancelSecret: SECRET });

    const outcome = await h.handleCancel(token());

    expect(outcome).toEqual({
      status: 200,
      body: "Booking cancelled successfully",
    });
    expect(client.cancelBooking).toHaveBeenCalledWith(
      SCHEDULE_ID,
      SCHEDULE_USER_ID
    );
    expect(await outboxNames()).toEqual(["BookingCancelled"]);
    expect(
      await getLeaseStatus(pool, {
        effectType: "cancel",
        scheduleId: SCHEDULE_ID,
        forDate: DATE,
        attemptKey: String(SCHEDULE_USER_ID),
      })
    ).toBe("done");
  });

  it("returns 404 when the booking is not present", async () => {
    const client = mockClient({
      getDaySchedule: vi.fn().mockResolvedValue([]),
    });
    const h = createCancellationHandler({ pool, client, cancelSecret: SECRET });
    const outcome = await h.handleCancel(token());
    expect(outcome).toEqual({ status: 404, body: "Booking not found" });
    expect(client.cancelBooking).not.toHaveBeenCalled();
  });

  it("returns 404 when the slot exists but the user isn't booked", async () => {
    const client = mockClient({
      getDaySchedule: vi
        .fn()
        .mockResolvedValue([
          makeScheduleItem({ id: SCHEDULE_ID, date: DATE, user_booked: null }),
        ]),
    });
    const h = createCancellationHandler({ pool, client, cancelSecret: SECRET });
    expect(await h.handleCancel(token())).toEqual({
      status: 404,
      body: "Booking not found",
    });
  });

  it("is idempotent under a double-click (cancels exactly once)", async () => {
    const client = mockClient();
    const h = createCancellationHandler({ pool, client, cancelSecret: SECRET });

    const [a, b] = await Promise.all([
      h.handleCancel(token()),
      h.handleCancel(token()),
    ]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(client.cancelBooking).toHaveBeenCalledTimes(1);
  });

  it("returns 500 and fails the lease when Arbox cancel errors", async () => {
    const client = mockClient({
      cancelBooking: vi.fn().mockRejectedValue(new Error("403: forbidden")),
    });
    const h = createCancellationHandler({ pool, client, cancelSecret: SECRET });

    const outcome = await h.handleCancel(token());

    expect(outcome.status).toBe(500);
    expect(outcome.body).toContain("403: forbidden");
    expect(
      await getLeaseStatus(pool, {
        effectType: "cancel",
        scheduleId: SCHEDULE_ID,
        forDate: DATE,
        attemptKey: String(SCHEDULE_USER_ID),
      })
    ).toBe("failed");
  });

  it("returns 400 on an invalid token", async () => {
    const client = mockClient();
    const h = createCancellationHandler({ pool, client, cancelSecret: SECRET });
    const outcome = await h.handleCancel("garbage");
    expect(outcome.status).toBe(400);
    expect(client.getDaySchedule).not.toHaveBeenCalled();
  });
});
