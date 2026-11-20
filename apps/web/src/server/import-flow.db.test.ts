import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ProposedTask, QueueLine } from "@ahead/ai";
import { auditLog, contacts, sources, tasks, users, type DbHandle } from "@ahead/db";
import { freshTestDb } from "../test/test-db";
import { recordImportUsage } from "./import/ai-usage";
import { buildDraftRows } from "./import/draft-rows";
import { saveImportDraft } from "./import/draft-store";
import { acceptReview } from "./review/review-actions";
import { loadImportIssues, loadReviewRows } from "./review/review-queries";
import { countInReview, loadAcceptedTasks } from "./today-queries";

const databaseUrl = process.env.DATABASE_URL;
const DOC_A = { docId: "docA", url: "https://docs.google.com/document/d/docA/edit" };
const DOC_B = { docId: "docB", url: "https://docs.google.com/document/d/docB/edit" };

const lines: QueueLine[] = [
  { text: "Offsite", done: false, level: 0 },
  { text: "Book venue", done: true, level: 1 },
  { text: "Agenda, waiting on Sara", done: false, level: 1 },
];
const proposal: ProposedTask[] = [
  {
    sourceLineIndexes: [0],
    title: "Prepare offsite",
    area: "work",
    dueDateConfidence: "none",
    done: false,
    confidence: 1,
  },
  {
    sourceLineIndexes: [1],
    title: "Book venue",
    area: "work",
    dueDateConfidence: "none",
    done: true,
    confidence: 1,
    parentIndex: 0,
  },
  {
    sourceLineIndexes: [2],
    title: "Write agenda",
    area: "work",
    dueDate: "2026-11-24",
    dueDateConfidence: "guessed",
    waitingOn: "Sara",
    done: false,
    confidence: 1,
    parentIndex: 0,
  },
];

describe.skipIf(!databaseUrl)("import flow (integration)", () => {
  let handle: DbHandle;
  let userId: string;
  let otherId: string;

  beforeAll(async () => {
    handle = await freshTestDb(databaseUrl ?? "", "web_import");
  });
  afterAll(async () => {
    await handle?.pool.end();
  });
  beforeEach(async () => {
    await handle.db.delete(users);
    const [u, o] = await handle.db
      .insert(users)
      .values([{ email: "owner@example.com" }, { email: "other@example.com" }])
      .returning({ id: users.id });
    userId = u!.id;
    otherId = o!.id;
  });

  async function importDoc(owner: string, doc: typeof DOC_A, titles = proposal) {
    const rows = buildDraftRows(titles, {
      userId: owner,
      docUrl: doc.url,
      docTitle: "Queue",
      lines,
      now: new Date(),
      timeZone: "Asia/Riyadh",
      dueHour: 17,
      newId: randomUUID,
    });
    await saveImportDraft(handle.db, {
      userId: owner,
      docId: doc.docId,
      docUrl: doc.url,
      rows,
      issues: { invalid_item: 2 },
    });
  }

  const draftTitles = async (owner: string) =>
    (await loadReviewRows(handle.db, owner)).map((r) => r.title).sort();

  it("saves the draft as linked trees with sources, a contact and an audit row", async () => {
    await importDoc(userId, DOC_A);
    const rows = await loadReviewRows(handle.db, userId);
    expect(rows).toHaveLength(3);
    const root = rows.find((r) => r.title === "Prepare offsite")!;
    expect(rows.every((r) => r.rootId === root.id)).toBe(true);
    expect(rows.find((r) => r.title === "Book venue")).toMatchObject({ status: "done", parentId: root.id });
    expect(rows.find((r) => r.title === "Write agenda")).toMatchObject({
      status: "proposed",
      waitingOn: "Sara",
      dueDateConfidence: "guessed",
      docLink: DOC_A.url,
      docTitle: "Queue",
    });
    expect(await handle.db.select().from(sources)).toHaveLength(3);
    expect(await loadImportIssues(handle.db, userId, [DOC_A.url])).toEqual([{ invalid_item: 2 }]);
    expect(await countInReview(handle.db, userId)).toBe(3);
  });

  it("re-importing a doc replaces only that doc's rows still in review", async () => {
    await importDoc(userId, DOC_A);
    await importDoc(userId, DOC_B, [proposal[0]!]);
    await importDoc(otherId, DOC_A);
    await importDoc(userId, DOC_A);

    expect(await draftTitles(userId)).toEqual([
      "Book venue",
      "Prepare offsite",
      "Prepare offsite",
      "Write agenda",
    ]);
    expect(await draftTitles(otherId)).toHaveLength(3);
    const userSources = await handle.db.select().from(sources).where(eq(sources.userId, userId));
    expect(userSources).toHaveLength(4);
    // Contacts are reused, not duplicated.
    expect(await handle.db.select().from(contacts).where(eq(contacts.userId, userId))).toHaveLength(1);
  });

  it("keeps one draft when the same doc is imported concurrently", async () => {
    await Promise.all([importDoc(userId, DOC_A), importDoc(userId, DOC_A), importDoc(userId, DOC_A)]);
    expect(await countInReview(handle.db, userId)).toBe(3);
  });

  it("keeps accepted tasks when the doc is imported again", async () => {
    await importDoc(userId, DOC_A);
    const form = new FormData();
    for (const row of await loadReviewRows(handle.db, userId)) {
      form.append("id", row.id);
      form.set(`title:${row.id}`, row.title);
      form.set(`area:${row.id}`, row.area ?? "work");
      form.set(`due:${row.id}`, "");
      form.set(`effort:${row.id}`, "");
      if (row.title !== "Write agenda") form.set(`keep:${row.id}`, "on");
    }
    await expect(acceptReview(handle.db, userId, form)).resolves.toEqual({ ok: true });

    const accepted = await loadAcceptedTasks(handle.db, userId);
    expect(accepted.map((t) => [t.title, t.status]).sort()).toEqual([
      ["Book venue", "done"],
      ["Prepare offsite", "todo"],
    ]);
    expect(await countInReview(handle.db, userId)).toBe(0);

    await importDoc(userId, DOC_A);
    expect(await loadAcceptedTasks(handle.db, userId)).toHaveLength(2);
    expect(await countInReview(handle.db, userId)).toBe(3);
  });

  it("never touches another user's draft through the review actions", async () => {
    await importDoc(otherId, DOC_A);
    const [theirs] = await loadReviewRows(handle.db, otherId);
    const form = new FormData();
    form.append("id", theirs!.id);
    form.set(`title:${theirs!.id}`, "Hijacked");
    form.set(`area:${theirs!.id}`, "work");

    await expect(acceptReview(handle.db, userId, form)).resolves.toEqual({ ok: false, reason: "not_found" });
    const [row] = await handle.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, theirs!.id)));
    expect(row).toMatchObject({ title: theirs!.title, inReview: true });
  });

  it("records Claude usage as tokens and cost only", async () => {
    await recordImportUsage(handle.db, userId, {
      model: "claude-opus-5-5",
      purpose: "import-queue",
      inputTokens: 1200,
      outputTokens: 300,
      cacheReadTokens: 0,
      cacheCreationTokens: 900,
      costUsd: 0.0123456789,
      unpricedModels: [],
      entries: [],
    });
    const [row] = await handle.db.select().from(auditLog).where(eq(auditLog.action, "ai.import_queue"));
    expect(row).toMatchObject({
      actor: "web",
      userId,
      inputTokens: 1200,
      outputTokens: 300,
      costUsd: "0.012346",
    });
  });
});
