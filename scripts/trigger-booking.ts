import "dotenv/config";
import { loadConfig } from "../schedule/config";
import { createNotifier } from "../schedule/notify";
import { runBookingJob } from "../schedule/booking";

const config = loadConfig();
const notifier = createNotifier(config.resendApiKey, config.notificationEmail);
runBookingJob(config, notifier)
  .then(() => console.log("Done"))
  .catch(console.error);
