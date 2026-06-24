import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { runMigrations } from "../../src/platform/migrate";

export interface TestDb {
  pool: Pool;
  stop: () => Promise<void>;
}

/**
 * Start a throwaway Postgres (real `SKIP LOCKED` / advisory locks / ON CONFLICT)
 * and apply all migrations. Used by integration tests; needs a running Docker.
 */
export async function startTestDb(): Promise<TestDb> {
  const container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const pool = new Pool({ connectionString: container.getConnectionUri() });
  await runMigrations(pool);
  return {
    pool,
    stop: async () => {
      await pool.end();
      await container.stop();
    },
  };
}

export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(
    `TRUNCATE platform.outbox, platform.consumed, arbox.effect_ledger,
              notification.sent_email RESTART IDENTITY`
  );
}
