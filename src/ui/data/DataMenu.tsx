import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Library } from '../../io/backup';
import { parseBackup } from '../../io/backup';
import { Modal } from '../common/Modal';

interface Props {
  taskCount: number;
  onBackup: () => void;
  onExportTasks: () => void;
  onExportCalendar: () => void;
  onRestore: (lib: Library, mode: 'replace' | 'merge') => void;
  onError: (message: string) => void;
}

export function DataMenu({ taskCount, onBackup, onExportTasks, onExportCalendar, onRestore, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Library | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    addEventListener('mousedown', onDown);
    return () => removeEventListener('mousedown', onDown);
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const onFile = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const chosen = input.files?.[0];
    input.value = '';
    if (!chosen) return;
    const result = parseBackup(await chosen.text());
    if (typeof result === 'string') onError(result);
    else setPending(result);
  };

  return (
    <div
      class="data-menu"
      ref={root}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !open) return;
        setOpen(false);
        root.current?.querySelector<HTMLElement>('.data-toggle')?.focus();
      }}
    >
      <button
        type="button"
        class="button-secondary data-toggle"
        aria-expanded={open}
        aria-controls="data-menu-panel"
        onClick={() => setOpen(!open)}
      >
        Data
      </button>
      {open && (
        <div class="menu-panel" id="data-menu-panel">
          <p class="menu-note">Tasks are saved only in this browser, on this device.</p>
          <ul>
            <li>
              <button type="button" onClick={run(onBackup)}>
                Back up tasks (.json)
              </button>
            </li>
            <li>
              <button type="button" onClick={run(() => file.current?.click())}>
                Restore from backup
              </button>
            </li>
            <li>
              <button type="button" onClick={run(onExportTasks)}>
                Export tasks for Thunderbird (.ics)
              </button>
            </li>
            <li>
              <button type="button" onClick={run(onExportCalendar)}>
                Export calendar (.ics)
              </button>
            </li>
          </ul>
        </div>
      )}
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        class="visually-hidden"
        tabIndex={-1}
        aria-label="Backup file"
        data-testid="restore-input"
        onChange={onFile}
      />
      {pending && (
        <Modal title="Restore from backup" onClose={() => setPending(null)} size="narrow">
          <p>
            The backup holds {pending.tasks.length} {pending.tasks.length === 1 ? 'task' : 'tasks'}. This board has{' '}
            {taskCount}.
          </p>
          <ul class="restore-options">
            <li>
              <strong>Replace</strong> removes the tasks on this board and keeps only the backup's tasks.
            </li>
            <li>
              <strong>Merge</strong> keeps both. When a task is in both, the most recently edited copy wins.
            </li>
          </ul>
          <div class="form-actions">
            <button type="button" class="button-secondary" onClick={() => setPending(null)}>
              Cancel
            </button>
            <span class="spacer" />
            <button
              type="button"
              class="button-secondary"
              onClick={() => {
                onRestore(pending, 'merge');
                setPending(null);
              }}
            >
              Merge tasks
            </button>
            <button
              type="button"
              class="button-primary"
              onClick={() => {
                onRestore(pending, 'replace');
                setPending(null);
              }}
            >
              Replace tasks
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
