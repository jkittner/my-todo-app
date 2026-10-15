import type { QuickFilter } from '../../logic/filter';
import { formatDuration } from '../../logic/dates';
import type { Summary } from '../../logic/stats';

interface Props {
  summary: Summary;
  quick: QuickFilter;
  onQuick: (q: QuickFilter) => void;
}

/** One line of board totals. Overdue and due-this-week double as filters. */
export function StatsLine({ summary, quick, onQuick }: Props) {
  const toggle = (q: Exclude<QuickFilter, null>, count: number, label: string) => (
    <li>
      <button
        type="button"
        class={`stat stat-button ${q === 'overdue' && count > 0 ? 'stat-alert' : ''}`}
        aria-pressed={quick === q}
        title={quick === q ? 'Show all tasks again' : `Show only tasks ${label}`}
        onClick={() => onQuick(quick === q ? null : q)}
      >
        <span class="stat-value">{count}</span> {label}
      </button>
    </li>
  );
  return (
    <ul class="stats-line" aria-label="Board totals">
      <li class="stat">
        <span class="stat-value">{summary.todo}</span> to do
      </li>
      <li class="stat">
        <span class="stat-value">{summary.doing}</span> in progress
      </li>
      <li class="stat">
        <span class="stat-value">{summary.done}</span> done
      </li>
      {toggle('overdue', summary.overdue, 'overdue')}
      {toggle('dueThisWeek', summary.dueThisWeek, 'due this week')}
      <li class="stat">
        {summary.medianCompletionMs === null ? (
          <span class="stat-muted">No completed tasks yet</span>
        ) : (
          <>
            <span class="stat-value">{formatDuration(summary.medianCompletionMs)}</span> median to complete
          </>
        )}
      </li>
    </ul>
  );
}
