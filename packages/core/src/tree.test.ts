import { describe, expect, it } from "vitest";
import type { Task } from "./task.js";
import { buildTree, type TaskNode } from "./tree.js";

const t = (id: string, parentId: string | null, rootId: string, position = 0): Task => ({
  id,
  parentId,
  rootId,
  title: id,
  status: "todo",
  hardDeadline: false,
  urgency: "normal",
  area: "work",
  position,
});

const ids = (node: TaskNode): unknown => [node.task.id, node.children.map(ids)];

describe("buildTree", () => {
  it("nests each root's descendants, ordered by position", () => {
    const trees = buildTree([
      t("b2", "b", "b"),
      t("a2", "a", "a", 2),
      t("a1", "a", "a", 1),
      t("a1x", "a1", "a"),
      t("a", null, "a"),
      t("b", null, "b"),
    ]);
    expect(trees.map(ids)).toEqual([
      [
        "a",
        [
          ["a1", [["a1x", []]]],
          ["a2", []],
        ],
      ],
      ["b", [["b2", []]]],
    ]);
  });

  it("breaks position ties by id", () => {
    const [root] = buildTree([t("r", null, "r"), t("z", "r", "r"), t("m", "r", "r")]);
    expect(root?.children.map((c) => c.task.id)).toEqual(["m", "z"]);
  });

  it("does not mutate the input", () => {
    const tasks = [t("r", null, "r"), t("s", "r", "r")];
    const copy = structuredClone(tasks);
    buildTree(tasks);
    expect(tasks).toEqual(copy);
  });

  it("returns no trees for no tasks", () => {
    expect(buildTree([])).toEqual([]);
  });

  it("rejects a task whose parent does not exist", () => {
    expect(() => buildTree([t("r", null, "r"), t("s", "ghost", "r")])).toThrow(/Orphan task "s".*"ghost"/);
  });

  it("rejects a tree without a root", () => {
    expect(() => buildTree([t("r", null, "r"), t("x", "y", "q"), t("y", "x", "q")])).toThrow(
      /tree "q" has no root/,
    );
  });

  it("rejects two roots for one rootId", () => {
    expect(() => buildTree([t("r", null, "r"), t("r2", null, "r")])).toThrow(
      /no parent but its rootId is "r"/,
    );
  });

  it("rejects duplicate ids, which would make a second root", () => {
    expect(() => buildTree([t("r", null, "r"), t("r", null, "r")])).toThrow(/Duplicate task id "r"/);
  });

  it("rejects a parent in another tree", () => {
    expect(() => buildTree([t("a", null, "a"), t("b", null, "b"), t("s", "b", "a")])).toThrow(
      /parent "b" is not/,
    );
  });

  it("rejects a parent cycle inside a tree that has a root", () => {
    expect(() => buildTree([t("r", null, "r"), t("x", "y", "r"), t("y", "x", "r")])).toThrow(/parent cycle/);
  });
});
