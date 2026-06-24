import type { Pool } from "pg";
import { withTx } from "../../platform/db";
import { emit } from "../../platform/outbox";
import { acquireLease, completeLease, failLease } from "../arbox/effects";
import type { ArboxClient } from "../arbox/client";
import { verifyCancelToken } from "./tokens";

export interface CancelOutcome {
  status: 200 | 400 | 404 | 500;
  body: string;
}

export interface CancellationHandler {
  handleCancel(token: string): Promise<CancelOutcome>;
}

/**
 * Redeem a cancel link inline (a human is blocking on the response). The cancel
 * is gated by the effect-lease, keyed by the booking instance (schedule_user_id)
 * so a double-click is a no-op 200 but a re-booked slot can still be cancelled.
 */
export function createCancellationHandler(deps: {
  pool: Pool;
  client: ArboxClient;
  cancelSecret: string;
}): CancellationHandler {
  const { pool, client, cancelSecret } = deps;

  async function handleCancel(token: string): Promise<CancelOutcome> {
    let payload;
    try {
      payload = verifyCancelToken(token, cancelSecret);
    } catch (err) {
      return { status: 400, body: (err as Error).message };
    }

    try {
      const items = await client.getDaySchedule(payload.date);
      const item = items.find((i) => i.id === payload.scheduleId);
      if (!item || item.user_booked === null) {
        return { status: 404, body: "Booking not found" };
      }

      const key = {
        effectType: "cancel" as const,
        scheduleId: payload.scheduleId,
        forDate: payload.date,
        attemptKey: String(item.user_booked),
      };

      if (!(await acquireLease(pool, key))) {
        // Already cancelled (or in-flight) for this exact booking instance.
        return { status: 200, body: "Booking cancelled successfully" };
      }

      try {
        await client.cancelBooking(payload.scheduleId, item.user_booked);
      } catch (err) {
        await failLease(pool, key, (err as Error).message);
        return {
          status: 500,
          body: `Failed to cancel booking: ${(err as Error).message}`,
        };
      }

      await completeLease(pool, key);
      await withTx(pool, (tx) =>
        emit(tx, "BookingCancelled", {
          scheduleId: payload.scheduleId,
          date: payload.date,
        })
      );
      return { status: 200, body: "Booking cancelled successfully" };
    } catch (err) {
      return {
        status: 500,
        body: `Failed to cancel booking: ${(err as Error).message}`,
      };
    }
  }

  return { handleCancel };
}
