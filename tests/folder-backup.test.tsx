import 'fake-indexeddb/auto';
import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  BACKUP_FILE_NAME,
  folderAccess,
  folderBackupSupported,
  idbFolderStore,
  isAbort,
  isNotAllowed,
  pickBackupFolder,
  requestFolderAccess,
  writeBackupFile,
  type BackupFolder,
  type FolderStore,
} from '../src/io/folderBackup';
import { parseBackup, type Library } from '../src/io/backup';
import { useFolderBackup, type FolderBackup, type FolderBackupDeps } from '../src/ui/data/useFolderBackup';
import { FolderBackupDialog, FolderBackupStatus } from '../src/ui/data/FolderBackup';
import { App } from '../src/ui/App';
import { emptyDb, type Db } from '../src/store/storage';
import { makeTask, NOW } from './helpers';

/** An in-memory stand-in for a folder picked with showDirectoryPicker. */
function fakeFolder(name = 'Sciebo backups', access: 'granted' | 'prompt' | 'denied' = 'granted') {
  const files = new Map<string, string>();
  const writes: string[] = [];
  let state = access;
  let fail: Error | null = null;
  let hold: Promise<void> | null = null;
  const folder: BackupFolder = {
    name,
    async getFileHandle(file, options) {
      expect(options).toEqual({ create: true });
      return {
        async createWritable() {
          if (fail) throw fail;
          let buffer = '';
          return {
            async write(data: string) {
              buffer += data;
            },
            async close() {
              if (hold) await hold;
              files.set(file, buffer);
              writes.push(buffer);
            },
          };
        },
      };
    },
    queryPermission: vi.fn(async () => state),
    requestPermission: vi.fn(async () => state),
  };
  return {
    folder,
    files,
    writes,
    setAccess: (s: typeof state) => (state = s),
    failWith: (e: Error | null) => (fail = e),
    holdWrites: (p: Promise<void> | null) => (hold = p),
    content: () => parseBackup(files.get(BACKUP_FILE_NAME) as string) as Library,
  };
}

function memoryStore(initial: BackupFolder | null = null) {
  const store = {
    value: initial,
    get: vi.fn(async (): Promise<BackupFolder | null> => store.value),
    set: vi.fn(async (f: BackupFolder): Promise<void> => void (store.value = f)),
    clear: vi.fn(async (): Promise<void> => void (store.value = null)),
  };
  return store satisfies FolderStore;
}

const deps = (over: Partial<FolderBackupDeps> = {}): FolderBackupDeps => ({
  supported: true,
  store: memoryStore(),
  pick: vi.fn(async () => fakeFolder().folder),
  delayMs: 0,
  ...over,
});

const lib = (titles: string[]): Library => ({
  tasks: titles.map((title, i) => makeTask({ id: `t${i}`, title })),
  tags: [],
  categories: [],
});
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 5))));

describe('folder backup primitives', () => {
  it('writes the backup file in one step', async () => {
    const f = fakeFolder();
    await writeBackupFile(f.folder, '{"a":1}');
    expect(f.files.get('todo-board-backup.json')).toBe('{"a":1}');
  });

  it('checks and requests write access', async () => {
    const f = fakeFolder('x', 'prompt');
    expect(await folderAccess(f.folder)).toBe('prompt');
    expect(await requestFolderAccess(f.folder)).toBe(false);
    f.setAccess('granted');
    expect(await requestFolderAccess(f.folder)).toBe(true);
    // Handles without the permission methods count as writable.
    const bare = { name: 'bare', getFileHandle: f.folder.getFileHandle };
    expect(await folderAccess(bare)).toBe('granted');
    expect(await requestFolderAccess(bare)).toBe(true);
  });

  it('detects browser support and opens the picker', async () => {
    expect(folderBackupSupported()).toBe(false);
    const f = fakeFolder();
    const picker = vi.fn(async () => f.folder);
    vi.stubGlobal('showDirectoryPicker', picker);
    expect(folderBackupSupported()).toBe(true);
    expect(await pickBackupFolder()).toBe(f.folder);
    expect(picker).toHaveBeenCalledWith({ id: 'todo-board-backup', mode: 'readwrite' });
    vi.unstubAllGlobals();
  });

  it('recognises cancelled pickers and revoked access', () => {
    expect(isAbort(new DOMException('x', 'AbortError'))).toBe(true);
    expect(isAbort(new Error('x'))).toBe(false);
    expect(isNotAllowed(new DOMException('x', 'NotAllowedError'))).toBe(true);
    expect(isNotAllowed(new DOMException('x', 'SecurityError'))).toBe(true);
    expect(isNotAllowed(new DOMException('x', 'NotFoundError'))).toBe(false);
  });

  it('remembers the folder in IndexedDB', async () => {
    expect(await idbFolderStore.get()).toBeNull();
    await idbFolderStore.set({ name: 'Remembered' } as BackupFolder);
    expect(await idbFolderStore.get()).toEqual({ name: 'Remembered' });
    await idbFolderStore.clear();
    expect(await idbFolderStore.get()).toBeNull();
  });

  it('reports IndexedDB failures', async () => {
    const open = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      const req = {} as IDBOpenDBRequest;
      setTimeout(() => {
        Object.defineProperty(req, 'error', { value: new DOMException('blocked', 'UnknownError') });
        req.onerror?.(new Event('error'));
      });
      return req;
    });
    await expect(idbFolderStore.get()).rejects.toThrow('blocked');
    open.mockRestore();
  });
});

describe('useFolderBackup', () => {
  it('stays off when the browser has no folder access', () => {
    const { result } = renderHook(() => useFolderBackup(lib([]), deps({ supported: false })));
    expect(result.current.phase).toBe('unsupported');
  });

  it('starts off without a remembered folder, then backs up to the chosen one', async () => {
    const f = fakeFolder();
    const d = deps({ pick: vi.fn(async () => f.folder) });
    const { result } = renderHook(() => useFolderBackup(lib(['First']), d));
    await flush();
    expect(result.current.phase).toBe('off');
    await act(() => result.current.choose());
    expect(result.current).toMatchObject({ phase: 'saved', folder: 'Sciebo backups', error: null });
    expect(result.current.lastSavedAt).not.toBeNull();
    expect(d.store.set).toHaveBeenCalledWith(f.folder);
    expect(f.content().tasks.map((t) => t.title)).toEqual(['First']);
  });

  it('backs up after each change to the tasks, but not for other updates', async () => {
    const f = fakeFolder();
    const d = deps({ store: memoryStore(f.folder) });
    const first = lib(['One']);
    const { rerender } = renderHook((l: Library) => useFolderBackup(l, d), { initialProps: first });
    await flush();
    expect(f.writes).toHaveLength(1); // written once on start
    rerender(first); // same data, e.g. a preference change
    await flush();
    expect(f.writes).toHaveLength(1);
    rerender(lib(['One', 'Two']));
    await flush();
    expect(f.writes).toHaveLength(2);
    expect(f.content().tasks.map((t) => t.title)).toEqual(['One', 'Two']);
  });

  it('waits for a pause in editing, and writes at once when the page is hidden', async () => {
    const f = fakeFolder();
    const d = deps({ store: memoryStore(f.folder), delayMs: 60_000 });
    const { rerender } = renderHook((l: Library) => useFolderBackup(l, d), { initialProps: lib(['A']) });
    await flush();
    rerender(lib(['A', 'B']));
    rerender(lib(['A', 'B', 'C']));
    await flush();
    expect(f.writes).toHaveLength(1);
    // A visible page does not flush.
    fireEvent(document, new Event('visibilitychange'));
    await flush();
    expect(f.writes).toHaveLength(1);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    await flush();
    expect(f.writes).toHaveLength(2);
    expect(f.content().tasks).toHaveLength(3);
    // Nothing pending: hiding again writes nothing.
    fireEvent(document, new Event('visibilitychange'));
    await flush();
    expect(f.writes).toHaveLength(2);
    visibility.mockRestore();
  });

  it('pauses until access is granted again', async () => {
    const f = fakeFolder('Synced', 'prompt');
    const d = deps({ store: memoryStore(f.folder) });
    const { result, rerender } = renderHook((l: Library) => useFolderBackup(l, d), { initialProps: lib(['A']) });
    await flush();
    expect(result.current).toMatchObject({ phase: 'paused', folder: 'Synced' });
    rerender(lib(['A', 'B'])); // no write while paused
    await flush();
    expect(f.writes).toHaveLength(0);
    await act(() => result.current.resume()); // still not allowed
    expect(result.current.phase).toBe('paused');
    f.setAccess('granted');
    await act(() => result.current.resume());
    expect(result.current.phase).toBe('saved');
    expect(f.content().tasks).toHaveLength(2);
  });

  it('pauses when the browser withdraws access during a write', async () => {
    const f = fakeFolder();
    const d = deps({ store: memoryStore(f.folder) });
    const { result } = renderHook(() => useFolderBackup(lib(['A']), d));
    await flush();
    f.failWith(new DOMException('no', 'NotAllowedError'));
    await act(() => result.current.backupNow());
    expect(result.current).toMatchObject({ phase: 'paused', error: null });
  });

  it('reports write errors with a way forward, and recovers', async () => {
    const f = fakeFolder();
    const d = deps({ store: memoryStore(f.folder) });
    const { result } = renderHook(() => useFolderBackup(lib(['A']), d));
    await flush();
    f.failWith(new Error('disk full'));
    await act(() => result.current.backupNow());
    expect(result.current.phase).toBe('error');
    expect(result.current.error).toBe(
      'The backup file could not be written: disk full. Check that the folder still exists, or choose it again.',
    );
    f.failWith({ toString: () => 'odd failure' } as unknown as Error);
    await act(() => result.current.backupNow());
    expect(result.current.error).toMatch(/written: odd failure\./);
    f.failWith(null);
    await act(() => result.current.backupNow());
    expect(result.current).toMatchObject({ phase: 'saved', error: null });
  });

  it('ignores a cancelled picker and reports other picker failures', async () => {
    const pick = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('cancel', 'AbortError'))
      .mockRejectedValueOnce(new Error('denied by policy'));
    const { result } = renderHook(() => useFolderBackup(lib([]), deps({ pick })));
    await flush();
    await act(() => result.current.choose());
    expect(result.current.phase).toBe('off');
    await act(() => result.current.choose());
    expect(result.current).toMatchObject({
      phase: 'error',
      error: 'The folder could not be opened: denied by policy.',
    });
  });

  it('keeps backing up when the folder cannot be remembered', async () => {
    const f = fakeFolder();
    const store = memoryStore();
    store.set.mockRejectedValueOnce(new Error('quota'));
    const { result } = renderHook(() => useFolderBackup(lib(['A']), deps({ store, pick: async () => f.folder })));
    await flush();
    await act(() => result.current.choose());
    expect(result.current.phase).toBe('saved');
    expect(f.writes).toHaveLength(1);
  });

  it('turns off and forgets the folder, even if forgetting fails', async () => {
    const f = fakeFolder();
    const store = memoryStore(f.folder);
    const { result, rerender } = renderHook((l: Library) => useFolderBackup(l, deps({ store, delayMs: 60_000 })), {
      initialProps: lib(['A']),
    });
    await flush();
    rerender(lib(['A', 'B'])); // a pending write is cancelled by turning off
    store.clear.mockRejectedValueOnce(new Error('gone'));
    await act(() => result.current.turnOff());
    expect(result.current).toMatchObject({ phase: 'off', folder: null, lastSavedAt: null });
    expect(store.clear).toHaveBeenCalled();
    await act(() => result.current.resume()); // nothing to resume
    await act(() => result.current.backupNow()); // nothing to write to
    expect(f.writes).toHaveLength(1);
  });

  it('turns off cleanly with no backup pending', async () => {
    const f = fakeFolder();
    const stable = lib(['A']);
    const { result } = renderHook(() => useFolderBackup(stable, deps({ store: memoryStore(f.folder) })));
    await flush();
    await act(() => result.current.turnOff());
    expect(result.current.phase).toBe('off');
  });

  it('treats an unreadable remembered folder as off', async () => {
    const store = memoryStore();
    store.get.mockRejectedValueOnce(new Error('broken'));
    const { result } = renderHook(() => useFolderBackup(lib([]), deps({ store })));
    await flush();
    expect(result.current.phase).toBe('off');
  });

  it('does nothing after unmounting mid-start', async () => {
    // Unmounted while looking up the folder…
    let release: (f: BackupFolder | null) => void = () => {};
    const slow = memoryStore();
    slow.get.mockReturnValueOnce(new Promise((r) => (release = r)));
    const a = renderHook(() => useFolderBackup(lib([]), deps({ store: slow })));
    act(() => a.unmount());
    release(fakeFolder().folder);
    await flush();
    // …while checking access…
    const f = fakeFolder();
    let grant: (s: 'granted') => void = () => {};
    vi.mocked(f.folder.queryPermission as () => Promise<'granted'>).mockReturnValueOnce(
      new Promise((r) => (grant = r)),
    );
    const b = renderHook(() => useFolderBackup(lib([]), deps({ store: memoryStore(f.folder) })));
    await flush();
    act(() => b.unmount());
    grant('granted');
    await flush();
    expect(f.writes).toHaveLength(0);
    // …and when the lookup fails afterwards.
    let fail: (e: Error) => void = () => {};
    const failing = memoryStore();
    failing.get.mockReturnValueOnce(new Promise((_, reject) => (fail = reject)));
    const c = renderHook(() => useFolderBackup(lib([]), deps({ store: failing })));
    act(() => c.unmount());
    fail(new Error('late'));
    await flush();
  });

  it('skips a queued write when the backup was turned off meanwhile', async () => {
    const f = fakeFolder();
    const { result } = renderHook(() => useFolderBackup(lib(['A']), deps({ store: memoryStore(f.folder) })));
    await flush();
    let release = () => {};
    f.holdWrites(new Promise<void>((r) => (release = r)));
    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.backupNow();
      second = result.current.backupNow();
    });
    await flush(); // the first write is now in progress, waiting to finish
    await act(() => result.current.turnOff());
    f.holdWrites(null);
    release();
    await act(async () => {
      await first;
      await second;
    });
    expect(f.writes).toHaveLength(2); // the start-up write and the one already running
  });
});

const stub = (over: Partial<FolderBackup>): FolderBackup => ({
  phase: 'off',
  folder: null,
  lastSavedAt: null,
  error: null,
  choose: vi.fn(async () => {}),
  resume: vi.fn(async () => {}),
  backupNow: vi.fn(async () => {}),
  turnOff: vi.fn(async () => {}),
  ...over,
});

describe('FolderBackupStatus', () => {
  it('stays hidden until a folder is in use', () => {
    for (const phase of ['unsupported', 'loading', 'off'] as const) {
      const { container, unmount } = render(<FolderBackupStatus backup={stub({ phase })} now={NOW} onOpen={vi.fn()} />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it('shows the last backup time and opens the settings', async () => {
    const onOpen = vi.fn();
    const { rerender } = render(
      <FolderBackupStatus
        backup={stub({ phase: 'saved', lastSavedAt: NOW.toISOString() })}
        now={NOW}
        onOpen={onOpen}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Backed up 10:00 AM. Folder backup settings' }));
    expect(onOpen).toHaveBeenCalled();
    rerender(
      <FolderBackupStatus
        backup={stub({ phase: 'saved', lastSavedAt: '2026-10-01T08:00:00.000Z' })}
        now={NOW}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByRole('button')).toHaveTextContent(/^Backed up Oct 1, 2026/);
    rerender(<FolderBackupStatus backup={stub({ phase: 'saving' })} now={NOW} onOpen={onOpen} />);
    expect(screen.getByRole('button')).toHaveTextContent('Backing up…');
    rerender(
      <FolderBackupStatus
        backup={stub({ phase: 'saving', lastSavedAt: NOW.toISOString() })}
        now={NOW}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByRole('button')).toHaveTextContent('Backed up 10:00 AM');
    rerender(<FolderBackupStatus backup={stub({ phase: 'error' })} now={NOW} onOpen={onOpen} />);
    expect(screen.getByRole('button')).toHaveTextContent('Backup failed');
    expect(screen.getByRole('button')).toHaveClass('is-error');
  });

  it('asks for access directly when paused', async () => {
    const backup = stub({ phase: 'paused', folder: 'Synced' });
    render(<FolderBackupStatus backup={backup} now={NOW} onOpen={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Resume backup' }));
    expect(backup.resume).toHaveBeenCalled();
  });
});

describe('FolderBackupDialog', () => {
  it('explains what happens and offers to choose a folder', async () => {
    const backup = stub({});
    const onClose = vi.fn();
    render(<FolderBackupDialog backup={backup} now={NOW} onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Back up to a folder' });
    expect(dialog).toHaveTextContent('todo-board-backup.json');
    expect(dialog).toHaveTextContent(/sciebo or Nextcloud desktop app/);
    expect(dialog).toHaveTextContent('No folder chosen.');
    expect(within(dialog).queryByRole('button', { name: 'Turn off' })).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Choose folder' }));
    expect(backup.choose).toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('says when the browser cannot do this', () => {
    render(<FolderBackupDialog backup={stub({ phase: 'unsupported' })} now={NOW} onClose={vi.fn()} />);
    expect(screen.getByText(/Open the board in Chrome or Edge/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Choose folder|Back up now/ })).toBeNull();
  });

  it('shows the folder and last backup, and offers the actions', async () => {
    const backup = stub({ phase: 'saved', folder: 'Sciebo backups', lastSavedAt: NOW.toISOString() });
    const { rerender } = render(<FolderBackupDialog backup={backup} now={NOW} onClose={vi.fn()} />);
    expect(screen.getByText('Sciebo backups')).toBeInTheDocument();
    expect(screen.getByText('10:00 AM')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back up now' }));
    await userEvent.click(screen.getByRole('button', { name: 'Change folder' }));
    await userEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    expect(backup.backupNow).toHaveBeenCalled();
    expect(backup.choose).toHaveBeenCalled();
    expect(backup.turnOff).toHaveBeenCalled();

    rerender(<FolderBackupDialog backup={stub({ phase: 'saving', folder: '' })} now={NOW} onClose={vi.fn()} />);
    expect(screen.getByText('Not yet')).toBeInTheDocument();
    expect(screen.getByText('Chosen folder')).toBeInTheDocument(); // a folder without a name
    rerender(
      <FolderBackupDialog
        backup={stub({ phase: 'error', folder: 'F', error: 'It broke.' })}
        now={NOW}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('It broke.');
  });

  it('asks for access again when paused', async () => {
    const backup = stub({ phase: 'paused', folder: 'F' });
    render(<FolderBackupDialog backup={backup} now={NOW} onClose={vi.fn()} />);
    expect(screen.getByText('Paused until you allow access again')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Allow access' }));
    expect(backup.resume).toHaveBeenCalled();
  });
});

describe('folder backup in the app', () => {
  it('backs up every change to the chosen folder and reports failures', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const user = userEvent.setup();
    const f = fakeFolder();
    const db: Db = { ...emptyDb(), tasks: [makeTask({ id: 'a', title: 'Existing task' })] };
    render(<App load={() => ({ db })} save={() => true} folderDeps={deps({ pick: async () => f.folder })} />);

    await user.click(screen.getByRole('button', { name: 'Data' }));
    expect(screen.getByText('Tasks are saved only in this browser, on this device.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back up to a folder automatically' }));
    const dialog = screen.getByRole('dialog', { name: 'Back up to a folder' });
    await user.click(within(dialog).getByRole('button', { name: 'Choose folder' }));
    await vi.waitFor(() => expect(f.writes).toHaveLength(1));
    expect(f.content().tasks.map((t) => t.title)).toEqual(['Existing task']);
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    const status = await screen.findByRole('button', { name: /^Backed up 10:00 AM/ });

    // Moving a task triggers a new backup.
    screen.getByRole('button', { name: /^Existing task/ }).focus();
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
    await vi.waitFor(() => expect(f.writes).toHaveLength(2));
    expect(f.content().tasks[0].status).toBe('doing');

    await user.click(screen.getByRole('button', { name: 'Data' }));
    expect(screen.getByText(/backed up to a folder on this device/)).toBeInTheDocument();
    await user.keyboard('{Escape}');

    // A failing write shows in the header and as a message.
    f.failWith(new Error('disk full'));
    await user.click(status);
    await user.click(screen.getByRole('button', { name: 'Back up now' }));
    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/could not be written: disk full/));
    expect(screen.getByRole('button', { name: /^Backup failed/ })).toBeInTheDocument();
  });
});
