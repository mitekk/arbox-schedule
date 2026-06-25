/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Pool } from "pg";
import { startTestDb, truncateAll, type TestDb } from "../helpers/testDb";
import { startServer } from "../../src/gateway/server";
import type { CancelOutcome } from "../../src/modules/cancellation/handler";
import type { SyncResult } from "../../src/modules/standby/handlers";

let db: TestDb;
let pool: Pool;
let server: Server | undefined;
let baseUrl: string;

const handleCancel = vi.fn<(t: string) => Promise<CancelOutcome>>();
const handleStandbySync = vi.fn<() => Promise<SyncResult>>();

async function start(
  config: { port: number; triggerToken?: string } = { port: 0 }
) {
  server = startServer({
    pool,
    config,
    cancellation: { handleCancel },
    standby: { handleStandbySync },
  });
  await new Promise<void>((resolve) =>
    server!.once("listening", () => {
      baseUrl = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
      resolve();
    })
  );
}

beforeAll(async () => {
  db = await startTestDb();
  pool = db.pool;
}, 180_000);

afterAll(async () => {
  await db.stop();
});

beforeEach(async () => {
  await truncateAll(pool);
  vi.clearAllMocks();
  handleStandbySync.mockResolvedValue({ added: [], tracked: [] });
});

afterEach(async () => {
  if (server) await new Promise<void>((r) => server!.close(() => r()));
  server = undefined;
});

describe("gateway", () => {
  it("GET /healthz pings the DB and returns 200", async () => {
    await start();
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("GET /cancel without a token returns 400 Missing token", async () => {
    await start();
    const res = await fetch(`${baseUrl}/cancel`);
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Missing token");
  });

  it("GET /cancel delegates to the handler and echoes its outcome", async () => {
    handleCancel.mockResolvedValue({
      status: 200,
      body: "Booking cancelled successfully",
    });
    await start();
    const res = await fetch(`${baseUrl}/cancel?token=abc.def`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Booking cancelled successfully");
    expect(handleCancel).toHaveBeenCalledWith("abc.def");
  });

  it("POST /standby/run emits a tick (202), then reports already-running (409)", async () => {
    await start();
    const first = await fetch(`${baseUrl}/standby/run`, { method: "POST" });
    expect(first.status).toBe(202);
    expect(await first.json()).toEqual({ status: "started" });

    const second = await fetch(`${baseUrl}/standby/run`, { method: "POST" });
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ status: "already-running" });

    const rows = await pool.query(
      "SELECT name FROM platform.outbox WHERE name='StandbyTickRequested'"
    );
    expect(rows.rowCount).toBe(1);
  });

  it("POST /standby/sync runs inline and returns added + tracked", async () => {
    handleStandbySync.mockResolvedValue({
      added: [
        { scheduleId: 1, seriesId: 2, date: "2026-06-26", status: "watching" },
      ],
      tracked: [
        { scheduleId: 1, seriesId: 2, date: "2026-06-26", status: "watching" },
      ],
    });
    await start();
    const res = await fetch(`${baseUrl}/standby/sync`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.added).toHaveLength(1);
    expect(body.tracked).toHaveLength(1);
  });

  it("POST /standby/sync returns 500 when the sync fails", async () => {
    handleStandbySync.mockRejectedValue(new Error("arbox down"));
    await start();
    const res = await fetch(`${baseUrl}/standby/sync`, { method: "POST" });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      status: "error",
      message: "arbox down",
    });
  });

  it("returns 404 for unknown paths", async () => {
    await start();
    const res = await fetch(`${baseUrl}/nope`);
    expect(res.status).toBe(404);
  });

  describe("with TRIGGER_TOKEN set", () => {
    it("rejects /standby/run without the header (401) and accepts it with (202)", async () => {
      await start({ port: 0, triggerToken: "secret" });
      const noHeader = await fetch(`${baseUrl}/standby/run`, {
        method: "POST",
      });
      expect(noHeader.status).toBe(401);

      const withHeader = await fetch(`${baseUrl}/standby/run`, {
        method: "POST",
        headers: { "x-trigger-token": "secret" },
      });
      expect(withHeader.status).toBe(202);
    });
  });
});
