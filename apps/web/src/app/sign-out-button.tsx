export function SignOutButton() {
  return (
    <form action="/api/auth/signout" method="post">
      <button className="button" type="submit">
        Sign out
      </button>
    </form>
  );
}
