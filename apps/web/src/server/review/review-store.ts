import { and, eq, inArray } from "drizzle-orm";
import { tasks, users, type Db, type NewTask, type Task } from "@ahead/db";
import type { AcceptPlan } from "./accept-plan";

export interface OwnedDraftRow {
  id: string;
  parentId: string | null;
  rootId: string | null;
  status: Task["status"];
  dueAt: Date | null;
  effortMin: number | null;
}

export type TaskEdit = { id: string } & Pick<
  NewTask,
  "title" | "area" | "dueAt" | "dueDateConfidence" | "effortMin" | "effortSource"
>;

/** The user's in-review tasks among `ids`. Rows of other users never come back. */
export async function loadOwnedDraftRows(db: Db, userId: string, ids: readonly string[]) {
  return db
    .select({
      id: tasks.id,
      parentId: tasks.parentId,
      rootId: tasks.rootId,
      status: tasks.status,
      dueAt: tasks.dueAt,
      effortMin: tasks.effortMin,
    })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.inReview, true), inArray(tasks.id, [...ids])));
}

/** Ids of the user's in-review tasks in the given trees. */
export async function loadDraftTreeIds(db: Db, userId: string, rootIds: readonly string[]) {
  const rows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.inReview, true), inArray(tasks.rootId, [...rootIds])));
  return rows.map((r) => r.id);
}

export async function loadUserClock(db: Db, userId: string) {
  const [row] = await db
    .select({ timeZone: users.timeZone, dayEndHour: users.dayEndHour })
    .from(users)
    .where(eq(users.id, userId));
  return row ?? null;
}

/** Applies edits and, when given, the accept plan in one transaction, always scoped to the user. */
export async function writeReview(
  db: Db,
  userId: string,
  edits: readonly TaskEdit[],
  plan?: AcceptPlan,
): Promise<void> {
  await db.transaction(async (tx) => {
    const mine = (id: string) => and(eq(tasks.id, id), eq(tasks.userId, userId), eq(tasks.inReview, true));
    for (const { id, ...set } of edits) await tx.update(tasks).set(set).where(mine(id));
    if (!plan) return;
    // Re-parent first: deleting a dropped parent or root cascades to whatever still points at it.
    for (const { id, ...set } of plan.updates) {
      await tx
        .update(tasks)
        .set({ ...set, inReview: false })
        .where(mine(id));
    }
    if (plan.deletes.length > 0) {
      await tx
        .delete(tasks)
        .where(and(eq(tasks.userId, userId), eq(tasks.inReview, true), inArray(tasks.id, plan.deletes)));
    }
  });
}
