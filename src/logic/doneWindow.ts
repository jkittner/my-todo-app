import type { Task } from '../model/task';
import { DAY_MS } from './dates';

export const DONE_WINDOW_DAYS = 30;

export type DoneMode = 'recent' | 'all' | 'hidden';

export function isRecentlyDone(task: Task, now: Date): boolean {
  if (task.status !== 'done' || !task.completedAt) return false;
  return now.getTime() - new Date(task.completedAt).getTime() <= DONE_WINDOW_DAYS * DAY_MS;
}

/** Splits done tasks into the ones to show and a count of older ones kept back. */
export function visibleDone(done: Task[], mode: DoneMode, now: Date): { shown: Task[]; olderHidden: number } {
  if (mode === 'hidden') return { shown: [], olderHidden: 0 };
  if (mode === 'all') return { shown: done, olderHidden: 0 };
  const shown = done.filter((t) => isRecentlyDone(t, now));
  return { shown, olderHidden: done.length - shown.length };
}
