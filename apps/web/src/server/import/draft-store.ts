import { and, eq, inArray, isNull, notExists, sql } from "drizzle-orm";
import { auditLog, contacts, sources, tasks, type Db } from "@ahead/db";
import type { DraftRow } from "./draft-rows";
import type { IssueCounts } from "./issues";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface SaveDraftInput {
  userId: string;
  docId: string;
  docUrl: string;
  rows: readonly DraftRow[];
  issues: IssueCounts;
}

/**
 * Stores an import draft in one transaction. Rows still in review from an earlier import of the same
 * doc are replaced; accepted tasks and other docs' drafts are left alone.
 */
export async function saveImportDraft(db: Db, input: SaveDraftInput): Promise<void> {
  await db.transaction(async (tx) => {
    await deletePreviousDraft(tx, input.userId, input.docUrl);
    const contactIds = await resolveContacts(tx, input.userId, input.rows);

    if (input.rows.length > 0) {
      await tx.insert(sources).values(input.rows.map((row) => row.source));
      // Parents come first in `rows`, and the self-references are checked at the end of the statement.
      await tx.insert(tasks).values(
        input.rows.map((row) => ({
          ...row.task,
          waitingOnContactId: row.waitingOn ? (contactIds.get(contactKey(row.waitingOn)) ?? null) : null,
        })),
      );
    }

    await tx.insert(auditLog).values({
      userId: input.userId,
      actor: "web",
      action: "import.draft",
      target: input.docId,
      meta: { tasks: input.rows.length, issues: input.issues },
    });
  });
}

async function deletePreviousDraft(tx: Tx, userId: string, docUrl: string): Promise<void> {
  const fromDoc = and(eq(sources.userId, userId), eq(sources.kind, "import"), eq(sources.link, docUrl));
  const docSources = tx.select({ id: sources.id }).from(sources).where(fromDoc);
  await tx
    .delete(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.inReview, true), inArray(tasks.sourceId, docSources)));
  // Drop the sources nothing points at any more; accepted tasks keep theirs.
  await tx.delete(sources).where(
    and(
      fromDoc,
      notExists(
        tx
          .select({ one: sql`1` })
          .from(tasks)
          .where(eq(tasks.sourceId, sources.id)),
      ),
    ),
  );
}

const contactKey = (name: string) => name.trim().toLowerCase();

/** Finds or creates one contact per distinct waiting-on name (matched case-insensitively by name). */
async function resolveContacts(tx: Tx, userId: string, rows: readonly DraftRow[]) {
  const names = new Map<string, string>();
  for (const row of rows) if (row.waitingOn) names.set(contactKey(row.waitingOn), row.waitingOn.trim());

  const ids = new Map<string, string>();
  if (names.size === 0) return ids;
  const existing = await tx
    .select({ id: contacts.id, name: contacts.name })
    .from(contacts)
    .where(
      and(
        eq(contacts.userId, userId),
        isNull(contacts.email),
        inArray(sql`lower(${contacts.name})`, [...names.keys()]),
      ),
    );
  for (const c of existing) if (c.name) ids.set(contactKey(c.name), c.id);

  const missing = [...names].filter(([key]) => !ids.has(key));
  if (missing.length > 0) {
    const created = await tx
      .insert(contacts)
      .values(missing.map(([, name]) => ({ userId, name })))
      .returning({ id: contacts.id, name: contacts.name });
    for (const c of created) if (c.name) ids.set(contactKey(c.name), c.id);
  }
  return ids;
}
