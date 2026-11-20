import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { EXTRACTION_MODEL, estimateCostUsd, type AiModel } from "./models.js";

type CreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type Message = Anthropic.Beta.Messages.BetaMessage;

/** The slice of the SDK the client uses; tests pass a fake. */
export interface MessagesApi {
  create(params: CreateParams): PromiseLike<Message>;
}

export interface UsageEntry {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface UsageEvent {
  /** The model that served the request (a server-side fallback may differ from the one requested). */
  model: string;
  purpose: string;
  /** Token totals across all entries. */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  /** `null` when any entry's model is not in the price table; see `unpricedModels`. */
  costUsd: number | null;
  /** Models that ran but have no price, so the app can flag them. */
  unpricedModels: string[];
  /** Per-model usage: one entry per `usage.iterations` item, or one for the whole request. */
  entries: UsageEntry[];
}

export interface AiClientOptions {
  apiKey: string;
  /** Called after every request that returned a response, including refusals. Never receives prompt text. */
  onUsage: (event: UsageEvent) => void | Promise<void>;
  /** Override the transport; defaults to the Anthropic SDK's beta Messages API. */
  messages?: MessagesApi;
}

export interface StructuredRequest<S extends z.ZodType> {
  model: AiModel;
  /** Short label for the audit log, e.g. "import-queue". */
  purpose: string;
  /** Stable instructions; cached, so keep anything request-specific out of it. */
  system: string;
  prompt: string;
  /** Shape of the JSON reply. Sent as the structured-output schema and checked on return. */
  schema: S;
  maxTokens?: number;
}

export interface AiClient {
  generateJson<S extends z.ZodType>(request: StructuredRequest<S>): Promise<z.infer<S>>;
}

/** Claude declined the request (after any server-side fallback). */
export class AiRefusalError extends Error {
  override readonly name = "AiRefusalError";
  constructor(readonly category: string | null) {
    super(`Model refused the request${category ? ` (${category})` : ""}`);
  }
}

/** The reply hit `max_tokens` and is incomplete. */
export class AiMaxTokensError extends Error {
  override readonly name = "AiMaxTokensError";
  constructor(readonly maxTokens: number) {
    super(`Model output was cut off at max_tokens=${maxTokens}`);
  }
}

/** The reply was not JSON of the expected shape. The message never includes the reply text. */
export class AiOutputError extends Error {
  override readonly name = "AiOutputError";
}

export const FALLBACK_BETA = "server-side-fallback-2026-07-01";
/** Models that accept server-side `fallbacks`. Haiku 5.5 has none. */
const FALLBACK_MODELS: ReadonlySet<string> = new Set([EXTRACTION_MODEL]);
const DEFAULT_MAX_TOKENS = 16_000;

export function createAiClient(options: AiClientOptions): AiClient {
  const messages = options.messages ?? new Anthropic({ apiKey: options.apiKey }).beta.messages;

  return {
    async generateJson(request) {
      const maxTokens = request.maxTokens ?? DEFAULT_MAX_TOKENS;
      const params: CreateParams = {
        model: request.model,
        max_tokens: maxTokens,
        system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: request.prompt }],
        output_config: { effort: "medium", format: betaZodOutputFormat(request.schema) },
        ...(FALLBACK_MODELS.has(request.model) && { betas: [FALLBACK_BETA], fallbacks: "default" }),
      };

      const response = await messages.create(params);
      await options.onUsage(usageEvent(request.purpose, request.model, response));

      if (response.stop_reason === "refusal") {
        throw new AiRefusalError(response.stop_details?.category ?? null);
      }
      if (response.stop_reason === "max_tokens") throw new AiMaxTokensError(maxTokens);

      const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new AiOutputError(`Reply for "${request.purpose}" was not valid JSON`);
      }
      const parsed = request.schema.safeParse(json);
      if (!parsed.success) {
        throw new AiOutputError(`Reply for "${request.purpose}" did not match the schema`);
      }
      return parsed.data;
    },
  };
}

/**
 * One usage event per request. When the response carries `usage.iterations` (for example a
 * declined Opus attempt followed by a fallback), each entry is priced by its own model.
 */
export function usageEvent(purpose: string, requestedModel: string, response: Message): UsageEvent {
  const { usage } = response;
  const entries: UsageEntry[] = usage.iterations
    ? usage.iterations.map((it) => ({
        model: ("model" in it && it.model) || requestedModel,
        inputTokens: it.input_tokens,
        outputTokens: it.output_tokens,
        cacheReadTokens: it.cache_read_input_tokens,
        cacheCreationTokens: it.cache_creation_input_tokens,
      }))
    : [
        {
          model: response.model,
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          cacheReadTokens: usage.cache_read_input_tokens ?? 0,
          cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
        },
      ];

  const costs = entries.map((entry) => estimateCostUsd(entry.model, entry));
  const unpricedModels = [...new Set(entries.filter((_, i) => costs[i] === null).map((e) => e.model))];
  const sum = (key: "inputTokens" | "outputTokens" | "cacheReadTokens" | "cacheCreationTokens") =>
    entries.reduce((total, entry) => total + entry[key], 0);
  return {
    model: response.model,
    purpose,
    inputTokens: sum("inputTokens"),
    outputTokens: sum("outputTokens"),
    cacheReadTokens: sum("cacheReadTokens"),
    cacheCreationTokens: sum("cacheCreationTokens"),
    costUsd: unpricedModels.length > 0 ? null : costs.reduce<number>((total, c) => total + (c ?? 0), 0),
    unpricedModels,
    entries,
  };
}
