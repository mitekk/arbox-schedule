import { Resend } from "resend";

export interface Mailer {
  send(subject: string, text: string, ics?: string): Promise<void>;
}

/** The only Resend caller. Ported verbatim from the old schedule/notify.ts. */
export function createResendMailer(apiKey: string, toEmail: string): Mailer {
  const resend = new Resend(apiKey);
  return {
    async send(subject, text, ics) {
      await resend.emails.send({
        // onboarding@resend.dev works in Resend test mode (delivers to the
        // verified account email only). Swap for a verified domain sender.
        from: "Arbox Scheduler <onboarding@resend.dev>",
        to: toEmail,
        subject,
        text,
        ...(ics && {
          attachments: [{ filename: "lessons.ics", content: Buffer.from(ics) }],
        }),
      });
    },
  };
}
