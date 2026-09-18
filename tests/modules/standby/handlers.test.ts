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
import { createStandby } from "../../../src/modules/standby/handlers";
import { upsertWatch, listAll } from "../../../src/modules/standby/repo";
import { getLeaseStatus } from "../../../src/modules/arbox/effects";
import type { ArboxClient } from "../../../src/modules/arbox/client";
import type { Message } from "../../../src/platform/events";
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

const FUTURE = "2099-12-31";
const PAST = "2020-01-01";
const SID = 1001;

function mockClient(over: Partial<ArboxClient> = {}): ArboxClient {
  return {
    getDaySchedule: vi.fn().mockResolvedValue([]),
    getWeekSchedule: vi.fn().mockResolvedValue([]),
    bookSlot: vi.fn().mockResolvedValue(undefined),
    joinStandby: vi.fn(),
    cancelBooking: vi.fn(),
    ...over,
  };
}

async function seedWatch(date = FUTURE) {
  await upsertWatch(pool, {
    scheduleId: SID,
    seriesId: 101,
    date,
    className: "CrossFit",
    time: "18:00",
    endTime: "19:00",
  });
}

function outboxNames() {
  return pool
    .query("SELECT name FROM platform.outbox ORDER BY id")
    .then((r) => r.rows.map((x) => x.name));
}

function watchStatus(scheduleId = SID) {
  return pool
    .query("SELECT status FROM standby.watch_entry WHERE schedule_id=$1", [
      scheduleId,
    ])
    .then((r) => r.rows[0]?.status);
}

describe("standby tick", () => {
  it("confirms when a slot opens, books once, marks confirmed, emits", async () => {
    await seedWatch();
    const client = mockClient({
      getDaySchedule: vi
        .fn()
        .mockResolvedValue([
          makeScheduleItem({ id: SID, date: FUTURE, availability_id: 555 }),
        ]),
    });
    await createStandby({ pool, client }).handleStandbyTick();

    expect(client.bookSlot).toHaveBeenCalledWith(SID, { availabilityId: 555 });
    expect(await watchStatus()).toBe("confirmed");
    expect(await outboxNames()).toEqual(["StandbyConfirmed"]);
    expect(
      await getLeaseStatus(pool, {
        effectType: "confirm",
        scheduleId: SID,
        forDate: FUTURE,
      })
    ).toBe("done");
  });

  it("marks lost and emits when no longer on standby", async () => {
    await seedWatch();
    const client = mockClient({
      getDaySchedule: vi.fn().mockResolvedValue([
        makeScheduleItem({
          id: SID,
          date: FUTURE,
          availability_id: null,
          user_in_standby: null,
          user_booked: null,
        }),
      ]),
    });
    await createStandby({ pool, client }).handleStandbyTick();
    expect(client.bookSlot).not.toHaveBeenCalled();
    expect(await watchStatus()).toBe("lost");
    expect(await outboxNames()).toEqual(["StandbyLost"]);
  });

  it("expires a past entry without hitting the schedule API", async () => {
    await seedWatch(PAST);
    const client = mockClient();
    await createStandby({ pool, client }).handleStandbyTick();
    expect(client.getDaySchedule).not.toHaveBeenCalled();
    expect(await watchStatus()).toBe("expired");
    expect(await outboxNames()).toEqual(["StandbyExpired"]);
  });

  it("leaves the entry watching and releases the lease when booking fails", async () => {
    await seedWatch();
    const client = mockClient({
      getDaySchedule: vi
        .fn()
        .mockResolvedValue([
          makeScheduleItem({ id: SID, date: FUTURE, availability_id: 555 }),
        ]),
      bookSlot: vi.fn().mockRejectedValue(new Error("availability expired")),
    });
    await createStandby({ pool, client }).handleStandbyTick();
    expect(await watchStatus()).toBe("watching");
    expect(await outboxNames()).toEqual([]);
    // lease released -> a future tick can retry
    expect(
      await getLeaseStatus(pool, {
        effectType: "confirm",
        scheduleId: SID,
        forDate: FUTURE,
      })
    ).toBeNull();
  });

  it("serializes concurrent ticks via the advisory lock", async () => {
    await seedWatch();
    let started!: () => void;
    const startedP = new Promise<void>((r) => (started = r));
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const client = mockClient({
      getDaySchedule: vi.fn().mockImplementation(async () => {
        started();
        await gate;
        return [
          makeScheduleItem({ id: SID, date: FUTURE, user_in_standby: 3 }),
        ];
      }),
    });
    const standby = createStandby({ pool, client });

    const t1 = standby.handleStandbyTick();
    await startedP; // t1 holds the advisory lock, awaiting getDaySchedule
    await standby.handleStandbyTick(); // t2 sees the lock and returns immediately
    expect(client.getDaySchedule).toHaveBeenCalledTimes(1);
    release();
    await t1;
    expect(client.getDaySchedule).toHaveBeenCalledTimes(1);
  });
});

describe("standby sync", () => {
  it("registers untracked waitlist entries and returns added + tracked", async () => {
    const client = mockClient({
      getWeekSchedule: vi.fn().mockResolvedValue([
        makeScheduleItem({
          id: SID,
          series_fk: 101,
          date: FUTURE,
          user_in_standby: 5,
          user_booked: null,
        }),
        makeScheduleItem({
          id: 2002,
          date: FUTURE,
          user_in_standby: 6,
          user_booked: 99,
        }), // booked -> skip
        makeScheduleItem({ id: 3003, date: FUTURE, user_in_standby: null }), // not waitlisted -> skip
      ]),
    });
    const result = await createStandby({ pool, client }).handleStandbySync();
    expect(result.added.map((e) => e.scheduleId)).toEqual([SID]);
    expect(result.tracked.map((e) => e.scheduleId)).toEqual([SID]);
    expect(await listAll(pool)).toHaveLength(1);
  });

  it("is idempotent (already-tracked entries are not re-added)", async () => {
    await seedWatch();
    const client = mockClient({
      getWeekSchedule: vi.fn().mockResolvedValue([
        makeScheduleItem({
          id: SID,
          date: FUTURE,
          user_in_standby: 5,
          user_booked: null,
        }),
      ]),
    });
    const result = await createStandby({ pool, client }).handleStandbySync();
    expect(result.added).toHaveLength(0);
    expect(result.tracked).toHaveLength(1);
  });
});

describe("standby StandbyJoined consumer", () => {
  it("writes a watch row from the event", async () => {
    const standby = createStandby({ pool, client: mockClient() });
    const route = standby.routes().StandbyJoined![0];
    await route.handle({
      messageId: "m1",
      name: "StandbyJoined",
      kind: "event",
      payload: {
        scheduleId: 4004,
        seriesId: 9,
        date: FUTURE,
        className: "Y",
        time: "07:00",
        endTime: "08:00",
      },
    } as Message);
    const rows = await listAll(pool);
    expect(rows.map((r) => r.scheduleId)).toEqual([4004]);
  });
});

// The gate the 10-minute cron consults. It has to be answerable from memory:
// querying the database to decide whether to query the database would defeat
// the point, since any query keeps a scale-to-zero compute awake.
describe("standby isWatching gate", () => {
  it("starts optimistic so a restart never silently stops watching", () => {
    expect(createStandby({ pool, client: mockClient() }).isWatching()).toBe(
      true
    );
  });

  it("goes false once a tick finds nothing left to watch", async () => {
    const standby = createStandby({ pool, client: mockClient() });
    await standby.handleStandbyTick(); // empty watchlist
    expect(standby.isWatching()).toBe(false);
  });

  it("stays true while an entry is still waiting", async () => {
    await seedWatch();
    const standby = createStandby({
      pool,
      client: mockClient({
        getDaySchedule: vi
          .fn()
          .mockResolvedValue([
            makeScheduleItem({ id: SID, date: FUTURE, user_in_standby: 3 }),
          ]),
      }),
    });
    await standby.handleStandbyTick();
    expect(standby.isWatching()).toBe(true);
  });

  it("goes false after the last entry expires", async () => {
    await seedWatch(PAST);
    const standby = createStandby({ pool, client: mockClient() });
    await standby.handleStandbyTick();
    expect(await watchStatus()).toBe("expired");
    expect(standby.isWatching()).toBe(false);
  });

  it("goes back to true when a StandbyJoined event adds an entry", async () => {
    const standby = createStandby({ pool, client: mockClient() });
    await standby.handleStandbyTick();
    expect(standby.isWatching()).toBe(false);

    await standby.routes().StandbyJoined![0].handle({
      messageId: "m2",
      name: "StandbyJoined",
      kind: "event",
      payload: { scheduleId: 5005, seriesId: 9, date: FUTURE },
    } as Message);
    expect(standby.isWatching()).toBe(true);
  });

  it("goes back to true when a sync discovers an entry", async () => {
    const standby = createStandby({
      pool,
      client: mockClient({
        getWeekSchedule: vi
          .fn()
          .mockResolvedValue([
            makeScheduleItem({ id: SID, date: FUTURE, user_in_standby: 5 }),
          ]),
      }),
    });
    await standby.handleStandbyTick();
    expect(standby.isWatching()).toBe(false);
    await standby.handleStandbySync();
    expect(standby.isWatching()).toBe(true);
  });
});
