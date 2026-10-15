import { PRIORITY_LABEL, STATUS_LABEL, STATUSES, type Task } from '../../model/task';
import { formatDateKey, formatDuration, monthRange } from '../../logic/dates';
import { isOverdue } from '../../logic/filter';
import {
  categoryCounts,
  flowSummary,
  PRIORITY_KEYS,
  priorityByStatus,
  priorityCounts,
  statusCounts,
  weeklyDoneVsOverdue,
  type PriorityKey,
} from '../../logic/stats';
import { routeHref } from '../common/hooks';
import { BarList, ChartCard, GroupedColumns, Legend, ShareBar, SimpleTable, StackedRows, type Datum } from './charts';

const STATUS_COLOR = { todo: 'var(--c-todo)', doing: 'var(--c-doing)', done: 'var(--c-done)' };
const PRIORITY_COLOR: Record<PriorityKey, string> = {
  high: 'var(--c-high)',
  medium: 'var(--c-medium)',
  low: 'var(--c-low)',
  none: 'var(--c-none)',
};
const priorityName = (p: PriorityKey) => (p === 'none' ? 'No priority' : PRIORITY_LABEL[p]);
const orDash = (ms: number | null) => (ms === null ? 'Not enough data yet' : formatDuration(ms));

export function Insights({ tasks, now }: { tasks: Task[]; now: Date }) {
  const statuses = statusCounts(tasks);
  const statusData: Datum[] = STATUSES.map((s) => ({
    key: s,
    label: STATUS_LABEL[s],
    value: statuses[s],
    color: STATUS_COLOR[s],
  }));
  const prio = priorityCounts(tasks);
  const prioData: Datum[] = PRIORITY_KEYS.map((p) => ({
    key: p,
    label: priorityName(p),
    value: prio[p],
    color: PRIORITY_COLOR[p],
  }));
  const catData: Datum[] = categoryCounts(tasks).map((c) => ({
    key: c.label,
    label: c.label,
    value: c.count,
    color: 'var(--c-bar)',
  }));
  const pbs = priorityByStatus(tasks);
  const weekly = weeklyDoneVsOverdue(tasks, now);
  const flow = flowSummary(tasks, now);
  const month = monthRange(now);
  const dueThisMonth = tasks
    .filter((t) => t.dueDate >= month.from && t.dueDate <= month.to)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title));
  const monthName = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(now);

  const weeklyLegend: Datum[] = [
    { key: 'done', label: 'Completed', value: 0, color: 'var(--c-done)' },
    { key: 'overdue', label: 'Overdue', value: 0, color: 'var(--c-overdue)' },
  ];

  return (
    <div class="insights">
      <h1 class="page-title">Insights</h1>

      <section class="flow" aria-labelledby="flow-heading">
        <h2 id="flow-heading">How work moves</h2>
        <dl class="flow-list">
          <div>
            <dt>Median wait before starting</dt>
            <dd>{orDash(flow.medianWaitMs)}</dd>
          </div>
          <div>
            <dt>Median time worked</dt>
            <dd>{orDash(flow.medianWorkMs)}</dd>
          </div>
          <div>
            <dt>Finished late against the first due date</dt>
            <dd>
              {flow.lateVsOriginal} {flow.lateVsOriginal === 1 ? 'task' : 'tasks'}
              {flow.medianLateOriginalMs !== null && (
                <span class="muted">, median {formatDuration(flow.medianLateOriginalMs)} late</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Finished late against the current due date</dt>
            <dd>
              {flow.lateVsCurrent} {flow.lateVsCurrent === 1 ? 'task' : 'tasks'}
              {flow.medianLateCurrentMs !== null && (
                <span class="muted">, median {formatDuration(flow.medianLateCurrentMs)} late</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Rescheduled tasks</dt>
            <dd>
              {flow.rescheduledTasks} <span class="muted">({flow.totalDueChanges} due date changes in total)</span>
            </dd>
          </div>
        </dl>
      </section>

      <div class="chart-grid">
        <ChartCard
          title="Tasks by status"
          table={<SimpleTable head={['Status', 'Tasks']} rows={statusData.map((d) => [d.label, d.value])} />}
        >
          <ShareBar data={statusData} />
        </ChartCard>

        <ChartCard
          title="Tasks by priority"
          table={<SimpleTable head={['Priority', 'Tasks']} rows={prioData.map((d) => [d.label, d.value])} />}
        >
          <ShareBar data={prioData} />
        </ChartCard>

        <ChartCard
          title="Tasks by category"
          note="A task with several categories counts once in each."
          table={<SimpleTable head={['Category', 'Tasks']} rows={catData.map((d) => [d.label, d.value])} />}
        >
          <BarList data={catData} />
        </ChartCard>

        <ChartCard
          title="Priority and status"
          table={
            <SimpleTable
              head={['Priority', ...STATUSES.map((s) => STATUS_LABEL[s])]}
              rows={PRIORITY_KEYS.map((p) => [priorityName(p), ...STATUSES.map((s) => pbs[p][s])])}
            />
          }
        >
          <Legend items={statusData} />
          <StackedRows
            rows={PRIORITY_KEYS.map((p) => ({
              key: p,
              label: priorityName(p),
              parts: STATUSES.map((s) => ({
                key: s,
                label: STATUS_LABEL[s],
                value: pbs[p][s],
                color: STATUS_COLOR[s],
              })),
            }))}
          />
        </ChartCard>

        <ChartCard
          title="Completed and overdue per week"
          wide
          note="Overdue counts open tasks past their due date at the end of each week. Last 12 weeks."
          table={
            <SimpleTable
              head={['Week of', 'Completed', 'Overdue']}
              rows={weekly.map((w) => [formatDateKey(w.weekStart, now), w.done, w.overdue])}
            />
          }
        >
          <Legend items={weeklyLegend} />
          <GroupedColumns
            groups={weekly.map((w) => ({
              key: w.weekStart,
              label: formatDateKey(w.weekStart, now),
              title: `Week of ${formatDateKey(w.weekStart, now)}`,
              values: [
                { ...weeklyLegend[0], value: w.done },
                { ...weeklyLegend[1], value: w.overdue },
              ],
            }))}
          />
        </ChartCard>
      </div>

      <section class="month-table" aria-labelledby="month-heading">
        <h2 id="month-heading">Due in {monthName}</h2>
        {dueThisMonth.length === 0 ? (
          <p class="empty-note">Nothing is due this month.</p>
        ) : (
          <div class="table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th scope="col">Task</th>
                  <th scope="col">Status</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Due</th>
                </tr>
              </thead>
              <tbody>
                {dueThisMonth.map((t) => (
                  <tr key={t.id}>
                    <th scope="row">
                      <a href={routeHref('insights', t.id)}>{t.title}</a>
                    </th>
                    <td>{STATUS_LABEL[t.status]}</td>
                    <td>{t.priority ? PRIORITY_LABEL[t.priority] : 'None'}</td>
                    <td class={isOverdue(t, now) ? 'is-overdue' : ''}>
                      {isOverdue(t, now) && 'Overdue, '}
                      {formatDateKey(t.dueDate, now)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
