import type { gmail_v1 } from "googleapis";
import { describe, expect, it, vi } from "vitest";
import { GmailClient, encodeHeaderWord } from "./gmail.js";

function mockGmail() {
  const api = {
    users: {
      getProfile: vi.fn(async () => ({ data: { emailAddress: "tariq@example.com", historyId: "10" } })),
      history: {
        list: vi
          .fn()
          .mockResolvedValueOnce({ data: { history: [{ id: "11" }], historyId: "13", nextPageToken: "p2" } })
          .mockResolvedValueOnce({ data: { history: [{ id: "12" }], historyId: "13" } }),
      },
      messages: { get: vi.fn(async () => ({ data: { id: "m1" } })) },
      drafts: {
        create: vi.fn(async () => ({ data: { id: "d1" } })),
        update: vi.fn(async () => ({ data: { id: "d1" } })),
      },
    },
  };
  return { api, client: new GmailClient(api as unknown as gmail_v1.Gmail) };
}

type DraftRequest = { requestBody: { message: { raw: string; threadId?: string } } };

const decodeRaw = (raw: string) => {
  const text = Buffer.from(raw, "base64url").toString("utf8");
  const [head = "", body = ""] = text.split("\r\n\r\n");
  return { head, body: Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8") };
};

const decodeWords = (header: string) =>
  [...header.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)]
    .map((m) => Buffer.from(m[1] ?? "", "base64").toString("utf8"))
    .join("");

describe("GmailClient", () => {
  it("exposes no way to send", () => {
    const { client } = mockGmail();
    const keys = [
      ...Object.keys(client),
      ...Object.getOwnPropertyNames(Object.getPrototypeOf(client) as object),
    ];
    expect(keys).toEqual(expect.arrayContaining(["createDraft", "updateDraft"]));
    expect(keys.filter((k) => k.toLowerCase().includes("send"))).toEqual([]);
  });

  it("builds a threaded draft with an encoded UTF-8 subject", async () => {
    const { api, client } = mockGmail();
    await client.createDraft({
      to: "Omar <omar@example.com>",
      subject: "Re: موعد الاجتماع ✓",
      body: "أهلاً Omar,\nSee you Sunday.",
      threadId: "t1",
      inReplyTo: "<abc@mail.example.com>",
    });

    const [request] = api.users.drafts.create.mock.calls[0] as unknown as [DraftRequest];
    expect(request.requestBody.message.threadId).toBe("t1");
    const raw = request.requestBody.message.raw;
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);

    const { head, body } = decodeRaw(raw);
    expect(head).toContain("To: Omar <omar@example.com>");
    expect(head).toContain("In-Reply-To: <abc@mail.example.com>");
    expect(head).toContain("References: <abc@mail.example.com>");
    expect(head).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(head).toMatch(/^Subject: =\?UTF-8\?B\?/m);
    expect(decodeWords(head)).toBe("Re: موعد الاجتماع ✓");
    expect(body).toBe("أهلاً Omar,\nSee you Sunday.");
  });

  it("keeps ASCII subjects readable and strips header injection", async () => {
    const { api, client } = mockGmail();
    await client.updateDraft("d1", { to: "a@example.com\r\nBcc: x@evil.test", subject: "Hello", body: "Hi" });
    const [request] = api.users.drafts.update.mock.calls[0] as unknown as [DraftRequest & { id: string }];
    expect(request.id).toBe("d1");
    const { head } = decodeRaw(request.requestBody.message.raw);
    expect(head).toContain("Subject: Hello");
    expect(head).not.toMatch(/^Bcc:/m);
    expect(head).not.toContain("In-Reply-To");
  });

  it("splits long encoded subjects into short encoded words", () => {
    const subject = "ملاحظات ".repeat(20);
    const encoded = encodeHeaderWord(subject);
    for (const line of encoded.split("\r\n")) expect(line.trim().length).toBeLessThanOrEqual(75);
    expect(decodeWords(encoded)).toBe(subject);
  });

  it("follows every history page", async () => {
    const { api, client } = mockGmail();
    await expect(client.listHistory("10")).resolves.toEqual({
      history: [{ id: "11" }, { id: "12" }],
      historyId: "13",
    });
    expect(api.users.history.list).toHaveBeenLastCalledWith({
      userId: "me",
      startHistoryId: "10",
      pageToken: "p2",
    });
  });

  it("reads full messages and the profile", async () => {
    const { api, client } = mockGmail();
    await client.getMessage("m1");
    expect(api.users.messages.get).toHaveBeenCalledWith({ userId: "me", id: "m1", format: "full" });
    await expect(client.getProfile()).resolves.toMatchObject({ historyId: "10" });
  });
});
