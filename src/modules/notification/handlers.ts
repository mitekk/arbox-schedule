import type { Pool } from "pg";
import type { Config } from "../../platform/config";
import type { Routes } from "../../platform/events";
import { buildCancelUrl } from "../cancellation/tokens";
import { wasSent, recordSent } from "./repo";
import type { Mailer } from "./email";
import type { EmailContent } from "./render";
import * as render from "./render";

const CONSUMER = "notification";

export interface Notification {
  routes(): Routes;
}

/**
 * Event consumers that turn facts into emails. Send-then-record with a
 * sent_email dedupe ledger -> at-least-once delivery (a failed send rolls back
 * and is retried by the dispatcher).
 */
export function createNotification(deps: {
  pool: Pool;
  mailer: Mailer;
  config: Pick<Config, "cancelSecret" | "baseUrl">;
}): Notification {
  const { pool, mailer, config } = deps;

  async function sendOnce(
    dedupeKey: string,
    kind: string,
    content: EmailContent
  ): Promise<void> {
    if (await wasSent(pool, dedupeKey)) return;
    await mailer.send(content.subject, content.text, content.ics);
    await recordSent(pool, dedupeKey, kind);
  }

  function routes(): Routes {
    return {
      BookingSessionCompleted: [
        {
          consumer: CONSUMER,
          handle: async (m) => {
            if (m.name !== "BookingSessionCompleted") return;
            await sendOnce(
              `session:${m.payload.weekOf}`,
              "booking-session",
              render.bookingSession(m.payload.outcomes)
            );
          },
        },
      ],
      StandbyConfirmed: [
        {
          consumer: CONSUMER,
          handle: async (m) => {
            if (m.name !== "StandbyConfirmed") return;
            const cancelUrl = buildCancelUrl(
              m.payload.scheduleId,
              m.payload.date,
              config
            );
            await sendOnce(
              `confirmed:${m.payload.scheduleId}:${m.payload.date}`,
              "standby-confirmed",
              render.standbyConfirmed(m.payload, cancelUrl)
            );
          },
        },
      ],
      StandbyLost: [
        {
          consumer: CONSUMER,
          handle: async (m) => {
            if (m.name !== "StandbyLost") return;
            await sendOnce(
              `lost:${m.payload.scheduleId}:${m.payload.date}`,
              "standby-lost",
              render.standbyLost(m.payload)
            );
          },
        },
      ],
      StandbyExpired: [
        {
          consumer: CONSUMER,
          handle: async (m) => {
            if (m.name !== "StandbyExpired") return;
            await sendOnce(
              `expired:${m.payload.scheduleId}:${m.payload.date}`,
              "standby-expired",
              render.standbyExpired(m.payload)
            );
          },
        },
      ],
      OperationFailed: [
        {
          consumer: CONSUMER,
          handle: async (m) => {
            if (m.name !== "OperationFailed") return;
            const id = m.payload.context?.messageId ?? m.messageId;
            await sendOnce(
              `opfail:${id}`,
              "operation-failed",
              render.operationFailed(m.payload)
            );
          },
        },
      ],
    };
  }

  return { routes };
}
