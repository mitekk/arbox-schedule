import { describe, it, expect } from "vitest";
import {
  buildCancelUrl,
  verifyCancelToken,
} from "../../../src/modules/cancellation/tokens";

const opts = { cancelSecret: "s3cret", baseUrl: "http://localhost:3000" };

function tokenOf(url: string): string {
  return new URL(url).searchParams.get("token")!;
}

describe("cancellation tokens", () => {
  it("round-trips a signed token", () => {
    const url = buildCancelUrl(5555, "2026-05-27", opts)!;
    const payload = verifyCancelToken(tokenOf(url), opts.cancelSecret);
    expect(payload.scheduleId).toBe(5555);
    expect(payload.date).toBe("2026-05-27");
  });

  it("returns undefined when signing isn't configured", () => {
    expect(buildCancelUrl(1, "2026-01-01", {})).toBeUndefined();
    expect(
      buildCancelUrl(1, "2026-01-01", { cancelSecret: "x" })
    ).toBeUndefined();
  });

  it("rejects a tampered signature", () => {
    const url = buildCancelUrl(1, "2026-01-01", opts)!;
    expect(() =>
      verifyCancelToken(tokenOf(url) + "x", opts.cancelSecret)
    ).toThrow("Invalid token signature");
  });

  it("rejects a malformed token", () => {
    expect(() => verifyCancelToken("garbage", opts.cancelSecret)).toThrow(
      "Invalid token format"
    );
  });
});
