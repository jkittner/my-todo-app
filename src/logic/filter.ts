import type { Task } from '../model/task';
import { isPastDue, toDateKey, weekRange } from './dates';

export type QuickFilter = 'overdue' | 'dueThisWeek' | null;

export interface Filters {
  query: string;
  tags: string[];
  categories: string[];
  dueFrom: string;
  dueTo: string;
  createdFrom: string;
  createdTo: string;
  quick: QuickFilter;
}

export const EMPTY_FILTERS: Filters = {
  query: '',
  tags: [],
  categories: [],
  dueFrom: '',
  dueTo: '',
  createdFrom: '',
  createdTo: '',
  quick: null,
};

/** True when any filter other than the search query is set. */
export function hasActiveFilters(f: Filters): boolean {
  return (
    f.tags.length > 0 ||
    f.categories.length > 0 ||
    !!f.dueFrom ||
    !!f.dueTo ||
    !!f.createdFrom ||
    !!f.createdTo ||
    f.quick !== null
  );
}

const inRange = (key: string, from: string, to: string) => (!from || key >= from) && (!to || key <= to);

const containsAny = (have: string[], want: string[]) => {
  if (want.length === 0) return true;
  const lower = new Set(have.map((v) => v.toLowerCase()));
  return want.some((w) => lower.has(w.toLowerCase()));
};

export function isOverdue(task: Task, now: Date): boolean {
  return task.status !== 'done' && isPastDue(task.dueDate, now);
}

export function isDueThisWeek(task: Task, now: Date): boolean {
  const { from, to } = weekRange(now);
  return task.status !== 'done' && inRange(task.dueDate, from, to);
}

export function matchesQuery(task: Task, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return task.title.toLowerCase().includes(q) || task.description.toLowerCase().includes(q);
}

export function matchesFilters(task: Task, f: Filters, now: Date): boolean {
  if (!matchesQuery(task, f.query)) return false;
  if (!containsAny(task.tags, f.tags)) return false;
  if (!containsAny(task.categories, f.categories)) return false;
  if (!inRange(task.dueDate, f.dueFrom, f.dueTo)) return false;
  if (!inRange(toDateKey(new Date(task.createdAt)), f.createdFrom, f.createdTo)) return false;
  if (f.quick === 'overdue' && !isOverdue(task, now)) return false;
  if (f.quick === 'dueThisWeek' && !isDueThisWeek(task, now)) return false;
  return true;
}

export function filterTasks(tasks: Task[], f: Filters, now: Date): Task[] {
  return tasks.filter((t) => matchesFilters(t, f, now));
}
