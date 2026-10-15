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
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const monthFmt = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' });
const dayFmt = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' });

/** The 6×7 grid of days (Monday first) that covers the month of `month`. */
export function monthGrid(month: Date): Date[] {
  const first = startOfWeek(new Date(month.getFullYear(), month.getMonth(), 1));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

function TaskChip({ task, now }: { task: Task; now: Date }) {
  const late = isOverdue(task, now);
  const detail = [
    task.priority ? `${PRIORITY_LABEL[task.priority]} priority` : null,
    late ? 'overdue' : null,
    task.status === 'done' ? 'done' : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <a
      href={routeHref('calendar', task.id)}
      class={`cal-chip ${task.priority ? `prio-${task.priority}` : ''} ${task.status === 'done' ? 'is-done' : ''} ${late ? 'is-overdue' : ''}`}
      aria-label={detail ? `${task.title} (${detail})` : task.title}
    >
      {task.title}
    </a>
  );
}

export function CalendarView({ tasks, now, onExportCalendar, onExportTasks }: Props) {
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [expanded, setExpanded] = useState<string | null>(null);
  const compact = useMediaQuery('(max-width: 640px)');

  const byDay = new Map<string, Task[]>();
  for (const t of tasks) byDay.set(t.dueDate, [...(byDay.get(t.dueDate) ?? []), t]);
  for (const list of byDay.values())
    list.sort(
      (a, b) =>
        Number(a.status === 'done') - Number(b.status === 'done') ||
        priorityRank(a.priority) - priorityRank(b.priority) ||
        a.title.localeCompare(b.title),
    );

  const today = toDateKey(now);
  const days = monthGrid(month);
  const inMonth = (d: Date) => d.getMonth() === month.getMonth();
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const monthDaysWithTasks = days.filter((d) => inMonth(d) && byDay.has(toDateKey(d)));

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
      <p class="hint calendar-hint">
        Tasks appear on their due date. Select a task to open it. In Thunderbird, use File, then Import, and pick the
        exported file.
      </p>

      {compact ? (
        monthDaysWithTasks.length === 0 ? (
          <p class="empty-note">Nothing is due this month.</p>
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
                        <TaskChip task={t} now={now} />
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        )
      ) : (
        <div class="cal-grid" role="grid" aria-label={monthFmt.format(month)}>
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
                      <TaskChip key={t.id} task={t} now={now} />
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
