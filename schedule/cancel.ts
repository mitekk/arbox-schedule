import { createHmac, timingSafeEqual } from "node:crypto";
import type { Config } from "./config";

export interface CancelPayload {
  scheduleId: number;
  date: string; // "YYYY-MM-DD"
  exp: number; // Unix seconds
}

const TTL_SECONDS = 8 * 24 * 60 * 60;

export function buildCancelUrl(
  scheduleId: number,
  date: string,
  config: Config
): string | undefined {
  if (!config.cancelSecret || !config.baseUrl) return undefined;

  const payload: CancelPayload = {
    scheduleId,
    date,
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", config.cancelSecret)
    .update(data)
    .digest("base64url");
  return `${config.baseUrl}/cancel?token=${data}.${sig}`;
}

export function verifyCancelToken(
  token: string,
  secret: string
): CancelPayload {
  const dotIndex = token.indexOf(".");
  if (dotIndex === -1) throw new Error("Invalid token format");

  const data = token.slice(0, dotIndex);
  const sig = token.slice(dotIndex + 1);

  const expected = createHmac("sha256", secret)
    .update(data)
    .digest("base64url");
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(sig);

  if (
    expectedBuf.length !== actualBuf.length ||
    !timingSafeEqual(expectedBuf, actualBuf)
  ) {
    throw new Error("Invalid token signature");
  }

  const payload = JSON.parse(
    Buffer.from(data, "base64url").toString()
  ) as CancelPayload;

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token expired");
  }

  return payload;
}
