import { assertAcyclic } from "./deps.js";
import type { Area, Task, TaskDep, Urgency } from "./task.js";
import { DEFAULT_WORK_WEEK, subtractWorkingDays, type WorkWeek } from "./time.js";

export interface PlaybookStep {
  key: string;
  title: string;
  effortMin: number;
  /** Working days before the deadline this step is due; 0 means on the deadline's working day. */
  offsetWorkingDaysBeforeDeadline: number;
  dependsOn: readonly string[];
  /** Who usually does it, e.g. "me", "lead", "team", "author", "account manager". */
  ownerHint?: string;
}

export interface Playbook {
  id: string;
  name: string;
  steps: readonly PlaybookStep[];
}

const step = (
  key: string,
  title: string,
  effortMin: number,
  offset: number,
  dependsOn: readonly string[],
  ownerHint: string,
): PlaybookStep => ({ key, title, effortMin, offsetWorkingDaysBeforeDeadline: offset, dependsOn, ownerHint });

export const PROPOSAL_PLAYBOOK: Playbook = {
  id: "proposal",
  name: "Proposal submission",
  steps: [
    step("assign-lead", "Assign a proposal lead", 15, 10, [], "me"),
    step("assign-team", "Assign the proposal team", 30, 9, ["assign-lead"], "lead"),
    step("technical-draft", "Prepare the technical proposal draft", 480, 7, ["assign-team"], "team"),
    step(
      "technical-review",
      "Review the technical draft and write comments",
      120,
      6,
      ["technical-draft"],
      "lead",
    ),
    step("technical-approval", "Approve the final technical draft", 30, 5, ["technical-review"], "me"),
    step("financial-draft", "Prepare the financial proposal draft", 240, 6, ["technical-draft"], "team"),
    step(
      "financial-review",
      "Review the financial draft and write comments",
      60,
      4,
      ["financial-draft"],
      "lead",
    ),
    step("financial-approval", "Approve the final financial draft", 30, 3, ["financial-review"], "me"),
    step(
      "partner-approval",
      "Send to the partner and secure approval",
      30,
      2,
      ["technical-approval", "financial-approval"],
      "account manager",
    ),
    step("procurement-handoff", "Share the proposal with procurement", 15, 1, ["partner-approval"], "me"),
    step("submit", "Submit the proposal", 30, 0, ["procurement-handoff"], "procurement"),
  ],
};

export const DOCUMENT_REVIEW_PLAYBOOK: Playbook = {
  id: "document-review",
  name: "Document review (architecture document, BRD)",
  steps: [
    step("receive-draft", "Receive the draft", 5, 4, [], "author"),
    step("read-and-comment", "Read the draft and write comments", 90, 3, ["receive-draft"], "me"),
    step("author-revises", "Author revises the draft", 60, 1, ["read-and-comment"], "author"),
    step("approve", "Approve the document", 30, 0, ["author-revises"], "me"),
  ],
};

export const GENERIC_PLAYBOOK: Playbook = {
  id: "generic",
  name: "Generic task",
  steps: [
    step("define-next-action", "Define the next action", 10, 3, [], "me"),
    step("do-the-work", "Do the work", 120, 2, ["define-next-action"], "me"),
    step("review", "Review the result", 30, 1, ["do-the-work"], "me"),
    step("done", "Wrap up and mark done", 5, 0, ["review"], "me"),
  ],
};

export const BUILT_IN_PLAYBOOKS: readonly Playbook[] = [
  PROPOSAL_PLAYBOOK,
  DOCUMENT_REVIEW_PLAYBOOK,
  GENERIC_PLAYBOOK,
];

export interface InstantiateOptions {
  rootTitle: string;
  /** The root's due instant; step due dates count working days back from it. */
  deadline: Date;
  idFactory: () => string;
  week?: WorkWeek;
  area?: Area;
  urgency?: Urgency;
  hardDeadline?: boolean;
}

export interface InstantiatedPlaybook {
  root: Task;
  steps: Task[];
  deps: TaskDep[];
}

/** Throws on duplicate step keys, unknown `dependsOn` keys or a dependency cycle. */
export function validatePlaybook(playbook: Playbook): void {
  const keys = new Set<string>();
  for (const s of playbook.steps) {
    if (keys.has(s.key)) throw new Error(`Playbook "${playbook.id}" repeats step "${s.key}"`);
    keys.add(s.key);
  }
  for (const s of playbook.steps) {
    for (const dep of s.dependsOn) {
      if (!keys.has(dep))
        throw new Error(`Playbook "${playbook.id}" step "${s.key}" depends on unknown "${dep}"`);
    }
  }
  assertAcyclic(playbook.steps.flatMap((s) => s.dependsOn.map((d) => ({ taskId: s.key, dependsOnId: d }))));
}

/** Creates a root task, one child per playbook step (in order) and the dependencies between them. */
export function instantiatePlaybook(playbook: Playbook, options: InstantiateOptions): InstantiatedPlaybook {
  validatePlaybook(playbook);
  const { deadline, idFactory, week = DEFAULT_WORK_WEEK, area = "work", urgency = "normal" } = options;
  const rootId = idFactory();
  const root: Task = {
    id: rootId,
    parentId: null,
    rootId,
    title: options.rootTitle,
    status: "todo",
    dueAt: deadline,
    hardDeadline: options.hardDeadline ?? true,
    urgency,
    area,
    position: 0,
  };

  const idByKey = new Map<string, string>();
  const steps = playbook.steps.map((s, position): Task => {
    const id = idFactory();
    idByKey.set(s.key, id);
    return {
      id,
      parentId: rootId,
      rootId,
      title: s.title,
      status: "todo",
      dueAt: subtractWorkingDays(deadline, s.offsetWorkingDaysBeforeDeadline, week),
      hardDeadline: false,
      effortMin: s.effortMin,
      effortSource: "suggested",
      urgency,
      area,
      position,
    };
  });

  const idOf = (key: string): string => {
    const id = idByKey.get(key);
    if (id === undefined) throw new Error(`Unknown step "${key}"`);
    return id;
  };
  const deps = playbook.steps.flatMap((s) =>
    s.dependsOn.map((d): TaskDep => ({ taskId: idOf(s.key), dependsOnId: idOf(d) })),
  );
  return { root, steps, deps };
}
