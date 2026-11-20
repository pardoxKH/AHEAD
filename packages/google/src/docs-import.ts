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

/** Turns a `documents.get` response into lines, in reading order. Pure: no network. */
export function parseDocQueue(document: docs_v1.Schema$Document): QueueLine[] {
  const lines: QueueLine[] = [];
  collectLines(document.body?.content ?? [], lines);
  return lines;
}

function collectLines(content: docs_v1.Schema$StructuralElement[], lines: QueueLine[]): void {
  for (const element of content) {
    if (element.paragraph) {
      const line = parseParagraph(element.paragraph);
      if (line) lines.push(line);
    }
    for (const row of element.table?.tableRows ?? []) {
      for (const cell of row.tableCells ?? []) collectLines(cell.content ?? [], lines);
    }
  }
}

function parseParagraph(paragraph: docs_v1.Schema$Paragraph): QueueLine | undefined {
  let total = 0;
  let highlighted = 0;
  let text = "";
  for (const element of paragraph.elements ?? []) {
    const { content, style } = elementText(element);
    const visible = content.replace(/\s/g, "").length;
    total += visible;
    if (isHighlighted(style)) highlighted += visible;
    text += content;
  }
  text = text.trim();
  if (!text) return undefined;
  return { text, done: highlighted * 2 > total, level: paragraph.bullet?.nestingLevel ?? 0 };
}

/** Text of a run or a smart chip (link, person, date), with the style that carries its highlight. */
function elementText(element: docs_v1.Schema$ParagraphElement): {
  content: string;
  style: docs_v1.Schema$TextStyle | undefined;
} {
  const { textRun, richLink, person, dateElement } = element;
  if (textRun) return { content: textRun.content ?? "", style: textRun.textStyle };
  if (richLink) return { content: richLink.richLinkProperties?.title ?? "", style: richLink.textStyle };
  if (person) {
    const props = person.personProperties;
    return { content: props?.name || props?.email || "", style: person.textStyle };
  }
  if (dateElement) {
    return { content: dateElement.dateElementProperties?.displayText ?? "", style: dateElement.textStyle };
  }
  return { content: "", style: undefined };
}

/** A background colour counts as a highlight unless it is (near) white. */
function isHighlighted(style: docs_v1.Schema$TextStyle | undefined): boolean {
  const color = style?.backgroundColor?.color;
  if (!color) return false;
  const rgb = color.rgbColor;
  const isWhite = !!rgb && [rgb.red, rgb.green, rgb.blue].every((c) => (c ?? 0) >= 0.98);
  return !isWhite;
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
