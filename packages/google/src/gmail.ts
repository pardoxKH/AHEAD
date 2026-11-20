import type { OAuth2Client } from "google-auth-library";
import type { gmail_v1 } from "googleapis";
import { gmail } from "googleapis/build/src/apis/gmail/index.js";

// The only Gmail access in Ahead. It reads mail and creates or updates drafts; it has no way to send
// (ADR 0002). Do not add one: Tariq sends every draft himself.

export interface DraftInput {
  to: string;
  subject: string;
  /** Plain-text body. */
  body: string;
  /** Gmail thread to file the draft in. */
  threadId?: string;
  /** RFC 2822 Message-ID of the message being answered, e.g. `<abc@mail.example.com>`. */
  inReplyTo?: string;
}

export interface HistoryPage {
  history: gmail_v1.Schema$History[];
  /** The mailbox's current history id: the next `startHistoryId`. */
  historyId: string | null;
}

export class GmailClient {
  readonly #gmail: gmail_v1.Gmail;

  constructor(api: gmail_v1.Gmail) {
    this.#gmail = api;
  }

  /** All history records after `startHistoryId`, following every page. */
  async listHistory(startHistoryId: string): Promise<HistoryPage> {
    const history: gmail_v1.Schema$History[] = [];
    let pageToken: string | undefined;
    let historyId: string | null = null;
    do {
      const { data } = await this.#gmail.users.history.list({
        userId: "me",
        startHistoryId,
        ...(pageToken ? { pageToken } : {}),
      });
      history.push(...(data.history ?? []));
      historyId = data.historyId ?? historyId;
      pageToken = data.nextPageToken ?? undefined;
    } while (pageToken);
    return { history, historyId };
  }

  async getMessage(id: string): Promise<gmail_v1.Schema$Message> {
    const { data } = await this.#gmail.users.messages.get({ userId: "me", id, format: "full" });
    return data;
  }

  async getProfile(): Promise<gmail_v1.Schema$Profile> {
    const { data } = await this.#gmail.users.getProfile({ userId: "me" });
    return data;
  }

  async createDraft(input: DraftInput): Promise<gmail_v1.Schema$Draft> {
    const { data } = await this.#gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: toGmailMessage(input) },
    });
    return data;
  }

  async updateDraft(id: string, input: DraftInput): Promise<gmail_v1.Schema$Draft> {
    const { data } = await this.#gmail.users.drafts.update({
      userId: "me",
      id,
      requestBody: { id, message: toGmailMessage(input) },
    });
    return data;
  }
}

export function createGmailClient(auth: OAuth2Client): GmailClient {
  return new GmailClient(gmail({ version: "v1", auth }));
}

function toGmailMessage(input: DraftInput): gmail_v1.Schema$Message {
  return {
    raw: Buffer.from(buildRawMessage(input), "utf8").toString("base64url"),
    ...(input.threadId ? { threadId: input.threadId } : {}),
  };
}

/** Builds an RFC 2822 message with a UTF-8 plain-text body. */
export function buildRawMessage({ to, subject, body, inReplyTo }: DraftInput): string {
  const headers = [
    `To: ${headerValue(to)}`,
    `Subject: ${encodeHeaderWord(headerValue(subject))}`,
    ...(inReplyTo ? [`In-Reply-To: ${headerValue(inReplyTo)}`, `References: ${headerValue(inReplyTo)}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  const encodedBody = Buffer.from(body, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n");
  return `${headers.join("\r\n")}\r\n\r\n${encodedBody}`;
}

/** Strips line breaks so a value cannot inject extra headers. */
function headerValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** RFC 2047 encoding for non-ASCII header text, split so each encoded word stays within 75 chars. */
export function encodeHeaderWord(text: string): string {
  if (/^[\x20-\x7e]*$/.test(text)) return text;
  const words: string[] = [];
  let chunk = "";
  for (const char of text) {
    // 45 bytes of UTF-8 encode to 60 base64 chars, plus 12 for `=?UTF-8?B??=`.
    if (Buffer.byteLength(chunk + char, "utf8") > 45) {
      words.push(chunk);
      chunk = "";
    }
    chunk += char;
  }
  words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, "utf8").toString("base64")}?=`).join("\r\n ");
}
