import type { BookingOutcome, MessagePayloads } from "../../platform/events";

export interface EmailContent {
  subject: string;
  text: string;
  ics?: string;
}

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("he-IL", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
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

export function bookingSession(outcomes: BookingOutcome[]): EmailContent {
  const lines = outcomes.map((o) => {
    const date = formatDate(o.date);
    const time = o.time ?? "";
    const coach = o.coachName ?? "";
    const name = o.className ?? "Lesson";
    if (o.status === "booked") {
      const cancelLine = o.cancelUrl ? `\n   Cancel: ${o.cancelUrl}` : "";
      return `✅ ${name} — ${date} ב-${time}\n   מאמן: ${coach}${cancelLine}`;
    }
    return `⏳ ${name} — ${date} ב-${time}\n   Standby position: #${o.standbyPosition}\n   מאמן: ${coach}`;
  });
  const subject = `Arbox booking — ${outcomes.length} of 2 lessons scheduled`;
  const bookedEvents: IcsEvent[] = outcomes
    .filter((o) => o.status === "booked" && o.time && o.endTime)
    .map((o) => ({
      scheduleId: 0,
      date: o.date,
      time: o.time!,
      endTime: o.endTime!,
      summary: `${o.className ?? "Lesson"} with ${o.coachName ?? ""}`,
    }));
  const ics = bookedEvents.length > 0 ? generateIcs(bookedEvents) : undefined;
  return { subject, text: lines.join("\n\n"), ics };
}

export function standbyConfirmed(
  p: MessagePayloads["StandbyConfirmed"],
  cancelUrl?: string
): EmailContent {
  const ics =
    p.className && p.time && p.endTime
      ? generateIcs([
          {
            scheduleId: p.scheduleId,
            date: p.date,
            time: p.time,
            endTime: p.endTime,
            summary: p.className,
          },
        ])
      : undefined;
  const cancelLine = cancelUrl ? `\n\nCancel your booking: ${cancelUrl}` : "";
  return {
    subject: "✅ Standby confirmed",
    text: `Confirmed standby spot for series ${p.seriesId} on ${p.date}.${cancelLine}`,
    ics,
  };
}

export function standbyLost(p: MessagePayloads["StandbyLost"]): EmailContent {
  return {
    subject: "❌ Standby slot lost",
    text: `Lost standby position for series ${p.seriesId} on ${p.date}. No action needed.`,
  };
}

export function standbyExpired(
  p: MessagePayloads["StandbyExpired"]
): EmailContent {
  return {
    subject: "ℹ️ Standby expired",
    text: `Standby entry for series ${p.seriesId} on ${p.date} has passed without confirmation.`,
  };
}

export function operationFailed(
  p: MessagePayloads["OperationFailed"]
): EmailContent {
  return {
    subject: "⚠️ Arbox bot — manual action needed",
    text: `Operation "${p.operation}" failed and was given up on.\n\n${p.message}\n\nThe bot will not retry this automatically; please check manually.`,
  };
}
