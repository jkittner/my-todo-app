import { describe, expect, it } from 'vitest';
import {
  addDays,
  dueDeadline,
  formatDateKey,
  DAY_MS,
  humanDuration,
  MONTH_MS,
  YEAR_MS,
  formatDuration,
  formatTimestamp,
  isDateKey,
  isPastDue,
  monthRange,
  msBetween,
  parseDateKey,
  startOfWeek,
  toDateKey,
  weekRange,
} from '../src/logic/dates';
import {
  EMPTY_FILTERS,
  filterTasks,
  hasActiveFilters,
  isDueThisWeek,
  isOverdue,
  matchesQuery,
} from '../src/logic/filter';
import { DEFAULT_SORT, DIR_LABEL, normalizeSort, priorityRank, sortTasks } from '../src/logic/sort';
import { DONE_WINDOW_DAYS, isRecentlyDone, visibleDone } from '../src/logic/doneWindow';
import { renderMarkdown } from '../src/logic/markdown';
import { day, makeTask, NOW, walk } from './helpers';

describe('dates', () => {
  it('round-trips local date keys', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(parseDateKey('2026-01-05')).toEqual(new Date(2026, 0, 5));
  });

  it('validates date keys', () => {
    expect(isDateKey('2026-02-28')).toBe(true);
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(isDateKey('2026-2-3')).toBe(false);
    expect(isDateKey(20260101)).toBe(false);
  });

  it('computes Monday-based weeks and months', () => {
    // 2026-10-15 is a Thursday.
    expect(toDateKey(startOfWeek(NOW))).toBe('2026-10-12');
    expect(toDateKey(startOfWeek(new Date(2026, 9, 18)))).toBe('2026-10-12'); // Sunday
    expect(weekRange(NOW)).toEqual({ from: '2026-10-12', to: '2026-10-18' });
    expect(monthRange(NOW)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(toDateKey(addDays(NOW, -15))).toBe('2026-09-30');
  });

  it('treats a due date as passed only after that day ends', () => {
    expect(dueDeadline('2026-10-15')).toEqual(new Date(2026, 9, 16));
    expect(isPastDue('2026-10-15', NOW)).toBe(false);
    expect(isPastDue('2026-10-14', NOW)).toBe(true);
    expect(isPastDue('2026-10-18', new Date(2026, 9, 18, 23, 59, 59, 999))).toBe(false);
    expect(isPastDue('2026-10-18', new Date(2026, 9, 19, 0, 0))).toBe(true);
  });

  it('measures and formats durations', () => {
    expect(msBetween('2026-10-01T00:00:00Z', '2026-10-02T12:00:00Z')).toBe(1.5 * 86_400_000);
    expect(formatDuration(10 * 60_000)).toBe('under 1 h');
    expect(formatDuration(5 * 3_600_000)).toBe('5 h');
    expect(formatDuration(86_400_000)).toBe('1 day');
    expect(formatDuration(2.54 * 86_400_000)).toBe('2.5 days');
  });

  it('formats durations in the unit that fits their size', () => {
    const H = 3_600_000;
    expect([0, 30_000, 12 * 60_000, 60_000].map(humanDuration)).toEqual(['0', 'under 1 min', '12 min', '1 min']);
    expect([45 * 60_000, H, 3.5 * H, 47 * H].map(humanDuration)).toEqual(['45 min', '1 h', '3.5 h', '2 days']);
    expect([DAY_MS, 36 * H, 48 * H, 3 * DAY_MS, 45 * DAY_MS].map(humanDuration)).toEqual([
      '1 day',
      '1.5 days',
      '2 days',
      '3 days',
      '45 days',
    ]);
    expect([6 * MONTH_MS, YEAR_MS, 2.5 * YEAR_MS].map(humanDuration)).toEqual(['6 months', '1 year', '2.5 years']);
  });

  it('formats dates relative to the current year', () => {
    expect(formatDateKey('2026-10-18', NOW)).toBe('Oct 18');
    expect(formatDateKey('2025-10-18', NOW)).toBe('Oct 18, 2025');
    expect(formatTimestamp(NOW.toISOString())).toMatch(/Oct 15, 2026/);
  });
});

describe('filter', () => {
  const invoice = makeTask({
    title: 'Send invoice',
    description: 'Use the **PDF** template',
    tags: ['Finance'],
    categories: ['Work'],
    dueDate: day(-1),
  });
  const bike = makeTask({
    title: 'Book bike service',
    tags: ['errand'],
    categories: ['Home'],
    dueDate: day(10),
    created: -20,
  });
  const done = walk(makeTask({ title: 'Old report', dueDate: day(-5) }), [['done', -4]]);
  const all = [invoice, bike, done];

  it('reports whether filters are active', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, query: 'x' })).toBe(false);
    for (const patch of [
      { tags: ['a'] },
      { categories: ['a'] },
      { dueFrom: 'x' },
      { dueTo: 'x' },
      { createdFrom: 'x' },
      { createdTo: 'x' },
      { quick: 'overdue' as const },
    ])
      expect(hasActiveFilters({ ...EMPTY_FILTERS, ...patch })).toBe(true);
  });

  it('searches title and description case-insensitively', () => {
    expect(matchesQuery(invoice, '  ')).toBe(true);
    expect(matchesQuery(invoice, 'INVOICE')).toBe(true);
    expect(matchesQuery(invoice, 'pdf')).toBe(true);
    expect(matchesQuery(invoice, 'bike')).toBe(false);
    expect(filterTasks(all, { ...EMPTY_FILTERS, query: 'bike' }, NOW)).toEqual([bike]);
  });

  it('filters by any matching tag or category', () => {
    expect(filterTasks(all, { ...EMPTY_FILTERS, tags: ['finance', 'errand'] }, NOW)).toEqual([invoice, bike]);
    expect(filterTasks(all, { ...EMPTY_FILTERS, categories: ['home'] }, NOW)).toEqual([bike]);
  });

  it('filters by due and created date ranges (inclusive)', () => {
    expect(filterTasks(all, { ...EMPTY_FILTERS, dueFrom: day(-1), dueTo: day(10) }, NOW)).toEqual([invoice, bike]);
    expect(filterTasks(all, { ...EMPTY_FILTERS, dueTo: day(-2) }, NOW)).toEqual([done]);
    expect(filterTasks(all, { ...EMPTY_FILTERS, createdTo: day(-10) }, NOW)).toEqual([bike]);
    expect(filterTasks(all, { ...EMPTY_FILTERS, createdFrom: day(0) }, NOW)).toEqual([invoice, done]);
  });

  it('applies quick filters for overdue and due this week', () => {
    expect(isOverdue(done, NOW)).toBe(false);
    expect(isOverdue(invoice, NOW)).toBe(true);
    expect(isDueThisWeek(invoice, NOW)).toBe(true);
    expect(isDueThisWeek(done, NOW)).toBe(false);
    expect(filterTasks(all, { ...EMPTY_FILTERS, quick: 'overdue' }, NOW)).toEqual([invoice]);
    expect(filterTasks(all, { ...EMPTY_FILTERS, quick: 'dueThisWeek' }, NOW)).toEqual([invoice]);
  });
});

describe('sort', () => {
  const a = makeTask({ title: 'beta', priority: 'low', dueDate: day(2) });
  const b = makeTask({ title: 'Alpha', priority: null, dueDate: day(1) });
  const c = makeTask({ title: 'gamma', priority: 'high', dueDate: day(2) });
  const d = makeTask({ title: 'delta', priority: 'high', dueDate: day(1) });

  it('ranks priorities with none last', () => {
    expect(['high', 'medium', 'low', null].map((p) => priorityRank(p as never))).toEqual([0, 1, 2, 3]);
  });

  it('sorts by due date, then title', () => {
    expect(sortTasks([a, b, c, d], [{ key: 'due', dir: 'asc' }]).map((t) => t.title)).toEqual([
      'Alpha',
      'delta',
      'beta',
      'gamma',
    ]);
    expect(sortTasks([a, b, c, d], [{ key: 'due', dir: 'desc' }]).map((t) => t.title)).toEqual([
      'beta',
      'gamma',
      'Alpha',
      'delta',
    ]);
  });

  it('sorts by priority with due-date tie-breaks', () => {
    expect(sortTasks([a, b, c, d], [{ key: 'priority', dir: 'asc' }]).map((t) => t.title)).toEqual([
      'delta',
      'gamma',
      'beta',
      'Alpha',
    ]);
    expect(sortTasks([a, b, c, d], [{ key: 'priority', dir: 'desc' }]).map((t) => t.title)).toEqual([
      'Alpha',
      'beta',
      'delta',
      'gamma',
    ]);
  });

  it('sorts alphabetically ignoring case and does not mutate the input', () => {
    const input = [a, b, c, d];
    expect(sortTasks(input, [{ key: 'title', dir: 'asc' }]).map((t) => t.title)).toEqual([
      'Alpha',
      'beta',
      'delta',
      'gamma',
    ]);
    expect(sortTasks(input, [{ key: 'title', dir: 'desc' }]).map((t) => t.title)).toEqual([
      'gamma',
      'delta',
      'beta',
      'Alpha',
    ]);
    expect(input).toEqual([a, b, c, d]);
  });

  it('sorts by several criteria in order', () => {
    const e = makeTask({ title: 'epsilon', priority: 'high', dueDate: day(1) });
    const f = makeTask({ title: 'zeta', priority: 'low', dueDate: day(1) });
    const list = [a, b, c, d, e, f];
    // Priority first (most urgent first), then latest due date first.
    expect(
      sortTasks(list, [
        { key: 'priority', dir: 'asc' },
        { key: 'due', dir: 'desc' },
      ]).map((t) => t.title),
    ).toEqual(['gamma', 'delta', 'epsilon', 'beta', 'zeta', 'Alpha']);
    // Due date first, then priority, then title Z to A.
    expect(
      sortTasks(list, [
        { key: 'due', dir: 'asc' },
        { key: 'priority', dir: 'asc' },
        { key: 'title', dir: 'desc' },
      ]).map((t) => t.title),
    ).toEqual(['epsilon', 'delta', 'zeta', 'Alpha', 'gamma', 'beta']);
    // No rules still gives a stable order (due date, then title).
    expect(sortTasks(list, []).map((t) => t.title)).toEqual(['Alpha', 'delta', 'epsilon', 'zeta', 'beta', 'gamma']);
  });

  it('reads stored sort preferences, including the old single-rule form', () => {
    expect(normalizeSort({ key: 'title', dir: 'desc' })).toEqual([{ key: 'title', dir: 'desc' }]);
    expect(
      normalizeSort([
        { key: 'priority', dir: 'asc' },
        { key: 'due', dir: 'sideways' },
        { key: 'priority', dir: 'desc' },
        { key: 'size' },
        null,
      ]),
    ).toEqual([
      { key: 'priority', dir: 'asc' },
      { key: 'due', dir: 'asc' },
    ]);
    expect(normalizeSort(undefined)).toBe(DEFAULT_SORT);
    expect(normalizeSort([])).toBe(DEFAULT_SORT);
  });

  it('names directions in plain words', () => {
    expect(DIR_LABEL.due.asc).toBe('Soonest first');
    expect(DIR_LABEL.title.desc).toBe('Z to A');
  });
});

describe('done window', () => {
  const recent = walk(makeTask(), [['done', -3]]);
  const edge = walk(makeTask(), [['done', -DONE_WINDOW_DAYS]]);
  const old = walk(makeTask(), [['done', -45]]);
  const open = makeTask();

  it('keeps tasks completed in the last 30 days', () => {
    expect(isRecentlyDone(recent, NOW)).toBe(true);
    expect(isRecentlyDone(edge, NOW)).toBe(true);
    expect(isRecentlyDone(old, NOW)).toBe(false);
    expect(isRecentlyDone(open, NOW)).toBe(false);
    expect(isRecentlyDone({ ...recent, completedAt: null }, NOW)).toBe(false);
  });

  it('shows recent, all, or no done tasks', () => {
    const done = [recent, edge, old];
    expect(visibleDone(done, 'recent', NOW)).toEqual({ shown: [recent, edge], olderHidden: 1 });
    expect(visibleDone(done, 'all', NOW)).toEqual({ shown: done, olderHidden: 0 });
    expect(visibleDone(done, 'hidden', NOW)).toEqual({ shown: [], olderHidden: 0 });
  });
});

describe('markdown', () => {
  it('renders GitHub-flavoured markdown', () => {
    const html = renderMarkdown('# Plan\n\n- [x] done\n- [ ] open\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n~~old~~');
    expect(html).toContain('<h1>Plan</h1>');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('<table>');
    expect(html).toContain('<del>old</del>');
  });

  it('sanitises scripts and opens links in a new tab', () => {
    const html = renderMarkdown('<script>alert(1)</script><img src=x onerror=alert(1)>\n\n[site](https://example.com)');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    // The hook is registered once; a second render still works.
    expect(renderMarkdown('[a](https://a.example)')).toContain('target="_blank"');
  });

  it('leaves anchors without href alone', () => {
    expect(renderMarkdown('<a name="x">x</a>')).not.toContain('target');
  });
});
