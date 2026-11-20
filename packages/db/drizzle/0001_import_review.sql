CREATE TYPE "public"."due_date_confidence" AS ENUM('stated', 'guessed', 'none');--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "due_date_confidence" "due_date_confidence";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "in_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "tasks_user_in_review_idx" ON "tasks" USING btree ("user_id") WHERE "tasks"."in_review";