import Link from "next/link";
import { requireUser } from "@/server/current-user";
import { hasImportScopes } from "@/server/import/run-import";

const ERRORS: Record<string, string> = {
  link: "That doesn't look like a Google Doc link.",
  fetch: "Ahead couldn't read that document. Check the link and that your account can open it.",
  empty: "That document has no text to import.",
  ai: "Ahead couldn't turn the document into tasks. Please try again.",
  save: "Ahead couldn't save the proposal. Please try again.",
};

const CONSENT: Record<string, string> = {
  denied: "Google access to your documents was not granted, so nothing was imported.",
  state: "That Google consent link expired. Please try again.",
};

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string; error?: string; consent?: string }>;
}) {
  const [user, { doc, error, consent }] = await Promise.all([requireUser(), searchParams]);
  const message = error
    ? (ERRORS[error] ?? ERRORS.ai)
    : consent
      ? (CONSENT[consent] ?? "Google consent failed. Please try again.")
      : undefined;
  const ready = Boolean(doc) && !message && hasImportScopes(user.scopes);

  return (
    <>
      <nav className="nav">
        <Link href="/">Today</Link>
        <Link href="/import/review">Review proposals</Link>
      </nav>
      <h1>Import your task document</h1>
      <p className="muted">
        Paste the link to the Google Doc that holds your task queue. Highlighted items are imported as done.
        Ahead proposes tasks for you to review; nothing is added until you accept it.
      </p>
      {message && (
        <p className="notice" role="alert">
          {message}
        </p>
      )}
      {ready && <p className="notice">Google Docs access is ready. Press Import to continue.</p>}
      <form action="/api/import" method="post">
        <label htmlFor="doc">Google Doc link</label>
        <input
          className="field field-wide"
          id="doc"
          name="doc"
          type="text"
          inputMode="url"
          placeholder="https://docs.google.com/document/d/…"
          defaultValue={doc ?? ""}
          required
        />
        <button className="button button-primary" type="submit">
          Import
        </button>
      </form>
      {!hasImportScopes(user.scopes) && (
        <p className="muted">Google will ask once for read-only access to your documents.</p>
      )}
    </>
  );
}
