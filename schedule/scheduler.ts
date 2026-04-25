import "dotenv/config";
import * as cron from "node-cron";
import { loadConfig } from "./config";
import { createNotifier } from "./notify";
import { runBookingJob } from "./booking";
import { runStandbyJob } from "./standby";

const config = loadConfig();
const notifier = createNotifier(config.resendApiKey, config.notificationEmail);

// Every Friday at 21:00 Israel time — book next week's lessons
cron.schedule(
  "0 21 * * 5",
  () => {
    console.log("[booking] Cron triggered");
    runBookingJob(config, notifier).catch((err) =>
      console.error("[booking] Unhandled error:", err)
    );
  },
  { timezone: "Asia/Jerusalem" }
);

// Every 10 minutes — confirm any open standby slots
cron.schedule("*/10 * * * *", () => {
  runStandbyJob(config, notifier).catch((err) =>
    console.error("[standby] Unhandled error:", err)
  );
});

console.log("Scheduler started.");
console.log("  Booking job:  every Friday at 21:00 Israel time (0 21 * * 5)");
console.log("  Standby job:  every 10 minutes (*/10 * * * *)");
