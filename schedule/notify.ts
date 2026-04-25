import { Resend } from "resend";
import type { StandbyEntry } from "./state";

export type LessonStatus = "booked" | "standby" | "failed";

export interface LessonOutcome {
  className: string;
  coachName: string;
  date: string;
  time: string;
  endTime?: string;
  status: LessonStatus;
  standbyPosition?: number;
}

interface IcsEvent {
  scheduleId: number;
  date: string;
  time: string;
  endTime: string;
  summary: string;
}

function generateIcs(events: IcsEvent[]): string {
  const stamp =
    new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
  const vevents = events.map((e) => {
    const dtStart = `${e.date.replace(/-/g, "")}T${e.time.replace(":", "")}00`;
    const dtEnd = `${e.date.replace(/-/g, "")}T${e.endTime.replace(":", "")}00`;
    return [
      "BEGIN:VEVENT",
      `UID:${e.scheduleId}@arbox-scheduler`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Asia/Jerusalem:${dtStart}`,
      `DTEND;TZID=Asia/Jerusalem:${dtEnd}`,
      `SUMMARY:${e.summary}`,
      "END:VEVENT",
    ].join("\r\n");
  });
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Arbox Scheduler//EN",
    "CALSCALE:GREGORIAN",
    ...vevents,
    "END:VCALENDAR",
  ].join("\r\n");
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

  async function send(
    subject: string,
    text: string,
    ics?: string
  ): Promise<void> {
    await resend.emails.send({
      // onboarding@resend.dev works for Resend test mode (sends to verified account email only).
      // Replace with your own domain sender once verified in Resend dashboard.
      from: "Arbox Scheduler <onboarding@resend.dev>",
      to: toEmail,
      subject,
      text,
      ...(ics && {
        attachments: [{ filename: "lessons.ics", content: Buffer.from(ics) }],
      }),
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
      const bookedEvents: IcsEvent[] = outcomes
        .filter((o) => o.status === "booked" && o.endTime)
        .map((o) => ({
          scheduleId: 0,
          date: o.date,
          time: o.time,
          endTime: o.endTime!,
          summary: `${o.className} with ${o.coachName}`,
        }));
      const ics =
        bookedEvents.length > 0 ? generateIcs(bookedEvents) : undefined;
      return send(subject, lines.join("\n\n"), ics);
    },
    sendConfirmedEmail: (entry) => {
      const ics =
        entry.className && entry.time && entry.endTime
          ? generateIcs([
              {
                scheduleId: entry.scheduleId,
                date: entry.date,
                time: entry.time,
                endTime: entry.endTime,
                summary: entry.className,
              },
            ])
          : undefined;
      return send(
        "✅ Standby confirmed",
        `Confirmed standby spot for series ${entry.seriesId} on ${entry.date}.`,
        ics
      );
    },
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
