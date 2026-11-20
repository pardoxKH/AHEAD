export type TaskStatus =
  "proposed" | "todo" | "scheduled" | "in_progress" | "waiting" | "blocked" | "done" | "dropped";

export type Urgency = "normal" | "high";
export type Area = "work" | "learning" | "travel" | "personal";
export type EffortSource = "user" | "suggested";

/** One node of a task tree. A root has `parentId: null` and `rootId === id`. */
export interface Task {
  id: string;
  parentId: string | null;
  rootId: string;
  title: string;
  status: TaskStatus;
  dueAt?: Date;
  hardDeadline: boolean;
  effortMin?: number;
  effortSource?: EffortSource;
  ownerContactId?: string;
  waitingOnContactId?: string;
  waitingSince?: Date;
  urgency: Urgency;
  area: Area;
  /** Order among siblings, ascending. */
  position: number;
}

/** `taskId` cannot start until `dependsOnId` is done (or dropped). */
export interface TaskDep {
  taskId: string;
  dependsOnId: string;
}

/** Done or dropped: nothing left to wait for. */
export function isClosed(status: TaskStatus): boolean {
  return status === "done" || status === "dropped";
}
