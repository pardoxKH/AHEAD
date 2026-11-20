import type { Task, TaskDep } from "./task.js";

function adjacency(deps: readonly TaskDep[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const { taskId, dependsOnId } of deps) {
    const list = out.get(taskId);
    if (list) list.push(dependsOnId);
    else out.set(taskId, [dependsOnId]);
  }
  return out;
}

/** Returns one cycle as task ids (the first id repeated at the end), or null if there is none. */
export function findCycle(deps: readonly TaskDep[]): string[] | null {
  const edges = adjacency(deps);
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];

  const dfs = (id: string): string[] | null => {
    state.set(id, "visiting");
    stack.push(id);
    for (const next of edges.get(id) ?? []) {
      const s = state.get(next);
      if (s === "visiting") return [...stack.slice(stack.indexOf(next)), next];
      if (s === undefined) {
        const found = dfs(next);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(id, "done");
    return null;
  };

  for (const id of edges.keys()) {
    if (!state.has(id)) {
      const found = dfs(id);
      if (found) return found;
    }
  }
  return null;
}

/** Throws if the dependency graph has a cycle (a self-dependency counts). */
export function assertAcyclic(deps: readonly TaskDep[]): void {
  const cycle = findCycle(deps);
  if (cycle) throw new Error(`Dependency cycle: ${cycle.join(" -> ")}`);
}

/** True if adding `newDep` to the acyclic graph `deps` would create a cycle. */
export function wouldCreateCycle(deps: readonly TaskDep[], newDep: TaskDep): boolean {
  // A cycle appears iff dependsOnId already (transitively) depends on taskId.
  const edges = adjacency(deps);
  const seen = new Set<string>();
  const queue = [newDep.dependsOnId];
  for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
    if (id === newDep.taskId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...(edges.get(id) ?? []));
  }
  return false;
}

/** Throws unless every dependency joins two known tasks of the same tree and the graph is acyclic. */
export function validateDeps(tasks: readonly Task[], deps: readonly TaskDep[]): void {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const { taskId, dependsOnId } of deps) {
    const task = byId.get(taskId);
    const dependsOn = byId.get(dependsOnId);
    if (!task) throw new Error(`Dependency references unknown task "${taskId}"`);
    if (!dependsOn) throw new Error(`Dependency references unknown task "${dependsOnId}"`);
    if (task.rootId !== dependsOn.rootId) {
      throw new Error(
        `Dependency "${taskId}" -> "${dependsOnId}" crosses trees; dependencies must stay within one tree`,
      );
    }
  }
  assertAcyclic(deps);
}
