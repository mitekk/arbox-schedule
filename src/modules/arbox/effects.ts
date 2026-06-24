import type { Pool } from "pg";

export type EffectType = "book" | "confirm" | "standby-join" | "cancel";

export interface EffectKey {
  effectType: EffectType;
  scheduleId: number;
  forDate: string; // YYYY-MM-DD
  attemptKey?: string; // distinguishes a legitimate retry/rebook; default ''
}

function keyArgs(k: EffectKey): [EffectType, number, string, string] {
  return [k.effectType, k.scheduleId, k.forDate, k.attemptKey ?? ""];
}

/**
 * Try to claim the lease for an effect. Returns true if THIS caller won and may
 * proceed with the (non-idempotent) Arbox call; false if another path already
 * owns it (caller must NOT call Arbox). Committed immediately — this is the
 * primary guard against double-booking the real account.
 */
export async function acquireLease(
  pool: Pool,
  key: EffectKey
): Promise<boolean> {
  const res = await pool.query(
    `INSERT INTO arbox.effect_ledger (effect_type, schedule_id, for_date, attempt_key, status)
     VALUES ($1,$2,$3,$4,'in_progress')
     ON CONFLICT (effect_type, schedule_id, for_date, attempt_key) DO NOTHING
     RETURNING id`,
    keyArgs(key)
  );
  return (res.rowCount ?? 0) > 0;
}

export async function completeLease(
  pool: Pool,
  key: EffectKey,
  result?: unknown
): Promise<void> {
  await pool.query(
    `UPDATE arbox.effect_ledger SET status='done', result=$5, updated_at=now()
     WHERE effect_type=$1 AND schedule_id=$2 AND for_date=$3 AND attempt_key=$4`,
    [...keyArgs(key), result === undefined ? null : JSON.stringify(result)]
  );
}

export async function failLease(
  pool: Pool,
  key: EffectKey,
  error: string
): Promise<void> {
  await pool.query(
    `UPDATE arbox.effect_ledger SET status='failed', result=$5, updated_at=now()
     WHERE effect_type=$1 AND schedule_id=$2 AND for_date=$3 AND attempt_key=$4`,
    [...keyArgs(key), JSON.stringify({ error: error.slice(0, 500) })]
  );
}

export async function getLeaseStatus(
  pool: Pool,
  key: EffectKey
): Promise<string | null> {
  const res = await pool.query<{ status: string }>(
    `SELECT status FROM arbox.effect_ledger
     WHERE effect_type=$1 AND schedule_id=$2 AND for_date=$3 AND attempt_key=$4`,
    keyArgs(key)
  );
  return res.rows[0]?.status ?? null;
}

/**
 * Release a not-yet-done lease so a future attempt can retry. Use ONLY when
 * certain the Arbox effect did NOT happen (e.g. a failure BEFORE the call).
 */
export async function releaseLease(pool: Pool, key: EffectKey): Promise<void> {
  await pool.query(
    `DELETE FROM arbox.effect_ledger
     WHERE effect_type=$1 AND schedule_id=$2 AND for_date=$3 AND attempt_key=$4
       AND status <> 'done'`,
    keyArgs(key)
  );
}
