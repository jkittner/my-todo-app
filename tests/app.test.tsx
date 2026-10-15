import { act, fireEvent, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/ui/App';
import { emptyDb, STORAGE_KEY, type Db } from '../src/store/storage';
import { serializeBackup } from '../src/io/backup';
import { downloadText } from '../src/io/download';
import { day, makeTask, NOW, walk } from './helpers';

vi.mock('../src/io/download', async (orig) => ({
  ...(await orig<typeof import('../src/io/download')>()),
  downloadText: vi.fn(),
}));

const seeded = (): Db => ({
  ...emptyDb(),
  tasks: [
    makeTask({ id: 'inv', title: 'Send invoice', priority: 'high', dueDate: day(-1) }),
    walk(makeTask({ id: 'api', title: 'Draft API proposal', dueDate: day(3) }), [['doing', 0]]),
  ],
  tags: ['finance'],
});

function start(db: Db = seeded(), opts: { error?: string; save?: (db: Db) => boolean } = {}) {
  const save = vi.fn(opts.save ?? (() => true));
  render(<App load={() => ({ db, error: opts.error })} save={save} />);
  return { save };
}

const go = async (hash: string) =>
  act(async () => {
    location.hash = hash;
    await new Promise((r) => setTimeout(r, 0));
  });

const lastSaved = (save: ReturnType<typeof vi.fn>) => save.mock.calls.at(-1)?.[0] as Db;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.mocked(downloadText).mockClear();
});

describe('App', () => {
  it('shows the board with navigation and a page title', async () => {
    start();
    expect(screen.getByRole('link', { name: 'Board' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('region', { name: 'To do' })).toBeInTheDocument();
    await vi.waitFor(() => expect(document.title).toBe('Board, Todo board'));
    await go('#/insights');
    expect(screen.getByRole('heading', { name: 'Insights' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Insights' })).toHaveAttribute('aria-current', 'page');
    await vi.waitFor(() => expect(document.title).toBe('Insights, Todo board'));
    await go('#/calendar');
    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeInTheDocument();
  });

  it('adds a task through the modal and saves it', async () => {
    const user = userEvent.setup();
    const { save } = start();
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    const dialog = screen.getByRole('dialog', { name: 'Add task' });
    await user.type(within(dialog).getByLabelText('Title'), 'Water plants');
    fireEvent.input(within(dialog).getByLabelText('Due date'), { target: { value: day(1) } });
    await user.type(within(dialog).getByLabelText('Tags'), 'home{Enter}');
    await user.click(within(dialog).getByRole('button', { name: 'Add task' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Task added');
    const card = screen.getByRole('button', { name: /Water plants/ });
    expect(card.closest('li')).toHaveClass('just-saved');
    await vi.waitFor(() => expect(lastSaved(save).tasks.map((t) => t.title)).toContain('Water plants'));
    expect(lastSaved(save).tags).toEqual(['finance', 'home']);
    await vi.waitFor(() => expect(card.closest('li')).not.toHaveClass('just-saved'), { timeout: 3000 });
  });

  it('opens a task from the link, edits it and returns to the board', async () => {
    const user = userEvent.setup();
    const { save } = start();
    await user.click(screen.getByRole('button', { name: /Send invoice/ }));
    expect(location.hash).toBe('#/board?task=inv');
    const dialog = await screen.findByRole('dialog', { name: 'Edit task' });
    await user.selectOptions(within(dialog).getByLabelText('Status'), 'Done');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await vi.waitFor(() => expect(location.hash).toBe('#/board'));
    expect(screen.getByRole('status')).toHaveTextContent('Changes saved');
    await vi.waitFor(() => expect(lastSaved(save).tasks.find((t) => t.id === 'inv')?.status).toBe('done'));
    expect(
      within(screen.getByRole('region', { name: 'Done' })).getByRole('button', { name: /Send invoice/ }),
    ).toBeInTheDocument();
  });

  it('opens tasks from insights and calendar without leaving the page', async () => {
    const user = userEvent.setup();
    start();
    await go('#/insights');
    await user.click(screen.getByRole('link', { name: 'Send invoice' }));
    await vi.waitFor(() => expect(location.hash).toBe('#/insights?task=inv'));
    expect(await screen.findByRole('dialog', { name: 'Edit task' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Insights' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await vi.waitFor(() => expect(location.hash).toBe('#/insights'));
    expect(screen.getByRole('heading', { name: 'Insights' })).toBeInTheDocument();

    await go('#/calendar');
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await user.click(screen.getByRole('link', { name: /Draft API proposal/ }));
    await vi.waitFor(() => expect(location.hash).toBe('#/calendar?task=api'));
    expect(await screen.findByRole('dialog', { name: 'Edit task' })).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: 'October 2026' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await vi.waitFor(() => expect(location.hash).toBe('#/calendar'));
    expect(screen.getByRole('grid', { name: 'October 2026' })).toBeInTheDocument();
  });

  it('closes the edit modal without saving', async () => {
    const user = userEvent.setup();
    start();
    await go('#/calendar?task=api');
    const dialog = screen.getByRole('dialog', { name: 'Edit task' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await vi.waitFor(() => expect(location.hash).toBe('#/calendar'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('deletes a task without reporting it missing', async () => {
    const user = userEvent.setup();
    start();
    await go('#/board?task=inv');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete task' }));
    await vi.waitFor(() => expect(location.hash).toBe('#/board'));
    expect(screen.getByRole('status')).toHaveTextContent('Task deleted');
    expect(screen.queryByRole('button', { name: /Send invoice/ })).toBeNull();
  });

  it('reports links to tasks that no longer exist', async () => {
    start();
    await go('#/insights?task=gone');
    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('That task no longer exists.'));
    await vi.waitFor(() => expect(location.hash).toBe('#/insights'));
  });

  it('announces moves and ignores drops on the same column', async () => {
    const user = userEvent.setup();
    start();
    screen.getByRole('button', { name: /Send invoice/ }).focus();
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
    expect(screen.getByRole('status')).toHaveTextContent('Moved "Send invoice" to In progress');
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    const card = screen.getByRole('button', { name: /Draft API/ }).closest('li') as HTMLElement;
    const data: Record<string, string> = {};
    const dt = {
      setData: (k: string, v: string) => (data[k] = v),
      getData: (k: string) => data[k],
      types: ['application/x-todo-board-task'],
    };
    fireEvent.dragStart(card, { dataTransfer: dt });
    fireEvent.drop(screen.getByRole('region', { name: 'In progress' }), { dataTransfer: dt });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    data['application/x-todo-board-task'] = 'missing';
    fireEvent.drop(screen.getByRole('region', { name: 'Done' }), { dataTransfer: dt });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('keeps preferences such as hiding done tasks', async () => {
    const user = userEvent.setup();
    const { save } = start();
    await user.click(screen.getByLabelText('Hide done tasks'));
    await vi.waitFor(() => expect(lastSaved(save).prefs.hideDone).toBe(true));
  });

  it('exports backups and iCalendar files', async () => {
    const user = userEvent.setup();
    start();
    const menu = screen.getByRole('button', { name: 'Data' });
    await user.click(menu);
    await user.click(screen.getByRole('button', { name: 'Back up tasks (.json)' }));
    const [name, text, type] = vi.mocked(downloadText).mock.calls[0];
    expect(name).toBe('todo-board-backup-2026-10-15.json');
    expect(type).toBe('application/json');
    expect(JSON.parse(text).tasks).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent('Backed up 2 tasks');

    await user.click(menu);
    await user.click(screen.getByRole('button', { name: 'Export tasks for Thunderbird (.ics)' }));
    expect(vi.mocked(downloadText).mock.calls[1][0]).toBe('todo-board-tasks-2026-10-15.ics');
    expect(vi.mocked(downloadText).mock.calls[1][1]).toContain('BEGIN:VTODO');
    expect(screen.getByRole('status')).toHaveTextContent('Exported 2 tasks for Thunderbird');

    await go('#/calendar');
    await user.click(screen.getByRole('button', { name: 'Export calendar (.ics)' }));
    expect(vi.mocked(downloadText).mock.calls[2][0]).toBe('todo-board-calendar-2026-10-15.ics');
    expect(vi.mocked(downloadText).mock.calls[2][1]).toContain('BEGIN:VEVENT');
    expect(screen.getByRole('status')).toHaveTextContent('Exported calendar');
  });

  it('restores from a backup', async () => {
    const user = userEvent.setup();
    const { save } = start();
    const backup = serializeBackup(
      { tasks: [makeTask({ id: 'from-backup', title: 'From backup' })], tags: [], categories: [] },
      NOW,
    );
    const input = screen.getByTestId('restore-input') as HTMLInputElement;
    await user.upload(input, new File([backup], 'b.json'));
    await user.click(await screen.findByRole('button', { name: 'Merge tasks' }));
    expect(screen.getByRole('status')).toHaveTextContent('Merged 1 tasks from backup');
    await vi.waitFor(() => expect(lastSaved(save).tasks).toHaveLength(3));
    await user.upload(input, new File([backup], 'b.json'));
    await user.click(await screen.findByRole('button', { name: 'Replace tasks' }));
    expect(screen.getByRole('status')).toHaveTextContent('Restored 1 tasks from backup');
    await vi.waitFor(() => expect(lastSaved(save).tasks.map((t) => t.id)).toEqual(['from-backup']));
    await user.upload(input, new File(['{}'], 'b.json'));
    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('not a Todo board backup'));
  });

  it('shows load errors and leaves stored data alone until something changes', async () => {
    const user = userEvent.setup();
    const { save } = start(emptyDb(), { error: 'Saved tasks could not be read.' });
    expect(screen.getByRole('status')).toHaveTextContent('Saved tasks could not be read.');
    expect(screen.getByRole('heading', { name: 'Your board is empty' })).toBeInTheDocument();
    await act(async () => {});
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getAllByRole('button', { name: 'Add task' })[1]);
    expect(screen.getByRole('dialog', { name: 'Add task' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('warns when the browser refuses to save', async () => {
    start(seeded(), { save: () => false });
    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Changes could not be saved'));
  });

  it('uses local storage by default', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...seeded(), tasks: [makeTask({ title: 'Stored task' })] }));
    render(<App />);
    expect(screen.getByRole('button', { name: /Stored task/ })).toBeInTheDocument();
  });

  it('moves focus to the content with the skip link', async () => {
    start();
    await userEvent.click(screen.getByRole('link', { name: 'Skip to content' }));
    expect(screen.getByRole('main')).toHaveFocus();
  });
});
