import "dotenv/config";
import { loadConfig } from "./platform/config";
import { createPool } from "./platform/db";
import { runMigrations } from "./platform/migrate";
import { createDispatcher } from "./platform/dispatcher";
import { startCron } from "./platform/cron";
import { runStartupCatchup } from "./platform/catchup";
import { log } from "./platform/logger";
import type { Routes } from "./platform/events";
import { createSession } from "./modules/arbox/session";
import { createArboxClient } from "./modules/arbox/client";
import { createBooking } from "./modules/booking/handler";
import { createStandby } from "./modules/standby/handlers";
import { createCancellationHandler } from "./modules/cancellation/handler";
import { createNotification } from "./modules/notification/handlers";
import { createResendMailer } from "./modules/notification/email";
import { startServer } from "./gateway/server";

function mergeRoutes(...parts: Routes[]): Routes {
  const out: Routes = {};
  for (const part of parts) {
    for (const key of Object.keys(part) as (keyof Routes)[]) {
      const entries = part[key];
      if (!entries) continue;
      (out[key] ??= []).push(...entries);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config.databaseUrl);
  await runMigrations(pool);

  // Wire the modules.
  const session = createSession(config);
  const client = createArboxClient(session, config);
  const booking = createBooking({ pool, client, config });
  const standby = createStandby({ pool, client });
  const cancellation = createCancellationHandler({
    pool,
    client,
    cancelSecret: config.cancelSecret ?? "",
  });
  const mailer = createResendMailer(
    config.resendApiKey,
    config.notificationEmail
  );
  const notification = createNotification({ pool, mailer, config });

  // Assemble the routing table: command consumers + event consumers.
  const routes = mergeRoutes(
    {
      BookingRequested: [
        {
          consumer: "booking",
          handle: async (m) => {
            if (m.name === "BookingRequested")
              await booking.handleBookingRequested(m.payload.weekOf);
          },
        },
      ],
      StandbyTickRequested: [
        {
          consumer: "standby",
          handle: async (m) => {
            if (m.name === "StandbyTickRequested")
              await standby.handleStandbyTick();
          },
        },
      ],
    },
    standby.routes(), // StandbyJoined -> watch_entry
    notification.routes() // facts -> emails
  );

  const dispatcher = createDispatcher({ pool, routes });

  await runStartupCatchup(pool);
  dispatcher.start();
  startCron(pool);
  startServer({ pool, config, cancellation, standby });

  log(
    "main",
    `Arbox scheduler (event-driven) listening on port ${config.port}`
  );
  log(
    "main",
    "  Booking: Fri 21:00 Asia/Jerusalem | Standby: every 5 min | Dispatcher: poll 10s"
  );
  log(
    "main",
    "  Endpoints: POST /standby/run, POST /standby/sync, GET /cancel, GET /healthz"
  );
}

main().catch((err) => {
  console.error("[main] fatal:", err);
  process.exit(1);
});
