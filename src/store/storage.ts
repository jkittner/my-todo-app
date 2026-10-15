import type { Library } from '../io/backup';
import { parseTasks } from '../io/backup';
import { cleanLabels } from '../model/task';
import { DEFAULT_SORT, normalizeSort, type Sort } from '../logic/sort';

export const STORAGE_KEY = 'todoboard.v1';
export const SCHEMA_VERSION = 1;
export const UNREADABLE_KEY = `${STORAGE_KEY}.unreadable`;

export interface Prefs {
  sort: Sort;
  hideDone: boolean;
}

export interface Db extends Library {
  schemaVersion: number;
  prefs: Prefs;
}

export const DEFAULT_PREFS: Prefs = { sort: DEFAULT_SORT, hideDone: false };

export function emptyDb(): Db {
  return { schemaVersion: SCHEMA_VERSION, tasks: [], tags: [], categories: [], prefs: DEFAULT_PREFS };
}

function parsePrefs(raw: unknown): Prefs {
  const p = (raw ?? {}) as Partial<Prefs>;
  return { sort: normalizeSort(p.sort), hideDone: p.hideDone === true };
}

export interface LoadResult {
  db: Db;
  /** Set when stored data existed but could not be read. */
  error?: string;
}

export function loadDb(storage: Storage | null = safeLocalStorage()): LoadResult {
  if (!storage) return { db: emptyDb(), error: 'This browser blocks local storage, so changes will not be kept.' };
  const text = storage.getItem(STORAGE_KEY);
  if (text === null) return { db: emptyDb() };
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    const tasks = parseTasks(raw.tasks);
    if (typeof tasks === 'string') throw new Error(tasks);
    const strings = (v: unknown) => (Array.isArray(v) ? cleanLabels(v.filter((x) => typeof x === 'string')) : []);
    return {
      db: {
        schemaVersion: SCHEMA_VERSION,
        tasks,
        tags: strings(raw.tags),
        categories: strings(raw.categories),
        prefs: parsePrefs(raw.prefs),
      },
    };
  } catch {
    // Keep the unreadable data under a side key so the next save cannot destroy it.
    try {
      storage.setItem(UNREADABLE_KEY, text);
    } catch {
      /* storage full: the original stays in place until the next successful save */
    }
    return {
      db: emptyDb(),
      error: `Saved tasks could not be read, so the board started empty. The unreadable data is kept in this browser under "${UNREADABLE_KEY}". Restore a backup from the Data menu to recover your tasks.`,
    };
  }
}

/** Returns false when the browser refuses the write (for example, storage is full). */
export function saveDb(db: Db, storage: Storage | null = safeLocalStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(db));
    return true;
  } catch {
    return false;
  }
}

export function safeLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
