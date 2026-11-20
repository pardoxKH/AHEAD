import { and, asc, count, eq, ne } from "drizzle-orm";
import { tasks, type Db } from "@ahead/db";

export type TodayRow = Awaited<ReturnType<typeof loadAcceptedTasks>>[number];

/** Accepted tasks (not in review, not dropped); the page shows the trees that still have open work. */
export async function loadAcceptedTasks(db: Db, userId: string) {
  return db
    .select({
      id: tasks.id,
      parentId: tasks.parentId,
      rootId: tasks.rootId,
      position: tasks.position,
      title: tasks.title,
      status: tasks.status,
      dueAt: tasks.dueAt,
    })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.inReview, false), ne(tasks.status, "dropped")))
    .orderBy(asc(tasks.createdAt), asc(tasks.position));
}

export async function countInReview(db: Db, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.inReview, true)));
  return row?.n ?? 0;
}
