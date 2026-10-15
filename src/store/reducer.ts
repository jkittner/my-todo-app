import type { Library } from '../io/backup';
import { mergeLibraries } from '../io/backup';
import { applyDraft, cleanLabels, createTask, moveTask, type Status, type TaskDraft } from '../model/task';
import type { Db, Prefs } from './storage';

export type Action =
  | { type: 'add'; draft: TaskDraft; now: Date; id?: string }
  | { type: 'update'; id: string; draft: TaskDraft; now: Date }
  | { type: 'move'; id: string; status: Status; now: Date }
  | { type: 'delete'; id: string }
  | { type: 'import'; library: Library; mode: 'replace' | 'merge' }
  | { type: 'prefs'; prefs: Partial<Prefs> };

/** Remembers every tag and category a task uses so they can be picked again later. */
function rememberLabels(db: Db, draft: TaskDraft): Pick<Db, 'tags' | 'categories'> {
  return {
    tags: cleanLabels([...db.tags, ...draft.tags]),
    categories: cleanLabels([...db.categories, ...draft.categories]),
  };
}

export function reducer(db: Db, action: Action): Db {
  switch (action.type) {
    case 'add':
      return {
        ...db,
        ...rememberLabels(db, action.draft),
        tasks: [...db.tasks, createTask(action.draft, action.now, action.id)],
      };
    case 'update':
      return {
        ...db,
        ...rememberLabels(db, action.draft),
        tasks: db.tasks.map((t) => (t.id === action.id ? applyDraft(t, action.draft, action.now) : t)),
      };
    case 'move':
      return { ...db, tasks: db.tasks.map((t) => (t.id === action.id ? moveTask(t, action.status, action.now) : t)) };
    case 'delete':
      return { ...db, tasks: db.tasks.filter((t) => t.id !== action.id) };
    case 'import': {
      const lib = action.mode === 'replace' ? action.library : mergeLibraries(db, action.library);
      return { ...db, tasks: lib.tasks, tags: lib.tags, categories: lib.categories };
    }
    case 'prefs':
      return { ...db, prefs: { ...db.prefs, ...action.prefs } };
  }
}
