import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { startServer } from "../schedule/cancel";
import { runStandbyJob, isStandbyRunning } from "../schedule/standby";
import { makeConfig } from "./helpers/factories";
import type { Notifier } from "../schedule/notify";

vi.mock("../schedule/standby");

function makeNotifier(): Notifier {
  return {
    sendBookingSessionSummary: vi.fn().mockResolvedValue(undefined),
    sendConfirmedEmail: vi.fn().mockResolvedValue(undefined),
    sendStandbyLostEmail: vi.fn().mockResolvedValue(undefined),
    sendExpiredEmail: vi.fn().mockResolvedValue(undefined),
  };
}

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(runStandbyJob).mockResolvedValue(undefined);
  vi.mocked(isStandbyRunning).mockReturnValue(false);

  // Port 0 = let OS pick a free one
  const config = makeConfig({ port: 0 });
  server = startServer(config, makeNotifier());
  await new Promise<void>((resolve) =>
    server.once("listening", () => resolve())
  );
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("HTTP server — POST /standby/run", () => {
  it("returns 202 and starts the standby job when none is running", async () => {
    const res = await fetch(`${baseUrl}/standby/run`, { method: "POST" });

    expect(res.status).toBe(202);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ status: "started" });
    expect(vi.mocked(runStandbyJob)).toHaveBeenCalledTimes(1);
  });

  it("returns 409 and does not start a new job when one is already running", async () => {
    vi.mocked(isStandbyRunning).mockReturnValue(true);

    const res = await fetch(`${baseUrl}/standby/run`, { method: "POST" });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ status: "already-running" });
    expect(vi.mocked(runStandbyJob)).not.toHaveBeenCalled();
  });

  it("returns 404 for GET /standby/run (only POST is accepted)", async () => {
    const res = await fetch(`${baseUrl}/standby/run`, { method: "GET" });

    expect(res.status).toBe(404);
    expect(vi.mocked(runStandbyJob)).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown paths (existing behavior preserved)", async () => {
    const res = await fetch(`${baseUrl}/does-not-exist`, { method: "GET" });

    expect(res.status).toBe(404);
  });
});
