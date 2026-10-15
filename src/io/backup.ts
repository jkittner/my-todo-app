import { cleanLabels, STATUSES, type Priority, type Status, type Task } from '../model/task';
import { isDateKey } from '../logic/dates';

export const BACKUP_APP = 'todo-board';
export const BACKUP_VERSION = 1;

export interface Library {
  tasks: Task[];
  tags: string[];
  categories: string[];
}

export interface Backup extends Library {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
}

type Raw = Record<string, unknown>;

const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isStatus = (v: unknown): v is Status => STATUSES.includes(v as Status);
const isPriority = (v: unknown): v is Priority => v === null || v === 'high' || v === 'medium' || v === 'low';
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? cleanLabels(v.filter((x): x is string => typeof x === 'string')) : [];

/** Validates and normalises one stored task. Returns an error message when it can't be used. */
export function parseTask(raw: unknown): Task | string {
  if (!isObject(raw)) return 'is not a task object';
  const { id, title, dueDate, status, createdAt } = raw;
  if (typeof id !== 'string' || !id) return 'has no id';
  if (typeof title !== 'string' || !title.trim()) return 'has no title';
  if (!isDateKey(dueDate)) return 'has no valid due date';
  if (!isStatus(status)) return 'has an unknown status';
  if (!isIso(createdAt)) return 'has no valid creation date';
  const optionalIso = (v: unknown) => (isIso(v) ? v : null);
  const dueDateHistory = Array.isArray(raw.dueDateHistory)
    ? raw.dueDateHistory.filter(
        (c): c is Task['dueDateHistory'][number] =>
          isObject(c) && isDateKey(c.from) && isDateKey(c.to) && isIso(c.changedAt),
      )
    : [];
  const statusHistory = Array.isArray(raw.statusHistory)
    ? raw.statusHistory.filter(
        (c): c is Task['statusHistory'][number] => isObject(c) && isStatus(c.status) && isIso(c.at),
      )
    : [];
  return {
    id,
    title: title.trim(),
    description: typeof raw.description === 'string' ? raw.description : '',
    priority: isPriority(raw.priority) ? raw.priority : null,
    tags: strings(raw.tags),
    categories: strings(raw.categories),
    status,
    createdAt,
    updatedAt: isIso(raw.updatedAt) ? raw.updatedAt : createdAt,
    startedAt: optionalIso(raw.startedAt),
    completedAt: status === 'done' ? optionalIso(raw.completedAt) : null,
    dueDate,
    originalDueDate: isDateKey(raw.originalDueDate) ? raw.originalDueDate : dueDate,
    dueDateHistory,
    statusHistory: statusHistory.length ? statusHistory : [{ status, at: createdAt }],
  };
}

/** Parses a list of tasks, failing on the first unusable one so nothing is half-imported. */
export function parseTasks(raw: unknown): Task[] | string {
  if (!Array.isArray(raw)) return 'The file has no task list.';
  const tasks: Task[] = [];
  for (const [i, item] of raw.entries()) {
    const t = parseTask(item);
    if (typeof t === 'string') return `Task ${i + 1} ${t}.`;
    tasks.push(t);
  }
  return tasks;
}

export function createBackup(lib: Library, now: Date): Backup {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), ...lib };
}

export function serializeBackup(lib: Library, now: Date): string {
  return JSON.stringify(createBackup(lib, now), null, 2);
}

export function parseBackup(text: string): Library | string {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return 'This file is not valid JSON. Choose a backup file exported from Todo board.';
  }
  if (!isObject(data) || data.app !== BACKUP_APP) {
    return 'This file is not a Todo board backup. Choose a file exported with "Back up tasks".';
  }
  if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) {
    return 'This backup was made by a newer version of Todo board. Update the app, then try again.';
  }
  const tasks = parseTasks(data.tasks);
  if (typeof tasks === 'string') return tasks;
  return { tasks, tags: strings(data.tags), categories: strings(data.categories) };
}

/** Combines two libraries. Tasks with the same id keep whichever copy was updated last. */
export function mergeLibraries(current: Library, incoming: Library): Library {
  const byId = new Map(current.tasks.map((t) => [t.id, t]));
  for (const t of incoming.tasks) {
    const existing = byId.get(t.id);
    if (!existing || t.updatedAt > existing.updatedAt) byId.set(t.id, t);
  }
  return {
    tasks: [...byId.values()],
    tags: cleanLabels([...current.tags, ...incoming.tags]),
    categories: cleanLabels([...current.categories, ...incoming.categories]),
  };
}
