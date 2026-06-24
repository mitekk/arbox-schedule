import { createServer, type Server } from "node:http";
import type { Pool } from "pg";
import type { Config } from "../platform/config";
import type { CancellationHandler } from "../modules/cancellation/handler";

export interface GatewayDeps {
  pool: Pool;
  config: Config;
  cancellation: CancellationHandler;
}

/**
 * The sole HTTP ingress. Verifies and either runs a handler inline (cancel —
 * a human blocks on it) or, later, emits a command. No domain logic here.
 */
export function startServer(deps: GatewayDeps): Server {
  const { pool, config, cancellation } = deps;

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (url.pathname === "/healthz" && req.method === "GET") {
      try {
        await pool.query("SELECT 1");
        res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
      } catch {
        res.writeHead(500, { "Content-Type": "text/plain" }).end("db error");
      }
      return;
    }

    if (url.pathname === "/cancel" && req.method === "GET") {
      const token = url.searchParams.get("token");
      if (!token) {
        res
          .writeHead(400, { "Content-Type": "text/plain" })
          .end("Missing token");
        return;
      }
      const outcome = await cancellation.handleCancel(token);
      res
        .writeHead(outcome.status, { "Content-Type": "text/plain" })
        .end(outcome.body);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }).listen(config.port);
}
