import { DEFAULT_WORK_WEEK, dayOfWeekIn } from "@ahead/core";
import { z } from "zod";
import type { AiClient } from "./client.js";
import { EXTRACTION_MODEL } from "./models.js";

/** One line of the imported Google Doc queue, already parsed. */
export interface QueueLine {
  text: string;
  done: boolean;
  /** Nesting depth; 0 is top level. */
  level: number;
}

export const AREAS = ["work", "learning", "travel", "personal"] as const;
export type Area = (typeof AREAS)[number];

export interface ProposedTask {
  /** Indexes into the input `lines`. */
  sourceLineIndexes: number[];
  title: string;
  area: Area;
  dueDate?: string;
  dueDateConfidence: "stated" | "guessed" | "none";
  effortMin?: number;
  waitingOn?: string;
  /** Index of the parent task in the returned array; always earlier than this task. */
  parentIndex?: number;
  done: boolean;
  confidence: number;
}

export interface ImportIssue {
  /** Which chunk of the queue (0-based), and the item's position in the model's reply for that chunk. */
  chunk: number;
  item: number;
  problem: string;
}

export interface ProposeTasksInput {
  lines: readonly QueueLine[];
  /** YYYY-MM-DD in the user's time zone. */
  today: string;
  timeZone?: string;
  /** Called for every item dropped or corrected during validation, so the UI can flag it. */
  onIssue?: (issue: ImportIssue) => void;
}

export const CHUNK_SIZE = 60;
/** A chunk may run past CHUNK_SIZE to keep a parent's nested lines together, up to this many lines. */
const MAX_CHUNK_SIZE = 90;

// Sent to the model as the structured-output schema. No length or range constraints here:
// those are checked per item below so one bad item does not sink the whole chunk.
const replySchema = z.object({
  tasks: z.array(
    z.object({
      sourceLineIndexes: z.array(z.number().int()),
      title: z.string(),
      area: z.enum(AREAS),
      dueDate: z.string().nullable(),
      dueDateConfidence: z.enum(["stated", "guessed", "none"]),
      effortMin: z.number().int().nullable(),
      waitingOn: z.string().nullable(),
      parentIndex: z.number().int().nullable(),
      done: z.boolean(),
      confidence: z.number(),
    }),
  ),
});
type ReplyTask = z.infer<typeof replySchema>["tasks"][number];

const itemSchema = z.object({
  title: z.string().trim().min(1).max(80),
  dueDate: z.iso.date().nullable(),
  effortMin: z.number().int().positive().nullable(),
  confidence: z.number().min(0).max(1),
});

export const IMPORT_QUEUE_SYSTEM = `You turn Tariq's task queue, imported from a Google Doc, into proposed tasks that he will review and confirm.

About Tariq: a delivery leader who wears several hats (delivery, people management, his own learning, travel and personal life). His working week is Sunday to Thursday; Friday and Saturday are the weekend. He lives in Asia/Riyadh.

Input: a JSON object per line with its index "i", nesting "level" (0 is top level), "done" and "text". You may receive one chunk of a longer queue; use the line indexes exactly as given.

Return one task per actionable line, in queue order:
- sourceLineIndexes: the input line indexes the task came from. Usually one line; merge only when a line is plainly a continuation of the one before. Skip headings, blank or purely decorative lines, and notes that are not tasks, but keep a heading's index on the task it introduces if it adds meaning.
- title: imperative, specific, at most 80 characters ("Send Q3 budget to Finance", not "Budget").
- area: work, learning, travel or personal.
- done: true for every line marked done. Never mark a done line as not done.
- dueDate (YYYY-MM-DD) and dueDateConfidence: "stated" when the text gives a date or a day that resolves to one; "guessed" only when the text implies a deadline without stating it ("before the offsite", "end of week"); otherwise dueDate null and "none". Never invent a deadline. Resolve relative dates from today's date in the request, using the Sunday to Thursday week ("end of week" is Thursday).
- effortMin: minutes, only when the text states or clearly implies the effort; otherwise null.
- waitingOn: the person or thing the task is blocked on, only when the text says so; otherwise null.
- parentIndex: when a nested line is a step of the line above it, the position (0-based) in your returned tasks array of its parent task, which must come earlier. Top-level tasks use null.
- confidence: 0 to 1, how sure you are that this task reflects what Tariq meant.`;

export async function proposeTasksFromQueue(ai: AiClient, input: ProposeTasksInput): Promise<ProposedTask[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.today))
    throw new Error(`today must be YYYY-MM-DD, got "${input.today}"`);
  const timeZone = input.timeZone ?? DEFAULT_WORK_WEEK.timeZone;
  const weekday = WEEKDAYS[dayOfWeekIn(new Date(`${input.today}T12:00:00Z`), "UTC")];

  const result: ProposedTask[] = [];
  for (const [chunkNumber, chunk] of chunkLines(input.lines).entries()) {
    const reply = await ai.generateJson({
      model: EXTRACTION_MODEL,
      purpose: "import-queue",
      system: IMPORT_QUEUE_SYSTEM,
      prompt: [
        `Today is ${input.today} (${weekday}) in ${timeZone}.`,
        "<queue>",
        ...chunk.map((i) =>
          JSON.stringify({
            i,
            level: input.lines[i]!.level,
            done: input.lines[i]!.done,
            text: input.lines[i]!.text,
          }),
        ),
        "</queue>",
      ].join("\n"),
      schema: replySchema,
    });
    const report = (item: number, problem: string) => input.onIssue?.({ chunk: chunkNumber, item, problem });
    result.push(...validateChunk(reply.tasks, chunk, input.lines, result.length, report));
  }
  return result;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Splits line indexes into chunks of about CHUNK_SIZE, preferring to cut before a top-level line. */
export function chunkLines(lines: readonly QueueLine[]): number[][] {
  const chunks: number[][] = [];
  let current: number[] = [];
  lines.forEach((line, i) => {
    const full = current.length >= CHUNK_SIZE && (line.level === 0 || current.length >= MAX_CHUNK_SIZE);
    if (full) {
      chunks.push(current);
      current = [];
    }
    current.push(i);
  });
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function validateChunk(
  tasks: readonly ReplyTask[],
  chunk: readonly number[],
  lines: readonly QueueLine[],
  offset: number,
  report: (item: number, problem: string) => void,
): ProposedTask[] {
  const inChunk = new Set(chunk);
  const kept: ProposedTask[] = [];
  // Position in the model's reply -> position in the returned array, for remapping parentIndex.
  const newIndex = new Map<number, number>();

  tasks.forEach((task, item) => {
    const checked = itemSchema.safeParse(task);
    if (!checked.success) {
      report(item, `invalid ${checked.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
      return;
    }
    const sources = [...new Set(task.sourceLineIndexes)];
    if (sources.length === 0 || sources.some((i) => !inChunk.has(i))) {
      report(item, "sourceLineIndexes empty or out of range");
      return;
    }

    const { title, dueDate, effortMin, confidence } = checked.data;
    const proposed: ProposedTask = {
      sourceLineIndexes: sources.sort((a, b) => a - b),
      title,
      area: task.area,
      dueDateConfidence: "none",
      // Lines marked done in the doc stay done.
      done: task.done || sources.every((i) => lines[i]!.done),
      confidence,
    };
    if (dueDate !== null && task.dueDateConfidence !== "none") {
      proposed.dueDate = dueDate;
      proposed.dueDateConfidence = task.dueDateConfidence;
    } else if (dueDate !== null) {
      report(item, "dueDate given with confidence none; dropped the date");
    }
    if (effortMin !== null) proposed.effortMin = effortMin;
    if (task.waitingOn?.trim()) proposed.waitingOn = task.waitingOn.trim();
    if (task.parentIndex !== null) {
      const parent = task.parentIndex < item ? newIndex.get(task.parentIndex) : undefined;
      if (parent === undefined)
        report(item, "parentIndex does not point to an earlier kept task; made top level");
      else proposed.parentIndex = parent;
    }

    newIndex.set(item, offset + kept.length);
    kept.push(proposed);
  });
  return kept;
}
