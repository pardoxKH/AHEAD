import { describe, expect, it } from "vitest";
import type { ProposedTask, QueueLine } from "@ahead/ai";
import { buildDraftRows, capSnippet, SNIPPET_TTL_MS, type DraftContext } from "./draft-rows";

const lines: QueueLine[] = [
  { text: "Offsite prep", done: false, level: 0 },
  { text: "Book venue by Thursday", done: true, level: 1 },
  { text: "Agenda — waiting on Sara", done: false, level: 1 },
  { text: "Draft outline", done: false, level: 2 },
  { text: "Renew passport", done: false, level: 0 },
];

const task = (overrides: Partial<ProposedTask> & Pick<ProposedTask, "sourceLineIndexes" | "title">) =>
  ({ area: "work", dueDateConfidence: "none", done: false, confidence: 0.9, ...overrides }) as ProposedTask;

const proposal: ProposedTask[] = [
  task({ sourceLineIndexes: [0], title: "Prepare the offsite" }),
  task({
    sourceLineIndexes: [1],
    title: "Book the venue",
    parentIndex: 0,
    done: true,
    dueDate: "2026-11-26",
    dueDateConfidence: "stated",
  }),
  task({ sourceLineIndexes: [2], title: "Write the agenda", parentIndex: 0, waitingOn: "Sara" }),
  task({
    sourceLineIndexes: [3],
    title: "Draft the outline",
    parentIndex: 2,
    effortMin: 30,
    dueDate: "2026-11-24",
    dueDateConfidence: "guessed",
  }),
  task({ sourceLineIndexes: [4], title: "Renew passport", area: "travel" }),
];

function context(over: Partial<DraftContext> = {}): DraftContext {
  let n = 0;
  return {
    userId: "user-1",
    docUrl: "https://docs.google.com/document/d/doc1/edit",
    docTitle: "Queue",
    lines,
    now: new Date("2026-11-20T08:00:00Z"),
    timeZone: "Asia/Riyadh",
    dueHour: 17,
    newId: () => `id-${n++}`,
    ...over,
  };
}

describe("buildDraftRows", () => {
  it("links parents and roots to the top-level ancestor", () => {
    const rows = buildDraftRows(proposal, context());
    const [root, venue, agenda, outline, passport] = rows.map((r) => r.task);
    expect(root).toMatchObject({ parentId: null, rootId: root!.id, position: 0 });
    expect(venue).toMatchObject({ parentId: root!.id, rootId: root!.id, position: 0 });
    expect(agenda).toMatchObject({ parentId: root!.id, rootId: root!.id, position: 1 });
    expect(outline).toMatchObject({ parentId: agenda!.id, rootId: root!.id, position: 0 });
    expect(passport).toMatchObject({ parentId: null, rootId: passport!.id, position: 1, area: "travel" });
  });

  it("stores done items as done and the rest as proposed, all in review", () => {
    const rows = buildDraftRows(proposal, context());
    expect(rows.map((r) => r.task.status)).toEqual(["proposed", "done", "proposed", "proposed", "proposed"]);
    expect(rows.every((r) => r.task.inReview)).toBe(true);
  });

  it("keeps due date confidence, effort and waiting-on", () => {
    const rows = buildDraftRows(proposal, context());
    expect(rows[1]!.task).toMatchObject({ dueDateConfidence: "stated", effortMin: null });
    expect(rows[1]!.task.dueAt?.toISOString()).toBe("2026-11-26T14:00:00.000Z");
    expect(rows[3]!.task).toMatchObject({
      dueDateConfidence: "guessed",
      effortMin: 30,
      effortSource: "suggested",
    });
    expect(rows[0]!.task).toMatchObject({ dueAt: null, dueDateConfidence: "none" });
    expect(rows[2]!.waitingOn).toBe("Sara");
    expect(rows[0]!.waitingOn).toBeUndefined();
  });

  it("gives each task an import source with the doc link, title and an expiring snippet", () => {
    const ctx = context();
    const rows = buildDraftRows(proposal, ctx);
    for (const { source, task: t } of rows) {
      expect(t.sourceId).toBe(source.id);
      expect(source).toMatchObject({ userId: "user-1", kind: "import", link: ctx.docUrl, subject: "Queue" });
      expect(source.snippetExpiresAt?.getTime()).toBe(ctx.now.getTime() + SNIPPET_TTL_MS);
    }
    expect(rows[2]!.source.snippet).toBe("Agenda — waiting on Sara");
  });

  it("caps the snippet at 300 characters, counting code points", () => {
    const long = "🙂".repeat(250) + "x".repeat(200);
    const rows = buildDraftRows([task({ sourceLineIndexes: [0, 1], title: "Long" })], {
      ...context(),
      lines: [
        { text: long, done: false, level: 0 },
        { text: "second line", done: false, level: 0 },
      ],
    });
    const snippet = rows[0]!.source.snippet!;
    expect(Array.from(snippet)).toHaveLength(300);
    expect(snippet.startsWith("🙂".repeat(250))).toBe(true);
    expect(capSnippet("short")).toBe("short");
  });

  it("refuses a parentIndex that does not point at an earlier task", () => {
    expect(() =>
      buildDraftRows([task({ sourceLineIndexes: [0], title: "A", parentIndex: 0 })], context()),
    ).toThrow(/parentIndex/);
  });
});
