import type { Priority, Task } from '../model/task';

export type SortKey = 'due' | 'priority' | 'title';
export type SortDir = 'asc' | 'desc';

export interface SortRule {
  key: SortKey;
  dir: SortDir;
}

/** Sort criteria in order of importance, e.g. priority first, then due date. Keys are unique. */
export type Sort = SortRule[];

export const SORT_KEYS: SortKey[] = ['due', 'priority', 'title'];
const SORT_DIRS: SortDir[] = ['asc', 'desc'];
export const DEFAULT_SORT: Sort = [{ key: 'due', dir: 'asc' }];

export const SORT_LABEL: Record<SortKey, string> = {
  due: 'Due date',
  priority: 'Priority',
  title: 'Title',
};

/** Plain words for each direction, e.g. "Soonest first" rather than "Ascending". */
export const DIR_LABEL: Record<SortKey, Record<SortDir, string>> = {
  due: { asc: 'Soonest first', desc: 'Latest first' },
  priority: { asc: 'Highest first', desc: 'Lowest first' },
  title: { asc: 'A to Z', desc: 'Z to A' },
};

const PRIORITY_RANK: Record<Exclude<Priority, null>, number> = { high: 0, medium: 1, low: 2 };

export const priorityRank = (p: Priority) => (p === null ? 3 : PRIORITY_RANK[p]);

const byTitle = (a: Task, b: Task) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
const byDue = (a: Task, b: Task) => a.dueDate.localeCompare(b.dueDate);
const byPriority = (a: Task, b: Task) => priorityRank(a.priority) - priorityRank(b.priority);

const PRIMARY: Record<SortKey, (a: Task, b: Task) => number> = {
  due: byDue,
  priority: byPriority,
  title: byTitle,
};

/**
 * Sorts a copy of `tasks` by each rule in turn; a later rule only decides between tasks the
 * earlier ones consider equal. "Ascending" priority means most urgent first. Remaining ties
 * fall back to due date, then title, always ascending, so the order is stable and predictable.
 */
export function sortTasks(tasks: Task[], sort: Sort): Task[] {
  const rules = sort.map((r) => ({ compare: PRIMARY[r.key], sign: r.dir === 'asc' ? 1 : -1 }));
  return [...tasks].sort((a, b) => {
    for (const { compare, sign } of rules) {
      const d = sign * compare(a, b);
      if (d) return d;
    }
    return byDue(a, b) || byTitle(a, b);
  });
}

/**
 * Reads a stored sort preference. Accepts the current list form and the older single
 * `{ key, dir }` object, drops invalid or repeated keys, and falls back to due date.
 */
export function normalizeSort(raw: unknown): Sort {
  const list = Array.isArray(raw) ? raw : [raw];
  const seen = new Set<SortKey>();
  const out: Sort = [];
  for (const item of list) {
    const r = (item ?? {}) as Partial<SortRule>;
    if (!SORT_KEYS.includes(r.key as SortKey) || seen.has(r.key as SortKey)) continue;
    seen.add(r.key as SortKey);
    out.push({ key: r.key as SortKey, dir: SORT_DIRS.includes(r.dir as SortDir) ? (r.dir as SortDir) : 'asc' });
  }
  return out.length ? out : DEFAULT_SORT;
}
