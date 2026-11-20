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
      // A white background (pasted text) is not a highlight.
      { text: "Reply to the auditors", done: false, level: 0 },
      // Smart chips: a highlighted person and link.
      { text: "Layla Haddad Board pack FY26", done: true, level: 0 },
      // A person chip without a name falls back to the email; a date chip uses its display text.
      { text: "Call khalid@example.com before Nov 27, 2026", done: false, level: 0 },
      { text: "Projects", done: false, level: 0 },
      // Table cells, read row by row.
      { text: "Project", done: false, level: 0 },
      { text: "Next step", done: false, level: 0 },
      { text: "Riyadh office", done: false, level: 0 },
      { text: "Sign the lease", done: true, level: 0 },
      { text: "Hire a fit-out firm", done: false, level: 0 },
      { text: "Hiring", done: false, level: 0 },
      { text: "Later", done: false, level: 0 },
      { text: "Renew passport", done: true, level: 0 },
      { text: "Ideas: hire an EA?", done: false, level: 0 },
    ]);
  });

  const line = (elements: docs_v1.Schema$ParagraphElement[]): docs_v1.Schema$Document => ({
    body: { content: [{ paragraph: { elements } }] },
  });
  const bg = (red: number, green: number, blue: number) => ({
    backgroundColor: { color: { rgbColor: { red, green, blue } } },
  });

  it("treats near-white backgrounds as unhighlighted and other colours as highlighted", () => {
    const parse = (style: docs_v1.Schema$TextStyle) =>
      parseDocQueue(line([{ textRun: { content: "Task\n", textStyle: style } }]))[0]?.done;
    expect(parse(bg(0.99, 0.98, 1))).toBe(false);
    expect(parse(bg(1, 1, 0))).toBe(true);
    expect(parse(bg(0.97, 0.97, 0.97))).toBe(true);
  });

  it("finds tasks in nested tables", () => {
    const cell = (content: docs_v1.Schema$StructuralElement[]) => ({ content });
    const doc: docs_v1.Schema$Document = {
      body: {
        content: [
          {
            table: {
              tableRows: [
                {
                  tableCells: [
                    cell([
                      {
                        table: {
                          tableRows: [
                            {
                              tableCells: [
                                cell([
                                  { paragraph: { elements: [{ textRun: { content: "Deep task\n" } }] } },
                                ]),
                              ],
                            },
                          ],
                        },
                      },
                    ]),
                  ],
                },
              ],
            },
          },
        ],
      },
    };
    expect(parseDocQueue(doc)).toEqual([{ text: "Deep task", done: false, level: 0 }]);
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
