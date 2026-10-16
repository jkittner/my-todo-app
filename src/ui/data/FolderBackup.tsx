import { BACKUP_FILE_NAME } from '../../io/folderBackup';
import { formatTimestamp, toDateKey } from '../../logic/dates';
import { Modal } from '../common/Modal';
import type { FolderBackup } from './useFolderBackup';

const timeFmt = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' });

/** "2:32 PM" today, otherwise the full date and time. */
function when(iso: string, now: Date): string {
  const d = new Date(iso);
  return toDateKey(d) === toDateKey(now) ? timeFmt.format(d) : formatTimestamp(iso);
}

/** Small header button that shows whether the folder backup is up to date. */
export function FolderBackupStatus({ backup, now, onOpen }: { backup: FolderBackup; now: Date; onOpen: () => void }) {
  const { phase, lastSavedAt } = backup;
  if (phase === 'unsupported' || phase === 'loading' || phase === 'off') return null;
  if (phase === 'paused') {
    // Granting access again has to follow a click, so this button asks directly.
    return (
      <button type="button" class="backup-status is-paused" onClick={() => void backup.resume()}>
        Resume backup
      </button>
    );
  }
  const label =
    phase === 'error'
      ? 'Backup failed'
      : phase === 'saving' && !lastSavedAt
        ? 'Backing up…'
        : `Backed up ${when(lastSavedAt as string, now)}`;
  return (
    <button
      type="button"
      class={`backup-status ${phase === 'error' ? 'is-error' : ''}`}
      aria-label={`${label}. Folder backup settings`}
      onClick={onOpen}
    >
      {label}
    </button>
  );
}

export function FolderBackupDialog({ backup, now, onClose }: { backup: FolderBackup; now: Date; onClose: () => void }) {
  const { phase, folder, lastSavedAt, error } = backup;
  const on = phase === 'saving' || phase === 'saved' || phase === 'error' || phase === 'paused';
  return (
    <Modal title="Back up to a folder" onClose={onClose} size="narrow">
      <div class="folder-backup">
        <p>
          After every change, the board is saved as <code>{BACKUP_FILE_NAME}</code> in a folder you choose. Pick a
          folder that the sciebo or Nextcloud desktop app syncs: the backup then reaches the cloud, and the cloud keeps
          earlier versions of the file. To recover, restore the file with Data, then Restore from backup.
        </p>

        {phase === 'unsupported' ? (
          <p class="notice">
            This browser cannot save to a folder. Open the board in Chrome or Edge to use this, or download backups with
            Data, then Back up tasks (.json).
          </p>
        ) : on ? (
          <dl class="folder-facts">
            <div>
              <dt>Folder</dt>
              <dd>{folder || 'Chosen folder'}</dd>
            </div>
            <div>
              <dt>Last backup</dt>
              <dd>
                {phase === 'paused'
                  ? 'Paused until you allow access again'
                  : lastSavedAt
                    ? when(lastSavedAt, now)
                    : 'Not yet'}
              </dd>
            </div>
          </dl>
        ) : (
          <p class="muted">No folder chosen. Backups only happen when you download them yourself.</p>
        )}

        {error && (
          <p class="error" role="alert">
            {error}
          </p>
        )}

        <div class="form-actions">
          {on && (
            <button type="button" class="button-quiet button-danger-text" onClick={() => void backup.turnOff()}>
              Turn off
            </button>
          )}
          <span class="spacer" />
          <button type="button" class="button-secondary" onClick={onClose}>
            Close
          </button>
          {phase !== 'unsupported' &&
            (phase === 'paused' ? (
              <button type="button" class="button-primary" onClick={() => void backup.resume()}>
                Allow access
              </button>
            ) : on ? (
              <>
                <button type="button" class="button-secondary" onClick={() => void backup.choose()}>
                  Change folder
                </button>
                <button type="button" class="button-primary" onClick={() => void backup.backupNow()}>
                  Back up now
                </button>
              </>
            ) : (
              <button type="button" class="button-primary" onClick={() => void backup.choose()}>
                Choose folder
              </button>
            ))}
        </div>
      </div>
    </Modal>
  );
}
