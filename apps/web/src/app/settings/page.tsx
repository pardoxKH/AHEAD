import Link from "next/link";
import { requireUser } from "@/server/current-user";
import { SignOutButton } from "../sign-out-button";

// 0 = Sunday, matching users.working_days.
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function SettingsPage() {
  const user = await requireUser();
  const workingDays = user.workingDays.map((day) => DAY_NAMES[day] ?? `Day ${day}`).join(", ");

  return (
    <>
      <nav className="nav">
        <Link href="/">Today</Link>
        <SignOutButton />
      </nav>
      <h1>Settings</h1>
      <dl>
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>Time zone</dt>
        <dd>{user.timeZone}</dd>
        <dt>Working days</dt>
        <dd>{workingDays}</dd>
      </dl>

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

      <h2>Delete all my data</h2>
      <p className="muted">
        Revokes Ahead&apos;s access to your Google account and deletes everything Ahead stored.
      </p>
      <Link className="button button-danger" href="/settings/delete">
        Delete all my data…
      </Link>
    </>
  );
}
