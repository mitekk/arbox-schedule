import { Pool, type PoolClient } from "pg";

export type Tx = PoolClient;

/** A pool or a transaction client — for repo functions usable in either. */
export type Db = Pool | PoolClient;

export function createPool(connectionString: string): Pool {
  // Neon requires SSL; the connection string carries sslmode=require.
  return new Pool({ connectionString, max: 10 });
}

/**
 * Run `fn` inside a single transaction. Commits on success, rolls back on
 * throw. The same client is passed to `fn` so all of its queries — the state
 * change AND the outbox append — commit atomically.
 */
export async function withTx<T>(
  pool: Pool,
  fn: (tx: Tx) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
