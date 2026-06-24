import type { Pool } from "pg";

export async function wasSent(pool: Pool, dedupeKey: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM notification.sent_email WHERE dedupe_key=$1`,
    [dedupeKey]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function recordSent(
  pool: Pool,
  dedupeKey: string,
  kind: string
): Promise<void> {
  await pool.query(
    `INSERT INTO notification.sent_email (dedupe_key, kind) VALUES ($1,$2)
     ON CONFLICT DO NOTHING`,
    [dedupeKey, kind]
  );
}
