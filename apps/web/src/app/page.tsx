import Link from "next/link";
import { isClosed, type TaskStatus } from "@ahead/core";
import { requireUser } from "@/server/current-user";
import { localDate } from "@/server/dates";
import { getDb } from "@/server/db";
import { nestRows, pruneTree, type RowNode } from "@/server/task-tree";
import { countInReview, loadAcceptedTasks, type TodayRow } from "@/server/today-queries";
import { SignOutButton } from "./sign-out-button";

export default async function TodayPage() {
  const user = await requireUser();
  const db = getDb();
  const [rows, inReview] = await Promise.all([loadAcceptedTasks(db, user.id), countInReview(db, user.id)]);
  const trees = pruneTree(nestRows(rows), (row) => !isClosed(row.status as TaskStatus));

  return (
    <>
      <nav className="nav">
        <Link href="/import">Import tasks</Link>
        <Link href="/settings">Settings</Link>
        <SignOutButton />
      </nav>
      <h1>Today</h1>
      <p className="muted">Signed in as {user.email}</p>

      {inReview > 0 && (
        <p className="notice">
          {inReview} proposed {inReview === 1 ? "item is" : "items are"} waiting for review.{" "}
          <Link href="/import/review">Review now</Link>
        </p>
      )}

      <h2>Open tasks</h2>
      {trees.length > 0 ? (
        <TaskTree nodes={trees} timeZone={user.timeZone} />
      ) : (
        <p className="muted">
          No open tasks yet. <Link href="/import">Import your task document</Link>.
        </p>
      )}
    </>
  );
}

function TaskTree({ nodes, timeZone }: { nodes: RowNode<TodayRow>[]; timeZone: string }) {
  return (
    <ul className="tree">
      {nodes.map(({ row, children }) => (
        <li key={row.id}>
          <span className={row.status === "done" ? "muted done" : undefined}>{row.title}</span>
          {row.dueAt && <span className="muted"> · due {localDate(row.dueAt, timeZone)}</span>}
          <span className="badge">{row.status.replace("_", " ")}</span>
          {children.length > 0 && <TaskTree nodes={children} timeZone={timeZone} />}
        </li>
      ))}
    </ul>
  );
}
