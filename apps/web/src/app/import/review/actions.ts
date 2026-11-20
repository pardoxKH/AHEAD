"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/server/current-user";
import { getDb } from "@/server/db";
import { acceptReview, saveReviewEdits } from "@/server/review/review-actions";

export async function saveEditsAction(form: FormData): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/signin");
  const result = await saveReviewEdits(getDb(), userId, form);
  redirect(result.ok ? "/import/review?saved=1" : `/import/review?error=${result.reason}`);
}

export async function acceptSelectedAction(form: FormData): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/signin");
  const result = await acceptReview(getDb(), userId, form);
  if (!result.ok) redirect(`/import/review?error=${result.reason}`);
  revalidatePath("/");
  redirect("/");
}
