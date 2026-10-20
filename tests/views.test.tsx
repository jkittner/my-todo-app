import { act, fireEvent, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Insights } from '../src/ui/insights/Insights';
import { BarList, columnPath, GroupedColumns, ShareBar } from '../src/ui/insights/charts';
import { calendarDay, CalendarView, monthGrid } from '../src/ui/calendar/CalendarView';
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
      'Priority and status',
      'Completed and overdue per week',
    ])
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByLabelText('To do: 2 tasks (50%)')).toBeInTheDocument();
    expect(screen.getByLabelText('High: 2 tasks (50%)')).toBeInTheDocument();
    expect(screen.getByLabelText('Work: 2 tasks')).toBeInTheDocument();
    expect(screen.getByLabelText('High, To do: 1 tasks')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Completed and overdue tasks per week' })).toBeInTheDocument();
    expect(screen.getAllByText('Show as table')).toHaveLength(5);

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

  it('handles an empty board', () => {
    render(<Insights tasks={[]} now={NOW} />);
    expect(screen.getAllByText('Not enough data yet')).toHaveLength(2);
    expect(screen.getAllByText('No tasks to show yet.')).toHaveLength(3);
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

  it('builds a 6-week grid starting on Monday', () => {
    const grid = monthGrid(new Date(2026, 9, 1));
    expect(grid).toHaveLength(42);
    expect(grid[0]).toEqual(new Date(2026, 8, 28));
  });

  it('places tasks on their due day and links to them', async () => {
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

    const busy = screen.getByRole('gridcell', { name: 'Tuesday, October 20' });
    expect(
      within(busy)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Medium thing', 'Low thing', 'Plain thing']);
    await user.click(within(busy).getByRole('button', { name: '1 more' }));
    expect(within(busy).getByRole('link', { name: 'Done thing (Low priority, done)' })).toHaveClass('is-done');
    await user.click(within(busy).getByRole('button', { name: 'Show fewer' }));
    expect(within(busy).getAllByRole('link')).toHaveLength(3);
    expect(within(busy).getByRole('link', { name: 'Plain thing' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Export calendar (.ics)' }));
    expect(onExportCalendar).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Export tasks for Thunderbird (.ics)' }));
    expect(onExportTasks).toHaveBeenCalled();
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
      await user.click(within(day14).getByRole('button', { name: '1 more' }));
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
