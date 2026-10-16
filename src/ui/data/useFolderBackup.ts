import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { serializeBackup, type Library } from '../../io/backup';
import {
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
} from '../../io/folderBackup';

export interface FolderBackupDeps {
  supported: boolean;
  store: FolderStore;
  pick: () => Promise<BackupFolder>;
  /** Wait after the last change before writing, so a burst of edits is written once. */
  delayMs: number;
}

export const defaultFolderDeps = (): FolderBackupDeps => ({
  supported: folderBackupSupported(),
  store: idbFolderStore,
  pick: pickBackupFolder,
  delayMs: 1000,
});

export type FolderPhase =
  | 'unsupported' // the browser cannot write to folders
  | 'loading' // looking up a remembered folder
  | 'off' // no folder chosen
  | 'paused' // folder remembered, but the browser wants permission again
  | 'saving'
  | 'saved'
  | 'error';

export interface FolderBackupState {
  phase: FolderPhase;
  folder: string | null;
  lastSavedAt: string | null;
  error: string | null;
}

export interface FolderBackup extends FolderBackupState {
  choose: () => Promise<void>;
  resume: () => Promise<void>;
  backupNow: () => Promise<void>;
  turnOff: () => Promise<void>;
}

const message = (e: unknown) => (e instanceof Error && e.message ? e.message : String(e));

/** Writes the backup file to the chosen folder shortly after every change to the tasks. */
export function useFolderBackup(library: Library, deps: FolderBackupDeps): FolderBackup {
  const [state, setState] = useState<FolderBackupState>({
    phase: deps.supported ? 'loading' : 'unsupported',
    folder: null,
    lastSavedAt: null,
    error: null,
  });
  const folder = useRef<BackupFolder | null>(null);
  const active = useRef(false); // true while the app has write access
  const latest = useRef(library);
  latest.current = library;
  const queue = useRef(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const write = useCallback(() => {
    // Writes run one after another; each one saves whatever the tasks are at that moment.
    queue.current = queue.current.then(async () => {
      const dir = folder.current;
      if (!dir || !active.current) return;
      setState((s) => ({ ...s, phase: 'saving' }));
      try {
        await writeBackupFile(dir, serializeBackup(latest.current, new Date()));
        setState((s) => ({ ...s, phase: 'saved', lastSavedAt: new Date().toISOString(), error: null }));
      } catch (e) {
        if (isNotAllowed(e)) {
          active.current = false;
          setState((s) => ({ ...s, phase: 'paused', error: null }));
        } else {
          setState((s) => ({
            ...s,
            phase: 'error',
            error: `The backup file could not be written: ${message(e)}. Check that the folder still exists, or choose it again.`,
          }));
        }
      }
    });
    return queue.current;
  }, []);

  // Pick up the folder chosen on an earlier visit.
  useEffect(() => {
    if (!deps.supported) return;
    let cancelled = false;
    (async () => {
      try {
        const dir = await deps.store.get();
        if (cancelled) return;
        if (!dir) return setState((s) => ({ ...s, phase: 'off' }));
        folder.current = dir;
        const access = await folderAccess(dir);
        if (cancelled) return;
        active.current = access === 'granted';
        setState((s) => ({ ...s, folder: dir.name, phase: active.current ? 'saved' : 'paused' }));
        if (active.current) await write();
      } catch {
        if (!cancelled) setState((s) => ({ ...s, phase: 'off' }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Back up shortly after each change to the tasks, tags or categories.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!active.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      void write();
    }, deps.delayMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [library.tasks, library.tags, library.categories]);

  // Write straight away when the page is being hidden or closed, instead of waiting.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState !== 'hidden' || !timer.current) return;
      clearTimeout(timer.current);
      timer.current = null;
      void write();
    };
    document.addEventListener('visibilitychange', flush);
    return () => document.removeEventListener('visibilitychange', flush);
  }, []);

  const choose = useCallback(async () => {
    let dir: BackupFolder;
    try {
      dir = await deps.pick();
    } catch (e) {
      if (isAbort(e)) return;
      setState((s) => ({ ...s, phase: 'error', error: `The folder could not be opened: ${message(e)}.` }));
      return;
    }
    folder.current = dir;
    active.current = true;
    setState((s) => ({ ...s, folder: dir.name, error: null }));
    try {
      await deps.store.set(dir);
    } catch {
      // Still back up during this visit; the folder just has to be chosen again next time.
    }
    await write();
  }, []);

  const resume = useCallback(async () => {
    const dir = folder.current;
    if (!dir) return;
    if (await requestFolderAccess(dir)) {
      active.current = true;
      await write();
    }
  }, []);

  const turnOff = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    folder.current = null;
    active.current = false;
    setState((s) => ({ ...s, phase: 'off', folder: null, lastSavedAt: null, error: null }));
    await deps.store.clear().catch(() => {});
  }, []);

  return { ...state, choose, resume, backupNow: write, turnOff };
}
