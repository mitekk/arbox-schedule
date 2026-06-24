import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { Tx } from "./db";
import {
  MESSAGE_KIND,
  type Message,
  type MessageName,
  type MessagePayloads,
} from "./events";

export interface OutboxRow {
  id: string; // bigserial -> string from pg
  message_id: string;
  kind: string;
  name: MessageName;
  payload: unknown;
  status: string;
  attempts: number;
  next_attempt_at: Date;
  locked_at: Date | null;
  error: string | null;
  created_at: Date;
}

/**
 * Append a message to the outbox within the caller's transaction, so the state
 * change and the emitted message commit atomically. Returns the message_id.
 */
export async function emit<N extends MessageName>(
  tx: Tx,
  name: N,
  payload: MessagePayloads[N],
  messageId: string = randomUUID()
): Promise<string> {
  await tx.query(
    `INSERT INTO platform.outbox (message_id, kind, name, payload)
     VALUES ($1, $2, $3, $4)`,
    [messageId, MESSAGE_KIND[name], name, JSON.stringify(payload)]
  );
  return messageId;
}

/** Atomically claim up to `limit` ready rows (FIFO by id), skipping locked. */
export async function claimBatch(
  pool: Pool,
  limit: number
): Promise<OutboxRow[]> {
  const res = await pool.query<OutboxRow>(
    `UPDATE platform.outbox SET status='processing', locked_at=now()
     WHERE id IN (
       SELECT id FROM platform.outbox
       WHERE status IN ('pending','failed') AND next_attempt_at <= now()
       ORDER BY id
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     )
     RETURNING *`,
    [limit]
  );
  return res.rows;
}

export async function markDone(pool: Pool, id: string): Promise<void> {
  await pool.query(
    `UPDATE platform.outbox SET status='done', locked_at=NULL WHERE id=$1`,
    [id]
  );
}

export async function markFailed(
  pool: Pool,
  id: string,
  attempts: number,
  error: string
): Promise<void> {
  const backoff = Math.min(2 ** attempts, 300);
  await pool.query(
    `UPDATE platform.outbox
     SET status='failed', attempts=$2, error=$3, locked_at=NULL,
         next_attempt_at = now() + make_interval(secs => $4)
     WHERE id=$1`,
    [id, attempts, error.slice(0, 1000), backoff]
  );
}

export async function markDead(
  pool: Pool,
  id: string,
  attempts: number,
  error: string
): Promise<void> {
  await pool.query(
    `UPDATE platform.outbox SET status='dead', attempts=$2, error=$3, locked_at=NULL WHERE id=$1`,
    [id, attempts, error.slice(0, 1000)]
  );
}

/** Re-queue rows stuck in 'processing' past the soft-lease timeout. */
export async function reapStuck(
  pool: Pool,
  olderThanSeconds: number
): Promise<number> {
  const res = await pool.query(
    `UPDATE platform.outbox SET status='pending', locked_at=NULL
     WHERE status='processing' AND locked_at < now() - make_interval(secs => $1)`,
    [olderThanSeconds]
  );
  return res.rowCount ?? 0;
}

export async function isConsumed(
  pool: Pool,
  messageId: string,
  consumer: string
): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM platform.consumed WHERE message_id=$1 AND consumer=$2`,
    [messageId, consumer]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function recordConsumed(
  pool: Pool,
  messageId: string,
  consumer: string
): Promise<void> {
  await pool.query(
    `INSERT INTO platform.consumed (message_id, consumer) VALUES ($1,$2)
     ON CONFLICT DO NOTHING`,
    [messageId, consumer]
  );
}

export function toMessage(row: OutboxRow): Message {
  return {
    messageId: row.message_id,
    name: row.name,
    kind: MESSAGE_KIND[row.name],
    payload: row.payload,
  } as Message;
}
