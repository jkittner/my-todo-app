import { createTask, emptyDraft, moveTask, type Status, type Task, type TaskDraft } from '../src/model/task';

export const NOW = new Date('2026-10-15T10:00:00');

/** Local date key `offset` days from NOW. */
export function day(offset: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A Date `offsetDays` from NOW. */
export function at(offsetDays: number, hours = 0): Date {
  return new Date(NOW.getTime() + offsetDays * 86_400_000 + hours * 3_600_000);
}

let n = 0;
export function makeTask(over: Partial<TaskDraft> & { id?: string; created?: number } = {}): Task {
  const { id = `task-${++n}`, created = 0, ...draft } = over;
  return createTask({ ...emptyDraft(), title: `Task ${n}`, dueDate: day(3), ...draft }, at(created), id);
}

/** Moves a task through statuses at given day offsets, e.g. [['doing', -3], ['done', -1]]. */
export function walk(task: Task, steps: [Status, number][]): Task {
  return steps.reduce((t, [status, offset]) => moveTask(t, status, at(offset)), task);
}
