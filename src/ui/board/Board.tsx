import { useMemo, useState } from 'preact/hooks';
import type { Status, Task } from '../../model/task';
import { EMPTY_FILTERS, filterTasks, hasActiveFilters, type Filters } from '../../logic/filter';
import { sortTasks } from '../../logic/sort';
import { DONE_WINDOW_DAYS, visibleDone } from '../../logic/doneWindow';
import { summarize } from '../../logic/stats';
import type { Prefs } from '../../store/storage';
import { Column } from './Column';
import { StatsLine } from './StatsLine';
import { Toolbar } from './Toolbar';

interface Props {
  tasks: Task[];
  tags: string[];
  categories: string[];
  prefs: Prefs;
  now: Date;
  savedId: string | null;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onMove: (id: string, status: Status) => void;
  onPrefs: (prefs: Partial<Prefs>) => void;
}

export function Board({ tasks, tags, categories, prefs, now, savedId, onOpen, onAdd, onMove, onPrefs }: Props) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [allDone, setAllDone] = useState(false);

  const narrowed = hasActiveFilters(filters) || !!filters.query.trim();
  const doneMode = prefs.hideDone ? 'hidden' : allDone ? 'all' : 'recent';
  const columns = useMemo(() => {
    const sorted = sortTasks(filterTasks(tasks, filters, now), prefs.sort);
    const by: Record<Status, Task[]> = { todo: [], doing: [], done: [] };
    for (const t of sorted) by[t.status].push(t);
    return { todo: by.todo, doing: by.doing, done: visibleDone(by.done, doneMode, now) };
  }, [tasks, filters, now, prefs.sort, doneMode]);
  const summary = useMemo(() => summarize(tasks, now), [tasks, now]);
  const { done } = columns;
  const emptyNote = (text: string) => (narrowed ? 'No tasks here match your search or filters.' : text);
  const shownCount = columns.todo.length + columns.doing.length + done.shown.length;

  if (tasks.length === 0) {
    return (
      <div class="board-page">
        <div class="board-empty">
          <h2>Your board is empty</h2>
          <p>Add your first task. Everything stays in this browser on this device.</p>
          <button type="button" class="button-primary" onClick={onAdd}>
            Add task
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="board-page">
      <StatsLine summary={summary} quick={filters.quick} onQuick={(quick) => setFilters({ ...filters, quick })} />
      <Toolbar
        filters={filters}
        sort={prefs.sort}
        hideDone={prefs.hideDone}
        knownTags={tags}
        knownCategories={categories}
        shown={shownCount}
        total={tasks.length}
        onFilters={setFilters}
        onSort={(sort) => onPrefs({ sort })}
        onHideDone={(hideDone) => onPrefs({ hideDone })}
        onClear={() => setFilters(EMPTY_FILTERS)}
      />

      <div class={`columns ${prefs.hideDone ? 'columns-2' : ''}`}>
        <Column
          status="todo"
          tasks={columns.todo}
          now={now}
          savedId={savedId}
          onOpen={onOpen}
          onMove={onMove}
          empty={emptyNote('Nothing waiting. Add a task to plan what comes next.')}
        />
        <Column
          status="doing"
          tasks={columns.doing}
          now={now}
          savedId={savedId}
          onOpen={onOpen}
          onMove={onMove}
          empty={emptyNote('Drag a task here when you start working on it.')}
        />
        {!prefs.hideDone && (
          <Column
            status="done"
            tasks={done.shown}
            now={now}
            note={allDone ? 'All time' : `Last ${DONE_WINDOW_DAYS} days`}
            savedId={savedId}
            onOpen={onOpen}
            onMove={onMove}
            empty={emptyNote(
              done.olderHidden
                ? `Nothing finished in the last ${DONE_WINDOW_DAYS} days.`
                : 'Drag a task here when it is finished.',
            )}
            footer={
              allDone ? (
                <button type="button" class="button-secondary column-more" onClick={() => setAllDone(false)}>
                  Show last {DONE_WINDOW_DAYS} days only
                </button>
              ) : (
                done.olderHidden > 0 && (
                  <button type="button" class="button-secondary column-more" onClick={() => setAllDone(true)}>
                    Load all done tasks ({done.olderHidden.toLocaleString('en')} older)
                  </button>
                )
              )
            }
          />
        )}
      </div>
    </div>
  );
}
