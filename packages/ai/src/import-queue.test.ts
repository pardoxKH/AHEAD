import { describe, expect, it, vi } from "vitest";
import type { AiClient, StructuredRequest } from "./client.js";
import {
  CHUNK_SIZE,
  IMPORT_QUEUE_SYSTEM,
  chunkLines,
  proposeTasksFromQueue,
  type ImportIssue,
  type QueueLine,
} from "./import-queue.js";

interface ReplyTask {
  sourceLineIndexes: number[];
  title: string;
  area: "work" | "learning" | "travel" | "personal";
  dueDate: string | null;
  dueDateConfidence: "stated" | "guessed" | "none";
  effortMin: number | null;
  waitingOn: string | null;
  parentIndex: number | null;
  parentContextLine: number | null;
  done: boolean;
  confidence: number;
}

function task(sourceLineIndexes: number[], overrides: Partial<ReplyTask> = {}): ReplyTask {
  return {
    sourceLineIndexes,
    title: `Do line ${sourceLineIndexes.join("+")}`,
    area: "work",
    dueDate: null,
    dueDateConfidence: "none",
    effortMin: null,
    waitingOn: null,
    parentIndex: null,
    parentContextLine: null,
    done: false,
    confidence: 0.9,
    ...overrides,
  };
}

/** A fake AiClient that answers each request with the next reply. */
function fakeAi(...replies: ReplyTask[][]) {
  const requests: StructuredRequest<never>[] = [];
  const generateJson = vi.fn(async (request: StructuredRequest<never>) => {
    requests.push(request);
    return { tasks: replies.shift() ?? [] };
  });
  return { ai: { generateJson } as unknown as AiClient, requests };
}

const line = (text: string, level = 0, done = false): QueueLine => ({ text, level, done });

describe("chunkLines", () => {
  it("keeps short queues in one chunk", () => {
    expect(chunkLines([line("a"), line("b")])).toEqual([{ context: [], lines: [0, 1] }]);
  });

  it("splits about every CHUNK_SIZE lines, before a top-level line", () => {
    const lines = Array.from({ length: 130 }, (_, i) => line(`l${i}`, i === 60 || i === 61 ? 1 : 0));
    const chunks = chunkLines(lines);
    expect(chunks.map((c) => c.lines.length)).toEqual([62, 60, 8]);
    expect(chunks.flatMap((c) => c.lines)).toEqual(lines.map((_, i) => i));
    expect(chunks.every((c) => c.context.length === 0)).toBe(true);
  });

  it("caps a chunk in a long list of steps and carries the ancestors as context", () => {
    // 0: level 0, 1: level 1, then 198 level-2 steps
    const lines = Array.from({ length: 200 }, (_, i) => line(`l${i}`, Math.min(i, 2)));
    const chunks = chunkLines(lines);
    expect(chunks.map((c) => c.lines.length)).toEqual([90, 90, 20]);
    expect(chunks.map((c) => c.context)).toEqual([[], [0, 1], [0, 1]]);
  });
});

describe("proposeTasksFromQueue", () => {
  it("sends today, weekday, time zone and indexed lines, with a stable system prompt", async () => {
    const { ai, requests } = fakeAi([task([0])]);
    await proposeTasksFromQueue(ai, { lines: [line("Ship the roadmap", 0, true)], today: "2026-11-20" });

    expect(requests).toHaveLength(1);
    expect(requests[0]!.model).toBe("claude-opus-5-5");
    expect(requests[0]!.system).toBe(IMPORT_QUEUE_SYSTEM);
    expect(requests[0]!.prompt).toContain("Today is 2026-11-20 (Friday) in Asia/Riyadh.");
    expect(requests[0]!.prompt).toContain('{"i":0,"level":0,"done":true,"text":"Ship the roadmap"}');
    expect(IMPORT_QUEUE_SYSTEM).not.toContain("2026");
  });

  it("chunks long queues and offsets parentIndex into the combined list", async () => {
    const lines = Array.from({ length: CHUNK_SIZE + 2 }, (_, i) =>
      line(`l${i}`, i === CHUNK_SIZE + 1 ? 1 : 0),
    );
    const first = Array.from({ length: CHUNK_SIZE }, (_, i) => task([i]));
    const second = [task([CHUNK_SIZE]), task([CHUNK_SIZE + 1], { parentIndex: 0 })];
    const { ai, requests } = fakeAi(first, second);

    const tasks = await proposeTasksFromQueue(ai, { lines, today: "2026-11-20" });
    expect(requests).toHaveLength(2);
    expect(requests[1]!.system).toBe(requests[0]!.system);
    expect(tasks).toHaveLength(CHUNK_SIZE + 2);
    expect(tasks[CHUNK_SIZE + 1]!.parentIndex).toBe(CHUNK_SIZE);
  });

  it("drops or corrects invalid items and reports each one", async () => {
    const lines = [line("Plan offsite"), line("Book venue", 1), line("Old thing", 0, true), line("x")];
    const { ai } = fakeAi([
      task([0], { dueDate: "2026-11-26", dueDateConfidence: "stated", effortMin: 30, waitingOn: " Sara " }),
      task([9]), // out of range
      task([1], { parentIndex: 0 }),
      task([2], { done: false }), // done line stays done
      task([3], { title: "x".repeat(81) }), // too long
      task([3], { parentIndex: 6 }), // points forward
      task([3], { confidence: 1.5 }),
      task([3], { dueDate: "2026-02-30", dueDateConfidence: "guessed" }),
      task([3], { dueDate: "2026-12-01", dueDateConfidence: "none" }),
    ]);
    const issues: ImportIssue[] = [];
    const tasks = await proposeTasksFromQueue(ai, {
      lines,
      today: "2026-11-20",
      onIssue: (i) => issues.push(i),
    });

    expect(tasks).toEqual([
      {
        sourceLineIndexes: [0],
        title: "Do line 0",
        area: "work",
        dueDate: "2026-11-26",
        dueDateConfidence: "stated",
        effortMin: 30,
        waitingOn: "Sara",
        done: false,
        confidence: 0.9,
      },
      {
        sourceLineIndexes: [1],
        title: "Do line 1",
        area: "work",
        dueDateConfidence: "none",
        parentIndex: 0,
        done: false,
        confidence: 0.9,
      },
      {
        sourceLineIndexes: [2],
        title: "Do line 2",
        area: "work",
        dueDateConfidence: "none",
        done: true,
        confidence: 0.9,
      },
      {
        sourceLineIndexes: [3],
        title: "Do line 3",
        area: "work",
        dueDateConfidence: "none",
        done: false,
        confidence: 0.9,
      },
      {
        sourceLineIndexes: [3],
        title: "Do line 3",
        area: "work",
        dueDateConfidence: "none",
        done: false,
        confidence: 0.9,
      },
    ]);
    expect(issues.map((i) => i.item)).toEqual([1, 3, 4, 5, 6, 7, 8]);
  });

  it("takes done from the doc, not the model, and reports a disagreement", async () => {
    const lines = [line("Done in doc", 0, true), line("Open in doc"), line("Half", 0, true), line("done", 1)];
    const { ai } = fakeAi([
      task([0], { done: false }),
      task([1], { done: true }),
      task([2, 3], { done: true }),
    ]);
    const issues: ImportIssue[] = [];
    const tasks = await proposeTasksFromQueue(ai, {
      lines,
      today: "2026-11-20",
      onIssue: (i) => issues.push(i),
    });
    expect(tasks.map((t) => t.done)).toEqual([true, false, false]);
    expect(issues.map((i) => i.item)).toEqual([0, 1, 2]);
    expect(issues[1]!.problem).toContain("kept the doc's done=false");
  });

  it("links steps after a forced cut back to the parent from the earlier chunk", async () => {
    const lines = [line("Plan the offsite"), ...Array.from({ length: 99 }, (_, i) => line(`step ${i}`, 1))];
    const first = [task([0]), ...Array.from({ length: 89 }, (_, i) => task([i + 1], { parentIndex: 0 }))];
    const second = Array.from({ length: 10 }, (_, i) => task([90 + i], { parentContextLine: 0 }));
    const { ai, requests } = fakeAi(first, second);
    const issues: ImportIssue[] = [];

    const tasks = await proposeTasksFromQueue(ai, {
      lines,
      today: "2026-11-20",
      onIssue: (i) => issues.push(i),
    });
    expect(requests).toHaveLength(2);
    const contextPart = requests[1]!.prompt.split("<queue>")[0]!;
    expect(contextPart).toContain(
      '<context>\n{"i":0,"level":0,"done":false,"text":"Plan the offsite"}\n</context>',
    );
    expect(requests[1]!.prompt.split("<queue>")[1]).not.toContain('"i":0,');
    expect(tasks).toHaveLength(100);
    expect(tasks.slice(1).every((t) => t.parentIndex === 0)).toBe(true);
    expect(issues).toEqual([]);
  });

  it("rejects a context line as a task source and a parentContextLine outside the context", async () => {
    const lines = [line("Parent"), ...Array.from({ length: 99 }, (_, i) => line(`step ${i}`, 1))];
    const first = [task([0]), ...Array.from({ length: 89 }, (_, i) => task([i + 1], { parentIndex: 0 }))];
    const second = [task([0]), task([90], { parentContextLine: 5 })];
    const { ai } = fakeAi(first, second);
    const issues: ImportIssue[] = [];
    const tasks = await proposeTasksFromQueue(ai, {
      lines,
      today: "2026-11-20",
      onIssue: (i) => issues.push(i),
    });
    expect(tasks).toHaveLength(91);
    expect(tasks[90]).not.toHaveProperty("parentIndex");
    expect(issues.map((i) => [i.chunk, i.item])).toEqual([
      [1, 0],
      [1, 1],
    ]);
  });

  it("drops the parent link of a child whose parent was dropped", async () => {
    const { ai } = fakeAi([task([0], { title: "" }), task([1], { parentIndex: 0 })]);
    const tasks = await proposeTasksFromQueue(ai, { lines: [line("a"), line("b", 1)], today: "2026-11-20" });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).not.toHaveProperty("parentIndex");
  });

  it("rejects a malformed or impossible today", async () => {
    const { ai } = fakeAi();
    for (const today of ["20/11/2026", "2026-02-30", "2026-13-01"]) {
      await expect(proposeTasksFromQueue(ai, { lines: [], today })).rejects.toThrow("real date");
    }
  });
});
