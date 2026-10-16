// Automatic backup into a folder on this computer (File System Access API, Chrome and Edge).
// Pointing it at a folder that a sync client such as sciebo or Nextcloud uploads gives an
// off-device copy with version history, without the browser ever holding cloud credentials.

export const BACKUP_FILE_NAME = 'todo-board-backup.json';

type Access = 'granted' | 'denied' | 'prompt';

/** The parts of a FileSystemDirectoryHandle the backup uses. */
export interface BackupFolder {
  readonly name: string;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<{ createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }> }>;
  queryPermission?(descriptor: { mode: 'readwrite' }): Promise<Access>;
  requestPermission?(descriptor: { mode: 'readwrite' }): Promise<Access>;
}

/** Remembers the chosen folder between visits. */
export interface FolderStore {
  get(): Promise<BackupFolder | null>;
  set(folder: BackupFolder): Promise<void>;
  clear(): Promise<void>;
}

type DirectoryPicker = (options: { id: string; mode: 'readwrite' }) => Promise<BackupFolder>;

const picker = () => (globalThis as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;

export function folderBackupSupported(): boolean {
  return typeof picker() === 'function';
}

/** Asks the person to choose a folder. Rejects with an AbortError when they cancel. */
export function pickBackupFolder(): Promise<BackupFolder> {
  return (picker() as DirectoryPicker)({ id: 'todo-board-backup', mode: 'readwrite' });
}

/** Whether the app may still write to the folder without asking again. */
export async function folderAccess(folder: BackupFolder): Promise<Access> {
  return folder.queryPermission ? folder.queryPermission({ mode: 'readwrite' }) : 'granted';
}

/** Asks for write access again; the browser requires this to follow a click. */
export async function requestFolderAccess(folder: BackupFolder): Promise<boolean> {
  const state = folder.requestPermission ? await folder.requestPermission({ mode: 'readwrite' }) : 'granted';
  return state === 'granted';
}

/**
 * Replaces the backup file in the folder. The browser writes to a temporary file and swaps it
 * in on close, so a sync client never uploads a half-written backup.
 */
export async function writeBackupFile(folder: BackupFolder, text: string): Promise<void> {
  const file = await folder.getFileHandle(BACKUP_FILE_NAME, { create: true });
  const writable = await file.createWritable();
  await writable.write(text);
  await writable.close();
}

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';
export const isNotAllowed = (e: unknown) =>
  e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError');

// ---- Remembering the folder ------------------------------------------------
// Folder handles cannot go into localStorage; IndexedDB stores them as they are.

const DB_NAME = 'todoboard';
const STORE = 'handles';
const KEY = 'backupFolder';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE);
  return request(req);
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await request(fn(db.transaction(STORE, mode).objectStore(STORE)));
  } finally {
    db.close();
  }
}

export const idbFolderStore: FolderStore = {
  get: async () => ((await withStore('readonly', (s) => s.get(KEY))) as BackupFolder | undefined) ?? null,
  set: async (folder) => void (await withStore('readwrite', (s) => s.put(folder, KEY))),
  clear: async () => void (await withStore('readwrite', (s) => s.delete(KEY))),
};
