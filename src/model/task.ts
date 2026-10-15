import { isDateKey } from '../logic/dates';

export type Status = 'todo' | 'doing' | 'done';
export type Priority = 'high' | 'medium' | 'low' | null;

export const STATUSES: Status[] = ['todo', 'doing', 'done'];
export const PRIORITIES: Exclude<Priority, null>[] = ['high', 'medium', 'low'];

export const STATUS_LABEL: Record<Status, string> = {
  todo: 'To do',
  doing: 'In progress',
  done: 'Done',
};

export const PRIORITY_LABEL: Record<Exclude<Priority, null>, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export interface DueDateChange {
  from: string;
  to: string;
  changedAt: string;
}

export interface StatusChange {
  status: Status;
  at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  tags: string[];
  categories: string[];
  status: Status;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  dueDate: string;
  originalDueDate: string;
  dueDateHistory: DueDateChange[];
  statusHistory: StatusChange[];
}

/** The fields a person edits in the task form. */
export interface TaskDraft {
  title: string;
  description: string;
  priority: Priority;
  tags: string[];
  categories: string[];
  status: Status;
  dueDate: string;
}

export type DraftErrors = Partial<Record<'title' | 'dueDate', string>>;

export function emptyDraft(status: Status = 'todo'): TaskDraft {
  return { title: '', description: '', priority: null, tags: [], categories: [], status, dueDate: '' };
}

export function draftFromTask(t: Task): TaskDraft {
  return {
    title: t.title,
    description: t.description,
    priority: t.priority,
    tags: [...t.tags],
    categories: [...t.categories],
    status: t.status,
    dueDate: t.dueDate,
  };
}

export function validateDraft(d: TaskDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!d.title.trim()) errors.title = 'Enter a title.';
  if (!d.dueDate.trim()) errors.dueDate = 'Pick a due date.';
  else if (!isDateKey(d.dueDate)) errors.dueDate = 'Use a valid date (YYYY-MM-DD).';
  return errors;
}

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

/** Normalises a list of labels: trims, drops empties and case-insensitive duplicates. */
export function cleanLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of labels) {
    const label = raw.trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

export function moveTask(task: Task, status: Status, now: Date): Task {
  if (task.status === status) return task;
  const at = now.toISOString();
  const next: Task = {
    ...task,
    status,
    updatedAt: at,
    statusHistory: [...task.statusHistory, { status, at }],
  };
  if (status === 'todo') {
    next.startedAt = null;
    next.completedAt = null;
  } else if (status === 'doing') {
    next.startedAt = task.startedAt ?? at;
    next.completedAt = null;
  } else {
    next.startedAt = task.startedAt ?? at;
    next.completedAt = at;
  }
  return next;
}

export function changeDueDate(task: Task, dueDate: string, now: Date): Task {
  if (task.dueDate === dueDate) return task;
  const changedAt = now.toISOString();
  return {
    ...task,
    dueDate,
    updatedAt: changedAt,
    dueDateHistory: [...task.dueDateHistory, { from: task.dueDate, to: dueDate, changedAt }],
  };
}

export function createTask(draft: TaskDraft, now: Date, id: string = newId()): Task {
  const at = now.toISOString();
  const base: Task = {
    id,
    title: draft.title.trim(),
    description: draft.description,
    priority: draft.priority,
    tags: cleanLabels(draft.tags),
    categories: cleanLabels(draft.categories),
    status: 'todo',
    createdAt: at,
    updatedAt: at,
    startedAt: null,
    completedAt: null,
    dueDate: draft.dueDate,
    originalDueDate: draft.dueDate,
    dueDateHistory: [],
    statusHistory: [{ status: 'todo', at }],
  };
  return moveTask(base, draft.status, now);
}

export function applyDraft(task: Task, draft: TaskDraft, now: Date): Task {
  let next: Task = {
    ...task,
    title: draft.title.trim(),
    description: draft.description,
    priority: draft.priority,
    tags: cleanLabels(draft.tags),
    categories: cleanLabels(draft.categories),
    updatedAt: now.toISOString(),
  };
  next = changeDueDate(next, draft.dueDate, now);
  return moveTask(next, draft.status, now);
}
