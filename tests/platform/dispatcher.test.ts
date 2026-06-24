import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Pool } from "pg";
import { startTestDb, truncateAll, type TestDb } from "../helpers/testDb";
import { withTx } from "../../src/platform/db";
import { emit } from "../../src/platform/outbox";
import { createDispatcher } from "../../src/platform/dispatcher";
import type { Message, Routes } from "../../src/platform/events";

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

async function seed<P>(
  name: Parameters<typeof emit>[1],
  payload: P
): Promise<string> {
  return withTx(pool, (tx) => emit(tx, name, payload as never));
}

function rows() {
  return pool
    .query(`SELECT * FROM platform.outbox ORDER BY id`)
    .then((r) => r.rows);
}

describe("dispatcher", () => {
  it("delivers a message to its consumer and marks it done", async () => {
    const seen: Message[] = [];
    const routes: Routes = {
      StandbyTickRequested: [
        { consumer: "test", handle: async (m) => void seen.push(m) },
      ],
    };
    const d = createDispatcher({ pool, routes });

    await seed("StandbyTickRequested", {});
    await d.tick();

    expect(seen).toHaveLength(1);
    expect(seen[0].name).toBe("StandbyTickRequested");
    const [row] = await rows();
    expect(row.status).toBe("done");
  });

  it("marks a message done when it has no consumers", async () => {
    const d = createDispatcher({ pool, routes: {} });
    await seed("StandbyLost", {
      scheduleId: 1,
      seriesId: 2,
      date: "2026-06-26",
    });
    await d.tick();
    const [row] = await rows();
    expect(row.status).toBe("done");
  });

  it("does not re-run an already-consumed consumer when a sibling fails then succeeds", async () => {
    let aCount = 0;
    let bCount = 0;
    const routes: Routes = {
      StandbyConfirmed: [
        { consumer: "A", handle: async () => void aCount++ },
        {
          consumer: "B",
          handle: async () => {
            bCount++;
            if (bCount === 1) throw new Error("B fails first time");
          },
        },
      ],
    };
    const d = createDispatcher({ pool, routes });

    await seed("StandbyConfirmed", {
      scheduleId: 1,
      seriesId: 2,
      date: "2026-06-26",
    });

    await d.tick(); // A ok (consumed), B throws -> message failed
    let [row] = await rows();
    expect(row.status).toBe("failed");
    expect(row.attempts).toBe(1);
    expect(aCount).toBe(1);

    // Make it claimable again immediately, then re-tick.
    await pool.query(`UPDATE platform.outbox SET next_attempt_at = now()`);
    await d.tick(); // A skipped (already consumed), B ok -> done

    [row] = await rows();
    expect(row.status).toBe("done");
    expect(aCount).toBe(1); // NOT re-run
    expect(bCount).toBe(2); // ran twice (fail, then ok)
  });

  it("applies backoff on a failing handler", async () => {
    const routes: Routes = {
      StandbyTickRequested: [
        {
          consumer: "boom",
          handle: async () => {
            throw new Error("kaboom");
          },
        },
      ],
    };
    const d = createDispatcher({ pool, routes });
    await seed("StandbyTickRequested", {});
    await d.tick();

    const [row] = await rows();
    expect(row.status).toBe("failed");
    expect(row.attempts).toBe(1);
    expect(row.error).toContain("kaboom");
    expect(new Date(row.next_attempt_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("dead-letters after maxAttempts and emits OperationFailed", async () => {
    const routes: Routes = {
      StandbyTickRequested: [
        {
          consumer: "boom",
          handle: async () => {
            throw new Error("always fails");
          },
        },
      ],
    };
    const d = createDispatcher({ pool, routes, maxAttempts: 1 });
    await seed("StandbyTickRequested", {});
    await d.tick();

    const all = await rows();
    const dead = all.find((r) => r.name === "StandbyTickRequested");
    const opFailed = all.find((r) => r.name === "OperationFailed");
    expect(dead?.status).toBe("dead");
    expect(opFailed).toBeDefined();
    expect(opFailed?.status).toBe("pending");
    expect((opFailed?.payload as { operation: string }).operation).toBe(
      "StandbyTickRequested"
    );
  });

  it("reaper re-queues rows stuck in 'processing'", async () => {
    const { reapStuck } = await import("../../src/platform/outbox");
    await seed("StandbyTickRequested", {});
    await pool.query(
      `UPDATE platform.outbox SET status='processing', locked_at = now() - interval '10 minutes'`
    );
    const reaped = await reapStuck(pool, 300);
    expect(reaped).toBe(1);
    const [row] = await rows();
    expect(row.status).toBe("pending");
    expect(row.locked_at).toBeNull();
  });
});
