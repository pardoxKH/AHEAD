import { describe, expect, it } from "vitest";
import { assertAcyclic, findCycle, validateDeps, wouldCreateCycle } from "./deps.js";
import type { Task, TaskDep } from "./task.js";

const d = (taskId: string, dependsOnId: string): TaskDep => ({ taskId, dependsOnId });
const t = (id: string, rootId: string): Task => ({
  id,
  parentId: id === rootId ? null : rootId,
  rootId,
  title: id,
  status: "todo",
  hardDeadline: false,
  urgency: "normal",
  area: "work",
  position: 0,
});

// d depends on b and c, which both depend on a.
const diamond = [d("b", "a"), d("c", "a"), d("d", "b"), d("d", "c")];

describe("dependency cycles", () => {
  it("accepts an empty graph and a diamond", () => {
    expect(() => assertAcyclic([])).not.toThrow();
    expect(() => assertAcyclic(diamond)).not.toThrow();
  });

  it("treats a self-dependency as a cycle", () => {
    expect(findCycle([d("a", "a")])).toEqual(["a", "a"]);
    expect(() => assertAcyclic([d("a", "a")])).toThrow("Dependency cycle: a -> a");
    expect(wouldCreateCycle([], d("a", "a"))).toBe(true);
  });

  it("finds a cycle across three nodes", () => {
    expect(() => assertAcyclic([d("a", "b"), d("b", "c"), d("c", "a")])).toThrow(/a -> b -> c -> a/);
  });

  it("reports only the cycle, not the path leading to it", () => {
    expect(findCycle([d("x", "a"), d("a", "b"), d("b", "a")])).toEqual(["a", "b", "a"]);
  });

  it("predicts whether a new dependency closes a cycle", () => {
    const chain = [d("a", "b"), d("b", "c")];
    expect(wouldCreateCycle(chain, d("c", "a"))).toBe(true);
    expect(wouldCreateCycle(chain, d("a", "c"))).toBe(false);
    expect(wouldCreateCycle(diamond, d("a", "d"))).toBe(true);
    expect(wouldCreateCycle(diamond, d("c", "b"))).toBe(false);
    expect(wouldCreateCycle(diamond, d("d", "a"))).toBe(false); // redundant, not cyclic
  });
});

describe("validateDeps", () => {
  const tasks = [t("r", "r"), t("a", "r"), t("b", "r"), t("q", "q"), t("x", "q")];

  it("accepts dependencies within one tree", () => {
    expect(() => validateDeps(tasks, [d("b", "a"), d("a", "r")])).not.toThrow();
  });

  it("rejects a dependency that crosses trees", () => {
    expect(() => validateDeps(tasks, [d("a", "x")])).toThrow(/"a" -> "x" crosses trees/);
  });

  it("rejects unknown tasks", () => {
    expect(() => validateDeps(tasks, [d("a", "nope")])).toThrow(/unknown task "nope"/);
    expect(() => validateDeps(tasks, [d("nope", "a")])).toThrow(/unknown task "nope"/);
  });

  it("rejects cycles", () => {
    expect(() => validateDeps(tasks, [d("a", "b"), d("b", "a")])).toThrow(/cycle/);
  });
});
