import { act, fireEvent, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Insights } from '../src/ui/insights/Insights';
import { BarList, BoxPlotList, columnPath, GroupedColumns, niceStep, ShareBar } from '../src/ui/insights/charts';
import { calendarDay, CalendarView, fitLines, monthGrid, weekLines } from '../src/ui/calendar/CalendarView';
import { DataMenu } from '../src/ui/data/DataMenu';
import { serializeBackup } from '../src/io/backup';
import { changeDueDate } from '../src/model/task';
import { at, day, makeTask, NOW, walk } from './helpers';
import { media } from './setup';

const tasks = () => {
  let rescheduled = makeTask({
    id: 'r',
    title: 'Rescheduled',
    priority: 'high',
    categories: ['Work'],
    dueDate: day(-8),
    created: -12,
  });
  rescheduled = changeDueDate(rescheduled, day(-5), at(-9));
  rescheduled = walk(rescheduled, [
    ['doing', -8],
    ['done', -3],
  ]);
  return [
    makeTask({ id: 'a', title: 'Overdue invoice', priority: 'high', categories: ['Work', 'Home'], dueDate: day(-1) }),
    makeTask({ id: 'b', title: 'Next month', priority: 'low', dueDate: day(30) }),
    walk(makeTask({ id: 'c', title: 'In flight', priority: 'medium', dueDate: day(3), created: -3 }), [['doing', -1]]),
    rescheduled,
  ];
};

describe('Insights', () => {
  it('summarises flow, draws every chart, and lists tasks due this month', async () => {
    render(<Insights tasks={tasks()} now={NOW} />);
    expect(screen.getByRole('heading', { name: 'Insights' })).toBeInTheDocument();
    const flow = screen.getByRole('region', { name: 'How work moves' });
    expect(within(flow).getByText('Median wait before starting').nextSibling).toHaveTextContent('3 days');
    expect(within(flow).getByText('Median time worked').nextSibling).toHaveTextContent('5 days');
    expect(within(flow).getByText('Finished late against the first due date').nextSibling).toHaveTextContent(
      /1 task, median/,
    );
    expect(within(flow).getByText('Finished late against the current due date').nextSibling).toHaveTextContent(
      /1 task, median/,
    );
    expect(within(flow).getByText('Rescheduled tasks').nextSibling).toHaveTextContent(
      '1 (1 due date changes in total)',
    );

    for (const title of [
      'Tasks by status',
      'Tasks by priority',
      'Tasks by category',
      'Time to complete by category',
      'Priority and status',
      'Completed and overdue per week',
    ])
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByLabelText('To do: 2 tasks (50%)')).toBeInTheDocument();
    expect(screen.getByLabelText('High: 2 tasks (50%)')).toBeInTheDocument();
    expect(screen.getByLabelText('Work: 2 tasks')).toBeInTheDocument();
    // Only the rescheduled task is done: started 8 days ago, finished 3 days ago.
    const completion = screen.getByRole('heading', { name: 'Time to complete by category' })
      .parentElement as HTMLElement;
    expect(
      within(completion).getByLabelText('Work: median 5 days, IQR 5 days to 5 days, whiskers 5 days to 5 days, 1 task'),
    ).toBeInTheDocument();
    expect(
      within(completion).getByRole('row', { name: 'Work 5 days 5 days to 5 days 5 days to 5 days 1' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('High, To do: 1 tasks')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Completed and overdue tasks per week' })).toBeInTheDocument();
    expect(screen.getAllByText('Show as table')).toHaveLength(6);

    const month = screen.getByRole('region', { name: 'Due in October 2026' });
    const rows = within(month).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getByRole('link').textContent)).toEqual([
      'Rescheduled',
      'Overdue invoice',
      'In flight',
    ]);
    expect(within(rows[1]).getByText('Overdue, Oct 14')).toHaveClass('is-overdue');
    expect(within(rows[1]).getByRole('link')).toHaveAttribute('href', '#/insights?task=a');
    expect(within(rows[2]).getByText('Medium')).toBeInTheDocument();
  });

  it('shows time to complete in hours or minutes when tasks finish within a day', () => {
    const done = (category: string, hours: number) =>
      walk(makeTask({ categories: [category], created: -5 }), [
        ['doing', -1],
        ['done', -1 + hours / 24],
      ]);
    const card = () =>
      screen.getByRole('heading', { name: 'Time to complete by category' }).parentElement as HTMLElement;
    const ticks = () => [...card().querySelectorAll('.box-ticks span')].map((t) => t.textContent);

    const { rerender } = render(<Insights tasks={[1, 2, 3, 5, 8].map((h) => done('Work', h))} now={NOW} />);
    expect(ticks()).toEqual(['0', '2', '4', '6', '8']);
    expect(card().querySelector('.box-axis')).toHaveTextContent('hours');
    expect(
      within(card()).getByLabelText('Work: median 3 h, IQR 2 h to 5 h, whiskers 1 h to 8 h, 5 tasks'),
    ).toBeInTheDocument();
    expect(within(card()).getByRole('row', { name: 'Work 3 h 2 h to 5 h 1 h to 8 h 5' })).toBeInTheDocument();

    rerender(<Insights tasks={[6, 12, 18, 30].map((m) => done('Quick', m / 60))} now={NOW} />);
    expect(ticks()).toEqual(['0', '10', '20', '30']);
    expect(card().querySelector('.box-axis')).toHaveTextContent('minutes');
    expect(
      within(card()).getByLabelText('Quick: median 15 min, IQR 10.5 min to 21 min, whiskers 6 min to 30 min, 4 tasks'),
    ).toBeInTheDocument();
  });

  it('handles an empty board', () => {
    render(<Insights tasks={[]} now={NOW} />);
    expect(screen.getAllByText('Not enough data yet')).toHaveLength(2);
    expect(screen.getAllByText('No tasks to show yet.')).toHaveLength(3);
    expect(screen.getByText('No completed tasks yet.')).toBeInTheDocument();
    expect(screen.getByText('Nothing is due this month.')).toBeInTheDocument();
    expect(screen.getAllByText(/^0 tasks$/)).toHaveLength(2);
  });

  it('shows "None" for tasks without priority and orders same-day tasks by title', () => {
    render(
      <Insights
        tasks={[
          makeTask({ title: 'Plain', dueDate: day(1) }),
          makeTask({ title: 'Earlier title', priority: 'low', dueDate: day(1) }),
        ]}
        now={NOW}
      />,
    );
    const month = screen.getByRole('region', { name: 'Due in October 2026' });
    expect(within(month).getByText('None')).toBeInTheDocument();
    expect(
      within(month)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Earlier title', 'Plain']);
  });
});

describe('chart parts', () => {
  const data = [
    { key: 'a', label: 'Alpha', value: 3, color: 'red' },
    { key: 'b', label: 'Beta', value: 0, color: 'blue' },
  ];

  it('shows a tooltip on hover and focus', () => {
    render(<ShareBar data={data} unit="items" />);
    const seg = screen.getByLabelText('Alpha: 3 items (100%)');
    expect(screen.queryByLabelText('Beta: 0 items (0%)')).toBeNull();
    fireEvent.pointerEnter(seg);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Alpha: 3 items (100%)');
    fireEvent.pointerLeave(seg);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(seg);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.blur(seg);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('renders bar lists with a custom unit', () => {
    render(<BarList data={data} unit="items" />);
    expect(screen.getByLabelText('Alpha: 3 items')).toHaveStyle({ width: '100%' });
  });

  it('draws box plots on a shared scale from zero', () => {
    const { container } = render(
      <BoxPlotList
        unit="days"
        format={(v) => `${v} d`}
        rows={[
          { key: 'a', label: 'Alpha', count: 5, box: { low: 1, q1: 2, median: 3, q3: 4, high: 8 } },
          { key: 'b', label: 'Beta', count: 1, box: { low: 0.5, q1: 0.5, median: 0.5, q3: 0.5, high: 0.5 } },
        ]}
      />,
    );
    // Whiskers run from 0.5 to 8: steps of 2 from 0 to 8.
    const alpha = screen.getByLabelText('Alpha: median 3 d, IQR 2 d to 4 d, whiskers 1 d to 8 d, 5 tasks');
    expect(alpha.querySelector('.box-whisker')).toHaveStyle({ left: '12.5%', width: '87.5%' });
    expect(alpha.querySelector('.box')).toHaveStyle({ left: '25%', width: '25%' });
    expect(alpha.querySelector('.box-median')).toHaveStyle({ left: '37.5%' });
    expect(
      screen.getByLabelText('Beta: median 0.5 d, IQR 0.5 d to 0.5 d, whiskers 0.5 d to 0.5 d, 1 task'),
    ).toBeInTheDocument();
    expect(screen.getByText('3 d')).toHaveClass('bar-value');
    expect([...container.querySelectorAll('.box-ticks span')].map((t) => t.textContent)).toEqual([
      '0',
      '2',
      '4',
      '6',
      '8',
    ]);
    expect(container.querySelector('.box-axis')).toHaveTextContent('days');
  });

  it('fits box plot scales to the lowest and highest whisker shown', () => {
    const scale = (...boxes: [low: number, high: number][]) => {
      const rows = boxes.map(([low, high], i) => ({
        key: `r${i}`,
        label: `R${i}`,
        count: 1,
        box: { low, q1: low, median: low, q3: high, high },
      }));
      const { container, unmount } = render(<BoxPlotList unit="days" format={String} rows={rows} />);
      const ticks = [...container.querySelectorAll('.box-ticks span')].map((t) => Number(t.textContent));
      const whisker = container.querySelector('.box-whisker') as HTMLElement;
      const place = [whisker.style.left, whisker.style.width];
      act(() => {
        unmount();
      });
      return { ticks, place };
    };
    // Starts below the lowest whisker, not at zero.
    expect(scale([12, 33], [15, 20])).toEqual({ ticks: [10, 20, 30, 40], place: ['6.666666666666667%', '70%'] });
    expect(scale([0, 170])).toEqual({ ticks: [0, 50, 100, 150, 200], place: ['0%', '85%'] });
    // Small ranges get small steps.
    expect(scale([0.25, 0.9]).ticks).toEqual([0.2, 0.4, 0.6, 0.8, 1]);
    // All values equal: a step around the value, or a unit step at zero.
    expect(scale([9, 9]).ticks).toEqual([5, 10]);
    expect(scale([0, 0]).ticks).toEqual([0, 1]);
  });

  it('picks round steps', () => {
    expect([0.03, 1, 1.5, 3, 7, 12].map(niceStep)).toEqual([0.05, 1, 2, 5, 10, 20]);
  });

  it('says when there is nothing to draw box plots from', () => {
    render(<BoxPlotList unit="days" format={String} rows={[]} />);
    expect(screen.getByText('No completed tasks yet.')).toBeInTheDocument();
  });

  it('scales column charts to the measured width', () => {
    let callback: ResizeObserverCallback = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          callback = cb;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const groups = (v: number) => [
      { key: 'w1', label: 'W1', title: 'Week 1', values: [{ key: 'd', label: 'Done', value: v, color: 'red' }] },
      { key: 'w2', label: 'W2', title: 'Week 2', values: [{ key: 'd', label: 'Done', value: 0, color: 'red' }] },
    ];
    const { container, rerender, unmount } = render(<GroupedColumns groups={groups(7)} />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg).toHaveAttribute('width', '640');
    act(() => {
      callback([{ contentRect: { width: 100 } } as ResizeObserverEntry], {} as ResizeObserver);
    });
    expect(svg).toHaveAttribute('width', '280');
    // Ticks round up to a clean maximum.
    expect([...svg.querySelectorAll('.tick')].slice(0, 3).map((t) => t.textContent)).toEqual(['0', '5', '10']);
    rerender(<GroupedColumns groups={groups(17)} />);
    expect(svg.querySelectorAll('.tick')[2].textContent).toBe('20');
    rerender(<GroupedColumns groups={groups(40)} />);
    expect(svg.querySelectorAll('.tick')[2].textContent).toBe('50');
    rerender(<GroupedColumns groups={groups(80)} />);
    expect(svg.querySelectorAll('.tick')[2].textContent).toBe('100');
    expect(screen.getByLabelText('Week 1: 80 done')).toBeInTheDocument();
    expect(screen.queryByLabelText('Week 2: 0 done')).toBeNull();
    act(() => {
      unmount();
    });
    expect(disconnect).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('labels every other week on narrow charts and handles no groups', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      key: `w${i}`,
      label: `W${i}`,
      title: `Week ${i}`,
      values: [{ key: 'd', label: 'Done', value: 1, color: 'red' }],
    }));
    const { container, unmount } = render(<GroupedColumns groups={many} />);
    const labels = [...container.querySelectorAll('.tick')].slice(3).map((t) => t.textContent);
    expect(labels).toEqual(['W1', 'W3', 'W5', 'W7', 'W9', 'W11']);
    unmount();
    render(<GroupedColumns groups={[]} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('draws columns with a rounded top', () => {
    expect(columnPath(0, 100, 10, 20)).toBe('M0,100v-16q0,-4 4,-4h2q4,0 4,4v16z');
    expect(columnPath(0, 100, 10, 2)).toBe('M0,100v0q0,-2 2,-2h6q2,0 2,2v0z');
  });
});

describe('CalendarView', () => {
  const calTasks = () => [
    makeTask({ id: 'h', title: 'Pay rent', priority: 'high', dueDate: day(-1) }),
    makeTask({ id: 'm', title: 'Medium thing', priority: 'medium', dueDate: day(5) }),
    makeTask({ id: 'n', title: 'Plain thing', dueDate: day(5) }),
    walk(makeTask({ id: 'd', title: 'Done thing', priority: 'low', dueDate: day(5) }), [['done', 0]]),
    makeTask({ id: 'l', title: 'Low thing', priority: 'low', dueDate: day(5) }),
    makeTask({ id: 'x', title: 'Next month', dueDate: day(30) }),
    makeTask({ id: 'x2', title: 'Another next month', dueDate: day(30) }),
  ];

  /** jsdom puts the grid at the top of the page, so the window height is the room it fills. */
  const windowHeight = (px: number) => vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(px);

  it('fits chip lines into the grid height', () => {
    // 31px weekdays, 8px frame, 6 × 36px day chrome, 23px per line.
    expect(fitLines(255 + 12 * 23)).toBe(12);
    expect(fitLines(255 + 12 * 23 - 1)).toBe(11);
    expect(fitLines(100)).toBe(0);
  });

  it('shares lines between weeks within bounds', () => {
    // Even share 3.5: rows get 2 to 7 lines. The quiet week is satisfied, the busy one is capped.
    expect(weekLines([0, 4, 20, 0, 0, 0], 21)).toEqual([2, 4, 7, 2, 2, 2]);
    // Plenty of room: quiet weeks still keep half an even share.
    expect(weekLines([1, 1, 1, 1, 1, 1], 60)).toEqual([5, 5, 5, 5, 5, 5]);
    // Spare lines go to the week with the fewest so far; ties go to the earlier week.
    expect(weekLines([5, 5, 0, 0, 0, 0], 13)).toEqual([3, 2, 2, 2, 2, 2]);
    expect(weekLines([5, 5, 0, 0, 0, 0], 14)).toEqual([3, 3, 2, 2, 2, 2]);
    // No room at all: every week still shows one chip and a "more" link.
    expect(weekLines([9, 9, 9, 9, 9, 9], 0)).toEqual([2, 2, 2, 2, 2, 2]);
  });

  it('builds a 6-week grid starting on Monday', () => {
    const grid = monthGrid(new Date(2026, 9, 1));
    expect(grid).toHaveLength(42);
    expect(grid[0]).toEqual(new Date(2026, 8, 28));
  });

  it('places tasks on their due day and links to them', async () => {
    // 13 lines: two for each week, and the spare one for the busy week of October 19.
    windowHeight(24 + 255 + 13 * 23);
    const user = userEvent.setup();
    const onExportCalendar = vi.fn();
    const onExportTasks = vi.fn();
    render(
      <CalendarView tasks={calTasks()} now={NOW} onExportCalendar={onExportCalendar} onExportTasks={onExportTasks} />,
    );
    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeInTheDocument();
    const rent = screen.getByRole('link', { name: 'Pay rent (High priority, overdue)' });
    expect(rent).toHaveAttribute('href', '#/calendar?task=h');
    expect(rent.closest('[role=gridcell]')).toHaveAccessibleName('Wednesday, October 14');
    const today = screen.getByRole('gridcell', { name: 'Thursday, October 15' });
    expect(today).toHaveClass('is-today');

    const grid = screen.getByRole('grid');
    const rows = (...px: number[]) => `auto ${px.map((p) => `minmax(${p}px, 1fr)`).join(' ')}`;
    expect(grid).toHaveStyle({ height: `${255 + 13 * 23}px` });
    expect(grid.style.gridTemplateRows).toBe(rows(82, 82, 82, 105, 82, 82));

    const busy = screen.getByRole('gridcell', { name: 'Tuesday, October 20' });
    expect(
      within(busy)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Medium thing', 'Low thing']);
    await user.click(within(busy).getByRole('button', { name: '2 more' }));
    expect(within(busy).getByRole('link', { name: 'Done thing (Low priority, done)' })).toHaveClass('is-done');
    // The open day's week grows to fit every task and the "Show fewer" link.
    expect(grid.style.gridTemplateRows).toBe(rows(82, 82, 82, 151, 82, 82));
    expect(grid).toHaveStyle({ height: `${31 + 8 + 5 * 82 + 151}px` });
    await user.click(within(busy).getByRole('button', { name: 'Show fewer' }));
    expect(within(busy).getAllByRole('link')).toHaveLength(2);
    expect(within(busy).getByRole('link', { name: 'Low thing (Low priority)' })).toBeInTheDocument();

    // A taller window fits the whole day.
    windowHeight(768);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(within(busy).getAllByRole('link')).toHaveLength(4);
    expect(within(busy).queryByRole('button')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Export calendar (.ics)' }));
    expect(onExportCalendar).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Export tasks for Thunderbird (.ics)' }));
    expect(onExportTasks).toHaveBeenCalled();
  });

  it('stops following the window size when it closes', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(
      <CalendarView tasks={calTasks()} now={NOW} onExportCalendar={vi.fn()} onExportTasks={vi.fn()} />,
    );
    act(() => {
      unmount();
    });
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('moves between months', async () => {
    const user = userEvent.setup();
    render(<CalendarView tasks={calTasks()} now={NOW} onExportCalendar={vi.fn()} onExportTasks={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('heading', { name: 'November 2026' })).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: 'Saturday, October 31' })).toHaveClass('is-outside');
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeInTheDocument();
  });

  it('shows an agenda list on small screens', async () => {
    media.matches = (q) => q.includes('640');
    const user = userEvent.setup();
    render(<CalendarView tasks={calTasks()} now={NOW} onExportCalendar={vi.fn()} onExportTasks={vi.fn()} />);
    expect(screen.queryByRole('grid')).toBeNull();
    const days = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(days).toEqual(['Wednesday, October 14', 'Tuesday, October 20']);
    expect(screen.getAllByRole('link')).toHaveLength(5);
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByText('Nothing is due this month.')).toBeInTheDocument();
  });

  it('marks today in the agenda', () => {
    media.matches = () => true;
    render(
      <CalendarView
        tasks={[makeTask({ title: 'Today', dueDate: day(0) })]}
        now={NOW}
        onExportCalendar={vi.fn()}
        onExportTasks={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Thursday, October 15' }).closest('li')).toHaveClass('is-today');
  });

  describe('completed view', () => {
    const finished = () => [
      // Due later, but finished two days ago (Oct 13).
      walk(makeTask({ id: 'early', title: 'Finished early', priority: 'high', dueDate: day(10) }), [['done', -2]]),
      // Overdue when it was finished on Oct 13 too, a few hours before the one above; no overdue styling in this view.
      walk(makeTask({ id: 'late', title: 'Finished late', dueDate: day(-5) }), [['done', -2.25]]),
      // Finished last month.
      walk(makeTask({ id: 'sept', title: 'September work', dueDate: day(-30) }), [['done', -25]]),
      // Reopened after being done: no completion date any more.
      walk(makeTask({ id: 'reopened', title: 'Reopened', dueDate: day(1) }), [
        ['done', -3],
        ['doing', -1],
      ]),
      makeTask({ id: 'open', title: 'Still open', dueDate: day(2) }),
    ];

    it('places only finished tasks, on the day they were completed', () => {
      const [early, , sept, reopened, open] = finished();
      expect(calendarDay(early, 'completed')).toBe(day(-2));
      expect(calendarDay(early, 'due')).toBe(day(10));
      expect(calendarDay(sept, 'completed')).toBe(day(-25));
      expect(calendarDay(reopened, 'completed')).toBeNull();
      expect(calendarDay(open, 'completed')).toBeNull();
      expect(calendarDay({ ...early, completedAt: null }, 'completed')).toBeNull();
    });

    it('switches between due dates (the default) and completed tasks', async () => {
      const user = userEvent.setup();
      render(<CalendarView tasks={finished()} now={NOW} onExportCalendar={vi.fn()} onExportTasks={vi.fn()} />);
      const due = screen.getByRole('button', { name: 'Due dates' });
      const completed = screen.getByRole('button', { name: 'Completed' });
      expect(due).toHaveAttribute('aria-pressed', 'true');
      expect(completed).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('grid', { name: 'October 2026, due dates' })).toBeInTheDocument();
      expect(screen.getByText('4 tasks due this month')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Finished late (done)' })).toHaveClass('is-done');

      await user.click(completed);
      expect(completed).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('grid', { name: 'October 2026, completed tasks' })).toBeInTheDocument();
      expect(screen.getByText('2 tasks completed this month')).toBeInTheDocument();
      expect(screen.getByText(/on the day they were moved to Done/)).toBeInTheDocument();
      const day13 = screen.getByRole('gridcell', { name: 'Tuesday, October 13' });
      expect(
        within(day13)
          .getAllByRole('link')
          .map((l) => l.textContent),
      ).toEqual(['Finished late', 'Finished early']);
      const late = within(day13).getByRole('link', { name: 'Finished late' });
      expect(late).not.toHaveClass('is-done');
      expect(late).not.toHaveClass('is-overdue');
      expect(late).toHaveAttribute('href', '#/calendar?task=late');
      expect(within(day13).getByRole('link', { name: 'Finished early (High priority)' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Reopened|Still open/ })).toBeNull();

      await user.click(screen.getByRole('button', { name: 'Previous month' }));
      expect(screen.getByText('1 task completed this month')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'September work' })).toBeInTheDocument();

      await user.click(due);
      expect(screen.getByRole('grid', { name: 'September 2026, due dates' })).toBeInTheDocument();
      expect(screen.getByText('1 task due this month')).toBeInTheDocument();
    });

    it('orders a day by completion time, then by title for simultaneous completions', async () => {
      const user = userEvent.setup();
      const tasks = [
        walk(makeTask({ title: 'Zebra', priority: 'high' }), [['done', -1]]),
        walk(makeTask({ title: 'Beta' }), [['done', -1]]),
        walk(makeTask({ title: 'Alpha' }), [['done', -1]]),
        walk(makeTask({ title: 'First' }), [['done', -1.25]]),
      ];
      render(<CalendarView tasks={tasks} now={NOW} onExportCalendar={vi.fn()} onExportTasks={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'Completed' }));
      const day14 = screen.getByRole('gridcell', { name: 'Wednesday, October 14' });
      expect(
        within(day14)
          .getAllByRole('link')
          .map((l) => l.textContent),
      ).toEqual(['First', 'Alpha', 'Beta', 'Zebra']);
    });

    it('shows an empty completed month in the agenda', async () => {
      media.matches = () => true;
      const user = userEvent.setup();
      render(<CalendarView tasks={finished()} now={NOW} onExportCalendar={vi.fn()} onExportTasks={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'Completed' }));
      expect(screen.getByRole('heading', { name: 'Tuesday, October 13' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Next month' }));
      expect(screen.getByText('Nothing was completed this month.')).toBeInTheDocument();
      expect(screen.getByText('0 tasks completed this month')).toBeInTheDocument();
    });
  });
});

describe('DataMenu', () => {
  function setup(taskCount = 2) {
    const props = {
      taskCount,
      onBackup: vi.fn(),
      onExportTasks: vi.fn(),
      onExportCalendar: vi.fn(),
      onRestore: vi.fn(),
      onError: vi.fn(),
      onFolderBackup: vi.fn(),
      folderBackupOn: false,
    };
    render(<DataMenu {...props} />);
    return props;
  }
  const backupFile = (n: number) =>
    new File(
      [
        serializeBackup(
          { tasks: Array.from({ length: n }, (_, i) => makeTask({ id: `b${i}` })), tags: [], categories: [] },
          NOW,
        ),
      ],
      'backup.json',
      {
        type: 'application/json',
      },
    );

  it('opens, runs actions, and closes', async () => {
    const user = userEvent.setup();
    const p = setup();
    const toggle = screen.getByRole('button', { name: 'Data' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/saved only in this browser/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back up tasks (.json)' }));
    expect(p.onBackup).toHaveBeenCalled();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: 'Export tasks for Thunderbird (.ics)' }));
    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: 'Export calendar (.ics)' }));
    expect(p.onExportTasks).toHaveBeenCalled();
    expect(p.onExportCalendar).toHaveBeenCalled();
  });

  it('closes on Escape and outside clicks', async () => {
    const user = userEvent.setup();
    setup();
    const toggle = screen.getByRole('button', { name: 'Data' });
    await user.click(toggle);
    await user.keyboard('a');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    await user.click(screen.getByText(/saved only/));
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // The outside-click listener attaches after paint.
    await vi.waitFor(() => {
      fireEvent.mouseDown(document.body);
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('restores a backup by replacing or merging', async () => {
    const user = userEvent.setup();
    const p = setup(1);
    const click = vi.spyOn(HTMLInputElement.prototype, 'click');
    await user.click(screen.getByRole('button', { name: 'Data' }));
    await user.click(screen.getByRole('button', { name: 'Restore from backup' }));
    expect(click).toHaveBeenCalled();
    const input = screen.getByTestId('restore-input') as HTMLInputElement;

    await user.upload(input, backupFile(3));
    const dialog = await screen.findByRole('dialog', { name: 'Restore from backup' });
    expect(dialog).toHaveTextContent('The backup holds 3 tasks. This board has 1.');
    await user.click(within(dialog).getByRole('button', { name: 'Replace tasks' }));
    expect(p.onRestore).toHaveBeenLastCalledWith(expect.objectContaining({ tasks: expect.any(Array) }), 'replace');
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.upload(input, backupFile(1));
    const again = await screen.findByRole('dialog');
    expect(again).toHaveTextContent('The backup holds 1 task.');
    await user.click(within(again).getByRole('button', { name: 'Merge tasks' }));
    expect(p.onRestore).toHaveBeenLastCalledWith(expect.anything(), 'merge');

    await user.upload(input, backupFile(1));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.upload(input, backupFile(1));
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(p.onRestore).toHaveBeenCalledTimes(2);
  });

  it('reports files that are not backups', async () => {
    const p = setup();
    const input = screen.getByTestId('restore-input') as HTMLInputElement;
    await userEvent.upload(input, new File(['nope'], 'x.json', { type: 'application/json' }));
    await vi.waitFor(() => expect(p.onError).toHaveBeenCalledWith(expect.stringMatching(/not valid JSON/)));
    fireEvent.change(input, { target: { files: [] } });
    expect(p.onError).toHaveBeenCalledTimes(1);
  });
});
