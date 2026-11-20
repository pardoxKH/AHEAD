import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { auditLog, oauthTokens, users, type DbHandle } from "@ahead/db";
import { encryptSecret } from "@ahead/google";
import { freshTestDb } from "../test/test-db";
import { MissingRefreshTokenError, saveGoogleConnection } from "./connection-store";
import { deleteAccount } from "./delete-account";

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("Google connection storage (integration)", () => {
  let handle: DbHandle;
  const email = "owner@example.com";
  const key = Buffer.alloc(32, 3);

  beforeAll(async () => {
    handle = await freshTestDb(databaseUrl ?? "", "web");
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
      revocation: "revoked",
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
      revocation: "failed",
    });
    expect(await handle.db.select().from(users)).toHaveLength(0);
  });

  it("reports nothing to revoke when no token is stored", async () => {
    const [user] = await handle.db.insert(users).values({ email }).returning();
    if (!user) throw new Error("user not inserted");
    const revokeToken = vi.fn();

    await expect(deleteAccount(user.id, { db: handle.db, encryptionKey: key, revokeToken })).resolves.toEqual(
      { revocation: "none" },
    );
    expect(revokeToken).not.toHaveBeenCalled();
    expect(await handle.db.select().from(users)).toHaveLength(0);
  });
});
