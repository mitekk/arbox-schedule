import type { Pool } from "pg";
import { withTx } from "./db";
import {
  emit,
  claimBatch,
  markDone,
  markFailed,
  markDead,
  nextAttemptAt,
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
  batchSize?: number;
  maxAttempts?: number;
  reapAfterSeconds?: number;
}

export interface Dispatcher {
  /** Run one drain (reap + claim + process). Exposed for tests/manual triggers. */
  tick(): Promise<void>;
  /** Ask for a drain now. Call after emitting outside of a tick. */
  wake(): void;
  start(): void;
  stop(): void;
}

export function createDispatcher(opts: DispatcherOptions): Dispatcher {
  const { pool, routes } = opts;
  const batchSize = opts.batchSize ?? 10;
  const maxAttempts = opts.maxAttempts ?? 8;
  const reapAfterSeconds = opts.reapAfterSeconds ?? 300;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let pendingWake = false;
  let running = false;

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

  function clearTimer(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  /**
   * Arm the next wake from the outbox itself: at the earliest `next_attempt_at`,
   * or NOT AT ALL when nothing is actionable. An idle process therefore issues
   * no queries, which is what lets a scale-to-zero database actually suspend.
   */
  async function scheduleNext(): Promise<void> {
    if (!running) return;
    clearTimer();
    if (pendingWake) {
      pendingWake = false;
      drain();
      return;
    }
    let at: Date | null;
    try {
      at = await nextAttemptAt(pool);
    } catch (e) {
      logError("dispatcher", "failed to read the next attempt time:", e);
      return;
    }
    // `running` can have been cleared by stop() while the query was in flight.
    if (!at || !running) return;
    timer = setTimeout(drain, Math.max(0, at.getTime() - Date.now()));
  }

  /** Drain once, then re-arm. Overlapping calls collapse into one follow-up. */
  function drain(): void {
    if (inFlight) {
      pendingWake = true;
      return;
    }
    inFlight = true;
    clearTimer();
    void tick()
      .catch((e) => logError("dispatcher", "tick error:", e))
      .finally(() => {
        inFlight = false;
        void scheduleNext();
      });
  }

  function wake(): void {
    if (running) drain();
  }

  function start(): void {
    if (running) return;
    running = true;
    // The first drain also reaps rows a previous process left mid-flight.
    drain();
  }

  function stop(): void {
    running = false;
    pendingWake = false;
    clearTimer();
  }

  return { tick, wake, start, stop };
}
