import { describe, expect, it } from "vitest";
import { deriveRootStatus, deriveStatus, deriveStatuses } from "./status.js";
import type { Task, TaskDep, TaskStatus } from "./task.js";

const t = (id: string, status: TaskStatus, rootId = "r"): Task => ({
  id,
  parentId: id === rootId ? null : rootId,
  rootId,
  title: id,
  status,
  hardDeadline: false,
  urgency: "normal",
  area: "work",
  position: 0,
});
const d = (taskId: string, dependsOnId: string): TaskDep => ({ taskId, dependsOnId });
const byId = (...tasks: Task[]) => new Map(tasks.map((x) => [x.id, x]));

describe("deriveStatus", () => {
  it("blocks a step while any dependency is open", () => {
    const a = t("a", "done");
    const b = t("b", "in_progress");
    const c = t("c", "scheduled");
    expect(deriveStatus(c, [d("c", "a"), d("c", "b")], byId(a, b, c))).toBe("blocked");
  });

  it("returns a blocked step to todo once dependencies are done or dropped", () => {
    const a = t("a", "done");
    const b = t("b", "dropped");
    const c = t("c", "blocked");
    expect(deriveStatus(c, [d("c", "a"), d("c", "b")], byId(a, b, c))).toBe("todo");
  });

  it("keeps the stored status when nothing blocks it", () => {
    const c = t("c", "scheduled");
    expect(deriveStatus(c, [], byId(c))).toBe("scheduled");
  });

  it.each<TaskStatus>(["done", "dropped", "waiting", "proposed"])("never overrides %s", (status) => {
    const a = t("a", "todo");
    const c = t("c", status);
    expect(deriveStatus(c, [d("c", "a")], byId(a, c))).toBe(status);
  });

  it("does not mutate the task", () => {
    const a = t("a", "todo");
    const c = t("c", "todo");
    deriveStatus(c, [d("c", "a")], byId(a, c));
    expect(c.status).toBe("todo");
  });

  it("rejects a dependency on an unknown task", () => {
    const c = t("c", "todo");
    expect(() => deriveStatus(c, [d("c", "ghost")], byId(c))).toThrow(/unknown task "ghost"/);
  });
});

describe("deriveRootStatus", () => {
  it("is done when every non-dropped step is done", () => {
    const tasks = [t("r", "in_progress"), t("a", "done"), t("b", "dropped"), t("x", "todo", "other")];
    expect(deriveRootStatus(tasks[0]!, tasks)).toBe("done");
  });

  it("keeps its status while a step is open", () => {
    const tasks = [t("r", "in_progress"), t("a", "done"), t("b", "waiting")];
    expect(deriveRootStatus(tasks[0]!, tasks)).toBe("in_progress");
  });

  it("is not done just because it has no live steps", () => {
    expect(deriveRootStatus(t("r", "todo"), [t("r", "todo")])).toBe("todo");
    expect(deriveRootStatus(t("r", "todo"), [t("a", "dropped")])).toBe("todo");
  });

  it("stays dropped", () => {
    expect(deriveRootStatus(t("r", "dropped"), [t("a", "done")])).toBe("dropped");
  });
});

describe("deriveStatuses", () => {
  it("derives a diamond step by step", () => {
    const deps = [d("b", "a"), d("c", "a"), d("d", "b"), d("d", "c")];
    const tasks = [t("r", "todo"), t("a", "done"), t("b", "done"), t("c", "todo"), t("d", "todo")];
    expect(Object.fromEntries(deriveStatuses(tasks, deps))).toEqual({
      r: "todo",
      a: "done",
      b: "done",
      c: "todo",
      d: "blocked",
    });
  });
});
