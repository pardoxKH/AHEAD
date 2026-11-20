import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as AiModule from "@ahead/ai";
import { createAiClient, proposeTasksFromQueue, type UsageEvent } from "@ahead/ai";
import type { Db } from "@ahead/db";
import type * as GoogleModule from "@ahead/google";
import { encryptSecret, fetchDocument, IMPORT_SCOPES, loadEncryptionKey } from "@ahead/google";
import { testEnv } from "../../test/env-fixture";
import { recordImportUsage } from "./ai-usage";
import { saveImportDraft } from "./draft-store";
import { runImport, type ImportUser } from "./run-import";

vi.mock("@ahead/google", async (importOriginal) => ({
  ...(await importOriginal<typeof GoogleModule>()),
  fetchDocument: vi.fn(),
}));
vi.mock("@ahead/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof AiModule>()),
  createAiClient: vi.fn(() => ({ generateJson: vi.fn() })),
  proposeTasksFromQueue: vi.fn(),
}));
vi.mock("./draft-store", () => ({ saveImportDraft: vi.fn() }));
vi.mock("./ai-usage", () => ({ recordImportUsage: vi.fn() }));

const SECRET_TEXT = "Call the lawyer about the lease";
const key = loadEncryptionKey({ TOKEN_ENCRYPTION_KEY: testEnv.TOKEN_ENCRYPTION_KEY });
const user: ImportUser = {
  id: "user-1",
  timeZone: "Asia/Riyadh",
  dayEndHour: 17,
  scopes: ["openid", "email", ...IMPORT_SCOPES],
  encryptedRefreshToken: encryptSecret("refresh-token", key),
};
const doc = { docId: "doc1", url: "https://docs.google.com/document/d/doc1/edit" };
const db = {} as Db;
let n = 0;
const deps = { db, env: testEnv, now: new Date("2026-11-20T22:00:00Z"), newId: () => `id-${n++}` };

const document = {
  title: "My queue",
  body: { content: [{ paragraph: { elements: [{ textRun: { content: `${SECRET_TEXT}\n` } }] } }] },
};

describe("runImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchDocument).mockResolvedValue(document);
    vi.mocked(proposeTasksFromQueue).mockImplementation(async (_ai, input) => {
      input.onIssue?.({ chunk: 0, item: 1, problem: "invalid title" });
      input.onIssue?.({ chunk: 0, item: 2, problem: "model said done=true; kept the doc's done=false" });
      return [
        {
          sourceLineIndexes: [0],
          title: "Call the lawyer",
          area: "personal",
          dueDateConfidence: "none",
          done: false,
          confidence: 0.8,
        },
      ];
    });
  });

  it("asks for consent first when the Docs scope is missing, without calling Google or Claude", async () => {
    const result = await runImport({ ...user, scopes: ["openid", "email"] }, doc, deps);
    expect(result).toEqual({ ok: false, reason: "consent" });
    expect(fetchDocument).not.toHaveBeenCalled();
    expect(proposeTasksFromQueue).not.toHaveBeenCalled();
  });

  it("fetches with the decrypted token, proposes with today's local date and saves the draft", async () => {
    await expect(runImport(user, doc, deps)).resolves.toEqual({ ok: true, tasks: 1 });

    const auth = vi.mocked(fetchDocument).mock.calls[0]![0];
    expect(auth.credentials.refresh_token).toBe("refresh-token");
    expect(vi.mocked(fetchDocument).mock.calls[0]![1]).toBe("doc1");
    expect(createAiClient).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: testEnv.ANTHROPIC_API_KEY }),
    );
    expect(vi.mocked(proposeTasksFromQueue).mock.calls[0]![1]).toMatchObject({
      // 22:00 UTC on the 20th is already the 21st in Riyadh.
      today: "2026-11-21",
      timeZone: "Asia/Riyadh",
      lines: [{ text: SECRET_TEXT, done: false, level: 0 }],
    });

    const saved = vi.mocked(saveImportDraft).mock.calls[0]![1];
    expect(saved).toMatchObject({ userId: "user-1", docId: "doc1", docUrl: doc.url });
    expect(saved.issues).toEqual({ invalid_item: 1, done_corrected: 1 });
    expect(saved.rows[0]!.source).toMatchObject({ subject: "My queue", snippet: SECRET_TEXT });
  });

  it("records Claude usage for the session user", async () => {
    await runImport(user, doc, deps);
    const { onUsage } = vi.mocked(createAiClient).mock.calls[0]![0];
    const event = { inputTokens: 10, outputTokens: 5 } as UsageEvent;
    await onUsage(event);
    expect(recordImportUsage).toHaveBeenCalledWith(db, "user-1", event);
  });

  it.each([
    ["fetch", () => vi.mocked(fetchDocument).mockRejectedValue(new Error(SECRET_TEXT))],
    ["ai", () => vi.mocked(proposeTasksFromQueue).mockRejectedValue(new Error(SECRET_TEXT))],
    ["save", () => vi.mocked(saveImportDraft).mockRejectedValue(new Error(SECRET_TEXT))],
  ])("reports a %s failure without logging its message", async (reason, fail) => {
    fail();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(runImport(user, doc, deps)).resolves.toEqual({ ok: false, reason });
    expect(JSON.stringify(log.mock.calls)).not.toContain(SECRET_TEXT);
    expect(JSON.stringify(log.mock.calls)).not.toContain("refresh-token");
    log.mockRestore();
  });

  it("reports an empty document without calling Claude", async () => {
    vi.mocked(fetchDocument).mockResolvedValue({ title: "Empty", body: { content: [] } });
    await expect(runImport(user, doc, deps)).resolves.toEqual({ ok: false, reason: "empty" });
    expect(proposeTasksFromQueue).not.toHaveBeenCalled();
  });
});
