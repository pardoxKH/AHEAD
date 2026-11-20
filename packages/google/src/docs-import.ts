import type { OAuth2Client } from "google-auth-library";
import type { docs_v1 } from "googleapis";
import { docs } from "googleapis/build/src/apis/docs/index.js";

// Reads Tariq's existing task document for the one-time import. He marks a task done by highlighting it.

export interface QueueLine {
  text: string;
  /** True when most of the line's visible text is highlighted. */
  done: boolean;
  /** Bullet nesting level; 0 for top-level bullets and plain paragraphs. */
  level: number;
}

/** Turns a `documents.get` response into lines. Pure: no network. */
export function parseDocQueue(document: docs_v1.Schema$Document): QueueLine[] {
  const lines: QueueLine[] = [];
  for (const element of document.body?.content ?? []) {
    const paragraph = element.paragraph;
    if (!paragraph) continue;

    let total = 0;
    let highlighted = 0;
    let text = "";
    for (const { textRun } of paragraph.elements ?? []) {
      const content = textRun?.content ?? "";
      const visible = content.replace(/\s/g, "").length;
      total += visible;
      if (textRun?.textStyle?.backgroundColor?.color) highlighted += visible;
      text += content;
    }

    text = text.trim();
    if (!text) continue;
    lines.push({ text, done: highlighted * 2 > total, level: paragraph.bullet?.nestingLevel ?? 0 });
  }
  return lines;
}

/** Accepts a bare document id or a docs.google.com URL. */
export function extractDocumentId(documentIdOrUrl: string): string {
  const input = documentIdOrUrl.trim();
  const fromUrl = /docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]+)/.exec(input)?.[1];
  if (fromUrl) return fromUrl;
  if (/^[A-Za-z0-9_-]+$/.test(input)) return input;
  throw new Error("Not a Google Docs document id or URL");
}

/** Needs the documents.readonly import scope. */
export async function fetchDocument(
  auth: OAuth2Client,
  documentIdOrUrl: string,
): Promise<docs_v1.Schema$Document> {
  const api = docs({ version: "v1", auth });
  const { data } = await api.documents.get({ documentId: extractDocumentId(documentIdOrUrl) });
  return data;
}
