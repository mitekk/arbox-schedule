import { createServer, type Server } from "node:http";
import { login, logout } from "../api/requests/auth";
import { getSchedule, cancelClass } from "../api/requests/schedule";
import type { Config } from "./config";
import { runStandbyJob, isStandbyRunning, syncStandbyEntries } from "./standby";
import { loadState } from "./state";
import { verifyCancelToken, type CancelPayload } from "./cancel";
import type { Notifier } from "./notify";

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

    if (url.pathname === "/standby/sync" && req.method === "POST") {
      try {
        const added = await syncStandbyEntries(config);
        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end(JSON.stringify({ added, tracked: loadState().standby }));
        console.log(`[standby] Sync registered ${added.length} new entry(ies)`);
      } catch (err) {
        const message = (err as Error).message;
        console.error("[standby] Sync failed:", message);
        res
          .writeHead(500, { "Content-Type": "application/json" })
          .end(JSON.stringify({ status: "error", message }));
      }
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

    let arboxToken: string | undefined;
    try {
      ({
        data: { token: arboxToken },
      } = await login({ email: config.email, password: config.password }));
      const dateZ = `${payload.date}T00:00:00.000Z`;
      const { data: items } = await getSchedule(arboxToken, {
        from: dateZ,
        to: dateZ,
        locations_box_id: config.locationId,
        boxes_id: config.boxId,
      });
      const item = items.find((i) => i.id === payload.scheduleId);
      if (!item || item.user_booked === null) {
        res
          .writeHead(404, { "Content-Type": "text/plain" })
          .end("Booking not found");
        return;
      }
      await cancelClass(arboxToken, {
        schedule_user_id: item.user_booked,
        schedule_id: payload.scheduleId,
        late_cancel: false,
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
      if (arboxToken) await logout(arboxToken);
    }
  }).listen(config.port, () => {
    console.log(`  HTTP server:  listening on port ${config.port}`);
  });
}
