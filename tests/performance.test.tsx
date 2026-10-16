// Performance and correctness at scale: boards of 300, 1,000 and 5,000 generated tasks.
//
// These tests only catch hard regressions (an accidental O(n²), a loop that re-parses every
// task), not small slowdowns. Budgets are about 10× the worst time measured with coverage
// instrumentation and the whole suite running in parallel, and repeatable steps use the best
// of three runs, so a GC pause or a busy machine cannot fail them. Structural checks (such as
// how many cards are in the DOM) guard the specific optimisations instead of timing them.
import { act, fireEvent, render, screen, within } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import ICAL from 'ical.js';
import { generateDb } from '../e2e/generate';
import { parseBackup, parseTasks, serializeBackup } from '../src/io/backup';
import { exportCalendarIcs, exportTasksIcs } from '../src/io/ical';
import { EMPTY_FILTERS, filterTasks } from '../src/logic/filter';
import { sortTasks } from '../src/logic/sort';
import { categoryCounts, flowSummary, priorityByStatus, summarize, weeklyDoneVsOverdue } from '../src/logic/stats';
import { reducer } from '../src/store/reducer';
import { loadDb, saveDb, type Db } from '../src/store/storage';
import { PAGE_SIZE } from '../src/ui/board/Column';
import { App } from '../src/ui/App';
import type { Task } from '../src/model/task';
import { NOW } from './helpers';

/** CI sets PERF_BUDGET_FACTOR to loosen budgets further on slower shared runners. */
const FACTOR = Number(process.env.PERF_BUDGET_FACTOR ?? 1);

type Budget = Record<
  'logic' | 'ics' | 'backup' | 'storage' | 'change' | 'board' | 'search' | 'insights' | 'calendar',
  number
>;

// Worst times seen under coverage (5 full runs), for reference when adjusting:
//   5,000 tasks: logic 506, ics 696, backup 171, storage 144, board 404, search 282, insights 357 ms.
//   Smaller boards are dominated by warm-up, e.g. the 300-task board render peaked at 611 ms.
const BUDGET_MS: Record<number, Budget> = {
  300: {
    logic: 1000,
    ics: 1000,
    backup: 1000,
    storage: 1000,
    change: 500,
    board: 5000,
    search: 3000,
    insights: 3000,
    calendar: 2000,
  },
  1000: {
    logic: 2000,
    ics: 2000,
    backup: 1000,
    storage: 1000,
    change: 500,
    board: 5000,
    search: 3000,
    insights: 3000,
    calendar: 2000,
  },
  5000: {
    logic: 5000,
    ics: 7000,
    backup: 2000,
    storage: 2000,
    change: 500,
    board: 5000,
    search: 3000,
    insights: 4000,
    calendar: 2000,
  },
};

/** Runs `fn` several times and reports the fastest run, which filters out one-off stalls. */
function bestOf<T>(fn: () => T, runs = 3): [T, number] {
  let result = fn();
  let best = Infinity;
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    result = fn();
    best = Math.min(best, performance.now() - start);
  }
  return [result, best];
}

/** Fails with the measured time and the budget in the message. */
function withinBudget(label: string, ms: number, budget: number) {
  expect(ms, `${label} took ${Math.round(ms)} ms; budget ${budget} ms`).toBeLessThan(budget);
}

async function timedAsync(fn: () => Promise<unknown>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

const go = (hash: string) =>
  act(async () => {
    location.hash = hash;
    await new Promise((r) => setTimeout(r, 0));
  });

describe.each([300, 1000, 5000])('with %i tasks', (n) => {
  const budget = Object.fromEntries(Object.entries(BUDGET_MS[n]).map(([k, v]) => [k, v * FACTOR])) as Budget;
  const db = generateDb(n, NOW);
  const tasks = parseTasks(db.tasks) as Task[];

  it('generates valid, varied data', () => {
    expect(tasks).toHaveLength(n);
    const counts = summarize(tasks, NOW);
    expect(counts.todo + counts.doing + counts.done).toBe(n);
    expect(counts.todo).toBeGreaterThan(0);
    expect(counts.done).toBeGreaterThan(0);
    expect(tasks.some((t) => t.dueDateHistory.length > 0)).toBe(true);
  });

  it('filters, sorts and computes statistics within budget', () => {
    const [, ms] = bestOf(() => {
      const visible = filterTasks(tasks, { ...EMPTY_FILTERS, query: 'invoice', tags: ['finance', 'admin'] }, NOW);
      sortTasks(tasks, [{ key: 'priority', dir: 'asc' }]);
      sortTasks(visible, [{ key: 'title', dir: 'desc' }]);
      sortTasks(tasks, [
        { key: 'priority', dir: 'asc' },
        { key: 'due', dir: 'asc' },
        { key: 'title', dir: 'desc' },
      ]);
      summarize(tasks, NOW);
      flowSummary(tasks, NOW);
      weeklyDoneVsOverdue(tasks, NOW);
      categoryCounts(tasks);
      priorityByStatus(tasks);
    });
    withinBudget('Filtering, sorting and statistics', ms, budget.logic);
  }, 30_000);

  it('exports every task to iCalendar within budget', () => {
    const [[todos, events], ms] = bestOf(() => [exportTasksIcs(tasks, NOW), exportCalendarIcs(tasks, NOW)]);
    withinBudget('iCalendar export', ms, budget.ics);
    const parsed = new ICAL.Component(ICAL.parse(todos));
    expect(parsed.getAllSubcomponents('vtodo')).toHaveLength(n);
    expect(events.match(/BEGIN:VEVENT/g)).toHaveLength(n);
  }, 30_000);

  it('round-trips a backup within budget', () => {
    const [restored, ms] = bestOf(() =>
      parseBackup(serializeBackup({ tasks, tags: db.tags, categories: db.categories }, NOW)),
    );
    withinBudget('Backup round trip', ms, budget.backup);
    expect(restored).toEqual({ tasks, tags: db.tags, categories: db.categories });
  }, 30_000);

  it('saves to and loads from local storage within budget', () => {
    const full: Db = {
      schemaVersion: 1,
      tasks,
      tags: db.tags,
      categories: db.categories,
      prefs: { sort: [{ key: 'due', dir: 'asc' }], hideDone: false },
    };
    const [[ok, loaded], ms] = bestOf(() => [saveDb(full, localStorage), loadDb(localStorage)] as const);
    expect(ok).toBe(true);
    withinBudget('Saving and loading', ms, budget.storage);
    expect(loaded.db.tasks).toHaveLength(n);
  }, 30_000);

  it('applies a change to the whole board quickly', () => {
    const full: Db = {
      schemaVersion: 1,
      tasks,
      tags: db.tags,
      categories: db.categories,
      prefs: { sort: [{ key: 'due', dir: 'asc' }], hideDone: false },
    };
    const [next, ms] = bestOf(() => reducer(full, { type: 'move', id: tasks[n - 1].id, status: 'done', now: NOW }));
    withinBudget('Applying a change', ms, budget.change);
    expect(next.tasks[n - 1].status).toBe('done');
  });

  it('renders the board, search, insights and calendar within budget', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const full: Db = {
      schemaVersion: 1,
      tasks,
      tags: db.tags,
      categories: db.categories,
      prefs: { sort: [{ key: 'due', dir: 'asc' }], hideDone: false },
    };
    const boardMs = await timedAsync(async () => {
      render(<App load={() => ({ db: full })} save={() => true} />);
    });
    withinBudget('Board render', boardMs, budget.board);

    // Long columns render one page of cards at a time, with the real total in the header.
    const counts = summarize(tasks, NOW);
    const todo = screen.getByRole('region', { name: 'To do' });
    expect(within(todo).getByLabelText(`${counts.todo} tasks`)).toBeInTheDocument();
    expect(todo.querySelectorAll('.card').length).toBe(Math.min(PAGE_SIZE, counts.todo));
    expect(document.querySelectorAll('.card').length).toBeLessThanOrEqual(3 * PAGE_SIZE);

    const searchMs = await timedAsync(async () => {
      fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'invoice' } });
      await act(async () => {});
    });
    withinBudget('Search', searchMs, budget.search);
    const expected = filterTasks(tasks, { ...EMPTY_FILTERS, query: 'invoice' }, NOW).filter(
      (t) => t.status === 'todo',
    ).length;
    expect(within(todo).getByLabelText(`${expected} tasks`)).toBeInTheDocument();

    const insightsMs = await timedAsync(() => go('#/insights'));
    withinBudget('Insights page', insightsMs, budget.insights);
    expect(screen.getByRole('heading', { name: 'Tasks by status' })).toBeInTheDocument();

    const calendarMs = await timedAsync(() => go('#/calendar'));
    withinBudget('Calendar page', calendarMs, budget.calendar);
    expect(screen.getByRole('grid', { name: 'October 2026, due dates' })).toBeInTheDocument();
    console.info(
      `[perf] ${n} tasks (jsdom): board ${boardMs.toFixed(0)} ms, search ${searchMs.toFixed(0)} ms, insights ${insightsMs.toFixed(0)} ms, calendar ${calendarMs.toFixed(0)} ms`,
    );
  }, 30_000);
});
