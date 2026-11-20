import { randomUUID } from "node:crypto";
import { getEnv } from "@/env";
import { getSessionUserId } from "@/server/current-user";
import { getDb } from "@/server/db";
import { parseDocLink } from "@/server/import/doc-link";
import { loadImportUser } from "@/server/import/import-user";
import { runImport } from "@/server/import/run-import";
import { redirectTo } from "@/server/redirect";
import { forbidden, isSameOrigin } from "@/server/same-origin";

export const dynamic = "force-dynamic";
// Claude may take a while on a long queue.
export const maxDuration = 300;

export async function POST(request: Request) {
  // Starting an import spends Claude tokens: only accept it from Ahead's own pages.
  if (!isSameOrigin(request.headers, getEnv().APP_URL)) return forbidden();

  const userId = await getSessionUserId();
  if (!userId) return redirectTo("/signin");

  const form = await request.formData();
  const doc = parseDocLink(form.get("doc"));
  if (!doc) return redirectTo("/import?error=link");

  const db = getDb();
  const user = await loadImportUser(db, userId);
  if (!user) return redirectTo("/signin");

  const back = `/import?doc=${encodeURIComponent(doc.url)}`;
  const result = await runImport(user, doc, { db, env: getEnv(), now: new Date(), newId: randomUUID });
  if (result.ok) return redirectTo("/import/review");
  if (result.reason === "consent") {
    // Incremental consent for the Docs scope, then back to this form with the link filled in.
    return redirectTo(`/api/auth/google/start?scopes=import&next=${encodeURIComponent(back)}`);
  }
  return redirectTo(`${back}&error=${result.reason}`);
}
