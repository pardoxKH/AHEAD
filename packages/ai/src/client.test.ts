import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  AiMaxTokensError,
  AiOutputError,
  AiRefusalError,
  createAiClient,
  FALLBACK_BETA,
  type MessagesApi,
  type UsageEvent,
} from "./client.js";
import { EXTRACTION_MODEL, TRIAGE_MODEL } from "./models.js";

type Message = Anthropic.Beta.Messages.BetaMessage;
type CreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

function reply(text: string, overrides: Partial<Message> = {}): Message {
  return {
    model: EXTRACTION_MODEL,
    stop_reason: "end_turn",
    stop_details: null,
    content: [{ type: "text", text, citations: null }],
    usage: {
      input_tokens: 1000,
      output_tokens: 500,
      cache_read_input_tokens: 2000,
      cache_creation_input_tokens: 0,
    },
    ...overrides,
  } as Message;
}

function setup(response: Message) {
  const create = vi.fn<(params: CreateParams) => Promise<Message>>().mockResolvedValue(response);
  const messages: MessagesApi = { create };
  const usage: UsageEvent[] = [];
  const ai = createAiClient({ apiKey: "test", onUsage: (e) => void usage.push(e), messages });
  return { ai, create, usage };
}

const schema = z.object({ answer: z.string() });
const request = {
  model: EXTRACTION_MODEL,
  purpose: "test",
  system: "SYSTEM",
  prompt: "SECRET PROMPT",
  schema,
} as const;

describe("createAiClient", () => {
  it("sends a cached system prompt, a JSON schema, medium effort and default fallbacks", async () => {
    const { ai, create } = setup(reply('{"answer":"ok"}'));
    await expect(ai.generateJson(request)).resolves.toEqual({ answer: "ok" });

    const params = create.mock.calls[0]![0];
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.max_tokens).toBe(16_000);
    expect(params.system).toEqual([{ type: "text", text: "SYSTEM", cache_control: { type: "ephemeral" } }]);
    expect(params.messages).toEqual([{ role: "user", content: "SECRET PROMPT" }]);
    expect(params.output_config?.effort).toBe("medium");
    expect(params.output_config?.format).toMatchObject({
      type: "json_schema",
      schema: { type: "object", properties: { answer: { type: "string" } } },
    });
    expect(params.betas).toEqual([FALLBACK_BETA]);
    expect(params.fallbacks).toBe("default");
    expect(params).not.toHaveProperty("thinking");
  });

  it("does not send fallbacks for Haiku, which has none", async () => {
    const { ai, create } = setup(reply('{"answer":"ok"}', { model: TRIAGE_MODEL }));
    await ai.generateJson({ ...request, model: TRIAGE_MODEL });
    const params = create.mock.calls[0]![0];
    expect(params).not.toHaveProperty("fallbacks");
    expect(params).not.toHaveProperty("betas");
  });

  it("reports usage and cost without prompt contents", async () => {
    const { ai, usage } = setup(reply('{"answer":"ok"}'));
    await ai.generateJson(request);
    expect(usage).toEqual([
      {
        model: EXTRACTION_MODEL,
        purpose: "test",
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 2000,
        cacheCreationTokens: 0,
        costUsd: (1000 * 4 + 500 * 20 + 2000 * 0.2) / 1e6,
      },
    ]);
    expect(JSON.stringify(usage)).not.toContain("SECRET");
  });

  it("throws AiRefusalError on a refusal, after reporting usage", async () => {
    const { ai, usage } = setup(
      reply("", {
        content: [],
        stop_reason: "refusal",
        stop_details: { type: "refusal", category: "cyber" } as Message["stop_details"],
      }),
    );
    const error = await ai.generateJson(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiRefusalError);
    expect((error as AiRefusalError).category).toBe("cyber");
    expect(usage).toHaveLength(1);
  });

  it("throws AiMaxTokensError when the reply is cut off", async () => {
    const { ai } = setup(reply('{"answer":', { stop_reason: "max_tokens" }));
    await expect(ai.generateJson({ ...request, maxTokens: 100 })).rejects.toThrow(AiMaxTokensError);
  });

  it("throws AiOutputError on invalid JSON or the wrong shape, without echoing the reply", async () => {
    const bad = setup(reply("not json SECRET"));
    const error = await bad.ai.generateJson(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiOutputError);
    expect((error as Error).message).not.toContain("SECRET");

    const wrong = setup(reply('{"answer": 42}'));
    await expect(wrong.ai.generateJson(request)).rejects.toThrow(AiOutputError);
  });

  it("ignores non-text blocks such as a fallback marker", async () => {
    const response = reply('{"answer":"ok"}');
    response.content.unshift({ type: "fallback" } as unknown as Message["content"][number]);
    const { ai } = setup(response);
    await expect(ai.generateJson(request)).resolves.toEqual({ answer: "ok" });
  });
});
