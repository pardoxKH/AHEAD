import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@ahead/db";
import { acceptReview, saveReviewEdits } from "./review-actions";
import {
  loadDraftTreeIds,
  loadOwnedDraftRows,
  loadUserClock,
  writeReview,
  type OwnedDraftRow,
} from "./review-store";

vi.mock("./review-store", () => ({
  loadOwnedDraftRows: vi.fn(),
  loadDraftTreeIds: vi.fn(),
  loadUserClock: vi.fn(),
  writeReview: vi.fn(),
}));

const db = {} as Db;
const ROOT = "0b7c2f4e-1d3a-4c5b-8e6f-7a8b9c0d1e2f";
const CHILD = "1c8d3a5f-2e4b-4d6c-9f7a-8b9c0d1e2f3a";
const OTHER = "2d9e4b6a-3f5c-4e7d-8a8b-9c0d1e2f3a4b";

const owned: OwnedDraftRow[] = [
  { id: ROOT, parentId: null, rootId: ROOT, status: "proposed", dueAt: null, effortMin: null },
  {
    id: CHILD,
    parentId: ROOT,
    rootId: ROOT,
    status: "done",
    dueAt: new Date("2026-11-24T14:00:00Z"),
    effortMin: 30,
  },
];

function form(rows: { id: string; keep?: boolean; due?: string; effort?: string; title?: string }[]) {
  const data = new FormData();
  for (const row of rows) {
    data.append("id", row.id);
    data.set(`title:${row.id}`, row.title ?? "A task");
    data.set(`area:${row.id}`, "work");
    data.set(`due:${row.id}`, row.due ?? "");
    data.set(`effort:${row.id}`, row.effort ?? "");
    if (row.keep ?? true) data.set(`keep:${row.id}`, "on");
  }
  return data;
}

describe("review actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(loadOwnedDraftRows).mockImplementation(async (_db, _user, ids) =>
      owned.filter((row) => ids.includes(row.id)),
    );
    vi.mocked(loadUserClock).mockResolvedValue({ timeZone: "Asia/Riyadh", dayEndHour: 17 });
    vi.mocked(loadDraftTreeIds).mockResolvedValue([ROOT, CHILD]);
  });

  it("refuses ids that are not the session user's in-review tasks and writes nothing", async () => {
    vi.mocked(loadOwnedDraftRows).mockResolvedValue([owned[0]!]);
    const result = await acceptReview(db, "user-1", form([{ id: ROOT }, { id: OTHER }]));
    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(loadOwnedDraftRows).toHaveBeenCalledWith(db, "user-1", [ROOT, OTHER]);
    expect(writeReview).not.toHaveBeenCalled();
  });

  it("looks rows up for the session user only", async () => {
    await saveReviewEdits(db, "user-2", form([{ id: ROOT }]));
    expect(loadOwnedDraftRows).toHaveBeenCalledWith(db, "user-2", [ROOT]);
    expect(writeReview).toHaveBeenCalledWith(db, "user-2", expect.any(Array));
  });

  it.each([
    ["a non-uuid id", [{ id: "not-a-uuid" }]],
    ["an empty title", [{ id: ROOT, title: " " }]],
    ["an impossible date", [{ id: ROOT, due: "2026-02-30" }]],
    ["a negative effort", [{ id: ROOT, effort: "-5" }]],
    ["a duplicate id", [{ id: ROOT }, { id: ROOT }]],
  ])("rejects %s before touching the database", async (_, rows) => {
    await expect(saveReviewEdits(db, "user-1", form(rows))).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(loadOwnedDraftRows).not.toHaveBeenCalled();
  });

  it("marks a changed due date as stated and a changed effort as the user's", async () => {
    await saveReviewEdits(
      db,
      "user-1",
      form([
        { id: ROOT, due: "2026-11-25", effort: "45" },
        { id: CHILD, due: "2026-11-24", effort: "30" },
      ]),
    );
    const edits = vi.mocked(writeReview).mock.calls[0]![2];
    expect(edits[0]).toMatchObject({
      id: ROOT,
      dueAt: new Date("2026-11-25T14:00:00Z"),
      dueDateConfidence: "stated",
      effortMin: 45,
      effortSource: "user",
    });
    // Unchanged fields keep their stored values (and the guessed flag).
    expect(edits[1]).toEqual({ id: CHILD, title: "A task", area: "work" });
  });

  it("accepts kept rows and drops the rest", async () => {
    await expect(
      acceptReview(db, "user-1", form([{ id: ROOT, keep: false }, { id: CHILD }])),
    ).resolves.toEqual({ ok: true });
    const plan = vi.mocked(writeReview).mock.calls[0]![3];
    expect(plan).toEqual({
      updates: [{ id: CHILD, parentId: null, rootId: CHILD, status: "done" }],
      deletes: [ROOT],
    });
  });

  it("refuses to accept part of a tree that changed since the page loaded", async () => {
    vi.mocked(loadDraftTreeIds).mockResolvedValue([ROOT, CHILD, OTHER]);
    await expect(acceptReview(db, "user-1", form([{ id: ROOT }, { id: CHILD }]))).resolves.toEqual({
      ok: false,
      reason: "stale",
    });
    expect(writeReview).not.toHaveBeenCalled();
  });
});
