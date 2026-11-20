import type { Db } from "@ahead/db";
import { localDate, zonedTimeToUtc } from "../dates";
import { planAccept } from "./accept-plan";
import { parseReviewForm, type ReviewRowInput } from "./review-input";
import {
  loadDraftTreeIds,
  loadOwnedDraftRows,
  loadUserClock,
  writeReview,
  type OwnedDraftRow,
  type TaskEdit,
} from "./review-store";

export type ReviewOutcome = { ok: true } | { ok: false; reason: "invalid" | "not_found" | "stale" };

/** Saves inline edits to the user's draft rows. */
export function saveReviewEdits(db: Db, userId: string, form: FormData): Promise<ReviewOutcome> {
  return review(db, userId, form, false);
}

/** Saves edits, then accepts the kept rows and deletes the dropped ones. */
export function acceptReview(db: Db, userId: string, form: FormData): Promise<ReviewOutcome> {
  return review(db, userId, form, true);
}

async function review(db: Db, userId: string, form: FormData, accept: boolean): Promise<ReviewOutcome> {
  const input = parseReviewForm(form);
  if (!input) return { ok: false, reason: "invalid" };

  // Ownership: every submitted id must be one of this user's in-review tasks, or nothing is written.
  const owned = await loadOwnedDraftRows(
    db,
    userId,
    input.map((r) => r.id),
  );
  if (owned.length !== input.length) return { ok: false, reason: "not_found" };
  const clock = await loadUserClock(db, userId);
  if (!clock) return { ok: false, reason: "not_found" };

  const byId = new Map(owned.map((row) => [row.id, row]));
  const edits = input.map((row) => toEdit(row, byId.get(row.id)!, clock));
  if (!accept) {
    await writeReview(db, userId, edits);
    return { ok: true };
  }

  // Accept whole trees only: a tree changed since the page loaded (say, by a re-import) is refused.
  const roots = [...new Set(owned.map((row) => row.rootId ?? row.id))];
  const treeIds = await loadDraftTreeIds(db, userId, roots);
  if (treeIds.some((id) => !byId.has(id))) return { ok: false, reason: "stale" };

  const keep = new Set(input.filter((row) => row.keep).map((row) => row.id));
  await writeReview(db, userId, edits, planAccept(owned, keep));
  return { ok: true };
}

function toEdit(
  row: ReviewRowInput,
  current: OwnedDraftRow,
  clock: { timeZone: string; dayEndHour: number },
): TaskEdit {
  const edit: TaskEdit = { id: row.id, title: row.title, area: row.area };
  const currentDue = current.dueAt ? localDate(current.dueAt, clock.timeZone) : "";
  if (row.due !== currentDue) {
    // A date the user typed is no longer a guess.
    edit.dueAt = row.due ? zonedTimeToUtc(row.due, clock.dayEndHour, clock.timeZone) : null;
    edit.dueDateConfidence = row.due ? "stated" : "none";
  }
  const effort = row.effort === "" ? null : row.effort;
  if (effort !== current.effortMin) {
    edit.effortMin = effort;
    edit.effortSource = effort === null ? null : "user";
  }
  return edit;
}
