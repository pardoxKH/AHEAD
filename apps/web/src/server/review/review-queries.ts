import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { auditLog, contacts, sources, tasks, type Db } from "@ahead/db";
import { parseDocLink } from "../import/doc-link";
import { readIssueCounts, type IssueCounts } from "../import/issues";

export type ReviewRow = Awaited<ReturnType<typeof loadReviewRows>>[number];

/** The user's in-review tasks with their waiting-on name and source doc. */
export async function loadReviewRows(db: Db, userId: string) {
  return db
    .select({
      id: tasks.id,
      parentId: tasks.parentId,
      rootId: tasks.rootId,
      position: tasks.position,
      title: tasks.title,
      status: tasks.status,
      area: tasks.area,
      dueAt: tasks.dueAt,
      dueDateConfidence: tasks.dueDateConfidence,
      effortMin: tasks.effortMin,
      waitingOn: contacts.name,
      docLink: sources.link,
      docTitle: sources.subject,
    })
    .from(tasks)
    .leftJoin(contacts, eq(contacts.id, tasks.waitingOnContactId))
    .leftJoin(sources, eq(sources.id, tasks.sourceId))
    .where(and(eq(tasks.userId, userId), eq(tasks.inReview, true)))
    .orderBy(asc(tasks.createdAt), asc(tasks.position));
}

/** Issue counts of the latest import of each doc that still has rows in review. */
export async function loadImportIssues(
  db: Db,
  userId: string,
  docLinks: readonly string[],
): Promise<IssueCounts[]> {
  const docIds = [...new Set(docLinks.map((link) => parseDocLink(link)?.docId).filter((id) => id))];
  if (docIds.length === 0) return [];
  const rows = await db
    .select({ target: auditLog.target, meta: auditLog.meta })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.userId, userId),
        eq(auditLog.action, "import.draft"),
        inArray(auditLog.target, docIds as string[]),
      ),
    )
    .orderBy(desc(auditLog.createdAt));
  const latest = new Map<string, unknown>();
  for (const row of rows) if (row.target && !latest.has(row.target)) latest.set(row.target, row.meta);
  return [...latest.values()].map((meta) => readIssueCounts((meta as { issues?: unknown } | null)?.issues));
}
