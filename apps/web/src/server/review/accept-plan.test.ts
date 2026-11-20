import { describe, expect, it } from "vitest";
import { planAccept, type DraftNode } from "./accept-plan";

// a ─ b ─ c
//   └ d
// e
const nodes: DraftNode[] = [
  { id: "a", parentId: null, status: "proposed" },
  { id: "b", parentId: "a", status: "proposed" },
  { id: "c", parentId: "b", status: "done" },
  { id: "d", parentId: "a", status: "proposed" },
  { id: "e", parentId: null, status: "done" },
];

describe("planAccept", () => {
  it("keeps the trees as they are when everything is kept", () => {
    const plan = planAccept(nodes, new Set(["a", "b", "c", "d", "e"]));
    expect(plan.deletes).toEqual([]);
    expect(plan.updates).toEqual([
      { id: "a", parentId: null, rootId: "a", status: "todo" },
      { id: "b", parentId: "a", rootId: "a", status: "todo" },
      { id: "c", parentId: "b", rootId: "a", status: "done" },
      { id: "d", parentId: "a", rootId: "a", status: "todo" },
      { id: "e", parentId: null, rootId: "e", status: "done" },
    ]);
  });

  it("moves a kept task up past a dropped parent", () => {
    const plan = planAccept(nodes, new Set(["a", "c"]));
    expect(plan.deletes).toEqual(["b", "d", "e"]);
    expect(plan.updates).toContainEqual({ id: "c", parentId: "a", rootId: "a", status: "done" });
  });

  it("makes kept descendants of a dropped root into new roots", () => {
    const plan = planAccept(nodes, new Set(["b", "c", "d"]));
    expect(plan.deletes).toEqual(["a", "e"]);
    expect(plan.updates).toEqual([
      { id: "b", parentId: null, rootId: "b", status: "todo" },
      { id: "c", parentId: "b", rootId: "b", status: "done" },
      { id: "d", parentId: null, rootId: "d", status: "todo" },
    ]);
  });
});
