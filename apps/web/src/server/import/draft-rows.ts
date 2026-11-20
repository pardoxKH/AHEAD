import type { ProposedTask, QueueLine } from "@ahead/ai";
import type { NewSource, NewTask } from "@ahead/db";
import { zonedTimeToUtc } from "../dates";

export const SNIPPET_MAX_CHARS = 300;
export const SNIPPET_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface DraftContext {
  userId: string;
  docUrl: string;
  docTitle: string | undefined;
  lines: readonly QueueLine[];
  now: Date;
  timeZone: string;
  /** Local hour a due date resolves to (the user's day end). */
  dueHour: number;
  /** Makes row ids; injected so tests get stable values. */
  newId: () => string;
}

export interface DraftRow {
  source: NewSource & { id: string };
  task: NewTask & { id: string; rootId: string };
  /** Resolved to a contact by the store. */
  waitingOn?: string;
}

/** First `max` characters, counted as code points (as Postgres counts varchar length). */
export function capSnippet(text: string, max = SNIPPET_MAX_CHARS): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max).join("");
}

/**
 * Maps a proposal to draft rows: one import source per task, parents before children, root_id the
 * top-level ancestor (a root points at itself), done items as 'done', everything else 'proposed'.
 */
export function buildDraftRows(proposal: readonly ProposedTask[], ctx: DraftContext): DraftRow[] {
  const rows: DraftRow[] = [];
  const siblingCount = new Map<string, number>();

  proposal.forEach((proposed, index) => {
    const parent = proposed.parentIndex !== undefined ? rows[proposed.parentIndex] : undefined;
    if (proposed.parentIndex !== undefined && (!parent || proposed.parentIndex >= index)) {
      throw new Error(`Task ${index} has a parentIndex that is not an earlier task`);
    }
    const id = ctx.newId();
    const siblingKey = parent?.task.id ?? "";
    const position = siblingCount.get(siblingKey) ?? 0;
    siblingCount.set(siblingKey, position + 1);

    const text = proposed.sourceLineIndexes.map((i) => ctx.lines[i]?.text ?? "").join("\n");
    const source: DraftRow["source"] = {
      id: ctx.newId(),
      userId: ctx.userId,
      kind: "import",
      link: ctx.docUrl,
      subject: ctx.docTitle ?? null,
      snippet: capSnippet(text),
      snippetExpiresAt: new Date(ctx.now.getTime() + SNIPPET_TTL_MS),
    };
    const task: DraftRow["task"] = {
      id,
      userId: ctx.userId,
      parentId: parent?.task.id ?? null,
      rootId: parent?.task.rootId ?? id,
      title: proposed.title,
      status: proposed.done ? "done" : "proposed",
      inReview: true,
      area: proposed.area,
      dueAt: proposed.dueDate ? zonedTimeToUtc(proposed.dueDate, ctx.dueHour, ctx.timeZone) : null,
      dueDateConfidence: proposed.dueDate ? proposed.dueDateConfidence : "none",
      effortMin: proposed.effortMin ?? null,
      effortSource: proposed.effortMin !== undefined ? "suggested" : null,
      confidence: proposed.confidence,
      sourceId: source.id,
      position,
    };
    rows.push({ source, task, ...(proposed.waitingOn !== undefined && { waitingOn: proposed.waitingOn }) });
  });
  return rows;
}
