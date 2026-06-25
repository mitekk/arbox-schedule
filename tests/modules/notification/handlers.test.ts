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
import {
  createNotification,
  type Notification,
} from "../../../src/modules/notification/handlers";
import { wasSent } from "../../../src/modules/notification/repo";
import type { Mailer } from "../../../src/modules/notification/email";
import type { Message } from "../../../src/platform/events";

let db: TestDb;
let pool: Pool;
let send: ReturnType<typeof vi.fn>;
let mailer: Mailer;
let notification: Notification;

beforeAll(async () => {
  db = await startTestDb();
  pool = db.pool;
}, 180_000);

afterAll(async () => {
  await db.stop();
});

beforeEach(async () => {
  await truncateAll(pool);
  send = vi.fn().mockResolvedValue(undefined);
  mailer = { send } as unknown as Mailer;
  notification = createNotification({
    pool,
    mailer,
    config: { cancelSecret: "s", baseUrl: "http://x" },
  });
});

async function deliver(msg: Message): Promise<void> {
  const routes = notification.routes();
  for (const { handle } of routes[msg.name] ?? []) await handle(msg);
}

const msg = (name: Message["name"], payload: unknown): Message =>
  ({ messageId: "m1", name, kind: "event", payload }) as Message;

describe("notification handlers", () => {
  it("emails the booking session digest and dedupes by week", async () => {
    const m = msg("BookingSessionCompleted", {
      weekOf: "2026-06-21",
      outcomes: [
        {
          date: "2026-06-22",
          status: "booked",
          className: "CrossFit",
          time: "18:00",
          endTime: "19:00",
          coachName: "Coach",
          cancelUrl: "http://x/cancel?token=abc",
        },
      ],
    });

    await deliver(m);
    expect(send).toHaveBeenCalledTimes(1);
    const [subject, text, ics] = send.mock.calls[0];
    expect(subject).toContain("1 of 2");
    expect(text).toContain("CrossFit");
    expect(text).toContain("Cancel: http://x/cancel?token=abc");
    expect(ics).toContain("BEGIN:VCALENDAR");

    await deliver(m); // same week -> deduped
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("emails a standby confirmation with a cancel link", async () => {
    await deliver(
      msg("StandbyConfirmed", {
        scheduleId: 5,
        seriesId: 9,
        date: "2026-06-26",
        className: "X",
        time: "18:00",
        endTime: "19:00",
      })
    );
    const [subject, text] = send.mock.calls[0];
    expect(subject).toBe("✅ Standby confirmed");
    expect(text).toContain("Cancel your booking: http://x/cancel?token=");
  });

  it("emails standby lost and expired notices", async () => {
    await deliver(
      msg("StandbyLost", { scheduleId: 1, seriesId: 2, date: "2026-06-26" })
    );
    await deliver(
      msg("StandbyExpired", { scheduleId: 1, seriesId: 2, date: "2026-06-26" })
    );
    const subjects = send.mock.calls.map((c) => c[0]);
    expect(subjects).toContain("❌ Standby slot lost");
    expect(subjects).toContain("ℹ️ Standby expired");
  });

  it("emails a manual-action notice on OperationFailed", async () => {
    await deliver(
      msg("OperationFailed", {
        operation: "BookingRequested",
        message: "boom",
        context: { messageId: "x" },
      })
    );
    const [subject, text] = send.mock.calls[0];
    expect(subject).toBe("⚠️ Arbox bot — manual action needed");
    expect(text).toContain("boom");
  });

  it("does not record (so it retries) when the send fails", async () => {
    send.mockRejectedValueOnce(new Error("resend down"));
    const lost = msg("StandbyLost", {
      scheduleId: 1,
      seriesId: 2,
      date: "2026-06-26",
    });

    await expect(deliver(lost)).rejects.toThrow("resend down");
    expect(await wasSent(pool, "lost:1:2026-06-26")).toBe(false);

    await deliver(lost); // retry succeeds
    expect(send).toHaveBeenCalledTimes(2);
    expect(await wasSent(pool, "lost:1:2026-06-26")).toBe(true);
  });
});
