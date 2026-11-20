import Link from "next/link";
import { requireUser } from "@/server/current-user";
import { DELETE_CONFIRMATION } from "@/server/delete-account";

export default async function DeleteDataPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [user, { error }] = await Promise.all([requireUser(), searchParams]);

  return (
    <>
      <nav className="nav">
        <Link href="/settings">Back to Settings</Link>
      </nav>
      <h1>Delete all my data</h1>
      <p>
        This revokes Ahead&apos;s Google access for <strong>{user.email}</strong> and permanently deletes your
        tasks, plans, drafts records and settings. It cannot be undone.
      </p>
      {error === "confirm" && (
        <p className="notice" role="alert">
          Type {DELETE_CONFIRMATION} exactly to confirm.
        </p>
      )}
      <form action="/api/account/delete" method="post">
        <label htmlFor="confirm">
          Type <strong>{DELETE_CONFIRMATION}</strong> to confirm
        </label>
        <input
          className="field"
          id="confirm"
          name="confirm"
          autoComplete="off"
          autoCapitalize="characters"
          required
        />
        <button className="button button-danger" type="submit">
          Delete everything
        </button>
      </form>
    </>
  );
}
