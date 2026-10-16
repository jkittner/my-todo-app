import { useCallback, useEffect, useReducer, useRef, useState } from 'preact/hooks';
import { STATUS_LABEL, type Status, type TaskDraft } from '../model/task';
import { toDateKey } from '../logic/dates';
import { serializeBackup, type Library } from '../io/backup';
import { exportCalendarIcs, exportTasksIcs } from '../io/ical';
import { downloadText } from '../io/download';
import { reducer } from '../store/reducer';
import { loadDb, saveDb, type Db } from '../store/storage';
import { navigate, routeHref, useNow, useRoute, type Page } from './common/hooks';
import { Toast, type ToastMessage } from './common/Toast';
import { Board } from './board/Board';
import { TaskModal } from './task/TaskModal';
import { Insights } from './insights/Insights';
import { CalendarView } from './calendar/CalendarView';
import { DataMenu } from './data/DataMenu';
import { FolderBackupDialog, FolderBackupStatus } from './data/FolderBackup';
import { defaultFolderDeps, useFolderBackup, type FolderBackupDeps } from './data/useFolderBackup';

const NAV: [Page, string][] = [
  ['board', 'Board'],
  ['insights', 'Insights'],
  ['calendar', 'Calendar'],
];

interface Props {
  /** Injected in tests; defaults to the browser's local storage. */
  load?: () => ReturnType<typeof loadDb>;
  save?: (db: Db) => boolean;
  /** Injected in tests; defaults to the File System Access API and IndexedDB. */
  folderDeps?: FolderBackupDeps;
}

export function App({ load = loadDb, save = saveDb, folderDeps }: Props) {
  const [initial] = useState(load);
  const [folderSetup] = useState(() => folderDeps ?? defaultFolderDeps());
  const [folderDialog, setFolderDialog] = useState(false);
  const [db, dispatch] = useReducer(reducer, initial.db);
  const folderBackup = useFolderBackup(db, folderSetup);
  const [toast, setToast] = useState<ToastMessage | null>(
    initial.error ? { id: 0, text: initial.error, tone: 'error' } : null,
  );
  const [adding, setAdding] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const route = useRoute();
  const now = useNow();
  const firstSave = useRef(true);
  const toastId = useRef(1);
  const deletedId = useRef<string | null>(null);

  const notify = useCallback((text: string, tone: ToastMessage['tone'] = 'info') => {
    setToast({ id: toastId.current++, text, tone });
  }, []);
  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (folderBackup.phase === 'error' && folderBackup.error) notify(folderBackup.error, 'error');
  }, [folderBackup.phase, folderBackup.error]);

  useEffect(() => {
    // Leave unreadable stored data alone until the person changes something.
    if (firstSave.current) {
      firstSave.current = false;
      if (initial.error) return;
    }
    if (!save(db))
      notify('Changes could not be saved in this browser. Back up your tasks from the Data menu.', 'error');
  }, [db]);

  useEffect(() => {
    if (!savedId) return;
    const id = setTimeout(() => setSavedId(null), 1600);
    return () => clearTimeout(id);
  }, [savedId]);

  const editing = route.taskId ? (db.tasks.find((t) => t.id === route.taskId) ?? null) : null;

  useEffect(() => {
    if (route.taskId && !editing) {
      if (route.taskId !== deletedId.current) notify('That task no longer exists. It may have been deleted.', 'error');
      navigate(route.page);
    }
  }, [route.taskId, editing]);

  useEffect(() => {
    const titles: Record<Page, string> = { board: 'Board', insights: 'Insights', calendar: 'Calendar' };
    document.title = `${titles[route.page]}, Todo board`;
  }, [route.page]);

  // Stable callbacks let the board skip re-rendering its cards on unrelated updates.
  const latest = useRef({ tasks: db.tasks, page: route.page });
  latest.current = { tasks: db.tasks, page: route.page };
  const open = useCallback((id: string) => navigate(latest.current.page, id), []);
  const startAdding = useCallback(() => setAdding(true), []);
  const setPrefs = useCallback((prefs: Partial<Db['prefs']>) => dispatch({ type: 'prefs', prefs }), []);
  const closeModal = () => {
    setAdding(false);
    if (route.taskId) navigate(route.page);
  };

  const move = useCallback(
    (id: string, status: Status) => {
      const task = latest.current.tasks.find((t) => t.id === id);
      if (!task || task.status === status) return;
      dispatch({ type: 'move', id, status, now: new Date() });
      notify(`Moved "${task.title}" to ${STATUS_LABEL[status]}`);
    },
    [notify],
  );

  const saveDraft = (draft: TaskDraft) => {
    const at = new Date();
    if (editing) {
      dispatch({ type: 'update', id: editing.id, draft, now: at });
      setSavedId(editing.id);
      notify('Changes saved');
    } else {
      const id = crypto.randomUUID();
      dispatch({ type: 'add', draft, now: at, id });
      setSavedId(id);
      notify('Task added');
    }
    closeModal();
  };

  const remove = (id: string) => {
    deletedId.current = id;
    dispatch({ type: 'delete', id });
    notify('Task deleted');
    closeModal();
  };

  const stamp = toDateKey(now);
  const exportTasks = () => {
    downloadText(`todo-board-tasks-${stamp}.ics`, exportTasksIcs(db.tasks, new Date()), 'text/calendar');
    notify(`Exported ${db.tasks.length} tasks for Thunderbird`);
  };
  const exportCalendar = () => {
    downloadText(`todo-board-calendar-${stamp}.ics`, exportCalendarIcs(db.tasks, new Date()), 'text/calendar');
    notify('Exported calendar');
  };
  const backup = () => {
    downloadText(`todo-board-backup-${stamp}.json`, serializeBackup(db, new Date()), 'application/json');
    notify(`Backed up ${db.tasks.length} tasks`);
  };
  const restore = (library: Library, mode: 'replace' | 'merge') => {
    dispatch({ type: 'import', library, mode });
    notify(
      mode === 'replace'
        ? `Restored ${library.tasks.length} tasks from backup`
        : `Merged ${library.tasks.length} tasks from backup`,
    );
  };

  return (
    <>
      <a href="#main" class="skip-link" onClick={(e) => (e.preventDefault(), document.getElementById('main')?.focus())}>
        Skip to content
      </a>
      <header class="app-header">
        <a class="brand" href={routeHref('board')}>
          Todo board
        </a>
        <nav aria-label="Pages">
          <ul>
            {NAV.map(([page, label]) => (
              <li key={page}>
                <a href={routeHref(page)} aria-current={route.page === page ? 'page' : undefined}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div class="header-actions">
          <FolderBackupStatus backup={folderBackup} now={now} onOpen={() => setFolderDialog(true)} />
          <button type="button" class="button-primary" onClick={startAdding}>
            Add task
          </button>
          <DataMenu
            taskCount={db.tasks.length}
            onBackup={backup}
            onExportTasks={exportTasks}
            onExportCalendar={exportCalendar}
            onRestore={restore}
            onError={(m) => notify(m, 'error')}
            onFolderBackup={() => setFolderDialog(true)}
            folderBackupOn={folderBackup.folder !== null}
          />
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        {route.page === 'board' && (
          <Board
            tasks={db.tasks}
            tags={db.tags}
            categories={db.categories}
            prefs={db.prefs}
            now={now}
            savedId={savedId}
            onOpen={open}
            onAdd={startAdding}
            onMove={move}
            onPrefs={setPrefs}
          />
        )}
        {route.page === 'insights' && <Insights tasks={db.tasks} now={now} />}
        {route.page === 'calendar' && (
          <CalendarView tasks={db.tasks} now={now} onExportCalendar={exportCalendar} onExportTasks={exportTasks} />
        )}
      </main>

      {(adding || editing) && (
        <TaskModal
          key={editing?.id ?? 'new'}
          task={adding ? null : editing}
          knownTags={db.tags}
          knownCategories={db.categories}
          now={now}
          onSave={saveDraft}
          onDelete={remove}
          onClose={closeModal}
        />
      )}
      {folderDialog && <FolderBackupDialog backup={folderBackup} now={now} onClose={() => setFolderDialog(false)} />}
      <Toast message={toast} onDone={clearToast} />
    </>
  );
}
