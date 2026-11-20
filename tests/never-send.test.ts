import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// Guards ADR 0002: the lint rule that bans Gmail send calls must keep working.
const lint = async (code: string) => {
  const eslint = new ESLint();
  const [result] = await eslint.lintText(code, { filePath: "packages/google/src/example.ts" });
  return result?.messages.map((m) => m.message) ?? [];
};

describe("never-send lint rule", () => {
  it.each([
    "gmail.users.messages.send({ userId: 'me' });",
    "gmail.users.drafts.send({ userId: 'me' });",
    "const s = gmail.users.messages.send;",
    "gmail.users.messages['send']({ userId: 'me' });",
    "gmail.users['drafts']['send']({ userId: 'me' });",
    "gmail.users.messages?.send({ userId: 'me' });",
    "const { send } = gmail.users.messages;",
    "const { send: s } = gmail.users.drafts;",
    "const { 'send': s } = gmail.users['messages'];",
    "const { messages: { send } } = gmail.users;",
    "const { messages } = gmail.users; messages.send({});",
    "const { drafts } = gmail.users; drafts['send']({});",
    "gmail.users.drafts[`send`]({ userId: 'me' });",
  ])("rejects %s", async (code) => {
    const messages = await lint(`declare const gmail: any;\n${code}\n`);
    expect(messages.some((m) => m.includes("never sends"))).toBe(true);
  });

  it("allows creating drafts", async () => {
    const messages = await lint("declare const gmail: any;\ngmail.users.drafts.create({ userId: 'me' });\n");
    expect(messages.some((m) => m.includes("never sends"))).toBe(false);
  });

  it("allows sending the brief through Resend", async () => {
    const messages = await lint("declare const resend: any;\nresend.emails.send({});\n");
    expect(messages.some((m) => m.includes("never sends"))).toBe(false);
  });
});
