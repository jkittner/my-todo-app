import { fireEvent, render, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { useState } from 'preact/hooks';
import { describe, expect, it, vi } from 'vitest';
import { TokenInput } from '../src/ui/task/TokenInput';
import { MarkdownField } from '../src/ui/task/MarkdownField';
import { Timeline } from '../src/ui/task/Timeline';
import { TaskModal } from '../src/ui/task/TaskModal';
import { changeDueDate } from '../src/model/task';
import { at, day, makeTask, NOW, walk } from './helpers';

function Tokens({
  initial = [] as string[],
  suggestions = ['Home', 'Work'],
  onDeleteValue = undefined as ((name: string) => void) | undefined,
}) {
  const [values, setValues] = useState(initial);
  return (
    <TokenInput
      label="Tags"
      noun="tag"
      values={values}
      suggestions={suggestions}
      onChange={setValues}
      onDeleteValue={onDeleteValue}
    />
  );
}

const tokens = () =>
  screen
    .queryAllByRole('button', { name: /Remove tag/ })
    .map((b) => b.getAttribute('aria-label')?.replace('Remove tag ', ''));

describe('TokenInput', () => {
  it('adds labels with Enter or comma and removes them', async () => {
    const user = userEvent.setup();
    render(<Tokens />);
    const input = screen.getByLabelText('Tags');
    expect(input).toHaveAttribute('placeholder', 'Add a tag');
    await user.type(input, 'urgent{Enter}');
    await user.type(input, 'later,');
    expect(tokens()).toEqual(['urgent', 'later']);
    expect(input).toHaveAttribute('placeholder', '');
    await user.type(input, 'URGENT{Enter}');
    expect(tokens()).toEqual(['urgent', 'later']);
    await user.click(screen.getByRole('button', { name: 'Remove tag urgent' }));
    expect(tokens()).toEqual(['later']);
    await user.click(input);
    await user.keyboard('{Backspace}');
    expect(tokens()).toEqual([]);
    await user.keyboard('{Backspace}');
    expect(tokens()).toEqual([]);
  });

  it('opens a menu on right-click of a label, and deletes only from the menu', async () => {
    const onDeleteValue = vi.fn();
    render(<Tokens initial={['Home']} onDeleteValue={onDeleteValue} />);
    expect(screen.getByText(/Right-click a tag to delete it/)).toBeInTheDocument();
    fireEvent.contextMenu(screen.getByText('Home'));
    expect(onDeleteValue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete tag' }));
    expect(onDeleteValue).toHaveBeenCalledWith('Home');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes the menu on Escape or a press outside it, and has none without a delete handler', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Tokens initial={['Home']} onDeleteValue={vi.fn()} />);
    fireEvent.contextMenu(screen.getByText('Home'));
    await user.keyboard('a');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.contextMenu(screen.getByText('Home'));
    await user.click(screen.getByLabelText('Tags'));
    expect(screen.queryByRole('menu')).toBeNull();
    unmount();

    render(<Tokens initial={['Home']} />);
    expect(screen.queryByText(/Right-click/)).toBeNull();
    fireEvent.contextMenu(screen.getByText('Home'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('commits typed text on blur and adds picked suggestions at once', async () => {
    const user = userEvent.setup();
    render(<Tokens initial={['Home']} />);
    const input = screen.getByLabelText('Tags');
    const options = [...document.querySelectorAll('datalist option')].map((o) => o.getAttribute('value'));
    expect(options).toEqual(['Work']);
    fireEvent.input(input, { target: { value: 'Work' } });
    expect(tokens()).toEqual(['Home', 'Work']);
    expect(input).toHaveValue('');
    await user.type(input, 'draft');
    await user.tab();
    expect(tokens()).toEqual(['Home', 'Work', 'draft']);
    // Blurring an empty field adds nothing.
    await user.click(input);
    await user.tab();
    expect(tokens()).toEqual(['Home', 'Work', 'draft']);
  });
});

function Md({ start = '', preview = false }) {
  const [v, setV] = useState(start);
  return <MarkdownField value={v} onChange={setV} startInPreview={preview} />;
}

describe('MarkdownField', () => {
  it('switches between write and preview', async () => {
    const user = userEvent.setup();
    render(<Md />);
    const write = screen.getByRole('tab', { name: 'Write' });
    expect(write).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Preview' }));
    expect(screen.getByText(/No description yet/)).toBeInTheDocument();
    await user.click(write);
    await user.type(screen.getByRole('textbox', { name: 'Description' }), '**bold**');
    await user.click(screen.getByRole('tab', { name: 'Preview' }));
    expect(screen.getByRole('tabpanel').querySelector('strong')).toHaveTextContent('bold');
  });

  it('moves between tabs with arrow keys', async () => {
    const user = userEvent.setup();
    render(<Md />);
    screen.getByRole('tab', { name: 'Write' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Write' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('tab', { name: 'Write' })).toHaveAttribute('aria-selected', 'true');
  });

  it('opens on the preview for existing notes only', () => {
    const { unmount } = render(<Md start="# Notes" preview />);
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeInTheDocument();
    unmount();
    render(<Md start="  " preview />);
    expect(screen.getByRole('tab', { name: 'Write' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Timeline', () => {
  const values = () =>
    Object.fromEntries(
      [...document.querySelectorAll('.timeline dl > div')].map((d) => [
        d.querySelector('dt')?.textContent,
        d.querySelector('dd')?.textContent,
      ]),
    );

  it('describes a task that has not started', () => {
    render(<Timeline task={makeTask({ created: -2, dueDate: day(3) })} now={NOW} />);
    const v = values();
    expect(v['Started']).toBe('Not started');
    expect(v['Completed']).toBe('Not completed');
    expect(v['Waited before starting']).toBe('2 days so far');
    expect(v['Worked on']).toBe('Not started');
    expect(v['Due date changes']).toBe('Never changed');
    expect(screen.queryByRole('list', { name: 'Due date changes' })).toBeNull();
  });

  it('describes a finished, rescheduled, late task', () => {
    let t = makeTask({ created: -10, dueDate: day(-8) });
    t = changeDueDate(t, day(-5), at(-9));
    t = walk(t, [
      ['doing', -7],
      ['done', -3],
    ]);
    render(<Timeline task={t} now={NOW} />);
    const v = values();
    expect(v['Waited before starting']).toBe('3 days');
    expect(v['Worked on']).toBe('4 days');
    expect(v[`Against first due date (Oct 7)`]).toMatch(/late$/);
    expect(v[`Against current due date (Oct 10)`]).toMatch(/late$/);
    expect(v['Due date changes']).toBe('Changed once');
    expect(
      within(screen.getByRole('list', { name: 'Due date changes' })).getByText(/Oct 7 to Oct 10/),
    ).toBeInTheDocument();
  });

  it('shows ongoing lateness and multiple changes', () => {
    let t = walk(makeTask({ created: -6, dueDate: day(-3) }), [['doing', -4]]);
    t = changeDueDate(changeDueDate(t, day(-2), at(-5)), day(-1), at(-4));
    render(<Timeline task={t} now={NOW} />);
    const v = values();
    expect(v['Worked on']).toBe('4 days so far');
    expect(v['Against current due date (Oct 14)']).toMatch(/late so far$/);
    expect(v['Due date changes']).toBe('Changed 2 times');
  });

  it('asks before deleting a category from the menu, and keeps it out of the open task', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Keep me', categories: ['Work', 'Home'], dueDate: day(2) });
    const p = setup(task);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.contextMenu(screen.getByText('Work'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete category' }));
    expect(confirm).toHaveBeenLastCalledWith(
      'Delete the category "Work"? It is removed from 2 tasks. This cannot be undone.\n\nAre you really sure?',
    );
    // Cancelled: nothing changes.
    expect(p.onDeleteLabel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Remove category Work' })).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText('Work'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete category' }));
    expect(p.onDeleteLabel).toHaveBeenCalledWith('categories', 'Work');
    expect(screen.queryByRole('button', { name: 'Remove category Work' })).toBeNull();
    // Saving sends only the remaining categories.
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(p.onSave).toHaveBeenCalledWith(expect.objectContaining({ categories: ['Home'] }));
  });

  it('does not ask to discard after deleting a category that was the only change', async () => {
    const user = userEvent.setup();
    const task = makeTask({ categories: ['Work'], dueDate: day(2) });
    const p = setup(task);
    // Unticked, then typed back in: the saved copy still has it, the draft now does too.
    await user.click(screen.getByRole('button', { name: 'Remove category Work' }));
    await user.type(screen.getByLabelText('Categories'), 'Work{Enter}');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    fireEvent.contextMenu(screen.getByText('Work'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete category' }));
    expect(p.onDeleteLabel).toHaveBeenCalledWith('categories', 'Work');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    // Only the delete confirmation was asked, never the discard prompt.
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it('asks before deleting a tag from the menu', async () => {
    const user = userEvent.setup();
    const p = setup(makeTask({ tags: ['finance'], dueDate: day(2) }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    fireEvent.contextMenu(screen.getByText('finance'));
    await user.click(screen.getByRole('menuitem', { name: 'Delete tag' }));
    expect(confirm).toHaveBeenCalledWith(
      'Delete the tag "finance"? It is removed from 2 tasks. This cannot be undone.\n\nAre you really sure?',
    );
    expect(p.onDeleteLabel).toHaveBeenCalledWith('tags', 'finance');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(p.onSave).toHaveBeenCalledWith(expect.objectContaining({ tags: [] }));
  });

  it('says when no task uses a category being deleted', async () => {
    const user = userEvent.setup();
    const p = setup(makeTask({ categories: ['Work'] }));
    // Cancelled first, so the token is still there for the second attempt.
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    p.labelUses.mockReturnValue(0);
    fireEvent.contextMenu(screen.getByText('Work'));
    await user.click(screen.getByRole('menuitem', { name: 'Delete category' }));
    expect(confirm.mock.calls[0][0]).toContain('No task uses it.');
    p.labelUses.mockReturnValue(1);
    fireEvent.contextMenu(screen.getByText('Work'));
    await user.click(screen.getByRole('menuitem', { name: 'Delete category' }));
    expect(confirm.mock.calls[1][0]).toContain('It is removed from 1 task.');
    expect(p.onDeleteLabel).toHaveBeenCalledTimes(1);
  });
});

function setup(task = null as ReturnType<typeof makeTask> | null) {
  const props = {
    task,
    knownTags: ['finance'],
    knownCategories: ['Work'],
    labelUses: vi.fn(() => 2),
    now: NOW,
    onSave: vi.fn(),
    onDelete: vi.fn(),
    onDeleteLabel: vi.fn(),
    onClose: vi.fn(),
  };
  render(<TaskModal {...props} />);
  return props;
}

describe('TaskModal', () => {
  it('requires a title and due date before adding', async () => {
    const user = userEvent.setup();
    const p = setup();
    expect(screen.getByRole('dialog', { name: 'Add task' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    expect(screen.getByText('Enter a title.')).toBeInTheDocument();
    expect(screen.getByText('Pick a due date.')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveFocus();
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true');
    await user.type(screen.getByLabelText('Title'), 'Plan trip');
    expect(screen.queryByText('Enter a title.')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    expect(screen.getByLabelText('Due date')).toHaveFocus();
    expect(p.onSave).not.toHaveBeenCalled();
  });

  it('collects every field of a new task', async () => {
    const user = userEvent.setup();
    const p = setup();
    await user.type(screen.getByLabelText('Title'), 'Plan trip');
    fireEvent.input(screen.getByLabelText('Due date'), { target: { value: '2026-11-02' } });
    await user.selectOptions(screen.getByLabelText('Status'), 'In progress');
    await user.click(screen.getByRole('radio', { name: 'High' }));
    await user.type(screen.getByLabelText('Tags'), 'travel{Enter}');
    await user.type(screen.getByLabelText('Categories'), 'Home{Enter}');
    await user.type(screen.getByRole('textbox', { name: 'Description' }), 'Book *train*');
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    expect(p.onSave).toHaveBeenCalledWith({
      title: 'Plan trip',
      description: 'Book *train*',
      priority: 'high',
      tags: ['travel'],
      categories: ['Home'],
      status: 'doing',
      dueDate: '2026-11-02',
    });
  });

  it('closes without asking when nothing changed, and asks otherwise', async () => {
    const user = userEvent.setup();
    const p = setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(p.onClose).toHaveBeenCalledTimes(1);
    await user.type(screen.getByLabelText('Title'), 'x');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(p.onClose).toHaveBeenCalledTimes(1);
    await user.keyboard('{Escape}');
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(p.onClose).toHaveBeenCalledTimes(2);
  });

  it('edits an existing task and shows its history', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Old title', description: 'Some *notes*', priority: 'low', dueDate: day(2) });
    const p = setup(task);
    expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'History' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true');
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'New title');
    await user.click(screen.getByRole('radio', { name: 'None' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(p.onSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'New title', priority: null }));
  });

  it('confirms before deleting', async () => {
    const user = userEvent.setup();
    const task = makeTask({ id: 'del' });
    const p = setup(task);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const group = screen.getByRole('group', { name: 'Confirm delete' });
    await user.click(within(group).getByRole('button', { name: 'Keep task' }));
    expect(p.onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete task' }));
    expect(p.onDelete).toHaveBeenCalledWith('del');
  });
});
