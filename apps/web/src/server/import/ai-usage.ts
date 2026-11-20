import type { UsageEvent } from "@ahead/ai";
import { auditLog, type Db } from "@ahead/db";

/** Records one Claude request of the import: tokens and cost only, never prompt or reply text. */
export async function recordImportUsage(db: Db, userId: string, event: UsageEvent): Promise<void> {
  await db.insert(auditLog).values({
    userId,
    actor: "web",
    action: "ai.import_queue",
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    costUsd: event.costUsd === null ? null : event.costUsd.toFixed(6),
    meta: {
      model: event.model,
      cacheReadTokens: event.cacheReadTokens,
      cacheCreationTokens: event.cacheCreationTokens,
      unpricedModels: event.unpricedModels,
    },
  });
}
