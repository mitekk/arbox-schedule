/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { startServer } from "../../src/gateway/server";
import type { CancelOutcome } from "../../src/modules/cancellation/handler";
import { makeConfig } from "../helpers/factories";

let server: Server;
let baseUrl: string;
const handleCancel = vi.fn<(t: string) => Promise<CancelOutcome>>();
const query = vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] });

function start(): Promise<void> {
  const config = makeConfig({ port: 0 } as any);
  server = startServer({
    pool: { query } as any,
    config: config as any,
    cancellation: { handleCancel },
  });
  return new Promise((resolve) =>
    server.once("listening", () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    })
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  query.mockResolvedValue({ rows: [{ "?column?": 1 }] });
  await start();
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("gateway", () => {
  it("GET /healthz pings the DB and returns 200", async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    expect(query).toHaveBeenCalledWith("SELECT 1");
  });

  it("GET /healthz returns 500 when the DB is down", async () => {
    query.mockRejectedValueOnce(new Error("no db"));
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(500);
  });

  it("GET /cancel without a token returns 400 Missing token", async () => {
    const res = await fetch(`${baseUrl}/cancel`);
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Missing token");
    expect(handleCancel).not.toHaveBeenCalled();
  });

  it("GET /cancel delegates to the handler and echoes its outcome", async () => {
    handleCancel.mockResolvedValue({
      status: 200,
      body: "Booking cancelled successfully",
    });
    const res = await fetch(`${baseUrl}/cancel?token=abc.def`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Booking cancelled successfully");
    expect(handleCancel).toHaveBeenCalledWith("abc.def");
  });

  it("returns 404 for unknown paths", async () => {
    const res = await fetch(`${baseUrl}/nope`);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
  });
});
