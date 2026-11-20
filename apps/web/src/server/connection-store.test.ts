import { eq, sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { auditLog, createDb, oauthTokens, runMigrations, users, type DbHandle } from "@ahead/db";
import { encryptSecret } from "@ahead/google";
import { MissingRefreshTokenError, saveGoogleConnection } from "./connection-store";
import { deleteAccount } from "./delete-account";

const databaseUrl = process.env.DATABASE_URL;

/**
 * packages/db's tests drop and recreate the schema of DATABASE_URL while other files run, so this
 * file uses its own database next to it: `<name>_test` becomes `<name>_web_test`.
 */
async function webTestDatabaseUrl(url: string): Promise<string> {
  const parsed = new URL(url);
  const name = parsed.pathname.slice(1);
  if (!name.endsWith("_test"))
    throw new Error("DATABASE_URL must name a *_test database; these tests wipe it.");
  const webName = name.replace(/_test$/, "_web_test");

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

describe.skipIf(!databaseUrl)("Google connection storage (integration)", () => {
  let handle: DbHandle;
  const email = "owner@example.com";
  const key = Buffer.alloc(32, 3);

  beforeAll(async () => {
    handle = createDb(await webTestDatabaseUrl(databaseUrl ?? ""));
    await handle.db.execute(sql`drop schema if exists drizzle cascade`);
    await handle.db.execute(sql`drop schema if exists public cascade`);
    await handle.db.execute(sql`create schema public`);
    await runMigrations(handle.db);
  });

  afterAll(async () => {
    await handle?.pool.end();
  });

  const tokenRow = async (userId: string) =>
    (await handle.db.select().from(oauthTokens).where(eq(oauthTokens.userId, userId)))[0];

  it("refuses a first connection without a refresh token and stores nothing", async () => {
    await expect(
      saveGoogleConnection(handle.db, { email, encryptedRefreshToken: undefined, scopes: ["openid"] }),
    ).rejects.toBeInstanceOf(MissingRefreshTokenError);
    expect(await handle.db.select().from(users)).toHaveLength(0);
  });

  it("creates the user and token, then keeps the stored token on a re-consent without one", async () => {
    const first = await saveGoogleConnection(handle.db, {
      email,
      encryptedRefreshToken: "enc-1",
      scopes: ["openid", "email"],
    });
    const again = await saveGoogleConnection(handle.db, {
      email,
      encryptedRefreshToken: undefined,
      scopes: ["openid", "email", "extra"],
    });

    expect(again.userId).toBe(first.userId);
    expect(await handle.db.select().from(users)).toHaveLength(1);
    expect(await tokenRow(first.userId)).toMatchObject({
      encryptedRefreshToken: "enc-1",
      scopes: ["openid", "email", "extra"],
    });

    await saveGoogleConnection(handle.db, { email, encryptedRefreshToken: "enc-2", scopes: ["openid"] });
    expect(await tokenRow(first.userId)).toMatchObject({
      encryptedRefreshToken: "enc-2",
      scopes: ["openid"],
    });

    const audits = await handle.db.select().from(auditLog).where(eq(auditLog.userId, first.userId));
    expect(audits).toHaveLength(3);
    expect(audits.every((a) => a.actor === "web" && a.action === "google.connect")).toBe(true);
    expect(JSON.stringify(audits.map((a) => a.meta))).not.toMatch(/enc-/);
  });

  it("deletes everything after revoking the decrypted token", async () => {
    const { userId } = await saveGoogleConnection(handle.db, {
      email,
      encryptedRefreshToken: encryptSecret("refresh-token", key),
      scopes: ["openid"],
    });
    const revokeToken = vi.fn().mockResolvedValue(undefined);

    await expect(deleteAccount(userId, { db: handle.db, encryptionKey: key, revokeToken })).resolves.toEqual({
      revoked: true,
    });
    expect(revokeToken).toHaveBeenCalledWith("refresh-token");
    expect(await handle.db.select().from(users)).toHaveLength(0);
    expect(await handle.db.select().from(oauthTokens)).toHaveLength(0);
    expect(await handle.db.select().from(auditLog)).toHaveLength(0);
  });

  it("still deletes the data when Google refuses the revocation", async () => {
    const { userId } = await saveGoogleConnection(handle.db, {
      email,
      encryptedRefreshToken: encryptSecret("refresh-token", key),
      scopes: ["openid"],
    });
    const revokeToken = vi.fn().mockRejectedValue(new Error("invalid_token"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(deleteAccount(userId, { db: handle.db, encryptionKey: key, revokeToken })).resolves.toEqual({
      revoked: false,
    });
    expect(await handle.db.select().from(users)).toHaveLength(0);
  });
});
