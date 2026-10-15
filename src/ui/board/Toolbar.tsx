import { useEffect, useRef, useState } from 'preact/hooks';
import { hasActiveFilters, type Filters } from '../../logic/filter';
import { DIR_LABEL, SORT_KEYS, SORT_LABEL, type Sort, type SortKey, type SortRule } from '../../logic/sort';

interface Props {
  filters: Filters;
  sort: Sort;
  hideDone: boolean;
  knownTags: string[];
  knownCategories: string[];
  shown: number;
  total: number;
  onFilters: (f: Filters) => void;
  onSort: (s: Sort) => void;
  onHideDone: (hide: boolean) => void;
  onClear: () => void;
}

const QUICK_LABEL = { overdue: 'Overdue only', dueThisWeek: 'Due this week only' } as const;

export function Toolbar(p: Props) {
  const { filters: f } = p;
  const [open, setOpen] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const active =
    f.tags.length + f.categories.length + (f.dueFrom || f.dueTo ? 1 : 0) + (f.createdFrom || f.createdTo ? 1 : 0);
  const narrowed = hasActiveFilters(f) || !!f.query.trim();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key !== '/' || target.closest('input, textarea, select, [contenteditable]')) return;
      if (document.body.classList.contains('has-modal')) return;
      e.preventDefault();
      search.current?.focus();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const set = (patch: Partial<Filters>) => p.onFilters({ ...f, ...patch });
  const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div class="toolbar-wrap">
      <div class="toolbar">
        <div class="search">
          <label for="search" class="visually-hidden">
            Search tasks
          </label>
          <input
            ref={search}
            id="search"
            type="search"
            placeholder="Search titles and descriptions"
            aria-keyshortcuts="/"
            value={f.query}
            onInput={(e) => set({ query: e.currentTarget.value })}
            onKeyDown={(e) => e.key === 'Escape' && f.query && (e.preventDefault(), set({ query: '' }))}
          />
          <kbd aria-hidden="true">/</kbd>
        </div>

        <SortControls sort={p.sort} onSort={p.onSort} />

        <button
          type="button"
          class="button-secondary"
          aria-expanded={open}
          aria-controls="filter-panel"
          onClick={() => setOpen(!open)}
        >
          Filters{active ? ` (${active})` : ''}
        </button>

        <label class="check">
          <input type="checkbox" checked={p.hideDone} onChange={(e) => p.onHideDone(e.currentTarget.checked)} />
          Hide done tasks
        </label>
      </div>

      {open && (
        <div id="filter-panel" class="filter-panel" role="group" aria-label="Filters">
          <ChipGroup
            label="Tags"
            options={p.knownTags}
            selected={f.tags}
            empty="No tags yet. Add tags to a task to filter by them."
            onToggle={(v) => set({ tags: toggleIn(f.tags, v) })}
          />
          <ChipGroup
            label="Categories"
            options={p.knownCategories}
            selected={f.categories}
            empty="No categories yet. Add categories to a task to filter by them."
            onToggle={(v) => set({ categories: toggleIn(f.categories, v) })}
          />
          <DateRange
            label="Due between"
            from={f.dueFrom}
            to={f.dueTo}
            idBase="due"
            onChange={(dueFrom, dueTo) => set({ dueFrom, dueTo })}
          />
          <DateRange
            label="Created between"
            from={f.createdFrom}
            to={f.createdTo}
            idBase="created"
            onChange={(createdFrom, createdTo) => set({ createdFrom, createdTo })}
          />
        </div>
      )}

      {narrowed && (
        <p class="filter-summary" role="status">
          Showing {p.shown} of {p.total} tasks
          {f.quick && <span class="filter-quick">{QUICK_LABEL[f.quick]}</span>}
          <button type="button" class="button-link" onClick={p.onClear}>
            Clear search and filters
          </button>
        </p>
      )}
    </div>
  );
}

/** One row per sort level: "Sort by Priority, Highest first, then by Due date, Soonest first". */
function SortControls({ sort, onSort }: { sort: Sort; onSort: (s: Sort) => void }) {
  const update = (i: number, patch: Partial<SortRule>) =>
    onSort(sort.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  // Picking a key another level already uses swaps the two levels, so reordering takes one step.
  const pick = (i: number, key: SortKey) => {
    const j = sort.findIndex((r) => r.key === key);
    if (j === -1) return update(i, { key });
    onSort(sort.map((r, k) => (k === i ? sort[j] : k === j ? sort[i] : r)));
  };
  const unused = SORT_KEYS.filter((k) => !sort.some((r) => r.key === k));
  return (
    <div class="sort-controls" role="group" aria-label="Sorting">
      {sort.map((rule, i) => (
        <div class="sort-rule" key={i}>
          <label for={`sort-key-${i}`}>
            {i === 0 ? 'Sort by' : 'then by'}
            {i > 0 && <span class="visually-hidden"> (level {i + 1})</span>}
          </label>
          <select id={`sort-key-${i}`} value={rule.key} onChange={(e) => pick(i, e.currentTarget.value as SortKey)}>
            {SORT_KEYS.map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </select>
          <button
            type="button"
            class="button-secondary"
            title="Reverse the order"
            onClick={() => update(i, { dir: rule.dir === 'asc' ? 'desc' : 'asc' })}
          >
            {DIR_LABEL[rule.key][rule.dir]}
          </button>
          {sort.length > 1 && (
            <button
              type="button"
              class="button-quiet sort-remove"
              aria-label={`Remove sort by ${SORT_LABEL[rule.key].toLowerCase()}`}
              title="Remove this sort level"
              onClick={() => onSort(sort.filter((_, j) => j !== i))}
            >
              ×
            </button>
          )}
        </div>
      ))}
      {unused.length > 0 && (
        <button type="button" class="button-link" onClick={() => onSort([...sort, { key: unused[0], dir: 'asc' }])}>
          Add sort
        </button>
      )}
    </div>
  );
}

function ChipGroup(p: {
  label: string;
  options: string[];
  selected: string[];
  empty: string;
  onToggle: (v: string) => void;
}) {
  return (
    <fieldset class="filter-field">
      <legend>{p.label}</legend>
      {p.options.length ? (
        <div class="chips">
          {p.options.map((o) => (
            <button
              type="button"
              key={o}
              class="chip"
              aria-pressed={p.selected.includes(o)}
              onClick={() => p.onToggle(o)}
            >
              {o}
            </button>
          ))}
        </div>
      ) : (
        <p class="hint">{p.empty}</p>
      )}
    </fieldset>
  );
}

function DateRange(p: {
  label: string;
  from: string;
  to: string;
  idBase: string;
  onChange: (from: string, to: string) => void;
}) {
  return (
    <fieldset class="filter-field">
      <legend>{p.label}</legend>
      <div class="date-range">
        <label for={`${p.idBase}-from`} class="visually-hidden">
          {p.label}: from
        </label>
        <input
          id={`${p.idBase}-from`}
          type="date"
          value={p.from}
          max={p.to || undefined}
          onInput={(e) => p.onChange(e.currentTarget.value, p.to)}
        />
        <span aria-hidden="true">and</span>
        <label for={`${p.idBase}-to`} class="visually-hidden">
          {p.label}: to
        </label>
        <input
          id={`${p.idBase}-to`}
          type="date"
          value={p.to}
          min={p.from || undefined}
          onInput={(e) => p.onChange(p.from, e.currentTarget.value)}
        />
      </div>
    </fieldset>
  );
}
