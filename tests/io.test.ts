import { describe, expect, it, vi } from 'vitest';
import ICAL from 'ical.js';
import { escapeText, exportCalendarIcs, exportTasksIcs, foldLine, formatUtc } from '../src/io/ical';
import { mergeLibraries, parseBackup, parseTask, parseTasks, serializeBackup, BACKUP_VERSION } from '../src/io/backup';
import { downloadText, readFileText } from '../src/io/download';
import {
  emptyDb,
  loadDb,
  saveDb,
  safeLocalStorage,
  STORAGE_KEY,
  UNREADABLE_KEY,
  DEFAULT_PREFS,
} from '../src/store/storage';
import { reducer } from '../src/store/reducer';
import { emptyDraft } from '../src/model/task';
import { at, day, makeTask, NOW, walk } from './helpers';

const encoder = new TextEncoder();

describe('iCalendar export', () => {
  it('escapes text values', () => {
    expect(escapeText('a\\b; c, d\ne\r\nf')).toBe('a\\\\b\\; c\\, d\\ne\\nf');
  });

  it('folds long lines at 75 octets without splitting characters', () => {
    const line = 'DESCRIPTION:' + 'ä'.repeat(80);
    const folded = foldLine(line);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(encoder.encode(p).length).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => p.startsWith(' '))).toBe(true);
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(line);
    expect(foldLine('SHORT')).toBe('SHORT');
    // 3- and 4-byte characters (euro sign, emoji with a surrogate pair) are never split.
    const wide = 'SUMMARY:' + '€😀'.repeat(30);
    const wideParts = foldLine(wide).split('\r\n');
    for (const p of wideParts) expect(encoder.encode(p).length).toBeLessThanOrEqual(75);
    expect(wideParts.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(wide);
    expect(
      foldLine('X'.repeat(80))
        .split('\r\n')
        .map((p) => p.length),
    ).toEqual([75, 6]);
  });

  it('formats UTC timestamps', () => {
    expect(formatUtc('2026-10-15T09:30:05.123Z')).toBe('20261015T093005Z');
  });

  const tasks = [
    makeTask({
      id: 'a',
      title: 'Pay rent; today, please',
      description: 'Line one\nLine two',
      priority: 'high',
      tags: ['money'],
      categories: ['Home'],
      dueDate: '2026-10-20',
    }),
    walk(makeTask({ id: 'b', title: 'Write docs', priority: 'medium', dueDate: '2026-10-16' }), [['doing', 0]]),
    walk(makeTask({ id: 'c', title: 'Done thing', priority: 'low', dueDate: '2026-10-01' }), [['done', 0]]),
    makeTask({ id: 'd', title: 'No extras', dueDate: '2026-12-31' }),
  ];

  it('exports VTODO entries Thunderbird can read', () => {
    const ics = exportTasksIcs(tasks, NOW);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    const comp = new ICAL.Component(ICAL.parse(ics));
    const todos = comp.getAllSubcomponents('vtodo');
    expect(todos).toHaveLength(4);
    const [a, b, c, d] = todos;
    expect(a.getFirstPropertyValue('summary')).toBe('Pay rent; today, please');
    expect(a.getFirstPropertyValue('description')).toBe('Line one\nLine two');
    expect(a.getFirstPropertyValue('priority')).toBe(1);
    expect(a.getFirstPropertyValue('status')).toBe('NEEDS-ACTION');
    expect(a.getFirstPropertyValue('percent-complete')).toBe(0);
    expect(a.getFirstProperty('categories')?.getValues()).toEqual(['Home', 'money']);
    expect(String(a.getFirstPropertyValue('due'))).toBe('2026-10-20');
    expect(a.getFirstPropertyValue('uid')).toBe('a@todo-board.local');
    expect(b.getFirstPropertyValue('status')).toBe('IN-PROCESS');
    expect(b.getFirstPropertyValue('priority')).toBe(5);
    expect(b.getFirstPropertyValue('percent-complete')).toBe(50);
    expect(c.getFirstPropertyValue('status')).toBe('COMPLETED');
    expect(c.getFirstPropertyValue('priority')).toBe(9);
    expect(c.getFirstPropertyValue('completed')).toBeTruthy();
    expect(d.getFirstPropertyValue('priority')).toBeNull();
    expect(d.getFirstPropertyValue('description')).toBeNull();
    expect(d.getFirstPropertyValue('categories')).toBeNull();
  });

  it('exports all-day VEVENTs on each due date', () => {
    const ics = exportCalendarIcs(tasks, NOW);
    const events = new ICAL.Component(ICAL.parse(ics)).getAllSubcomponents('vevent');
    expect(events).toHaveLength(4);
    const e = new ICAL.Event(events[3]);
    expect(e.summary).toBe('No extras');
    expect(e.startDate.isDate).toBe(true);
    expect(String(e.startDate)).toBe('2026-12-31');
    expect(String(e.endDate)).toBe('2027-01-01');
    expect(e.uid).toBe('d-due@todo-board.local');
  });
});

describe('backup', () => {
  const t = walk(makeTask({ id: 'x', title: 'Backed up', tags: ['a'], dueDate: day(2) }), [['doing', 0]]);

  it('round-trips through JSON', () => {
    const text = serializeBackup({ tasks: [t], tags: ['a'], categories: ['c'] }, NOW);
    const data = JSON.parse(text);
    expect(data).toMatchObject({ app: 'todo-board', version: BACKUP_VERSION, exportedAt: NOW.toISOString() });
    expect(parseBackup(text)).toEqual({ tasks: [t], tags: ['a'], categories: ['c'] });
  });

  it('explains unusable files', () => {
    expect(parseBackup('{oops')).toMatch(/not valid JSON/);
    expect(parseBackup('[]')).toMatch(/not a Todo board backup/);
    expect(parseBackup('{"app":"other"}')).toMatch(/not a Todo board backup/);
    expect(parseBackup('{"app":"todo-board","version":99,"tasks":[]}')).toMatch(/newer version/);
    expect(parseBackup('{"app":"todo-board","tasks":[]}')).toMatch(/newer version/);
    expect(parseBackup('{"app":"todo-board","version":1}')).toBe('The file has no task list.');
    expect(parseBackup('{"app":"todo-board","version":1,"tasks":[{"id":"1"}]}')).toBe('Task 1 has no title.');
    expect(parseBackup('{"app":"todo-board","version":1,"tasks":[],"tags":"nope"}')).toEqual({
      tasks: [],
      tags: [],
      categories: [],
    });
  });

  it('validates each task', () => {
    const ok = { id: '1', title: 'T', dueDate: '2026-10-10', status: 'todo', createdAt: NOW.toISOString() };
    expect(parseTask(null)).toBe('is not a task object');
    expect(parseTask([])).toBe('is not a task object');
    expect(parseTask({ ...ok, id: '' })).toBe('has no id');
    expect(parseTask({ ...ok, title: ' ' })).toBe('has no title');
    expect(parseTask({ ...ok, dueDate: '10/10/2026' })).toBe('has no valid due date');
    expect(parseTask({ ...ok, status: 'later' })).toBe('has an unknown status');
    expect(parseTask({ ...ok, createdAt: 'yesterday' })).toBe('has no valid creation date');
    expect(parseTasks('x')).toBe('The file has no task list.');
  });

  it('fills defaults for optional fields and drops broken history entries', () => {
    const parsed = parseTask({
      id: '1',
      title: ' T ',
      dueDate: '2026-10-10',
      status: 'done',
      createdAt: NOW.toISOString(),
      priority: 'urgent',
      tags: ['a', 3, 'A'],
      completedAt: 'bad',
      startedAt: at(1).toISOString(),
      dueDateHistory: [{ from: '2026-10-01', to: '2026-10-10', changedAt: NOW.toISOString() }, { from: 'x' }],
      statusHistory: [{ status: 'nope', at: 'x' }],
    });
    expect(parsed).toEqual({
      id: '1',
      title: 'T',
      description: '',
      priority: null,
      tags: ['a'],
      categories: [],
      status: 'done',
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      startedAt: at(1).toISOString(),
      completedAt: null,
      dueDate: '2026-10-10',
      originalDueDate: '2026-10-10',
      dueDateHistory: [{ from: '2026-10-01', to: '2026-10-10', changedAt: NOW.toISOString() }],
      statusHistory: [{ status: 'done', at: NOW.toISOString() }],
    });
    const minimal = parseTask({
      id: '2',
      title: 'U',
      dueDate: '2026-10-10',
      status: 'todo',
      createdAt: NOW.toISOString(),
      completedAt: NOW.toISOString(),
      description: 'd',
    });
    expect(minimal).toMatchObject({ completedAt: null, description: 'd', dueDateHistory: [] });
  });

  it('merges libraries keeping the newest copy of each task', () => {
    const older = { ...t, title: 'Old', updatedAt: at(-1).toISOString() };
    const newer = { ...t, title: 'New', updatedAt: at(1).toISOString() };
    const other = makeTask({ id: 'y' });
    expect(
      mergeLibraries(
        { tasks: [older], tags: ['a'], categories: [] },
        { tasks: [newer, other], tags: ['A', 'b'], categories: ['c'] },
      ),
    ).toEqual({
      tasks: [newer, other],
      tags: ['a', 'b'],
      categories: ['c'],
    });
    expect(
      mergeLibraries({ tasks: [newer], tags: [], categories: [] }, { tasks: [older], tags: [], categories: [] }).tasks,
    ).toEqual([newer]);
  });
});

describe('storage', () => {
  it('starts empty when nothing is stored', () => {
    expect(loadDb(localStorage)).toEqual({ db: emptyDb() });
  });

  it('saves and loads, normalising prefs', () => {
    const db = {
      ...emptyDb(),
      tasks: [makeTask()],
      tags: ['a'],
      prefs: { sort: [{ key: 'title' as const, dir: 'desc' as const }], hideDone: true },
    };
    expect(saveDb(db, localStorage)).toBe(true);
    expect(loadDb(localStorage).db).toEqual(db);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ tasks: [], tags: 'x', prefs: { sort: { key: 'size', dir: 'up' } } }),
    );
    expect(loadDb(localStorage).db).toEqual({ ...emptyDb(), prefs: DEFAULT_PREFS });
    // Preferences saved before multi-level sorting are upgraded.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks: [], prefs: { sort: { key: 'priority', dir: 'desc' } } }));
    expect(loadDb(localStorage).db.prefs.sort).toEqual([{ key: 'priority', dir: 'desc' }]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks: [], categories: ['b'] }));
    expect(loadDb(localStorage).db.categories).toEqual(['b']);
  });

  it('keeps unreadable data aside and explains how to recover', () => {
    localStorage.setItem(STORAGE_KEY, '{broken');
    const result = loadDb(localStorage);
    expect(result.db).toEqual(emptyDb());
    expect(result.error).toMatch(/could not be read/);
    expect(localStorage.getItem(UNREADABLE_KEY)).toBe('{broken');
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks: [{ id: 1 }] }));
    expect(loadDb(localStorage).error).toMatch(/could not be read/);
  });

  it('survives a full storage while keeping the original', () => {
    const full = {
      getItem: () => '{broken',
      setItem: () => {
        throw new Error('quota');
      },
    } as unknown as Storage;
    expect(loadDb(full).error).toMatch(/could not be read/);
    expect(saveDb(emptyDb(), full)).toBe(false);
  });

  it('handles browsers without local storage', () => {
    expect(loadDb(null).error).toMatch(/blocks local storage/);
    expect(saveDb(emptyDb(), null)).toBe(false);
    expect(safeLocalStorage()).toBe(localStorage);
    const spy = vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(safeLocalStorage()).toBeNull();
    spy.mockReturnValue(undefined as unknown as Storage);
    expect(safeLocalStorage()).toBeNull();
    spy.mockRestore();
  });

  it('uses the browser storage by default', () => {
    expect(saveDb({ ...emptyDb(), tags: ['z'] })).toBe(true);
    expect(loadDb().db.tags).toEqual(['z']);
  });
});

describe('reducer', () => {
  const base = emptyDb();
  const draft = { ...emptyDraft(), title: 'New', tags: ['t'], categories: ['c'], dueDate: day(1) };

  it('adds, updates, moves and deletes tasks', () => {
    let db = reducer(base, { type: 'add', draft, now: NOW, id: 'n' });
    expect(db.tasks).toHaveLength(1);
    expect(db.tags).toEqual(['t']);
    expect(db.categories).toEqual(['c']);
    db = reducer(db, { type: 'update', id: 'n', draft: { ...draft, title: 'Edited', tags: ['u'] }, now: at(1) });
    expect(db.tasks[0].title).toBe('Edited');
    expect(db.tags).toEqual(['t', 'u']);
    db = reducer(db, { type: 'update', id: 'missing', draft, now: at(1) });
    expect(db.tasks[0].title).toBe('Edited');
    db = reducer(db, { type: 'move', id: 'n', status: 'done', now: at(2) });
    db = reducer(db, { type: 'move', id: 'other', status: 'doing', now: at(2) });
    expect(db.tasks[0].status).toBe('done');
    db = reducer(db, { type: 'delete', id: 'n' });
    expect(db.tasks).toEqual([]);
  });

  it('imports by replacing or merging', () => {
    const db = reducer(base, { type: 'add', draft, now: NOW, id: 'keep' });
    const lib = { tasks: [makeTask({ id: 'imp' })], tags: ['i'], categories: [] };
    expect(reducer(db, { type: 'import', library: lib, mode: 'replace' }).tasks.map((t) => t.id)).toEqual(['imp']);
    const merged = reducer(db, { type: 'import', library: lib, mode: 'merge' });
    expect(merged.tasks.map((t) => t.id)).toEqual(['keep', 'imp']);
    expect(merged.tags).toEqual(['t', 'i']);
  });

  it('updates preferences', () => {
    expect(reducer(base, { type: 'prefs', prefs: { hideDone: true } }).prefs).toEqual({
      ...base.prefs,
      hideDone: true,
    });
  });
});

describe('download', () => {
  it('saves text through a temporary link', async () => {
    vi.useFakeTimers();
    const create = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('file.txt');
      expect(this.href).toBe('blob:x');
    });
    downloadText('file.txt', 'hello', 'text/plain');
    expect(click).toHaveBeenCalled();
    expect(document.querySelector('a[download]')).toBeNull();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:x');
    expect(await readFileText(new Blob(['abc']))).toBe('abc');
  });
});
