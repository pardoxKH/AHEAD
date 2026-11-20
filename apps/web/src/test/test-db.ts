import { sql } from "drizzle-orm";
import pg from "pg";
import { createDb, runMigrations, type DbHandle } from "@ahead/db";

/**
 * packages/db's tests drop and recreate the schema of DATABASE_URL while other files run, so each web
 * test file uses its own database next to it: `<name>_test` becomes `<name>_<suffix>_test`.
 */
export async function webTestDatabaseUrl(url: string, suffix: string): Promise<string> {
  const parsed = new URL(url);
  const name = parsed.pathname.slice(1);
  if (!name.endsWith("_test"))
    throw new Error("DATABASE_URL must name a *_test database; these tests wipe it.");
  if (!/^\w+$/.test(suffix)) throw new Error("suffix must be a plain identifier");
  const webName = name.replace(/_test$/, `_${suffix}_test`);

  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  try {
    const { rowCount } = await admin.query("select 1 from pg_database where datname = $1", [webName]);
    if (!rowCount) await admin.query(`create database "${webName}"`);
  } finally {
    await admin.end();
  }
  parsed.pathname = `/${webName}`;
  return parsed.toString();
}

/** A freshly migrated, empty database for one test file. The caller ends the pool. */
export async function freshTestDb(url: string, suffix: string): Promise<DbHandle> {
  const handle = createDb(await webTestDatabaseUrl(url, suffix));
  await handle.db.execute(sql`drop schema if exists drizzle cascade`);
  await handle.db.execute(sql`drop schema if exists public cascade`);
  await handle.db.execute(sql`create schema public`);
  await runMigrations(handle.db);
  return handle;
}
