import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import type { Pool } from "pg";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "migrations");

/**
 * Apply any migrations/*.sql files not yet recorded in
 * platform.schema_migrations, each in its own transaction, in filename order.
 * The bookkeeping table itself is created here (not in a migration file).
 */
export async function runMigrations(pool: Pool): Promise<string[]> {
  await pool.query("CREATE SCHEMA IF NOT EXISTS platform");
  await pool.query(
    `CREATE TABLE IF NOT EXISTS platform.schema_migrations (
       name text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`
  );

  const appliedRes = await pool.query<{ name: string }>(
    "SELECT name FROM platform.schema_migrations"
  );
  const applied = new Set(appliedRes.rows.map((r) => r.name));

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO platform.schema_migrations(name) VALUES ($1)",
        [file]
      );
      await client.query("COMMIT");
      ran.push(file);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
  return ran;
}

async function main(): Promise<void> {
  await import("dotenv/config");
  const { Pool } = await import("pg");
  const { loadConfig } = await import("./config");
  const config = loadConfig();
  const pool = new Pool({ connectionString: config.databaseUrl });
  try {
    const ran = await runMigrations(pool);
    console.log(
      ran.length ? `Applied: ${ran.join(", ")}` : "No new migrations"
    );
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
