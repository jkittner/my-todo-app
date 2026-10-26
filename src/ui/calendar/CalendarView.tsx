import type { RefObject } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
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

// Pixel sizes of the month grid; keep them in step with .cal-weekdays, .cal-day and .cal-chip in app.css.
const LINE_PX = 23; // one chip or "more" link (20px) and the 3px gap above it
const DAY_CHROME_PX = 36; // 6px padding above and below, 24px date
const WEEKDAYS_PX = 31; // the weekday header row
const GRID_FRAME_PX = 8; // 1px border above and below, six 1px gaps between rows
const BOTTOM_GAP_PX = 24; // the page's bottom padding
const MIN_LINES = 2; // one chip and a "more" link

/** How many chip lines fit in the six week rows of a grid `height` pixels tall. */
export function fitLines(height: number): number {
  return Math.max(0, Math.floor((height - WEEKDAYS_PX - GRID_FRAME_PX - 6 * DAY_CHROME_PX) / LINE_PX));
}

/**
 * Shares `total` chip lines between the week rows; `needs[i]` is the most tasks on one day of
 * week i. Every row gets at least half an even share and at most twice one, so quiet weeks keep
 * their room and a busy week cannot take over the month. Within those bounds, lines go to the
 * rows that still need them, smallest first, so as few days as possible collapse. Lines nobody
 * needs stay unassigned; the grid spreads that space evenly.
 */
export function weekLines(needs: number[], total: number): number[] {
  const share = total / needs.length;
  const min = Math.max(MIN_LINES, Math.floor(share / 2));
  const max = Math.max(min, Math.ceil(share * 2));
  const lines = needs.map(() => min);
  for (let left = total - min * needs.length; left > 0; left--) {
    let pick = -1;
    for (let i = 0; i < needs.length; i++)
      if (lines[i] < Math.min(needs[i], max) && (pick < 0 || lines[i] < lines[pick])) pick = i;
    if (pick < 0) break;
    lines[pick]++;
  }
  return lines;
}

/** Room from the top of `ref` to the bottom of the window, kept current as the window resizes. */
function useHeightToBottom(ref: RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0);
  const measure = () => {
    const el = ref.current;
    if (el) setHeight(Math.floor(innerHeight - el.getBoundingClientRect().top - scrollY - BOTTOM_GAP_PX));
  };
  // Every render: the month name or hint above the grid can wrap onto another line.
  useLayoutEffect(measure);
  useLayoutEffect(() => {
    addEventListener('resize', measure);
    return () => removeEventListener('resize', measure);
  }, []);
  return height;
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
  const gridRef = useRef<HTMLDivElement>(null);
  const height = useHeightToBottom(gridRef);
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

  const weeks = [0, 1, 2, 3, 4, 5].map((w) => days.slice(w * 7, w * 7 + 7));
  const dayCount = (d: Date) => byDay.get(toDateKey(d))?.length ?? 0;
  const lines = weekLines(
    weeks.map((w) => Math.max(...w.map(dayCount))),
    fitLines(height),
  );
  // An expanded day grows its week to show every task; the grid then grows past the window.
  weeks.forEach((w, i) => {
    const open = w.find((d) => toDateKey(d) === expanded);
    if (open) lines[i] = Math.max(lines[i], dayCount(open) + 1);
  });
  const rowPx = lines.map((l) => DAY_CHROME_PX + l * LINE_PX);
  // A definite height, so the rows share it instead of all growing to the tallest row's content.
  const gridPx = Math.max(height, WEEKDAYS_PX + GRID_FRAME_PX + rowPx.reduce((a, b) => a + b, 0));

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
          ref={gridRef}
          style={{
            height: `${gridPx}px`,
            gridTemplateRows: `auto ${rowPx.map((px) => `minmax(${px}px, 1fr)`).join(' ')}`,
          }}
          aria-label={`${monthFmt.format(month)}, ${mode === 'due' ? 'due dates' : 'completed tasks'}`}
        >
          <div role="row" class="cal-weekdays">
            {WEEKDAYS.map((w) => (
              <div role="columnheader" key={w}>
                {w}
              </div>
            ))}
          </div>
          {weeks.map((week, w) => (
            <div role="row" class="cal-week" key={w}>
              {week.map((d) => {
                const key = toDateKey(d);
                const list = byDay.get(key) ?? [];
                const open = expanded === key;
                const fit = lines[w];
                // A collapsed day gives its last line to the "more" link.
                const shown = list.length > fit ? list.slice(0, fit - 1) : list;
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
                    {(open || list.length > fit) && (
                      <button type="button" class="button-link cal-more" onClick={() => setExpanded(open ? null : key)}>
                        {open ? 'Show fewer' : `${list.length - shown.length} more`}
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
