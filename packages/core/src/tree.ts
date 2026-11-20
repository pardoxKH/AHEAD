import type { Task } from "./task.js";

export interface TaskNode {
  task: Task;
  children: TaskNode[];
}

/**
 * Nests tasks into one tree per root, children ordered by `position` (then id, for stability).
 * Throws on a missing or duplicate root, an unknown parent, a parent in another tree, or a parent cycle.
 */
export function buildTree(tasks: readonly Task[]): TaskNode[] {
  const nodes = new Map<string, TaskNode>();
  for (const task of tasks) {
    if (nodes.has(task.id)) throw new Error(`Duplicate task id "${task.id}"`);
    nodes.set(task.id, { task, children: [] });
  }

  const roots = new Map<string, TaskNode>();
  for (const node of nodes.values()) {
    const { id, parentId, rootId } = node.task;
    if (parentId === null) {
      if (id !== rootId) throw new Error(`Task "${id}" has no parent but its rootId is "${rootId}"`);
      if (roots.has(rootId)) throw new Error(`Tree "${rootId}" has more than one root`);
      roots.set(rootId, node);
      continue;
    }
    const parent = nodes.get(parentId);
    if (!parent) throw new Error(`Orphan task "${id}": parent "${parentId}" not found`);
    if (parent.task.rootId !== rootId) {
      throw new Error(`Task "${id}" is in tree "${rootId}" but its parent "${parentId}" is not`);
    }
    parent.children.push(node);
  }

  let reached = 0;
  const visit = (node: TaskNode): void => {
    reached++;
    node.children.sort((a, b) => a.task.position - b.task.position || a.task.id.localeCompare(b.task.id));
    node.children.forEach(visit);
  };
  roots.forEach(visit);

  if (reached !== nodes.size) {
    const rootless = [...nodes.values()].find((n) => !roots.has(n.task.rootId));
    if (rootless) {
      throw new Error(`Orphan task "${rootless.task.id}": tree "${rootless.task.rootId}" has no root`);
    }
    throw new Error("Tasks form a parent cycle that never reaches a root");
  }
  return [...roots.values()];
}
