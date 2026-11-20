import { isClosed, type Task, type TaskDep, type TaskStatus } from "./task.js";

/** Statuses that dependency state never overrides. */
const STICKY: ReadonlySet<TaskStatus> = new Set(["done", "dropped", "waiting", "proposed"]);

function applyDeps(
  task: Task,
  status: TaskStatus,
  deps: readonly TaskDep[],
  statusOf: (id: string) => TaskStatus | undefined,
): TaskStatus {
  if (STICKY.has(status)) return status;
  const open = deps.some((d) => {
    if (d.taskId !== task.id) return false;
    const depStatus = statusOf(d.dependsOnId);
    if (depStatus === undefined) throw new Error(`Dependency references unknown task "${d.dependsOnId}"`);
    return !isClosed(depStatus);
  });
  if (open) return "blocked";
  return status === "blocked" ? "todo" : status;
}

/**
 * Dependency rule for one task, using stored statuses: `blocked` while any of its dependencies is
 * open, back to `todo` once all are done or dropped. Done, dropped, waiting and proposed are kept.
 * Use `deriveStatuses` to also roll completion up from children.
 */
export function deriveStatus(
  task: Task,
  deps: readonly TaskDep[],
  tasksById: ReadonlyMap<string, Task>,
): TaskStatus {
  return applyDeps(task, task.status, deps, (id) => tasksById.get(id)?.status);
}

/**
 * Derived status of every task, keyed by id. Inputs are not mutated.
 *
 * 1. Completion rolls up bottom-up: a task with non-dropped children is done exactly when all of
 *    them are (derived) done, whatever its stored status; a stored `done` with open children becomes
 *    `in_progress`. Leaves, and parents whose children are all dropped, keep their stored status.
 * 2. The dependency rule (see `deriveStatus`) then applies, judging dependencies by step 1's result.
 */
export function deriveStatuses(tasks: readonly Task[], deps: readonly TaskDep[]): Map<string, TaskStatus> {
  const children = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.parentId === null) continue;
    const list = children.get(t.parentId);
    if (list) list.push(t);
    else children.set(t.parentId, [t]);
  }

  const completion = new Map<string, TaskStatus>();
  const complete = (task: Task, path: Set<string>): TaskStatus => {
    const known = completion.get(task.id);
    if (known) return known;
    if (path.has(task.id)) throw new Error(`Tasks form a parent cycle at "${task.id}"`);
    path.add(task.id);
    let status = task.status;
    if (status !== "dropped") {
      const live = (children.get(task.id) ?? []).map((c) => complete(c, path)).filter((s) => s !== "dropped");
      if (live.length > 0) {
        if (live.every((s) => s === "done")) status = "done";
        else if (status === "done") status = "in_progress";
      }
    }
    path.delete(task.id);
    completion.set(task.id, status);
    return status;
  };
  for (const t of tasks) complete(t, new Set());

  const result = new Map<string, TaskStatus>();
  for (const t of tasks) {
    result.set(
      t.id,
      applyDeps(t, completion.get(t.id) ?? t.status, deps, (id) => completion.get(id)),
    );
  }
  return result;
}

/** Derived status of one root (or any task) within its tree. */
export function deriveRootStatus(
  root: Task,
  tasks: readonly Task[],
  deps: readonly TaskDep[] = [],
): TaskStatus {
  const tree = tasks.filter((t) => t.rootId === root.rootId && t.id !== root.id);
  const status = deriveStatuses([root, ...tree], deps).get(root.id);
  return status ?? root.status;
}
