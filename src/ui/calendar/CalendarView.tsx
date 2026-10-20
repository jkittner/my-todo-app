import { useState } from 'preact/hooks';
import { PRIORITY_LABEL, type Task } from '../../model/task';
import { addDays, startOfWeek, toDateKey } from '../../logic/dates';
import { isOverdue } from '../../logic/filter';
import { priorityRank } from '../../logic/sort';
import { routeHref, useMediaQuery } from '../common/hooks';

interface Props {
  tasks: Task[];
  now: Date;
  onExportCalendar: () => void;
  onExportTasks: () => void;
}

const MAX_PER_DAY = 3;

/** What the calendar places on each day: when tasks are due, or when they were finished. */
export type CalendarMode = 'due' | 'completed';

/** The day a task belongs on in the given mode, or null when it has no place there. */
export function calendarDay(task: Task, mode: CalendarMode): string | null {
  if (mode === 'due') return task.dueDate;
  return task.status === 'done' && task.completedAt ? toDateKey(new Date(task.completedAt)) : null;
}

const MODE_TEXT: Record<CalendarMode, { hint: string; empty: string; count: (n: number) => string }> = {
  due: {
    hint: 'Tasks appear on their due date. Select a task to open it. In Thunderbird, use File, then Import, and pick the exported file.',
    empty: 'Nothing is due this month.',
    count: (n) => `${n} ${n === 1 ? 'task' : 'tasks'} due this month`,
  },
  completed: {
    hint: 'Tasks appear on the day they were moved to Done. Select a task to open it.',
    empty: 'Nothing was completed this month.',
    count: (n) => `${n} ${n === 1 ? 'task' : 'tasks'} completed this month`,
  },
};
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const monthFmt = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' });
const dayFmt = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' });

/** The 6×7 grid of days (Monday first) that covers the month of `month`. */
export function monthGrid(month: Date): Date[] {
  const first = startOfWeek(new Date(month.getFullYear(), month.getMonth(), 1));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

/** Open tasks first, then by priority and title. */
function byDueOrder(a: Task, b: Task): number {
  return (
    Number(a.status === 'done') - Number(b.status === 'done') ||
    priorityRank(a.priority) - priorityRank(b.priority) ||
    a.title.localeCompare(b.title)
  );
}

/** Earliest completion first, so a day reads in the order its tasks were finished. */
function byCompletionTime(a: Task, b: Task): number {
  return Date.parse(a.completedAt as string) - Date.parse(b.completedAt as string) || a.title.localeCompare(b.title);
}

function TaskChip({ task, now, mode }: { task: Task; now: Date; mode: CalendarMode }) {
  // In the completed view every task is done, so the strike-through would only add noise.
  const late = mode === 'due' && isOverdue(task, now);
  const struck = mode === 'due' && task.status === 'done';
  const detail = [
    task.priority ? `${PRIORITY_LABEL[task.priority]} priority` : null,
    late ? 'overdue' : null,
    struck ? 'done' : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <a
      href={routeHref('calendar', task.id)}
      class={`cal-chip ${task.priority ? `prio-${task.priority}` : ''} ${struck ? 'is-done' : ''} ${late ? 'is-overdue' : ''}`}
      aria-label={detail ? `${task.title} (${detail})` : task.title}
    >
      {task.title}
    </a>
  );
}

export function CalendarView({ tasks, now, onExportCalendar, onExportTasks }: Props) {
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [mode, setMode] = useState<CalendarMode>('due');
  const compact = useMediaQuery('(max-width: 640px)');
  const text = MODE_TEXT[mode];

  const byDay = new Map<string, Task[]>();
  for (const t of tasks) {
    const key = calendarDay(t, mode);
    if (!key) continue;
    const list = byDay.get(key);
    if (list) list.push(t);
    else byDay.set(key, [t]);
  }
  for (const list of byDay.values()) list.sort(mode === 'due' ? byDueOrder : byCompletionTime);

  const today = toDateKey(now);
  const days = monthGrid(month);
  const inMonth = (d: Date) => d.getMonth() === month.getMonth();
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const monthDaysWithTasks = days.filter((d) => inMonth(d) && byDay.has(toDateKey(d)));
  const monthCount = monthDaysWithTasks.reduce((n, d) => n + (byDay.get(toDateKey(d)) as Task[]).length, 0);

  return (
    <div class="calendar-page">
      <div class="calendar-head">
        <h1 class="page-title" aria-live="polite">
          {monthFmt.format(month)}
        </h1>
        <div class="calendar-nav">
          <button type="button" class="button-secondary" onClick={() => shift(-1)} aria-label="Previous month">
            Previous
          </button>
          <button
            type="button"
            class="button-secondary"
            onClick={() => setMonth(new Date(now.getFullYear(), now.getMonth(), 1))}
          >
            Today
          </button>
          <button type="button" class="button-secondary" onClick={() => shift(1)} aria-label="Next month">
            Next
          </button>
        </div>
        <div class="calendar-export">
          <button type="button" class="button-secondary" onClick={onExportCalendar}>
            Export calendar (.ics)
          </button>
          <button type="button" class="button-secondary" onClick={onExportTasks}>
            Export tasks for Thunderbird (.ics)
          </button>
        </div>
      </div>
      <div class="calendar-bar">
        <div class="segmented calendar-mode" role="group" aria-label="Calendar view">
          {(['due', 'completed'] as CalendarMode[]).map((m) => (
            <button
              key={m}
              type="button"
              class="segment-button"
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                setExpanded(null);
              }}
            >
              {m === 'due' ? 'Due dates' : 'Completed'}
            </button>
          ))}
        </div>
        <p class="calendar-count" aria-live="polite">
          {text.count(monthCount)}
        </p>
      </div>
      <p class="hint calendar-hint">{text.hint}</p>

      {compact ? (
        monthDaysWithTasks.length === 0 ? (
          <p class="empty-note">{text.empty}</p>
        ) : (
          <ol class="agenda">
            {monthDaysWithTasks.map((d) => {
              const key = toDateKey(d);
              return (
                <li key={key} class={key === today ? 'is-today' : ''}>
                  <h2>{dayFmt.format(d)}</h2>
                  <ul>
                    {(byDay.get(key) as Task[]).map((t) => (
                      <li key={t.id}>
                        <TaskChip task={t} now={now} mode={mode} />
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        )
      ) : (
        <div
          class={`cal-grid ${mode === 'completed' ? 'is-completed' : ''}`}
          role="grid"
          aria-label={`${monthFmt.format(month)}, ${mode === 'due' ? 'due dates' : 'completed tasks'}`}
        >
          <div role="row" class="cal-weekdays">
            {WEEKDAYS.map((w) => (
              <div role="columnheader" key={w}>
                {w}
              </div>
            ))}
          </div>
          {[0, 1, 2, 3, 4, 5].map((week) => (
            <div role="row" class="cal-week" key={week}>
              {days.slice(week * 7, week * 7 + 7).map((d) => {
                const key = toDateKey(d);
                const list = byDay.get(key) ?? [];
                const open = expanded === key;
                const shown = open ? list : list.slice(0, MAX_PER_DAY);
                return (
                  <div
                    role="gridcell"
                    key={key}
                    class={`cal-day ${inMonth(d) ? '' : 'is-outside'} ${key === today ? 'is-today' : ''}`}
                    aria-label={dayFmt.format(d)}
                  >
                    <span class="cal-date" aria-hidden="true">
                      {d.getDate()}
                    </span>
                    {shown.map((t) => (
                      <TaskChip key={t.id} task={t} now={now} mode={mode} />
                    ))}
                    {list.length > MAX_PER_DAY && (
                      <button type="button" class="button-link cal-more" onClick={() => setExpanded(open ? null : key)}>
                        {open ? 'Show fewer' : `${list.length - MAX_PER_DAY} more`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
