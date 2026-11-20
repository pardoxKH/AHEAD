import { createAiClient, proposeTasksFromQueue, type ImportIssue } from "@ahead/ai";
import type { Db } from "@ahead/db";
import { decryptSecret, fetchDocument, IMPORT_SCOPES, loadEncryptionKey, parseDocQueue } from "@ahead/google";
import type { Env } from "../../env";
import { localDate } from "../dates";
import { googleClient } from "../google-client";
import { recordImportUsage } from "./ai-usage";
import type { DocLink } from "./doc-link";
import { buildDraftRows } from "./draft-rows";
import { saveImportDraft } from "./draft-store";
import { countIssues } from "./issues";

export interface ImportUser {
  id: string;
  timeZone: string;
  dayEndHour: number;
  scopes: readonly string[];
  encryptedRefreshToken: string;
}

export type ImportResult =
  { ok: true; tasks: number } | { ok: false; reason: "consent" | "fetch" | "empty" | "ai" | "save" };

export interface ImportDeps {
  db: Db;
  env: Env;
  now: Date;
  newId: () => string;
}

export const hasImportScopes = (scopes: readonly string[]) => IMPORT_SCOPES.every((s) => scopes.includes(s));

/**
 * Fetches the doc with the user's own Google token, asks Claude for proposed tasks and saves them as
 * a draft. Errors are reduced to a reason; only their type is logged, never doc text or tokens.
 */
export async function runImport(user: ImportUser, doc: DocLink, deps: ImportDeps): Promise<ImportResult> {
  if (!hasImportScopes(user.scopes)) return { ok: false, reason: "consent" };
  const { db, env, now } = deps;

  let title: string | undefined;
  let lines;
  try {
    const auth = googleClient(env);
    const key = loadEncryptionKey({ TOKEN_ENCRYPTION_KEY: env.TOKEN_ENCRYPTION_KEY });
    auth.setCredentials({ refresh_token: decryptSecret(user.encryptedRefreshToken, key) });
    const document = await fetchDocument(auth, doc.docId);
    title = document.title ?? undefined;
    lines = parseDocQueue(document);
  } catch (err) {
    console.error("Doc import fetch failed:", (err as Error).name);
    return { ok: false, reason: "fetch" };
  }
  if (lines.length === 0) return { ok: false, reason: "empty" };

  const issues: ImportIssue[] = [];
  let proposal;
  try {
    const ai = createAiClient({
      apiKey: env.ANTHROPIC_API_KEY,
      onUsage: (event) => recordImportUsage(db, user.id, event),
    });
    proposal = await proposeTasksFromQueue(ai, {
      lines,
      today: localDate(now, user.timeZone),
      timeZone: user.timeZone,
      onIssue: (issue) => issues.push(issue),
    });
  } catch (err) {
    console.error("Doc import proposal failed:", (err as Error).name);
    return { ok: false, reason: "ai" };
  }

  try {
    const rows = buildDraftRows(proposal, {
      userId: user.id,
      docUrl: doc.url,
      docTitle: title,
      lines,
      now,
      timeZone: user.timeZone,
      dueHour: user.dayEndHour,
      newId: deps.newId,
    });
    await saveImportDraft(db, {
      userId: user.id,
      docId: doc.docId,
      docUrl: doc.url,
      rows,
      issues: countIssues(issues),
    });
    return { ok: true, tasks: rows.length };
  } catch (err) {
    console.error("Doc import save failed:", (err as Error).name);
    return { ok: false, reason: "save" };
  }
}
