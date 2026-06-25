import type { Pool } from "pg";
import { withTx } from "./db";
import {
  emit,
  claimBatch,
  markDone,
  markFailed,
  markDead,
  reapStuck,
  isConsumed,
  recordConsumed,
  toMessage,
  type OutboxRow,
} from "./outbox";
import type { Routes } from "./events";
import { logError } from "./logger";

export interface DispatcherOptions {
  pool: Pool;
  routes: Routes;
  pollMs?: number;
  batchSize?: number;
  maxAttempts?: number;
  reapAfterSeconds?: number;
}

export interface Dispatcher {
  /** Run one drain (reap + claim + process). Exposed for tests/manual triggers. */
  tick(): Promise<void>;
  start(): void;
  stop(): void;
}

export function createDispatcher(opts: DispatcherOptions): Dispatcher {
  const { pool, routes } = opts;
  const pollMs = opts.pollMs ?? 10_000;
  const batchSize = opts.batchSize ?? 10;
  const maxAttempts = opts.maxAttempts ?? 8;
  const reapAfterSeconds = opts.reapAfterSeconds ?? 300;

  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight = false;

  async function processRow(row: OutboxRow): Promise<void> {
    const msg = toMessage(row);
    const consumers = routes[row.name] ?? [];
    for (const { consumer, handle } of consumers) {
      // `consumed` is a delivery-dedup optimization; domain idempotency (the
      // effect-lease, sent_email dedupe) is the real guard against re-runs.
      if (await isConsumed(pool, msg.messageId, consumer)) continue;
      await handle(msg);
      await recordConsumed(pool, msg.messageId, consumer);
    }
    await markDone(pool, row.id);
  }

  async function tick(): Promise<void> {
    await reapStuck(pool, reapAfterSeconds);
    const rows = await claimBatch(pool, batchSize);
    for (const row of rows) {
      try {
        await processRow(row);
      } catch (err) {
        const attempts = row.attempts + 1;
        const message = err instanceof Error ? err.message : String(err);
        if (attempts >= maxAttempts) {
          await markDead(pool, row.id, attempts, message);
          logError(
            "dispatcher",
            `${row.name} dead after ${attempts} attempts:`,
            message
          );
          // Avoid an infinite dead-letter loop on OperationFailed itself.
          if (row.name !== "OperationFailed") {
            await withTx(pool, (tx) =>
              emit(tx, "OperationFailed", {
                operation: row.name,
                message,
                context: { messageId: row.message_id },
              })
            ).catch((e) =>
              logError("dispatcher", "failed to emit OperationFailed:", e)
            );
          }
        } else {
          await markFailed(pool, row.id, attempts, message);
          logError(
            "dispatcher",
            `${row.name} failed (attempt ${attempts}), retrying:`,
            message
          );
        }
      }
    }
  }

  function start(): void {
    if (timer) return;
    timer = setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      void tick()
        .catch((e) => logError("dispatcher", "tick error:", e))
        .finally(() => {
          inFlight = false;
        });
    }, pollMs);
  }

  function stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { tick, start, stop };
}
