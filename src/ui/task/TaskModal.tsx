import { useState } from 'preact/hooks';
import {
  draftFromTask,
  emptyDraft,
  PRIORITIES,
  PRIORITY_LABEL,
  STATUS_LABEL,
  STATUSES,
  validateDraft,
  type DraftErrors,
  type Priority,
  type Status,
  type Task,
  type TaskDraft,
} from '../../model/task';
import { Modal } from '../common/Modal';
import { MarkdownField } from './MarkdownField';
import { Timeline } from './Timeline';
import { TokenInput } from './TokenInput';

interface Props {
  /** The task to edit, or null to add a new one. */
  task: Task | null;
  initialStatus?: Status;
  knownTags: string[];
  knownCategories: string[];
  now: Date;
  onSave: (draft: TaskDraft) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const sameDraft = (a: TaskDraft, b: TaskDraft) => JSON.stringify(a) === JSON.stringify(b);

export function TaskModal({ task, initialStatus, knownTags, knownCategories, now, onSave, onDelete, onClose }: Props) {
  const [initial] = useState(() => (task ? draftFromTask(task) : emptyDraft(initialStatus)));
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isNew = task === null;

  const set = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (key in errors) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const requestClose = () => {
    if (sameDraft(draft, initial) || confirm('Discard your unsaved changes?')) onClose();
  };

  const submit = (e: Event) => {
    e.preventDefault();
    const found = validateDraft(draft);
    setErrors(found);
    if (found.title || found.dueDate) {
      const field = document.getElementById(found.title ? 'task-title' : 'task-due');
      field?.focus();
      return;
    }
    onSave(draft);
  };

  return (
    <Modal title={isNew ? 'Add task' : 'Edit task'} onClose={requestClose} hideTitle>
      <form class="task-form" onSubmit={submit} noValidate>
        <div class="field field-title">
          <label for="task-title">Title</label>
          <input
            id="task-title"
            data-autofocus
            class="title-input"
            value={draft.title}
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? 'task-title-error' : undefined}
            onInput={(e) => set('title', e.currentTarget.value)}
            placeholder="What needs doing?"
          />
          {errors.title && (
            <p class="error" id="task-title-error">
              {errors.title}
            </p>
          )}
        </div>

        <div class="form-grid">
          <div class="field">
            <label for="task-due">Due date</label>
            <input
              id="task-due"
              type="date"
              value={draft.dueDate}
              aria-invalid={!!errors.dueDate}
              aria-describedby={errors.dueDate ? 'task-due-error' : undefined}
              onInput={(e) => set('dueDate', e.currentTarget.value)}
            />
            {errors.dueDate && (
              <p class="error" id="task-due-error">
                {errors.dueDate}
              </p>
            )}
          </div>
          <div class="field">
            <label for="task-status">Status</label>
            <select
              id="task-status"
              value={draft.status}
              onChange={(e) => set('status', e.currentTarget.value as Status)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <fieldset class="field priority-picker">
            <legend>Priority</legend>
            <div class="segmented">
              {[null, ...PRIORITIES].map((p: Priority) => (
                <label key={p ?? 'none'} class={`segment ${p ? `prio-${p}` : ''}`}>
                  <input
                    type="radio"
                    name="priority"
                    checked={draft.priority === p}
                    onChange={() => set('priority', p)}
                  />
                  <span>{p ? PRIORITY_LABEL[p] : 'None'}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div class="form-grid form-grid-2">
          <TokenInput
            label="Tags"
            noun="tag"
            values={draft.tags}
            suggestions={knownTags}
            onChange={(v) => set('tags', v)}
          />
          <TokenInput
            label="Categories"
            noun="category"
            values={draft.categories}
            suggestions={knownCategories}
            onChange={(v) => set('categories', v)}
          />
        </div>

        <MarkdownField value={draft.description} onChange={(v) => set('description', v)} startInPreview={!isNew} />

        {task && <Timeline task={task} now={now} />}

        <div class="form-actions">
          {task &&
            (confirmDelete ? (
              <div class="confirm-delete" role="group" aria-label="Confirm delete">
                <span>Delete this task for good?</span>
                <button type="button" class="button-danger" onClick={() => onDelete(task.id)}>
                  Delete task
                </button>
                <button type="button" class="button-quiet" onClick={() => setConfirmDelete(false)}>
                  Keep task
                </button>
              </div>
            ) : (
              <button type="button" class="button-quiet button-danger-text" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            ))}
          <span class="spacer" />
          <button type="button" class="button-secondary" onClick={requestClose}>
            Cancel
          </button>
          <button type="submit" class="button-primary">
            {isNew ? 'Add task' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
