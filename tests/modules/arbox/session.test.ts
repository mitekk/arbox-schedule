/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSession } from "../../../src/modules/arbox/session";
import { login } from "../../../api/requests/auth";

vi.mock("../../../api/requests/auth");

beforeEach(() => vi.clearAllMocks());

describe("arbox session", () => {
  it("logs in once and shares the token across concurrent callers", async () => {
    vi.mocked(login).mockResolvedValue({ data: { token: "T1" } } as any);
    const session = createSession({ email: "e", password: "p" });

    const results = await Promise.all([
      session.withSession(async (t) => t),
      session.withSession(async (t) => t),
      session.withSession(async (t) => t),
    ]);

    expect(results).toEqual(["T1", "T1", "T1"]);
    expect(vi.mocked(login)).toHaveBeenCalledTimes(1);
  });

  it("re-logs-in on the next call after an auth error, without re-running fn", async () => {
    vi.mocked(login)
      .mockResolvedValueOnce({ data: { token: "T1" } } as any)
      .mockResolvedValueOnce({ data: { token: "T2" } } as any);
    const session = createSession({ email: "e", password: "p" });

    let runs = 0;
    await expect(
      session.withSession(async () => {
        runs++;
        throw new Error("401: expired");
      })
    ).rejects.toThrow("401");
    expect(runs).toBe(1);

    const token = await session.withSession(async (t) => t);
    expect(token).toBe("T2");
    expect(vi.mocked(login)).toHaveBeenCalledTimes(2);
  });

  it("allows a retry after a failed login", async () => {
    vi.mocked(login)
      .mockRejectedValueOnce(new Error("500: down"))
      .mockResolvedValueOnce({ data: { token: "T9" } } as any);
    const session = createSession({ email: "e", password: "p" });

    await expect(session.withSession(async (t) => t)).rejects.toThrow("500");
    const token = await session.withSession(async (t) => t);
    expect(token).toBe("T9");
    expect(vi.mocked(login)).toHaveBeenCalledTimes(2);
  });
});
