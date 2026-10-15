import { PRIORITIES, STATUSES, type Priority, type Status, type Task } from '../model/task';
import { addDays, dueDeadline, msBetween, startOfWeek, toDateKey } from './dates';
import { isDueThisWeek, isOverdue } from './filter';

export interface Span {
  ms: number;
  /** True while the span is still running (e.g. a task still waiting to be started). */
  ongoing: boolean;
}

export interface TaskStats {
  wait: Span;
  work: Span | null;
  overdueOriginalMs: number;
  overdueCurrentMs: number;
  dueChanges: number;
}

const overdueBy = (dueKey: string, endMs: number) => Math.max(0, endMs - dueDeadline(dueKey).getTime());

export function taskStats(task: Task, now: Date): TaskStats {
  const nowIso = now.toISOString();
  const wait: Span = task.startedAt
    ? { ms: msBetween(task.createdAt, task.startedAt), ongoing: false }
    : { ms: msBetween(task.createdAt, nowIso), ongoing: true };
  let work: Span | null = null;
  if (task.startedAt) {
    work = task.completedAt
      ? { ms: msBetween(task.startedAt, task.completedAt), ongoing: false }
      : { ms: msBetween(task.startedAt, nowIso), ongoing: true };
  }
  const end = new Date(task.completedAt ?? nowIso).getTime();
  return {
    wait,
    work,
    overdueOriginalMs: overdueBy(task.originalDueDate, end),
    overdueCurrentMs: overdueBy(task.dueDate, end),
    dueChanges: task.dueDateHistory.length,
  };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface Summary {
  todo: number;
  doing: number;
  done: number;
  overdue: number;
  dueThisWeek: number;
  medianCompletionMs: number | null;
}

export function summarize(tasks: Task[], now: Date): Summary {
  const done = tasks.filter((t) => t.status === 'done' && t.completedAt);
  return {
    todo: tasks.filter((t) => t.status === 'todo').length,
    doing: tasks.filter((t) => t.status === 'doing').length,
    done: tasks.filter((t) => t.status === 'done').length,
    overdue: tasks.filter((t) => isOverdue(t, now)).length,
    dueThisWeek: tasks.filter((t) => isDueThisWeek(t, now)).length,
    medianCompletionMs: median(done.map((t) => msBetween(t.createdAt, t.completedAt as string))),
  };
}

export interface FlowSummary {
  medianWaitMs: number | null;
  medianWorkMs: number | null;
  lateVsOriginal: number;
  lateVsCurrent: number;
  medianLateOriginalMs: number | null;
  medianLateCurrentMs: number | null;
  rescheduledTasks: number;
  totalDueChanges: number;
}

/** Aggregates the per-task statistics over finished work (and every task for reschedules). */
export function flowSummary(tasks: Task[], now: Date): FlowSummary {
  const stats = tasks.map((t) => ({ t, s: taskStats(t, now) }));
  const started = stats.filter(({ t }) => t.startedAt);
  const finished = stats.filter(({ t }) => t.status === 'done' && t.startedAt && t.completedAt);
  const lateOrig = finished.filter(({ s }) => s.overdueOriginalMs > 0).map(({ s }) => s.overdueOriginalMs);
  const lateCur = finished.filter(({ s }) => s.overdueCurrentMs > 0).map(({ s }) => s.overdueCurrentMs);
  return {
    medianWaitMs: median(started.map(({ s }) => s.wait.ms)),
    medianWorkMs: median(finished.map(({ s }) => (s.work as Span).ms)),
    lateVsOriginal: lateOrig.length,
    lateVsCurrent: lateCur.length,
    medianLateOriginalMs: median(lateOrig),
    medianLateCurrentMs: median(lateCur),
    rescheduledTasks: stats.filter(({ s }) => s.dueChanges > 0).length,
    totalDueChanges: stats.reduce((sum, { s }) => sum + s.dueChanges, 0),
  };
}

// ---- Chart series -------------------------------------------------------

export type PriorityKey = Exclude<Priority, null> | 'none';
export const PRIORITY_KEYS: PriorityKey[] = [...PRIORITIES, 'none'];
const priorityKey = (p: Priority): PriorityKey => p ?? 'none';

export function statusCounts(tasks: Task[]): Record<Status, number> {
  const out = { todo: 0, doing: 0, done: 0 };
  for (const t of tasks) out[t.status]++;
  return out;
}

export function priorityCounts(tasks: Task[]): Record<PriorityKey, number> {
  const out = { high: 0, medium: 0, low: 0, none: 0 };
  for (const t of tasks) out[priorityKey(t.priority)]++;
  return out;
}

export const NO_CATEGORY = 'No category';

/** Count per category; a task with several categories counts once in each. Largest first. */
export function categoryCounts(tasks: Task[]): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of tasks) {
    const cats = t.categories.length ? t.categories : [NO_CATEGORY];
    for (const c of cats) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function priorityByStatus(tasks: Task[]): Record<PriorityKey, Record<Status, number>> {
  const out = Object.fromEntries(
    PRIORITY_KEYS.map((p) => [p, Object.fromEntries(STATUSES.map((s) => [s, 0]))]),
  ) as Record<PriorityKey, Record<Status, number>>;
  for (const t of tasks) out[priorityKey(t.priority)][t.status]++;
  return out;
}

/** The due date that applied at a given moment, replaying the reschedule history. */
export function dueDateAt(task: Task, atMs: number): string {
  let due = task.originalDueDate;
  for (const c of task.dueDateHistory) if (new Date(c.changedAt).getTime() <= atMs) due = c.to;
  return due;
}

/** Whether the task counted as done at a given moment, replaying the status history. */
export function wasDoneAt(task: Task, atMs: number): boolean {
  let status: Status | null = null;
  for (const c of task.statusHistory) if (new Date(c.at).getTime() <= atMs) status = c.status;
  return status === 'done';
}

export interface WeekPoint {
  weekStart: string;
  done: number;
  overdue: number;
}

/**
 * For each of the last `weeks` weeks (Monday-based, current week last): how many tasks were
 * completed that week, and how many open tasks were past their due date when the week ended
 * (or now, for the current week).
 */
export function weeklyDoneVsOverdue(tasks: Task[], now: Date, weeks = 12): WeekPoint[] {
  // Parse every timestamp once; the week loop below then only compares numbers.
  const deadlines = new Map<string, number>();
  const deadlineMs = (key: string) => {
    let ms = deadlines.get(key);
    if (ms === undefined) deadlines.set(key, (ms = dueDeadline(key).getTime()));
    return ms;
  };
  const timelines = tasks.map((t) => ({
    createdMs: Date.parse(t.createdAt),
    completedMs: t.completedAt ? Date.parse(t.completedAt) : NaN,
    statuses: t.statusHistory.map((c) => [Date.parse(c.at), c.status === 'done'] as const),
    firstDeadline: deadlineMs(t.originalDueDate),
    reschedules: t.dueDateHistory.map((c) => [Date.parse(c.changedAt), deadlineMs(c.to)] as const),
  }));

  const thisWeek = startOfWeek(now);
  const points: WeekPoint[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(thisWeek, -7 * i);
    const startMs = start.getTime();
    const nextWeekMs = addDays(start, 7).getTime();
    const endMs = Math.min(nextWeekMs, now.getTime());
    let done = 0;
    let overdue = 0;
    for (const t of timelines) {
      if (t.completedMs >= startMs && t.completedMs < nextWeekMs) done++;
      if (t.createdMs > endMs) continue;
      let isDone = false;
      for (const [at, d] of t.statuses) if (at <= endMs) isDone = d;
      if (isDone) continue;
      let deadline = t.firstDeadline;
      for (const [at, ms] of t.reschedules) if (at <= endMs) deadline = ms;
      if (deadline <= endMs) overdue++;
    }
    points.push({ weekStart: toDateKey(start), done, overdue });
  }
  return points;
}
