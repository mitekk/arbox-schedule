import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Pool } from "pg";
import { withTx } from "../platform/db";
import { emit } from "../platform/outbox";
import type { Config } from "../platform/config";
import type { CancellationHandler } from "../modules/cancellation/handler";
import type { SyncResult } from "../modules/standby/handlers";

export interface GatewayDeps {
  pool: Pool;
  config: Pick<Config, "port" | "triggerToken">;
  cancellation: CancellationHandler;
  standby: { handleStandbySync(): Promise<SyncResult> };
}

const JSON_HEADERS = { "Content-Type": "application/json" };
const TEXT_HEADERS = { "Content-Type": "text/plain" };

/**
 * The sole HTTP ingress. Verifies, then either emits a command (cron-style
 * work) or runs a handler inline (cancel/sync — a human blocks on the result).
 */
export function startServer(deps: GatewayDeps): Server {
  const { pool, config, cancellation, standby } = deps;

  function triggerAuthorized(req: IncomingMessage): boolean {
    if (!config.triggerToken) return true;
    return req.headers["x-trigger-token"] === config.triggerToken;
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (url.pathname === "/healthz" && req.method === "GET") {
      try {
        await pool.query("SELECT 1");
        res.writeHead(200, TEXT_HEADERS).end("ok");
      } catch {
        res.writeHead(500, TEXT_HEADERS).end("db error");
      }
      return;
    }

    if (url.pathname === "/standby/run" && req.method === "POST") {
      if (!triggerAuthorized(req)) {
        res
          .writeHead(401, JSON_HEADERS)
          .end(JSON.stringify({ status: "unauthorized" }));
        return;
      }
      const pending = await pool.query(
        `SELECT 1 FROM platform.outbox
         WHERE name='StandbyTickRequested' AND status IN ('pending','processing')
         LIMIT 1`
      );
      if ((pending.rowCount ?? 0) > 0) {
        res
          .writeHead(409, JSON_HEADERS)
          .end(JSON.stringify({ status: "already-running" }));
        return;
      }
      await withTx(pool, (tx) => emit(tx, "StandbyTickRequested", {}));
      res
        .writeHead(202, JSON_HEADERS)
        .end(JSON.stringify({ status: "started" }));
      return;
    }

    if (url.pathname === "/standby/sync" && req.method === "POST") {
      if (!triggerAuthorized(req)) {
        res
          .writeHead(401, JSON_HEADERS)
          .end(JSON.stringify({ status: "unauthorized" }));
        return;
      }
      try {
        const result = await standby.handleStandbySync();
        res.writeHead(200, JSON_HEADERS).end(JSON.stringify(result));
      } catch (err) {
        res
          .writeHead(500, JSON_HEADERS)
          .end(
            JSON.stringify({ status: "error", message: (err as Error).message })
          );
      }
      return;
    }

    if (url.pathname === "/cancel" && req.method === "GET") {
      const token = url.searchParams.get("token");
      if (!token) {
        res.writeHead(400, TEXT_HEADERS).end("Missing token");
        return;
      }
      const outcome = await cancellation.handleCancel(token);
      res.writeHead(outcome.status, TEXT_HEADERS).end(outcome.body);
      return;
    }

    res.writeHead(404, TEXT_HEADERS).end("Not found");
  }).listen(config.port);
}
