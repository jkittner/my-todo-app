import { describe, expect, it } from 'vitest';
import { changeDueDate, moveTask } from '../src/model/task';
import { DAY_MS } from '../src/logic/dates';
import {
  categoryCounts,
  dueDateAt,
  flowSummary,
  median,
  priorityByStatus,
  priorityCounts,
  statusCounts,
  summarize,
  taskStats,
  wasDoneAt,
  weeklyDoneVsOverdue,
} from '../src/logic/stats';
import { at, day, makeTask, NOW, walk } from './helpers';

const H = 3_600_000;

describe('per-task statistics', () => {
  it('measures waiting time while a task is still waiting', () => {
    const t = makeTask({ created: -2, dueDate: day(5) });
    expect(taskStats(t, NOW)).toEqual({
      wait: { ms: 2 * DAY_MS, ongoing: true },
      work: null,
      overdueOriginalMs: 0,
      overdueCurrentMs: 0,
      dueChanges: 0,
    });
  });

  it('measures wait and work for finished tasks', () => {
    const t = walk(makeTask({ created: -10, dueDate: day(-1) }), [
      ['doing', -6],
      ['done', -1],
    ]);
    const s = taskStats(t, NOW);
    expect(s.wait).toEqual({ ms: 4 * DAY_MS, ongoing: false });
    expect(s.work).toEqual({ ms: 5 * DAY_MS, ongoing: false });
    // Due day -1 ended at midnight starting day 0; completion at -1 (10:00) was on time.
    expect(s.overdueCurrentMs).toBe(0);
  });

  it('measures ongoing work', () => {
    const t = walk(makeTask({ created: -3 }), [['doing', -1]]);
    expect(taskStats(t, NOW).work).toEqual({ ms: DAY_MS, ongoing: true });
  });

  it('compares lateness against the original and current due dates', () => {
    let t = makeTask({ created: -20, dueDate: day(-10) });
    t = changeDueDate(t, day(-6), at(-11));
    t = changeDueDate(t, day(-3), at(-7));
    t = walk(t, [
      ['doing', -5],
      ['done', -2],
    ]);
    const s = taskStats(t, NOW);
    // Completed at day -2 10:00. Original deadline: start of day -9 (00:00). Current: start of day -2.
    const completed = at(-2).getTime();
    expect(s.overdueOriginalMs).toBe(completed - new Date(day(-9) + 'T00:00:00').getTime());
    expect(s.overdueCurrentMs).toBe(completed - new Date(day(-2) + 'T00:00:00').getTime());
    expect(s.overdueCurrentMs).toBe(10 * H);
    expect(s.dueChanges).toBe(2);
  });

  it('counts lateness up to now for open tasks', () => {
    const t = makeTask({ created: -5, dueDate: day(-2) });
    expect(taskStats(t, NOW).overdueCurrentMs).toBe(NOW.getTime() - new Date(day(-1) + 'T00:00:00').getTime());
  });
});

describe('summaries', () => {
  it('computes medians', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('summarises the board', () => {
    const tasks = [
      makeTask({ dueDate: day(-1) }), // overdue
      makeTask({ dueDate: day(2) }), // due this week
      walk(makeTask({ created: -4, dueDate: day(20) }), [['doing', -2]]),
      walk(makeTask({ created: -4 }), [['done', -2]]), // 2 days to complete
      walk(makeTask({ created: -10 }), [['done', -4]]), // 6 days
      { ...walk(makeTask({ created: -10 }), [['done', -4]]), completedAt: null }, // malformed: ignored for median
    ];
    expect(summarize(tasks, NOW)).toEqual({
      todo: 2,
      doing: 1,
      done: 3,
      overdue: 1,
      dueThisWeek: 2,
      medianCompletionMs: 4 * DAY_MS,
    });
    expect(summarize([], NOW).medianCompletionMs).toBeNull();
  });

  it('summarises flow across tasks', () => {
    let late = makeTask({ created: -10, dueDate: day(-6) });
    late = changeDueDate(late, day(-4), at(-8));
    late = walk(late, [
      ['doing', -7],
      ['done', -3],
    ]);
    const onTime = walk(makeTask({ created: -6, dueDate: day(5) }), [
      ['doing', -5],
      ['done', -4],
    ]);
    const waiting = makeTask({ created: -1 });
    const f = flowSummary([late, onTime, waiting], NOW);
    expect(f.medianWaitMs).toBe(2 * DAY_MS);
    expect(f.medianWorkMs).toBe(2.5 * DAY_MS);
    expect(f.lateVsOriginal).toBe(1);
    expect(f.lateVsCurrent).toBe(1);
    expect(f.medianLateOriginalMs).toBeGreaterThan(f.medianLateCurrentMs as number);
    expect(f.rescheduledTasks).toBe(1);
    expect(f.totalDueChanges).toBe(1);
    expect(flowSummary([], NOW)).toMatchObject({ medianWaitMs: null, medianWorkMs: null, medianLateOriginalMs: null });
  });
});

describe('chart series', () => {
  const tasks = [
    makeTask({ priority: 'high', categories: ['Work', 'Home'] }),
    walk(makeTask({ priority: 'high', categories: ['Work'] }), [['doing', 0]]),
    walk(makeTask({ priority: null }), [['done', 0]]),
    makeTask({ priority: 'low' }),
  ];

  it('counts by status and priority', () => {
    expect(statusCounts(tasks)).toEqual({ todo: 2, doing: 1, done: 1 });
    expect(priorityCounts(tasks)).toEqual({ high: 2, medium: 0, low: 1, none: 1 });
    expect(priorityByStatus(tasks)).toEqual({
      high: { todo: 1, doing: 1, done: 0 },
      medium: { todo: 0, doing: 0, done: 0 },
      low: { todo: 1, doing: 0, done: 0 },
      none: { todo: 0, doing: 0, done: 1 },
    });
  });

  it('counts categories, largest first, with uncategorised tasks grouped', () => {
    expect(categoryCounts(tasks)).toEqual([
      { label: 'No category', count: 2 },
      { label: 'Work', count: 2 },
      { label: 'Home', count: 1 },
    ]);
  });

  it('replays due dates and status at a moment', () => {
    let t = makeTask({ created: -10, dueDate: day(-8) });
    t = changeDueDate(t, day(-2), at(-5));
    expect(dueDateAt(t, at(-6).getTime())).toBe(day(-8));
    expect(dueDateAt(t, at(-5).getTime())).toBe(day(-2));
    t = walk(t, [
      ['done', -4],
      ['todo', -3],
    ]);
    expect(wasDoneAt(t, at(-11).getTime())).toBe(false);
    expect(wasDoneAt(t, at(-4).getTime())).toBe(true);
    expect(wasDoneAt(t, at(-3).getTime())).toBe(false);
  });

  it('buckets completed and overdue tasks by week', () => {
    // Created 30 days ago, due 20 days ago, finished 2 days ago.
    const lateDone = walk(makeTask({ created: -30, dueDate: day(-20) }), [['done', -2]]);
    // Still open and overdue since 3 days ago.
    const open = makeTask({ created: -10, dueDate: day(-4) });
    const points = weeklyDoneVsOverdue([lateDone, open], NOW, 4);
    expect(points.map((p) => p.weekStart)).toEqual(['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12']);
    expect(points.map((p) => p.done)).toEqual([0, 0, 0, 1]);
    // Week of Sep 21 ends Sep 28: lateDone overdue. Oct 5 week: both. Current week (to now): only open.
    expect(points.map((p) => p.overdue)).toEqual([1, 1, 2, 1]);
    expect(weeklyDoneVsOverdue([], NOW)).toHaveLength(12);
  });

  it('ignores tasks created after a week ended', () => {
    const t = moveTask(makeTask({ created: -1, dueDate: day(-30) }), 'todo', at(0));
    expect(weeklyDoneVsOverdue([t], NOW, 2).map((p) => p.overdue)).toEqual([0, 1]);
  });
});
