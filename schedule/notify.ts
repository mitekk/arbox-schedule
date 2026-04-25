import { Resend } from "resend";
import type { StandbyEntry } from "./state";

export type LessonStatus = "booked" | "standby" | "failed";

export interface LessonOutcome {
  className: string;
  coachName: string;
  date: string;
  time: string;
  status: LessonStatus;
  standbyPosition?: number;
}

export interface Notifier {
  sendBookingSessionSummary: (outcomes: LessonOutcome[]) => Promise<void>;
  sendConfirmedEmail: (entry: StandbyEntry) => Promise<void>;
  sendStandbyLostEmail: (entry: StandbyEntry) => Promise<void>;
  sendExpiredEmail: (entry: StandbyEntry) => Promise<void>;
}

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("he-IL", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function createNotifier(apiKey: string, toEmail: string): Notifier {
  const resend = new Resend(apiKey);

  async function send(subject: string, text: string): Promise<void> {
    await resend.emails.send({
      // onboarding@resend.dev works for Resend test mode (sends to verified account email only).
      // Replace with your own domain sender once verified in Resend dashboard.
      from: "Arbox Scheduler <onboarding@resend.dev>",
      to: toEmail,
      subject,
      text,
    });
  }

  return {
    sendBookingSessionSummary: (outcomes) => {
      const lines = outcomes.map((o) => {
        const date = formatDate(o.date);
        if (o.status === "booked") {
          return `✅ ${o.className} — ${date} ב-${o.time}\n   מאמן: ${o.coachName}`;
        } else if (o.status === "standby") {
          return `⏳ ${o.className} — ${date} ב-${o.time}\n   Standby position: #${o.standbyPosition}\n   מאמן: ${o.coachName}`;
        } else {
          return `❌ ${o.className} — ${date} ב-${o.time} (failed)\n   מאמן: ${o.coachName}`;
        }
      });
      const subject = `Arbox booking — ${outcomes.length} of 2 lessons scheduled`;
      return send(subject, lines.join("\n\n"));
    },
    sendConfirmedEmail: (entry) =>
      send(
        "✅ Standby confirmed",
        `Confirmed standby spot for series ${entry.seriesId} on ${entry.date}.`
      ),
    sendStandbyLostEmail: (entry) =>
      send(
        "❌ Standby slot lost",
        `Lost standby position for series ${entry.seriesId} on ${entry.date}. No action needed.`
      ),
    sendExpiredEmail: (entry) =>
      send(
        "ℹ️ Standby expired",
        `Standby entry for series ${entry.seriesId} on ${entry.date} has passed without confirmation.`
      ),
  };
}
