import { describe, expect, it } from 'vitest';
import {
  applyDraft,
  changeDueDate,
  cleanLabels,
  createTask,
  draftFromTask,
  emptyDraft,
  moveTask,
  newId,
  validateDraft,
} from '../src/model/task';
import { at, day, makeTask, walk } from './helpers';

describe('task model', () => {
  it('requires a title and a valid due date', () => {
    expect(validateDraft(emptyDraft())).toEqual({ title: 'Enter a title.', dueDate: 'Pick a due date.' });
    expect(validateDraft({ ...emptyDraft(), title: '   ', dueDate: '2026-13-01' })).toEqual({
      title: 'Enter a title.',
      dueDate: 'Use a valid date (YYYY-MM-DD).',
    });
    expect(validateDraft({ ...emptyDraft(), title: 'Ok', dueDate: day(1) })).toEqual({});
  });

  it('creates tasks with clean labels and history', () => {
    const t = createTask(
      { ...emptyDraft(), title: '  Write report ', tags: [' a', 'A', '', 'b'], categories: ['Work'], dueDate: day(2) },
      at(0),
      'id-1',
    );
    expect(t).toMatchObject({
      id: 'id-1',
      title: 'Write report',
      tags: ['a', 'b'],
      status: 'todo',
      startedAt: null,
      completedAt: null,
      originalDueDate: day(2),
      dueDateHistory: [],
      statusHistory: [{ status: 'todo', at: at(0).toISOString() }],
    });
    expect(createTask({ ...emptyDraft(), title: 'x', dueDate: day(1) }, at(0)).id).toMatch(/^[0-9a-f-]{36}$/);
    expect(newId()).not.toBe(newId());
  });

  it('creates tasks directly in another column', () => {
    const t = createTask({ ...emptyDraft('done'), title: 'x', dueDate: day(1) }, at(0));
    expect(t.status).toBe('done');
    expect(t.startedAt).toBe(at(0).toISOString());
    expect(t.completedAt).toBe(at(0).toISOString());
    expect(t.statusHistory.map((h) => h.status)).toEqual(['todo', 'done']);
  });

  it('records start and completion when moving', () => {
    const t = walk(makeTask(), [
      ['doing', 1],
      ['done', 3],
    ]);
    expect(t.startedAt).toBe(at(1).toISOString());
    expect(t.completedAt).toBe(at(3).toISOString());
    // Re-opening keeps the start date, clears completion.
    const reopened = moveTask(t, 'doing', at(4));
    expect(reopened.startedAt).toBe(at(1).toISOString());
    expect(reopened.completedAt).toBeNull();
    // Back to to do clears both.
    const back = moveTask(t, 'todo', at(5));
    expect(back.startedAt).toBeNull();
    expect(back.completedAt).toBeNull();
    expect(back.statusHistory.map((h) => h.status)).toEqual(['todo', 'doing', 'done', 'todo']);
    // Moving to the same column changes nothing.
    expect(moveTask(back, 'todo', at(6))).toBe(back);
  });

  it('tracks due date changes and keeps the original', () => {
    const t = makeTask({ dueDate: day(1) });
    const once = changeDueDate(t, day(5), at(1));
    const twice = changeDueDate(once, day(7), at(2));
    expect(twice.originalDueDate).toBe(day(1));
    expect(twice.dueDateHistory).toEqual([
      { from: day(1), to: day(5), changedAt: at(1).toISOString() },
      { from: day(5), to: day(7), changedAt: at(2).toISOString() },
    ]);
    expect(changeDueDate(twice, day(7), at(3))).toBe(twice);
  });

  it('applies edits from a draft', () => {
    const t = makeTask({ title: 'Old', dueDate: day(1) });
    const draft = { ...draftFromTask(t), title: ' New ', tags: ['x', 'x'], dueDate: day(4), status: 'doing' as const };
    const next = applyDraft(t, draft, at(1));
    expect(next).toMatchObject({
      title: 'New',
      tags: ['x'],
      dueDate: day(4),
      status: 'doing',
      startedAt: at(1).toISOString(),
    });
    expect(next.dueDateHistory).toHaveLength(1);
    expect(draftFromTask(next).tags).not.toBe(next.tags);
  });

  it('cleans label lists', () => {
    expect(cleanLabels(['  Home', 'home', 'Work ', ''])).toEqual(['Home', 'Work']);
  });
});
