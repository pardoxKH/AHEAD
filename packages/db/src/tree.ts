import { asc, sql } from "drizzle-orm";
import type { Db } from "./client.js";
import { tasks, type Task } from "./schema.js";

/** Loads a task and all its descendants (via parent_id) with a recursive CTE. */
export async function loadTaskTree(db: Db, rootId: string): Promise<Task[]> {
  return db
    .select()
    .from(tasks)
    .where(
      sql`${tasks.id} in (
        with recursive tree as (
          select id from tasks where id = ${rootId}
          union all
          select t.id from tasks t join tree on t.parent_id = tree.id
        )
        select id from tree
      )`,
    )
    .orderBy(asc(tasks.position), asc(tasks.createdAt));
}
