import { z } from "zod";
import { AREAS } from "@ahead/ai";
import { isCalendarDate } from "../dates";

export const MAX_REVIEW_ROWS = 500;

const rowSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(200),
  due: z.union([z.literal(""), z.string().refine(isCalendarDate)]),
  area: z.enum(AREAS),
  effort: z.union([z.literal(""), z.coerce.number().int().min(1).max(10_080)]),
  keep: z.boolean(),
});

export type ReviewRowInput = z.infer<typeof rowSchema>;

/**
 * Reads the review form: one hidden `id` per row, and `title:<id>`, `due:<id>`, `area:<id>`,
 * `effort:<id>` and the `keep:<id>` checkbox. Returns null when anything is malformed.
 */
export function parseReviewForm(form: FormData): ReviewRowInput[] | null {
  const ids = form.getAll("id");
  if (ids.length === 0 || ids.length > MAX_REVIEW_ROWS) return null;
  if (new Set(ids).size !== ids.length) return null;

  const rows: ReviewRowInput[] = [];
  for (const id of ids) {
    if (typeof id !== "string") return null;
    const field = (name: string) => {
      const value = form.get(`${name}:${id}`);
      return typeof value === "string" ? value.trim() : value;
    };
    const parsed = rowSchema.safeParse({
      id,
      title: field("title"),
      due: field("due") ?? "",
      area: field("area"),
      effort: field("effort") ?? "",
      keep: form.get(`keep:${id}`) === "on",
    });
    if (!parsed.success) return null;
    rows.push(parsed.data);
  }
  return rows;
}
