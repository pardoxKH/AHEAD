import { z } from "zod";
import { extractDocumentId } from "@ahead/google";

export interface DocLink {
  docId: string;
  /** Canonical URL, used as the import's source link and to find an earlier import of the same doc. */
  url: string;
}

const docInput = z.string().trim().min(1).max(2048);

/** Parses a Google Doc link or id from user input, or returns null. */
export function parseDocLink(raw: unknown): DocLink | null {
  const parsed = docInput.safeParse(raw);
  if (!parsed.success) return null;
  try {
    const docId = extractDocumentId(parsed.data);
    return { docId, url: `https://docs.google.com/document/d/${docId}/edit` };
  } catch {
    return null;
  }
}
