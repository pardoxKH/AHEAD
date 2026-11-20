import "server-only";
import { createDb, type DbHandle } from "@ahead/db";
import { getEnv } from "../env";

// One pool per process. Kept on globalThis so dev-mode module reloads do not open new pools.
const globalForDb = globalThis as typeof globalThis & { aheadDb?: DbHandle };

export function getDb() {
  globalForDb.aheadDb ??= createDb(getEnv().DATABASE_URL);
  return globalForDb.aheadDb.db;
}
