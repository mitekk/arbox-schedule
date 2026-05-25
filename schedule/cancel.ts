import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";
import { login, logout } from "../api/requests/auth";
import { cancelClass } from "../api/requests/schedule";
import type { Config } from "./config";
import { runStandbyJob, isStandbyRunning } from "./standby";
import type { Notifier } from "./notify";

interface CancelPayload {
  scheduleId: number;
  locationsBoxFk: number;
  boxFk: number;
  exp: number; // Unix seconds
}

const TTL_SECONDS = 8 * 24 * 60 * 60;

export function buildCancelUrl(
  scheduleId: number,
  config: Config
): string | undefined {
  if (!config.cancelSecret || !config.baseUrl) return undefined;

  const payload: CancelPayload = {
    scheduleId,
    locationsBoxFk: config.locationId,
    boxFk: config.boxId,
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

export function startServer(config: Config, notifier: Notifier): Server {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (url.pathname === "/standby/run" && req.method === "POST") {
      if (isStandbyRunning()) {
        res
          .writeHead(409, { "Content-Type": "application/json" })
          .end(JSON.stringify({ status: "already-running" }));
        return;
      }
      runStandbyJob(config, notifier).catch((err) =>
        console.error("[standby] Manual trigger failed:", err)
      );
      res
        .writeHead(202, { "Content-Type": "application/json" })
        .end(JSON.stringify({ status: "started" }));
      console.log("[standby] Manual trigger fired");
      return;
    }

    if (url.pathname !== "/cancel") {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
      return;
    }

    const token = url.searchParams.get("token");
    if (!token) {
      res.writeHead(400, { "Content-Type": "text/plain" }).end("Missing token");
      return;
    }

    let payload: CancelPayload;
    try {
      payload = verifyCancelToken(token, config.cancelSecret!);
    } catch (err) {
      res
        .writeHead(400, { "Content-Type": "text/plain" })
        .end((err as Error).message);
      return;
    }

    const {
      data: { token: arboxToken },
    } = await login({
      email: config.email,
      password: config.password,
    });

    try {
      await cancelClass(arboxToken, {
        scheduleFk: payload.scheduleId,
        locationsBoxFk: payload.locationsBoxFk,
        boxFk: payload.boxFk,
      });
      res
        .writeHead(200, { "Content-Type": "text/plain" })
        .end("Booking cancelled successfully");
      console.log(`[cancel] Cancelled scheduleId ${payload.scheduleId}`);
    } catch (err) {
      const message = (err as Error).message;
      console.error("[cancel] Failed to cancel:", message);
      res
        .writeHead(500, { "Content-Type": "text/plain" })
        .end(`Failed to cancel booking: ${message}`);
    } finally {
      await logout(arboxToken);
    }
  }).listen(config.port, () => {
    console.log(`  HTTP server:  listening on port ${config.port}`);
  });
}
