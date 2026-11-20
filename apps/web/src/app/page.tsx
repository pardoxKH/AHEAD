import Link from "next/link";
import { requireUser } from "@/server/current-user";
import { SignOutButton } from "./sign-out-button";

export default async function TodayPage() {
  const user = await requireUser();

  return (
    <>
      <nav className="nav">
        <Link href="/settings">Settings</Link>
        <SignOutButton />
      </nav>
      <h1>Today</h1>
      <p className="muted">Signed in as {user.email}</p>

      <h2>Connected scopes</h2>
      {user.scopes.length > 0 ? (
        <ul className="list">
          {user.scopes.map((scope) => (
            <li key={scope}>
              <code>{scope}</code>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No Google scopes are connected.</p>
      )}
    </>
  );
}
