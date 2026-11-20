import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "./client.js";
import { runMigrations } from "./migrate.js";
import { planBlocks, sources, taskDeps, tasks, users } from "./schema.js";
import { loadTaskTree } from "./tree.js";

const databaseUrl = process.env.DATABASE_URL;

/** Drizzle wraps driver errors; the Postgres SQLSTATE lives on the error or its cause. */
async function pgErrorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (err) {
    const e = err as { code?: string; cause?: { code?: string } };
    return e.code ?? e.cause?.code;
  }
  throw new Error("expected the query to fail");
}

// These tests drop and recreate the schema. Refuse anything but a *_test database.
if (databaseUrl && !new URL(databaseUrl).pathname.endsWith("_test")) {
  throw new Error("DATABASE_URL must point at a database whose name ends in _test; these tests wipe it.");
}

describe.skipIf(!databaseUrl)("db (integration)", () => {
  let handle: DbHandle;
  let userId: string;

  beforeAll(async () => {
    handle = createDb(databaseUrl ?? "");
    await handle.db.execute(sql`drop schema if exists drizzle cascade`);
    await handle.db.execute(sql`drop schema if exists public cascade`);
    await handle.db.execute(sql`create schema public`);
    await runMigrations(handle.db);
    const [user] = await handle.db.insert(users).values({ email: "test@example.com" }).returning();
    if (!user) throw new Error("user not inserted");
    userId = user.id;
  });

  afterAll(async () => {
    await handle?.pool.end();
  });

  async function insertTask(title: string, parentId?: string, rootId?: string) {
    const [task] = await handle.db
      .insert(tasks)
      .values({ userId, title, parentId: parentId ?? null, rootId: rootId ?? null })
      .returning();
    if (!task) throw new Error("task not inserted");
    return task;
  }

  it("applies user defaults", async () => {
    const [user] = await handle.db.select().from(users);
    expect(user).toMatchObject({
      timeZone: "Asia/Riyadh",
      workingDays: [0, 1, 2, 3, 4],
      dayStartHour: 8,
      dayEndHour: 17,
      briefHour: 7,
    });
  });

  it("loads a 3-level task tree and nothing outside it", async () => {
    const root = await insertTask("Trip");
    const child = await insertTask("Book flights", root.id, root.id);
    const grandchild = await insertTask("Compare fares", child.id, root.id);
    await insertTask("Unrelated");

    const tree = await loadTaskTree(handle.db, root.id);
    expect(tree.map((t) => t.id).sort()).toEqual([root.id, child.id, grandchild.id].sort());
  });

  it("rejects a task depending on itself", async () => {
    const task = await insertTask("Self");
    const code = await pgErrorCode(
      handle.db.insert(taskDeps).values({ userId, taskId: task.id, dependsOnId: task.id }),
    );
    expect(code).toBe("23514");
  });

  it("rejects a plan block that ends before it starts", async () => {
    const task = await insertTask("Block");
    const code = await pgErrorCode(
      handle.db.insert(planBlocks).values({
        userId,
        taskId: task.id,
        startAt: new Date("2026-01-04T10:00:00Z"),
        endAt: new Date("2026-01-04T09:00:00Z"),
      }),
    );
    expect(code).toBe("23514");
  });

  it("rejects a snippet longer than 300 characters", async () => {
    const code = await pgErrorCode(
      handle.db.insert(sources).values({ userId, kind: "email", snippet: "x".repeat(301) }),
    );
    expect(code).toBe("22001");
  });
});
