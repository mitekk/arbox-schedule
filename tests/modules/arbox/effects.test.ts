import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Pool } from "pg";
import { startTestDb, truncateAll, type TestDb } from "../../helpers/testDb";
import {
  acquireLease,
  completeLease,
  failLease,
  getLeaseStatus,
  releaseLease,
  type EffectKey,
} from "../../../src/modules/arbox/effects";

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

const key = (over: Partial<EffectKey> = {}): EffectKey => ({
  effectType: "book",
  scheduleId: 1001,
  forDate: "2026-06-26",
  ...over,
});

describe("effect-lease", () => {
  it("grants the lease to exactly one of two competing acquirers", async () => {
    const [a, b] = await Promise.all([
      acquireLease(pool, key()),
      acquireLease(pool, key()),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it("blocks a second Arbox call for the same effect (concurrent double-call)", async () => {
    let bookCalls = 0;
    const attempt = async () => {
      if (await acquireLease(pool, key())) {
        bookCalls++; // stand-in for the non-idempotent Arbox bookSlot
        await completeLease(pool, key());
      }
    };
    await Promise.all([attempt(), attempt()]);
    expect(bookCalls).toBe(1);
    expect(await getLeaseStatus(pool, key())).toBe("done");
  });

  it("allows a different attempt_key to acquire (legitimate rebook)", async () => {
    expect(await acquireLease(pool, key({ attemptKey: "w1" }))).toBe(true);
    expect(await acquireLease(pool, key({ attemptKey: "w2" }))).toBe(true);
    expect(await acquireLease(pool, key({ attemptKey: "w1" }))).toBe(false);
  });

  it("releaseLease lets a failed (not-done) effect be retried", async () => {
    expect(await acquireLease(pool, key())).toBe(true);
    await failLease(pool, key(), "network blip");
    await releaseLease(pool, key());
    expect(await acquireLease(pool, key())).toBe(true);
  });

  it("does not release a completed lease", async () => {
    await acquireLease(pool, key());
    await completeLease(pool, key());
    await releaseLease(pool, key());
    expect(await acquireLease(pool, key())).toBe(false);
    expect(await getLeaseStatus(pool, key())).toBe("done");
  });
});
