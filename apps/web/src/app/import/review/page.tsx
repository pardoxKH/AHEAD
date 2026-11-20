import Link from "next/link";
import { requireUser } from "@/server/current-user";
import { getDb } from "@/server/db";
import { skippedCount, type IssueCounts } from "@/server/import/issues";
import { loadImportIssues, loadReviewRows } from "@/server/review/review-queries";
import { nestRows } from "@/server/task-tree";
import { acceptSelectedAction, saveEditsAction } from "./actions";
import { ReviewTree } from "./review-tree";

const ERRORS: Record<string, string> = {
  invalid: "Some fields were not valid. Check titles, dates and effort, then try again.",
  not_found: "Some of these tasks no longer exist. The list has been refreshed.",
  stale: "The proposal changed since this page loaded (perhaps a new import). Review it again.",
};

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const [user, { error, saved }] = await Promise.all([requireUser(), searchParams]);
  const db = getDb();
  const rows = await loadReviewRows(db, user.id);
  const issues = await loadImportIssues(
    db,
    user.id,
    rows.flatMap((row) => (row.docLink ? [row.docLink] : [])),
  );
  const docTitles = [...new Set(rows.flatMap((row) => (row.docTitle ? [row.docTitle] : [])))];

  return (
    <>
      <nav className="nav">
        <Link href="/">Today</Link>
        <Link href="/import">Import again</Link>
      </nav>
      <h1>Review proposed tasks</h1>
      {docTitles.length > 0 && <p className="muted">From {docTitles.join(", ")}</p>}
      {error && (
        <p className="notice" role="alert">
          {ERRORS[error] ?? ERRORS.invalid}
        </p>
      )}
      {saved && <p className="notice">Edits saved.</p>}
      <IssueNote issues={issues} />

      {rows.length === 0 ? (
        <p className="muted">
          Nothing to review. <Link href="/import">Import your task document</Link>.
        </p>
      ) : (
        <form>
          <p className="muted">Untick anything you don&apos;t want. Unticked tasks are deleted on accept.</p>
          <ReviewTree nodes={nestRows(rows)} timeZone={user.timeZone} />
          <div className="nav">
            <button className="button button-primary" type="submit" formAction={acceptSelectedAction}>
              Accept selected
            </button>
            <button className="button" type="submit" formAction={saveEditsAction}>
              Save edits
            </button>
          </div>
        </form>
      )}
    </>
  );
}

function IssueNote({ issues }: { issues: IssueCounts[] }) {
  const total: IssueCounts = {};
  for (const counts of issues) {
    for (const [code, n] of Object.entries(counts) as [keyof IssueCounts, number][]) {
      total[code] = (total[code] ?? 0) + n;
    }
  }
  const entries = Object.entries(total);
  if (entries.length === 0) return null;
  const skipped = skippedCount(total);
  return (
    <p className="muted small">
      {skipped > 0
        ? `Ahead skipped ${skipped} ${skipped === 1 ? "line" : "lines"}`
        : "Ahead adjusted some items"}
      {" ("}
      {entries.map(([code, n]) => `${code} ×${n}`).join(", ")}
      {")."}
    </p>
  );
}
