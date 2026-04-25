import { Resend } from "resend";
import type { StandbyEntry } from "./state";

export interface BookedInfo {
  seriesId: number;
  date: string;
  time: string;
}

export interface StandbyInfo {
  seriesId: number;
  date: string;
  time: string;
  position: number;
}

export interface FailureInfo {
  slotsFilled: number;
  unfilled: number[];
}

export interface Notifier {
  sendBookedEmail: (info: BookedInfo) => Promise<void>;
  sendStandbyEmail: (info: StandbyInfo) => Promise<void>;
  sendConfirmedEmail: (entry: StandbyEntry) => Promise<void>;
  sendStandbyLostEmail: (entry: StandbyEntry) => Promise<void>;
  sendExpiredEmail: (entry: StandbyEntry) => Promise<void>;
  sendFailureEmail: (info: FailureInfo) => Promise<void>;
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
    sendBookedEmail: (info) =>
      send(
        "✅ Lesson booked",
        `Booked class for series ${info.seriesId} on ${info.date} at ${info.time}.`
      ),
    sendStandbyEmail: (info) =>
      send(
        "⏳ On standby",
        `Joined standby for series ${info.seriesId} on ${info.date} at ${info.time} (position ${info.position}).`
      ),
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
    sendFailureEmail: (info) =>
      send(
        "❌ Booking incomplete",
        `Only ${info.slotsFilled}/2 slots could be filled this week.\nNo class found for series: ${info.unfilled.join(", ")}.`
      ),
  };
}
