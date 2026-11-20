export interface DraftNode {
  id: string;
  parentId: string | null;
  status: string;
}

export interface AcceptPlan {
  updates: { id: string; parentId: string | null; rootId: string; status: "todo" | "done" }[];
  deletes: string[];
}

/**
 * Kept tasks become 'todo' (or stay 'done'); dropped ones are deleted. A kept task under a dropped
 * parent moves up to its nearest kept ancestor, or becomes a root, so deleting never cascades into it.
 */
export function planAccept(nodes: readonly DraftNode[], keep: ReadonlySet<string>): AcceptPlan {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const keptParent = new Map<string, string | null>();
  const rootOf = new Map<string, string>();

  const parentFor = (node: DraftNode): string | null => {
    let parentId = node.parentId;
    const seen = new Set<string>();
    while (parentId && !keep.has(parentId)) {
      if (seen.has(parentId)) return null;
      seen.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    return parentId && byId.has(parentId) ? parentId : null;
  };
  const resolveRoot = (id: string, depth = 0): string => {
    const known = rootOf.get(id);
    if (known) return known;
    const parent = keptParent.get(id) ?? null;
    const root = parent && depth < nodes.length ? resolveRoot(parent, depth + 1) : id;
    rootOf.set(id, root);
    return root;
  };

  const kept = nodes.filter((n) => keep.has(n.id));
  for (const node of kept) keptParent.set(node.id, parentFor(node));
  return {
    updates: kept.map((node) => ({
      id: node.id,
      parentId: keptParent.get(node.id) ?? null,
      rootId: resolveRoot(node.id),
      status: node.status === "done" ? "done" : "todo",
    })),
    deletes: nodes.filter((n) => !keep.has(n.id)).map((n) => n.id),
  };
}
