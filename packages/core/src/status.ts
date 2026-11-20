import { isClosed, type Task, type TaskDep, type TaskStatus } from "./task.js";

/** Statuses that dependency state never overrides. */
const STICKY: ReadonlySet<TaskStatus> = new Set(["done", "dropped", "waiting", "proposed"]);

/**
 * Effective status of one step given the dependencies: `blocked` while any of its dependencies is
 * open, back to `todo` once all are done or dropped. Done, dropped, waiting and proposed are kept.
 */
export function deriveStatus(
  task: Task,
  deps: readonly TaskDep[],
  tasksById: ReadonlyMap<string, Task>,
): TaskStatus {
  if (STICKY.has(task.status)) return task.status;
  const open = deps.some((d) => {
    if (d.taskId !== task.id) return false;
    const dependsOn = tasksById.get(d.dependsOnId);
    if (!dependsOn) throw new Error(`Dependency references unknown task "${d.dependsOnId}"`);
    return !isClosed(dependsOn.status);
  });
  if (open) return "blocked";
  return task.status === "blocked" ? "todo" : task.status;
}

/**
 * A root is done when it has at least one non-dropped step and every non-dropped step in its tree
 * is done. Otherwise its own status stands. `tasks` may include other trees; they are ignored.
 */
export function deriveRootStatus(root: Task, tasks: readonly Task[]): TaskStatus {
  if (root.status === "dropped") return root.status;
  const live = tasks.filter((t) => t.rootId === root.id && t.id !== root.id && t.status !== "dropped");
  return live.length > 0 && live.every((t) => t.status === "done") ? "done" : root.status;
}

/** Derived status of every task, keyed by id. Inputs are not mutated. */
export function deriveStatuses(tasks: readonly Task[], deps: readonly TaskDep[]): Map<string, TaskStatus> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const result = new Map<string, TaskStatus>();
  for (const task of tasks) {
    const status = task.parentId === null ? deriveRootStatus(task, tasks) : deriveStatus(task, deps, byId);
    result.set(task.id, status);
  }
  return result;
}
