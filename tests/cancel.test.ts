import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { buildCancelUrl, verifyCancelToken } from "../schedule/cancel";
import { makeConfig } from "./helpers/factories";

function signToken(payload: object, secret: string): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

describe("buildCancelUrl", () => {
  it("returns undefined when cancelSecret is not set", () => {
    const config = makeConfig({ baseUrl: "http://localhost:3000" });
    expect(buildCancelUrl(1234, "2026-05-27", config)).toBeUndefined();
  });

  it("returns undefined when baseUrl is not set", () => {
    const config = makeConfig({ cancelSecret: "secret" });
    expect(buildCancelUrl(1234, "2026-05-27", config)).toBeUndefined();
  });

  it("returns a URL starting with baseUrl/cancel?token=", () => {
    const config = makeConfig({
      cancelSecret: "secret",
      baseUrl: "http://localhost:3000",
    });
    const url = buildCancelUrl(1234, "2026-05-27", config);
    expect(url).toMatch(/^http:\/\/localhost:3000\/cancel\?token=\S+/);
  });

  it("generates a token that round-trips through verifyCancelToken", () => {
    const config = makeConfig({
      cancelSecret: "test-secret",
      baseUrl: "http://localhost:3000",
    });
    const url = buildCancelUrl(1234, "2026-05-27", config)!;
    const token = new URL(url).searchParams.get("token")!;
    const payload = verifyCancelToken(token, "test-secret");
    expect(payload.scheduleId).toBe(1234);
    expect(payload.date).toBe("2026-05-27");
  });
});

describe("verifyCancelToken", () => {
  const SECRET = "test-secret";

  function freshToken(overrides: Record<string, unknown> = {}): string {
    return signToken(
      {
        scheduleId: 1234,
        date: "2026-05-27",
        exp: Math.floor(Date.now() / 1000) + 8 * 24 * 3600,
        ...overrides,
      },
      SECRET
    );
  }

  it("returns the correct payload for a valid token", () => {
    const payload = verifyCancelToken(freshToken(), SECRET);
    expect(payload.scheduleId).toBe(1234);
  });

  it("throws on tampered payload", () => {
    const [data, sig] = freshToken().split(".");
    const chars = data.split("");
    chars[5] = chars[5] === "a" ? "b" : "a";
    expect(() =>
      verifyCancelToken(`${chars.join("")}.${sig}`, SECRET)
    ).toThrow();
  });

  it("throws on tampered signature", () => {
    const [data, sig] = freshToken().split(".");
    const chars = sig.split("");
    chars[5] = chars[5] === "a" ? "b" : "a";
    expect(() =>
      verifyCancelToken(`${data}.${chars.join("")}`, SECRET)
    ).toThrow();
  });

  it("throws on expired token", () => {
    const token = freshToken({ exp: Math.floor(Date.now() / 1000) - 1 });
    expect(() => verifyCancelToken(token, SECRET)).toThrow(/expired/i);
  });

  it("throws when token has no dot separator", () => {
    expect(() => verifyCancelToken("nodottoken", SECRET)).toThrow();
  });

  it("throws on wrong secret", () => {
    const token = freshToken();
    expect(() => verifyCancelToken(token, "wrong-secret")).toThrow();
  });
});
