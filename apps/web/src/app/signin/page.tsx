const ERRORS: Record<string, string> = {
  state: "That sign-in link expired or was already used. Please try again.",
  denied: "Sign-in was cancelled.",
  not_allowed: "This Google account is not allowed to use Ahead.",
  failed: "Sign-in failed. Please try again.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; deleted?: string }>;
}) {
  const { error, deleted } = await searchParams;
  const message = error ? (ERRORS[error] ?? ERRORS.failed) : undefined;

  return (
    <>
      <h1>Ahead</h1>
      {deleted && (
        <p className="notice">
          Your data was deleted.{" "}
          {deleted === "revoked" ? (
            "Google access was revoked."
          ) : (
            <>
              Google did not confirm revoking access; remove Ahead at{" "}
              <a href="https://myaccount.google.com/permissions">your Google account permissions</a>.
            </>
          )}
        </p>
      )}
      {message && (
        <p className="notice" role="alert">
          {message}
        </p>
      )}
      <p className="muted">
        Ahead reads your Gmail and Google Calendar to plan your day, and writes only to its own calendar and
        to Gmail drafts. It never sends email.
      </p>
      <p>
        <a className="button button-primary" href="/api/auth/google/start">
          Sign in with Google
        </a>
      </p>
    </>
  );
}
