import { buildTree, type Task as CoreTask, type TaskNode } from "@ahead/core";

export interface TreeRowBase {
  id: string;
  parentId: string | null;
  rootId: string | null;
  position: number;
}

export interface RowNode<T> {
  row: T;
  children: RowNode<T>[];
}

/**
 * Nests rows into trees with the core rules (children ordered by position). Data that breaks the
 * tree rules is shown flat rather than failing the page.
 */
export function nestRows<T extends TreeRowBase>(rows: readonly T[]): RowNode<T>[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const asCore = rows.map((row): CoreTask => ({
    id: row.id,
    parentId: row.parentId,
    rootId: row.rootId ?? row.id,
    position: row.position,
    title: "",
    status: "todo",
    hardDeadline: false,
    urgency: "normal",
    area: "work",
  }));
  const toRowNode = (node: TaskNode): RowNode<T> => ({
    row: byId.get(node.task.id)!,
    children: node.children.map(toRowNode),
  });
  try {
    return buildTree(asCore).map(toRowNode);
  } catch {
    return rows.map((row) => ({ row, children: [] }));
  }
}

/** Keeps only nodes that match, or have a matching descendant. */
export function pruneTree<T>(nodes: readonly RowNode<T>[], keep: (row: T) => boolean): RowNode<T>[] {
  return nodes.flatMap((node) => {
    const children = pruneTree(node.children, keep);
    return keep(node.row) || children.length > 0 ? [{ row: node.row, children }] : [];
  });
}
