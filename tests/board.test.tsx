import { act, createEvent, fireEvent, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { useState } from 'preact/hooks';
import { describe, expect, it, vi } from 'vitest';
import { Board } from '../src/ui/board/Board';
import { DRAG_TYPE } from '../src/ui/board/TaskCard';
import { DEFAULT_PREFS, type Prefs } from '../src/store/storage';
import { moveTask, type Status, type Task } from '../src/model/task';
import { day, makeTask, NOW, walk } from './helpers';

function dataTransfer() {
  const data: Record<string, string> = {};
  return {
    data,
    get types() {
      return Object.keys(data);
    },
    setData: (k: string, v: string) => (data[k] = v),
    getData: (k: string) => data[k] ?? '',
    effectAllowed: '',
    dropEffect: '',
  };
}

const sample = (): Task[] => [
  makeTask({
    id: 'inv',
    title: 'Send invoice',
    priority: 'high',
    tags: ['finance'],
    categories: ['Work'],
    dueDate: day(-1),
    description: 'Attach the PDF',
  }),
  makeTask({
    id: 'bike',
    title: 'Book bike service',
    priority: 'low',
    categories: ['Home'],
    dueDate: day(9),
    created: -20,
  }),
  makeTask({ id: 'tax', title: 'Collect receipts', priority: 'medium', tags: ['finance'], dueDate: day(2) }),
  walk(makeTask({ id: 'api', title: 'Draft API proposal', dueDate: day(4) }), [['doing', -1]]),
  walk(makeTask({ id: 'slides', title: 'Retro slides', dueDate: day(-3) }), [['done', -2]]),
  walk(makeTask({ id: 'old', title: 'Migrate notes', dueDate: day(-50), created: -60 }), [['done', -45]]),
];

function Harness({
  tasks = sample(),
  initialPrefs = DEFAULT_PREFS,
  onMove = vi.fn(),
  onOpen = vi.fn(),
  onAdd = vi.fn(),
}) {
  const [prefs, setPrefs] = useState<Prefs>(initialPrefs);
  const [list, setList] = useState(tasks);
  return (
    <Board
      tasks={list}
      tags={['finance']}
      categories={['Home', 'Work']}
      prefs={prefs}
      now={NOW}
      savedId="tax"
      onOpen={onOpen}
      onAdd={onAdd}
      onMove={(id: string, status: Status) => {
        onMove(id, status);
        setList((l) => l.map((t) => (t.id === id ? moveTask(t, status, NOW) : t)));
      }}
      onPrefs={(p) => setPrefs({ ...prefs, ...p })}
    />
  );
}

const column = (name: string) => screen.getByRole('region', { name });
const titles = (name: string) =>
  within(column(name))
    .queryAllByRole('button')
    .filter((b) => b.classList.contains('card-button'))
    .map((b) => b.querySelector('.card-title')?.textContent);

describe('Board', () => {
  it('shows the three columns with collapsed cards and totals', () => {
    render(<Harness />);
    expect(titles('To do')).toEqual(['Send invoice', 'Collect receipts', 'Book bike service']);
    expect(titles('In progress')).toEqual(['Draft API proposal']);
    expect(titles('Done')).toEqual(['Retro slides']);
    const card = screen.getByRole('button', { name: /Send invoice/ });
    expect(card).toHaveAccessibleName(
      'Send invoice, High priority, overdue, was due Oct 14, category Work, tag finance',
    );
    expect(card).toHaveTextContent('Overdue');
    expect(card).not.toHaveTextContent('Attach the PDF');
    expect(screen.getByRole('button', { name: /Draft API proposal/ })).toHaveAccessibleName(
      'Draft API proposal, No priority, due Oct 19',
    );
    // Categories and tags appear on the card, styled apart.
    expect(card.querySelector('.card-category')).toHaveTextContent('Work');
    expect(card.querySelector('.card-tag')).toHaveTextContent('#finance');
    expect(screen.getByRole('button', { name: /Draft API proposal/ }).querySelector('.card-labels')).toBeNull();
    expect(screen.getByRole('button', { name: /Collect receipts/ }).closest('li')).toHaveClass('just-saved');
    const totals = screen.getByRole('list', { name: 'Board totals' });
    expect(totals).toHaveTextContent('3 to do');
    expect(totals).toHaveTextContent('1 in progress');
    expect(totals).toHaveTextContent('2 done');
    expect(totals).toHaveTextContent('1 overdue');
    expect(totals).toHaveTextContent('2 due this week');
    expect(totals).toHaveTextContent(/median to complete/);
  });

  it('names several categories and tags in the plural', () => {
    render(
      <Harness
        tasks={[
          makeTask({ id: 'm', title: 'Multi', categories: ['Work', 'Home'], tags: ['a', 'b'] }),
          makeTask({ id: 't', title: 'Tagged', tags: ['solo'] }),
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: /^Multi/ })).toHaveAccessibleName(/categories Work, Home, tags a, b$/);
    expect(screen.getByRole('button', { name: /^Tagged/ })).toHaveAccessibleName(/due Oct 18, tag solo$/);
  });

  it('renders long columns in steps of 100 cards', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 250 }, (_, i) =>
      makeTask({ id: `p${i}`, title: `Task ${String(i).padStart(3, '0')}` }),
    );
    render(<Harness tasks={many} />);
    const todo = column('To do');
    expect(within(todo).getByText('250')).toBeInTheDocument();
    expect(todo.querySelectorAll('.card')).toHaveLength(100);
    await user.click(within(todo).getByRole('button', { name: 'Show 100 more (150 not shown)' }));
    expect(todo.querySelectorAll('.card')).toHaveLength(200);
    await user.click(within(todo).getByRole('button', { name: 'Show 50 more (50 not shown)' }));
    expect(todo.querySelectorAll('.card')).toHaveLength(250);
    expect(within(todo).queryByRole('button', { name: /more/ })).toBeNull();
  }, 20_000);

  it('opens a task when its card is clicked', async () => {
    const onOpen = vi.fn();
    render(<Harness onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: /Book bike/ }));
    expect(onOpen).toHaveBeenCalledWith('bike');
  });

  it('moves cards by drag and drop', () => {
    const onMove = vi.fn();
    render(<Harness onMove={onMove} />);
    const card = screen.getByRole('button', { name: /Book bike/ }).closest('li') as HTMLElement;
    const dt = dataTransfer();
    fireEvent.dragStart(card, { dataTransfer: dt });
    expect(card).toHaveClass('is-dragging');
    expect(dt.data[DRAG_TYPE]).toBe('bike');
    expect(dt.effectAllowed).toBe('move');
    const target = column('Done');
    fireEvent.dragOver(target, { dataTransfer: dt });
    expect(target).toHaveClass('is-drop-target');
    expect(dt.dropEffect).toBe('move');
    const leave = (related: Element) => {
      const ev = createEvent.dragLeave(target, { dataTransfer: dt });
      Object.defineProperty(ev, 'relatedTarget', { value: related });
      fireEvent(target, ev);
    };
    leave(target.querySelector('li') as Element);
    expect(target).toHaveClass('is-drop-target');
    leave(document.body);
    expect(target).not.toHaveClass('is-drop-target');
    fireEvent.dragEnd(card);
    expect(card).not.toHaveClass('is-dragging');
    fireEvent.drop(target, { dataTransfer: dt });
    expect(onMove).toHaveBeenCalledWith('bike', 'done');
    expect(titles('Done')).toContain('Book bike service');
  });

  it('ignores drags that are not task cards', () => {
    const onMove = vi.fn();
    render(<Harness onMove={onMove} />);
    const target = column('In progress');
    const dt = dataTransfer();
    dt.setData('text/plain', 'hello');
    fireEvent.dragOver(target, { dataTransfer: dt });
    expect(target).not.toHaveClass('is-drop-target');
    fireEvent.drop(target, { dataTransfer: dt });
    expect(onMove).not.toHaveBeenCalled();
  });

  it('moves the focused card with Alt+arrow keys', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    render(<Harness onMove={onMove} />);
    screen.getByRole('button', { name: /Draft API/ }).focus();
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
    expect(onMove).toHaveBeenLastCalledWith('api', 'done');
    screen.getByRole('button', { name: /Draft API/ }).focus();
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
    expect(onMove).toHaveBeenCalledTimes(1);
    await user.keyboard('{ArrowLeft}');
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(onMove).toHaveBeenCalledTimes(1);
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}');
    expect(onMove).toHaveBeenLastCalledWith('api', 'doing');
  });

  it('searches titles and descriptions, and clears with Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.keyboard('/');
    const search = screen.getByRole('searchbox', { name: 'Search tasks' });
    expect(search).toHaveFocus();
    await user.type(search, 'pdf');
    expect(titles('To do')).toEqual(['Send invoice']);
    expect(screen.getAllByText(/No tasks here match/)).toHaveLength(2);
    expect(screen.getByText(/Showing 1 of 6 tasks/)).toBeInTheDocument();
    // Typing "/" inside a field types it.
    await user.type(search, '/');
    expect(search).toHaveValue('pdf/');
    await user.keyboard('{Escape}');
    expect(search).toHaveValue('');
    await user.keyboard('{Escape}');
    expect(titles('To do')).toHaveLength(3);
  });

  it('does not steal "/" while a dialog is open', async () => {
    render(<Harness />);
    document.body.classList.add('has-modal');
    await userEvent.keyboard('/');
    expect(screen.getByRole('searchbox')).not.toHaveFocus();
  });

  it('sorts by priority and title in both directions', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.selectOptions(screen.getByLabelText('Sort by'), 'Priority');
    expect(titles('To do')).toEqual(['Send invoice', 'Collect receipts', 'Book bike service']);
    await user.click(screen.getByRole('button', { name: 'Highest first' }));
    expect(titles('To do')).toEqual(['Book bike service', 'Collect receipts', 'Send invoice']);
    await user.selectOptions(screen.getByLabelText('Sort by'), 'Title');
    expect(screen.getByRole('button', { name: 'Z to A' })).toBeInTheDocument();
    expect(titles('To do')).toEqual(['Send invoice', 'Collect receipts', 'Book bike service']);
    await user.click(screen.getByRole('button', { name: 'Z to A' }));
    expect(titles('To do')).toEqual(['Book bike service', 'Collect receipts', 'Send invoice']);
  });

  it('sorts by several criteria and edits the sort levels', async () => {
    const user = userEvent.setup();
    const tasks = [
      makeTask({ id: '1', title: 'Low soon', priority: 'low', dueDate: day(1) }),
      makeTask({ id: '2', title: 'High late', priority: 'high', dueDate: day(8) }),
      makeTask({ id: '3', title: 'High soon', priority: 'high', dueDate: day(2) }),
      makeTask({ id: '4', title: 'Low late', priority: 'low', dueDate: day(6) }),
    ];
    render(<Harness tasks={tasks} />);
    const sorting = screen.getByRole('group', { name: 'Sorting' });
    expect(within(sorting).queryByRole('button', { name: /^Remove sort/ })).toBeNull();
    await user.selectOptions(screen.getByLabelText('Sort by'), 'Priority');
    expect(titles('To do')).toEqual(['High soon', 'High late', 'Low soon', 'Low late']);

    await user.click(within(sorting).getByRole('button', { name: 'Add sort' }));
    const second = screen.getByLabelText('then by (level 2)');
    // A new level starts with the first key not yet used.
    expect(second).toHaveValue('due');
    await user.click(within(sorting).getByRole('button', { name: 'Soonest first' }));
    expect(titles('To do')).toEqual(['High late', 'High soon', 'Low late', 'Low soon']);

    await user.click(within(sorting).getByRole('button', { name: 'Add sort' }));
    expect(screen.getByLabelText('then by (level 3)')).toHaveValue('title');
    // Swapping two levels leaves the third one alone.
    await user.selectOptions(screen.getByLabelText('then by (level 2)'), 'Priority');
    expect(screen.getByLabelText('Sort by')).toHaveValue('due');
    expect(screen.getByLabelText('then by (level 3)')).toHaveValue('title');
    await user.selectOptions(screen.getByLabelText('then by (level 2)'), 'Due date');
    expect(screen.getByLabelText('Sort by')).toHaveValue('priority');
    expect(within(sorting).queryByRole('button', { name: 'Add sort' })).toBeNull();
    await user.click(within(sorting).getByRole('button', { name: 'Remove sort by title' }));

    // Picking a key used by another level swaps the levels (keeping each level's direction).
    await user.selectOptions(screen.getByLabelText('Sort by'), 'Due date');
    expect(screen.getByLabelText('then by (level 2)')).toHaveValue('priority');
    expect(within(sorting).getByRole('button', { name: 'Latest first' })).toBeInTheDocument();
    expect(titles('To do')).toEqual(['High late', 'Low late', 'High soon', 'Low soon']);
    await user.click(within(sorting).getByRole('button', { name: 'Latest first' }));
    expect(titles('To do')).toEqual(['Low soon', 'High soon', 'Low late', 'High late']);
    // Choosing an unused key just changes that level.
    await user.selectOptions(screen.getByLabelText('then by (level 2)'), 'Title');
    expect(titles('To do')).toEqual(['Low soon', 'High soon', 'Low late', 'High late']);
    await user.selectOptions(screen.getByLabelText('then by (level 2)'), 'Priority');

    await user.click(within(sorting).getByRole('button', { name: 'Remove sort by due date' }));
    expect(screen.getByLabelText('Sort by')).toHaveValue('priority');
    expect(screen.queryByLabelText('then by (level 2)')).toBeNull();
  });

  it('filters by tags, categories and date ranges', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const toggle = screen.getByRole('button', { name: 'Filters' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('group', { name: 'Filters' });
    await user.click(within(panel).getByRole('button', { name: 'finance' }));
    expect(titles('To do')).toEqual(['Send invoice', 'Collect receipts']);
    expect(screen.getByRole('button', { name: 'Filters (1)' })).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'finance' }));
    await user.click(within(panel).getByRole('button', { name: 'Home' }));
    expect(titles('To do')).toEqual(['Book bike service']);
    await user.click(within(panel).getByRole('button', { name: 'Home' }));

    fireEvent.input(screen.getByLabelText('Due between: from'), { target: { value: day(0) } });
    fireEvent.input(screen.getByLabelText('Due between: to'), { target: { value: day(5) } });
    expect(titles('To do')).toEqual(['Collect receipts']);
    expect(screen.getByLabelText('Due between: to')).toHaveAttribute('min', day(0));
    expect(screen.getByRole('button', { name: 'Filters (1)' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear search and filters' }));
    expect(titles('To do')).toHaveLength(3);

    fireEvent.input(screen.getByLabelText('Created between: to'), { target: { value: day(-10) } });
    expect(titles('To do')).toEqual(['Book bike service']);
    expect(screen.getByLabelText('Created between: from')).toHaveAttribute('max', day(-10));
    fireEvent.input(screen.getByLabelText('Created between: from'), { target: { value: day(-30) } });
    expect(titles('To do')).toEqual(['Book bike service']);
    await user.click(toggle);
    expect(screen.queryByRole('group', { name: 'Filters' })).toBeNull();
  });

  it('explains how to get tags and categories when there are none', async () => {
    render(
      <Board
        tasks={sample()}
        tags={[]}
        categories={[]}
        prefs={DEFAULT_PREFS}
        now={NOW}
        savedId={null}
        onOpen={vi.fn()}
        onAdd={vi.fn()}
        onMove={vi.fn()}
        onPrefs={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.getByText(/No tags yet/)).toBeInTheDocument();
    expect(screen.getByText(/No categories yet/)).toBeInTheDocument();
  });

  it('filters from the overdue and due-this-week totals', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const overdue = screen.getByRole('button', { name: /^\d+ overdue$/ });
    await user.click(overdue);
    expect(overdue).toHaveAttribute('aria-pressed', 'true');
    expect(titles('To do')).toEqual(['Send invoice']);
    expect(screen.getByText('Overdue only')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /due this week/ }));
    expect(titles('To do')).toEqual(['Send invoice', 'Collect receipts']);
    expect(screen.getByText('Due this week only')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /due this week/ }));
    expect(titles('To do')).toHaveLength(3);
  });

  it('shows done tasks from the last 30 days and loads the rest on request', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(within(column('Done')).getByText('Last 30 days')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load all done tasks (1 older)' }));
    expect(titles('Done')).toEqual(['Migrate notes', 'Retro slides']);
    expect(within(column('Done')).getByText('All time')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show last 30 days only' }));
    expect(titles('Done')).toEqual(['Retro slides']);
  });

  it('says when only older done tasks exist', () => {
    render(<Harness tasks={[walk(makeTask({ id: 'o' }), [['done', -40]])]} />);
    expect(within(column('Done')).getByText('Nothing finished in the last 30 days.')).toBeInTheDocument();
    expect(within(column('To do')).getByText(/Nothing waiting/)).toBeInTheDocument();
    expect(within(column('In progress')).getByText(/Drag a task here when you start/)).toBeInTheDocument();
  });

  it('hides the done column completely', async () => {
    const user = userEvent.setup();
    render(<Harness tasks={[makeTask({ id: 'a' })]} />);
    expect(within(column('Done')).getByText('Drag a task here when it is finished.')).toBeInTheDocument();
    expect(screen.getByText('No completed tasks yet')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Hide done tasks'));
    expect(screen.queryByRole('region', { name: 'Done' })).toBeNull();
    await user.click(screen.getByLabelText('Hide done tasks'));
    expect(column('Done')).toBeInTheDocument();
  });

  it('invites the first task on an empty board', async () => {
    const onAdd = vi.fn();
    render(<Harness tasks={[]} onAdd={onAdd} />);
    expect(screen.getByRole('heading', { name: 'Your board is empty' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Board totals' })).toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    expect(onAdd).toHaveBeenCalled();
  });

  it('removes its keyboard listener when unmounted', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<Harness />);
    act(() => {
      unmount();
    });
    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
