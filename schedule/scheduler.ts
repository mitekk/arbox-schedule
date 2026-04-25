import "dotenv/config";
import * as cron from "node-cron";
import { loadConfig } from "./config";
import { createNotifier } from "./notify";
import { runBookingJob } from "./booking";
import { runStandbyJob } from "./standby";

const config = loadConfig();
const notifier = createNotifier(config.resendApiKey, config.notificationEmail);

// Every Saturday at midnight — book next week's lessons
cron.schedule("0 0 * * 6", () => {
  console.log("[booking] Cron triggered");
  runBookingJob(config, notifier).catch((err) =>
    console.error("[booking] Unhandled error:", err)
  );
});

// Every 10 minutes — confirm any open standby slots
cron.schedule("*/10 * * * *", () => {
  runStandbyJob(config, notifier).catch((err) =>
    console.error("[standby] Unhandled error:", err)
  );
});

console.log("Scheduler started.");
console.log("  Booking job:  every Saturday at midnight (0 0 * * 6)");
console.log("  Standby job:  every 10 minutes (*/10 * * * *)");
