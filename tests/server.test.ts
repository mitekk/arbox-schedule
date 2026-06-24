/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { startServer } from "../schedule/server";
import { buildCancelUrl } from "../schedule/cancel";
import {
  runStandbyJob,
  isStandbyRunning,
  syncStandbyEntries,
} from "../schedule/standby";
import { login, logout } from "../api/requests/auth";
import { getSchedule, cancelClass } from "../api/requests/schedule";
import { loadState, type StandbyEntry } from "../schedule/state";
import { makeConfig, makeScheduleItem } from "./helpers/factories";
import type { Notifier } from "../schedule/notify";
import type { Config } from "../schedule/config";

vi.mock("../schedule/standby");
vi.mock("../schedule/state");
vi.mock("../api/requests/auth");
vi.mock("../api/requests/schedule");

const ARBOX_TOKEN = "arbox-token";

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
let activeConfig: Config;

async function startWith(overrides: Partial<Config> = {}): Promise<void> {
  activeConfig = makeConfig({ port: 0, ...overrides });
  server = startServer(activeConfig, makeNotifier());
  await new Promise<void>((resolve) =>
    server.once("listening", () => resolve())
  );
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(runStandbyJob).mockResolvedValue(undefined);
  vi.mocked(isStandbyRunning).mockReturnValue(false);
  vi.mocked(syncStandbyEntries).mockResolvedValue([]);
  vi.mocked(loadState).mockReturnValue({ standby: [] });
  vi.mocked(login).mockResolvedValue({ data: { token: ARBOX_TOKEN } } as any);
  vi.mocked(logout).mockResolvedValue(undefined);
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("HTTP server — POST /standby/run", () => {
  beforeEach(async () => {
    await startWith();
  });

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

describe("HTTP server — POST /standby/sync", () => {
  beforeEach(async () => {
    await startWith();
  });

  it("registers discovered waitlist entries and returns 200 with added + tracked", async () => {
    const added: StandbyEntry[] = [
      {
        scheduleId: 1001,
        seriesId: 569196,
        date: "2026-06-26",
        className: "CrossFit",
        time: "18:00",
        endTime: "19:00",
      },
    ];
    vi.mocked(syncStandbyEntries).mockResolvedValue(added);
    vi.mocked(loadState).mockReturnValue({ standby: added });

    const res = await fetch(`${baseUrl}/standby/sync`, { method: "POST" });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ added, tracked: added });
    expect(vi.mocked(syncStandbyEntries)).toHaveBeenCalledWith(activeConfig);
  });

  it("returns 500 when sync fails", async () => {
    vi.mocked(syncStandbyEntries).mockRejectedValue(new Error("boom"));

    const res = await fetch(`${baseUrl}/standby/sync`, { method: "POST" });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ status: "error", message: "boom" });
  });

  it("returns 404 for GET /standby/sync (only POST is accepted)", async () => {
    const res = await fetch(`${baseUrl}/standby/sync`, { method: "GET" });

    expect(res.status).toBe(404);
    expect(vi.mocked(syncStandbyEntries)).not.toHaveBeenCalled();
  });
});

describe("HTTP server — GET /cancel", () => {
  const SECRET = "cancel-secret";
  const HOST = "http://localhost:3000";
  const SCHEDULE_ID = 5555;
  const SCHEDULE_USER_ID = 7777;
  const DATE = "2026-05-27";

  beforeEach(async () => {
    await startWith({ cancelSecret: SECRET, baseUrl: HOST });
  });

  function validToken(): string {
    const url = buildCancelUrl(SCHEDULE_ID, DATE, activeConfig)!;
    return new URL(url).searchParams.get("token")!;
  }

  it("returns 400 when token is missing", async () => {
    const res = await fetch(`${baseUrl}/cancel`);
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Missing token");
    expect(vi.mocked(login)).not.toHaveBeenCalled();
  });

  it("returns 400 when token signature is invalid", async () => {
    const res = await fetch(`${baseUrl}/cancel?token=garbage.signature`);
    expect(res.status).toBe(400);
    expect(vi.mocked(login)).not.toHaveBeenCalled();
  });

  it("cancels successfully with schedule_user_id from the live lookup", async () => {
    vi.mocked(getSchedule).mockResolvedValue({
      data: [
        makeScheduleItem({
          id: SCHEDULE_ID,
          date: DATE,
          user_booked: SCHEDULE_USER_ID,
        }),
      ],
    });
    vi.mocked(cancelClass).mockResolvedValue(undefined);

    const res = await fetch(`${baseUrl}/cancel?token=${validToken()}`);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Booking cancelled successfully");
    expect(vi.mocked(getSchedule)).toHaveBeenCalledWith(ARBOX_TOKEN, {
      from: `${DATE}T00:00:00.000Z`,
      to: `${DATE}T00:00:00.000Z`,
      locations_box_id: activeConfig.locationId,
      boxes_id: activeConfig.boxId,
    });
    expect(vi.mocked(cancelClass)).toHaveBeenCalledWith(ARBOX_TOKEN, {
      schedule_user_id: SCHEDULE_USER_ID,
      schedule_id: SCHEDULE_ID,
      late_cancel: false,
    });
    expect(vi.mocked(logout)).toHaveBeenCalledWith(ARBOX_TOKEN);
  });

  it("returns 404 when the schedule item is no longer in the day's schedule", async () => {
    vi.mocked(getSchedule).mockResolvedValue({ data: [] });

    const res = await fetch(`${baseUrl}/cancel?token=${validToken()}`);

    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Booking not found");
    expect(vi.mocked(cancelClass)).not.toHaveBeenCalled();
    expect(vi.mocked(logout)).toHaveBeenCalledWith(ARBOX_TOKEN);
  });

  it("returns 404 when the item exists but user is not booked (already cancelled)", async () => {
    vi.mocked(getSchedule).mockResolvedValue({
      data: [
        makeScheduleItem({ id: SCHEDULE_ID, date: DATE, user_booked: null }),
      ],
    });

    const res = await fetch(`${baseUrl}/cancel?token=${validToken()}`);

    expect(res.status).toBe(404);
    expect(vi.mocked(cancelClass)).not.toHaveBeenCalled();
  });

  it("returns 500 and logs out when cancelClass fails", async () => {
    vi.mocked(getSchedule).mockResolvedValue({
      data: [
        makeScheduleItem({
          id: SCHEDULE_ID,
          date: DATE,
          user_booked: SCHEDULE_USER_ID,
        }),
      ],
    });
    vi.mocked(cancelClass).mockRejectedValue(new Error("403: forbidden"));

    const res = await fetch(`${baseUrl}/cancel?token=${validToken()}`);

    expect(res.status).toBe(500);
    expect(await res.text()).toContain("403: forbidden");
    expect(vi.mocked(logout)).toHaveBeenCalledWith(ARBOX_TOKEN);
  });
});
