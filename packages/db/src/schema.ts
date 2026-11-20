import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// All times are UTC timestamptz; the user's time zone is applied only for display and planning.
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

const id = () => uuid("id").primaryKey().defaultRandom();

const userId = () =>
  uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

export const areaEnum = pgEnum("area", ["work", "learning", "travel", "personal"]);
export const sourceKindEnum = pgEnum("source_kind", ["email", "meeting", "import", "manual"]);
export const taskStatusEnum = pgEnum("task_status", [
  "proposed",
  "todo",
  "scheduled",
  "in_progress",
  "waiting",
  "blocked",
  "done",
  "dropped",
]);
export const effortSourceEnum = pgEnum("effort_source", ["user", "suggested"]);
export const urgencyEnum = pgEnum("urgency", ["normal", "high"]);
export const planTriggerEnum = pgEnum("plan_trigger", ["schedule", "high_urgency", "manual"]);
export const planBlockStateEnum = pgEnum("plan_block_state", [
  "proposed",
  "accepted",
  "pinned",
  "done",
  "skipped",
]);
// How sure the import was about a due date: stated in the text, guessed from it, or none.
export const dueDateConfidenceEnum = pgEnum("due_date_confidence", ["stated", "guessed", "none"]);
export const draftKindEnum = pgEnum("draft_kind", ["handoff", "chase"]);

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  timeZone: text("time_zone").notNull().default("Asia/Riyadh"),
  // 0 = Sunday. Default week is Sunday to Thursday.
  workingDays: integer("working_days")
    .array()
    .notNull()
    .default(sql`'{0,1,2,3,4}'::int[]`),
  dayStartHour: integer("day_start_hour").notNull().default(8),
  dayEndHour: integer("day_end_hour").notNull().default(17),
  briefHour: integer("brief_hour").notNull().default(7),
  ...timestamps,
});

// The refresh token is encrypted by the app before it reaches this table. Never store plaintext.
export const oauthTokens = pgTable("oauth_tokens", {
  id: id(),
  userId: userId().unique(),
  provider: text("provider").notNull().default("google"),
  encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
  scopes: text("scopes")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  ...timestamps,
});

export const contacts = pgTable("contacts", {
  id: id(),
  userId: userId(),
  name: text("name"),
  email: text("email"),
  ...timestamps,
});

export const goals = pgTable("goals", {
  id: id(),
  userId: userId(),
  name: text("name").notNull(),
  area: areaEnum("area").notNull(),
  weeklyMin: integer("weekly_min").notNull().default(0),
  ...timestamps,
});

// Email bodies are never stored: only headers, a snippet of at most 300 chars, and the Gmail link.
export const sources = pgTable(
  "sources",
  {
    id: id(),
    userId: userId(),
    kind: sourceKindEnum("kind").notNull(),
    gmailMessageId: text("gmail_message_id"),
    gmailThreadId: text("gmail_thread_id"),
    originalFrom: text("original_from"),
    originalTo: text("original_to").array(),
    originalDate: timestamp("original_date", { withTimezone: true }),
    subject: text("subject"),
    snippet: varchar("snippet", { length: 300 }),
    snippetExpiresAt: timestamp("snippet_expires_at", { withTimezone: true }),
    link: text("link"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("sources_user_gmail_message_uq")
      .on(t.userId, t.gmailMessageId)
      .where(sql`${t.gmailMessageId} is not null`),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    userId: userId(),
    parentId: uuid("parent_id").references((): AnyPgColumn => tasks.id, { onDelete: "cascade" }),
    rootId: uuid("root_id").references((): AnyPgColumn => tasks.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: taskStatusEnum("status").notNull().default("proposed"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    hardDeadline: boolean("hard_deadline").notNull().default(false),
    effortMin: integer("effort_min"),
    effortSource: effortSourceEnum("effort_source"),
    ownerContactId: uuid("owner_contact_id").references(() => contacts.id, { onDelete: "set null" }),
    waitingOnContactId: uuid("waiting_on_contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    waitingSince: timestamp("waiting_since", { withTimezone: true }),
    urgency: urgencyEnum("urgency").notNull().default("normal"),
    area: areaEnum("area"),
    goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    confidence: real("confidence"),
    dueDateConfidence: dueDateConfidenceEnum("due_date_confidence"),
    // True while the task is part of an unaccepted import draft (its status may already be done).
    inReview: boolean("in_review").notNull().default(false),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("tasks_user_status_idx").on(t.userId, t.status),
    index("tasks_root_idx").on(t.rootId),
    index("tasks_parent_idx").on(t.parentId),
    index("tasks_user_in_review_idx")
      .on(t.userId)
      .where(sql`${t.inReview}`),
  ],
);

export const taskDeps = pgTable(
  "task_deps",
  {
    userId: userId(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    dependsOnId: uuid("depends_on_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.dependsOnId] }),
    check("task_deps_no_self", sql`${t.taskId} <> ${t.dependsOnId}`),
  ],
);

export const playbooks = pgTable(
  "playbooks",
  {
    id: id(),
    userId: userId(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    steps: jsonb("steps")
      .notNull()
      .default(sql`'[]'::jsonb`),
    ...timestamps,
  },
  (t) => [uniqueIndex("playbooks_user_key_idx").on(t.userId, t.key)],
);

export const planRuns = pgTable("plan_runs", {
  id: id(),
  userId: userId(),
  trigger: planTriggerEnum("trigger").notNull(),
  inputsHash: text("inputs_hash").notNull(),
  diff: jsonb("diff"),
  explanation: text("explanation"),
  ...timestamps,
});

export const planBlocks = pgTable(
  "plan_blocks",
  {
    id: id(),
    userId: userId(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    planRunId: uuid("plan_run_id").references(() => planRuns.id, { onDelete: "set null" }),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    state: planBlockStateEnum("state").notNull().default("proposed"),
    googleEventId: text("google_event_id"),
    ...timestamps,
  },
  (t) => [check("plan_blocks_end_after_start", sql`${t.endAt} > ${t.startAt}`)],
);

export const drafts = pgTable("drafts", {
  id: id(),
  userId: userId(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  kind: draftKindEnum("kind").notNull(),
  gmailDraftId: text("gmail_draft_id"),
  ...timestamps,
});

// Never put email bodies in meta.
export const auditLog = pgTable("audit_log", {
  id: id(),
  userId: userId(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  costUsd: numeric("cost_usd", { precision: 10, scale: 6 }),
  meta: jsonb("meta"),
  ...timestamps,
});

export type User = typeof users.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type NewSource = typeof sources.$inferInsert;
