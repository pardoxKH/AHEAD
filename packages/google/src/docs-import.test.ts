import { readFileSync } from "node:fs";
import type { docs_v1 } from "googleapis";
import { describe, expect, it } from "vitest";
import { extractDocumentId, parseDocQueue } from "./docs-import.js";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/queue-document.json", import.meta.url), "utf8"),
) as docs_v1.Schema$Document;

describe("parseDocQueue", () => {
  it("parses headings, nested bullets and highlights", () => {
    expect(parseDocQueue(fixture)).toEqual([
      { text: "Tariq — Queue", done: false, level: 0 },
      { text: "This week", done: false, level: 0 },
      { text: "Send board deck to Omar", done: true, level: 0 },
      { text: "Q4 budget review", done: false, level: 0 },
      { text: "Collect numbers from finance", done: true, level: 1 },
      // Mostly highlighted.
      { text: "Draft summary for Layla", done: true, level: 1 },
      // Only "FX" highlighted.
      { text: "Check FX assumptions with the bank", done: false, level: 2 },
      // An empty backgroundColor means no highlight.
      { text: "Book flights to Dubai", done: false, level: 0 },
      { text: "Later", done: false, level: 0 },
      { text: "Renew passport", done: true, level: 0 },
      { text: "Ideas: hire an EA?", done: false, level: 0 },
    ]);
  });

  it("handles an empty document", () => {
    expect(parseDocQueue({})).toEqual([]);
  });
});

describe("extractDocumentId", () => {
  const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abc";

  it.each([
    id,
    `https://docs.google.com/document/d/${id}/edit`,
    `https://docs.google.com/document/d/${id}/edit?tab=t.0#heading=h.abc`,
    `https://docs.google.com/document/u/1/d/${id}`,
  ])("extracts the id from %s", (input) => {
    expect(extractDocumentId(input)).toBe(id);
  });

  it("rejects other URLs", () => {
    expect(() => extractDocumentId("https://example.com/document/d/abc")).toThrow();
  });
});
