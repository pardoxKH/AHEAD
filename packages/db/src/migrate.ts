// Self-contained (no local imports) so `pnpm migrate` runs it directly with Node's type stripping.
import { fileURLToPath } from "node:url";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

export const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

export async function runMigrations(db: NodePgDatabase<Record<string, unknown>>): Promise<void> {
  await migrate(db, { migrationsFolder });
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await runMigrations(drizzle(pool));
    console.log("Migrations applied");
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
