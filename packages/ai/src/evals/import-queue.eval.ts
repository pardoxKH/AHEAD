// Manual eval against the real API. Costs money; not part of `pnpm test`.
// Run: ANTHROPIC_API_KEY=... pnpm --filter @ahead/ai eval
import { afterAll, describe, expect, it } from "vitest";
import { createAiClient } from "../client.js";
import { proposeTasksFromQueue, type ProposedTask, type QueueLine } from "../import-queue.js";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required to run evals");

let totalCostUsd = 0;
const ai = createAiClient({
  apiKey,
  onUsage: (u) => {
    totalCostUsd += u.costUsd ?? 0;
    console.log(
      `${u.purpose} ${u.model}: in ${u.inputTokens}, out ${u.outputTokens}, cache read ${u.cacheReadTokens}`,
    );
  },
});

const TODAY = "2026-11-19"; // a Thursday
const l = (text: string, level = 0, done = false): QueueLine => ({ text, level, done });

interface Sample {
  name: string;
  lines: QueueLine[];
  check: (tasks: ProposedTask[]) => void;
}

const bySource = (tasks: ProposedTask[], index: number) =>
  tasks.find((t) => t.sourceLineIndexes.includes(index));

const samples: Sample[] = [
  {
    name: "done lines stay done",
    lines: [
      l("Send weekly status to steering committee", 0, true),
      l("Review Q4 hiring plan"),
      l("Renew passport", 0, true),
    ],
    check: (tasks) => {
      expect(bySource(tasks, 0)?.done).toBe(true);
      expect(bySource(tasks, 1)?.done).toBe(false);
      expect(bySource(tasks, 2)?.done).toBe(true);
      expect(bySource(tasks, 2)?.area).toBe("personal");
    },
  },
  {
    name: "no invented deadlines",
    lines: [l("Read the Team Topologies book"), l("Clean up Jira board"), l("Think about mentoring program")],
    check: (tasks) => {
      expect(tasks.length).toBeGreaterThanOrEqual(3);
      for (const t of tasks) {
        expect(t.dueDate).toBeUndefined();
        expect(t.dueDateConfidence).toBe("none");
      }
      expect(bySource(tasks, 0)?.area).toBe("learning");
    },
  },
  {
    name: "stated and implied dates",
    lines: [
      l("Submit budget to Finance by 2026-11-25"),
      l("Prep slides before end of week"),
      l("Dentist sometime"),
    ],
    check: (tasks) => {
      expect(bySource(tasks, 0)).toMatchObject({ dueDate: "2026-11-25", dueDateConfidence: "stated" });
      const slides = bySource(tasks, 1);
      expect(slides?.dueDateConfidence).not.toBe("none");
      expect(slides?.dueDate).toBe(TODAY); // Thursday is the end of his week
      expect(bySource(tasks, 2)?.dueDateConfidence).toBe("none");
    },
  },
  {
    name: "nested steps keep their parent",
    lines: [
      l("Riyadh to London trip for the client workshop"),
      l("Book flights", 1),
      l("Book hotel near the office", 1),
      l("Apply for UK visa", 1, true),
      l("1:1 with Omar"),
    ],
    check: (tasks) => {
      const parent = tasks.indexOf(bySource(tasks, 0)!);
      expect(parent).toBeGreaterThanOrEqual(0);
      for (const i of [1, 2, 3]) expect(bySource(tasks, i)?.parentIndex).toBe(parent);
      expect(bySource(tasks, 3)?.done).toBe(true);
      expect(bySource(tasks, 4)?.parentIndex).toBeUndefined();
    },
  },
  {
    name: "waiting-on and effort",
    lines: [l("Sign off vendor contract (waiting on Legal)"), l("Write 30 min retro notes")],
    check: (tasks) => {
      expect(bySource(tasks, 0)?.waitingOn).toMatch(/legal/i);
      expect(bySource(tasks, 1)?.effortMin).toBe(30);
      for (const t of tasks) expect(t.title.length).toBeLessThanOrEqual(80);
    },
  },
];

describe("proposeTasksFromQueue eval", () => {
  for (const sample of samples) {
    it(sample.name, async () => {
      const tasks = await proposeTasksFromQueue(ai, {
        lines: sample.lines,
        today: TODAY,
        timeZone: "Asia/Riyadh",
      });
      sample.check(tasks);
    });
  }

  afterAll(() => console.log(`Total estimated cost: $${totalCostUsd.toFixed(4)}`));
});
