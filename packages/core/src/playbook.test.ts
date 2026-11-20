import { describe, expect, it } from "vitest";
import { validateDeps } from "./deps.js";
import {
  BUILT_IN_PLAYBOOKS,
  instantiatePlaybook,
  PROPOSAL_PLAYBOOK,
  validatePlaybook,
  type Playbook,
} from "./playbook.js";
import { DEFAULT_WORK_WEEK } from "./time.js";
import { buildTree } from "./tree.js";

const counter = () => {
  let n = 0;
  return () => `t${n++}`;
};
const deadline = new Date("2026-12-15T14:00:00Z"); // Tuesday 17:00 Riyadh

describe("built-in playbooks", () => {
  it.each(BUILT_IN_PLAYBOOKS.map((p) => [p.id, p] as const))(
    "%s is valid and due dates follow deps",
    (_, p) => {
      expect(() => validatePlaybook(p)).not.toThrow();
      const offset = new Map(p.steps.map((s) => [s.key, s.offsetWorkingDaysBeforeDeadline]));
      for (const s of p.steps) {
        for (const dep of s.dependsOn)
          expect(offset.get(dep)).toBeGreaterThan(s.offsetWorkingDaysBeforeDeadline);
      }
    },
  );

  it("has the three expected playbooks", () => {
    expect(BUILT_IN_PLAYBOOKS.map((p) => p.id)).toEqual(["proposal", "document-review", "generic"]);
  });
});

describe("instantiatePlaybook", () => {
  const result = instantiatePlaybook(PROPOSAL_PLAYBOOK, {
    rootTitle: "Submit proposal by 15 Dec",
    deadline,
    idFactory: counter(),
  });

  it("creates a hard-deadline root and ordered, suggested-effort steps", () => {
    expect(result.root).toMatchObject({
      id: "t0",
      parentId: null,
      rootId: "t0",
      dueAt: deadline,
      hardDeadline: true,
    });
    expect(result.steps).toHaveLength(PROPOSAL_PLAYBOOK.steps.length);
    expect(result.steps[0]).toMatchObject({
      id: "t1",
      parentId: "t0",
      rootId: "t0",
      title: "Assign a proposal lead",
      effortMin: 15,
      effortSource: "suggested",
      hardDeadline: false,
      position: 0,
      status: "todo",
    });
  });

  it("produces a valid tree with valid dependencies", () => {
    const tasks = [result.root, ...result.steps];
    expect(buildTree(tasks)[0]?.children).toHaveLength(11);
    expect(() => validateDeps(tasks, result.deps)).not.toThrow();
    // partner approval waits for both approvals
    const partner = result.steps.find((s) => s.title.startsWith("Send to the partner"))!;
    expect(result.deps.filter((d) => d.taskId === partner.id)).toHaveLength(2);
  });

  it("counts due dates back in working days", () => {
    const due = (title: string) => result.steps.find((s) => s.title === title)?.dueAt?.toISOString();
    expect(due("Submit the proposal")).toBe("2026-12-15T14:00:00.000Z");
    expect(due("Send to the partner and secure approval")).toBe("2026-12-13T14:00:00.000Z"); // Sunday
    expect(due("Approve the final financial draft")).toBe("2026-12-10T14:00:00.000Z"); // Thursday
    expect(due("Assign a proposal lead")).toBe("2026-12-01T14:00:00.000Z");
  });

  it("moves steps off a weekend deadline", () => {
    const friday = new Date("2026-12-11T14:00:00Z");
    const { root, steps } = instantiatePlaybook(PROPOSAL_PLAYBOOK, {
      rootTitle: "x",
      deadline: friday,
      idFactory: counter(),
    });
    expect(root.dueAt).toBe(friday);
    expect(steps.at(-1)?.dueAt?.toISOString()).toBe("2026-12-10T14:00:00.000Z");
    expect(steps.at(-2)?.dueAt?.toISOString()).toBe("2026-12-09T14:00:00.000Z");
  });

  it("applies options", () => {
    const { root, steps } = instantiatePlaybook(PROPOSAL_PLAYBOOK, {
      rootTitle: "x",
      deadline,
      idFactory: counter(),
      week: { ...DEFAULT_WORK_WEEK, timeZone: "UTC", workingDays: [1, 2, 3, 4, 5] },
      area: "personal",
      urgency: "high",
      hardDeadline: false,
    });
    expect(root).toMatchObject({ area: "personal", urgency: "high", hardDeadline: false });
    expect(steps[0]).toMatchObject({ area: "personal", urgency: "high" });
    expect(steps.at(-2)?.dueAt?.toISOString()).toBe("2026-12-14T14:00:00.000Z"); // Monday
    expect(steps.at(-3)?.dueAt?.toISOString()).toBe("2026-12-11T14:00:00.000Z"); // Friday
  });
});

describe("validatePlaybook", () => {
  const base = PROPOSAL_PLAYBOOK.steps[0]!;
  const pb = (steps: Playbook["steps"]): Playbook => ({ id: "p", name: "p", steps });

  it("rejects duplicate keys, unknown deps and cycles", () => {
    expect(() => validatePlaybook(pb([base, base]))).toThrow(/repeats step/);
    expect(() => validatePlaybook(pb([{ ...base, dependsOn: ["x"] }]))).toThrow(/unknown "x"/);
    expect(() => validatePlaybook(pb([{ ...base, dependsOn: [base.key] }]))).toThrow(/cycle/);
  });
});
