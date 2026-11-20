import type { ImportIssue } from "@ahead/ai";

// Import issues are reduced to fixed reason codes before they are stored or shown; the problem text
// is never kept.
export const ISSUE_CODES = [
  "invalid_item",
  "bad_source_lines",
  "done_corrected",
  "date_dropped",
  "parent_unlinked",
  "other",
] as const;
export type IssueCode = (typeof ISSUE_CODES)[number];

/** Codes for items the import dropped; the others were corrected and kept. */
const SKIPPED: ReadonlySet<IssueCode> = new Set(["invalid_item", "bad_source_lines"]);

export function issueCode(issue: ImportIssue): IssueCode {
  const p = issue.problem;
  if (p.startsWith("invalid")) return "invalid_item";
  if (p.startsWith("sourceLineIndexes")) return "bad_source_lines";
  if (p.startsWith("model said done")) return "done_corrected";
  if (p.startsWith("dueDate")) return "date_dropped";
  if (p.startsWith("parentIndex") || p.startsWith("parentContextLine")) return "parent_unlinked";
  return "other";
}

export type IssueCounts = Partial<Record<IssueCode, number>>;

export function countIssues(issues: readonly ImportIssue[]): IssueCounts {
  const counts: IssueCounts = {};
  for (const issue of issues) {
    const code = issueCode(issue);
    counts[code] = (counts[code] ?? 0) + 1;
  }
  return counts;
}

export function skippedCount(counts: IssueCounts): number {
  return Object.entries(counts).reduce(
    (total, [code, n]) => total + (SKIPPED.has(code as IssueCode) ? (n ?? 0) : 0),
    0,
  );
}

/** Reads counts back from stored JSON, keeping only known codes. */
export function readIssueCounts(value: unknown): IssueCounts {
  const counts: IssueCounts = {};
  if (!value || typeof value !== "object") return counts;
  for (const code of ISSUE_CODES) {
    const n = (value as Record<string, unknown>)[code];
    if (typeof n === "number" && Number.isInteger(n) && n > 0) counts[code] = n;
  }
  return counts;
}
