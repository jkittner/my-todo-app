import type { Task } from '../../model/task';
import { formatDateKey, formatDuration, formatTimestamp } from '../../logic/dates';
import { taskStats, type Span } from '../../logic/stats';

const span = (s: Span) => `${formatDuration(s.ms)}${s.ongoing ? ' so far' : ''}`;
const late = (ms: number, done: boolean) => (ms > 0 ? `${formatDuration(ms)} late${done ? '' : ' so far'}` : 'On time');

/** Read-only history and timing figures for one task. */
export function Timeline({ task, now }: { task: Task; now: Date }) {
  const s = taskStats(task, now);
  const done = task.status === 'done';
  const rows: [string, string][] = [
    ['Created', formatTimestamp(task.createdAt)],
    ['Started', task.startedAt ? formatTimestamp(task.startedAt) : 'Not started'],
    ['Completed', task.completedAt ? formatTimestamp(task.completedAt) : 'Not completed'],
    ['Waited before starting', span(s.wait)],
    ['Worked on', s.work ? span(s.work) : 'Not started'],
    [`Against first due date (${formatDateKey(task.originalDueDate, now)})`, late(s.overdueOriginalMs, done)],
    [`Against current due date (${formatDateKey(task.dueDate, now)})`, late(s.overdueCurrentMs, done)],
    [
      'Due date changes',
      s.dueChanges === 1 ? 'Changed once' : s.dueChanges ? `Changed ${s.dueChanges} times` : 'Never changed',
    ],
  ];
  return (
    <section class="timeline" aria-labelledby="timeline-heading">
      <h3 id="timeline-heading">History</h3>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {task.dueDateHistory.length > 0 && (
        <ol class="due-changes" aria-label="Due date changes">
          {task.dueDateHistory.map((c) => (
            <li key={c.changedAt}>
              {formatDateKey(c.from, now)} to {formatDateKey(c.to, now)}, changed {formatTimestamp(c.changedAt)}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
