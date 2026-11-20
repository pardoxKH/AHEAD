// Runs once when the server starts: fail fast on a bad environment instead of on the first request.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getEnv } = await import("./env");
  getEnv();
}
