import { PRIORITY_LABEL, STATUSES, type Status, type Task } from '../../model/task';
import { formatDateKey } from '../../logic/dates';
import { isOverdue } from '../../logic/filter';

interface Props {
  task: Task;
  now: Date;
  justSaved: boolean;
  onOpen: (id: string) => void;
  onMove: (id: string, status: Status) => void;
}

export const DRAG_TYPE = 'application/x-todo-board-task';

export function TaskCard({ task, now, justSaved, onOpen, onMove }: Props) {
  const overdue = isOverdue(task, now);
  const due = formatDateKey(task.dueDate, now);
  const priority = task.priority ? PRIORITY_LABEL[task.priority] : null;
  const label = [
    task.title,
    priority ? `${priority} priority` : 'No priority',
    overdue ? `overdue, was due ${due}` : `due ${due}`,
    task.categories.length
      ? `${task.categories.length === 1 ? 'category' : 'categories'} ${task.categories.join(', ')}`
      : null,
    task.tags.length ? `${task.tags.length === 1 ? 'tag' : 'tags'} ${task.tags.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <li
      class={`card ${task.priority ? `prio-${task.priority}` : ''} ${overdue ? 'is-overdue' : ''} ${justSaved ? 'just-saved' : ''}`}
      draggable
      data-task-id={task.id}
      onDragStart={(e) => {
        const dt = e.dataTransfer as DataTransfer;
        dt.setData(DRAG_TYPE, task.id);
        dt.setData('text/plain', task.title);
        dt.effectAllowed = 'move';
        e.currentTarget.classList.add('is-dragging');
      }}
      onDragEnd={(e) => e.currentTarget.classList.remove('is-dragging')}
    >
      <button
        type="button"
        class="card-button"
        aria-label={label}
        aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
        onClick={() => onOpen(task.id)}
        onKeyDown={(e) => {
          if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
          const next = STATUSES[STATUSES.indexOf(task.status) + (e.key === 'ArrowLeft' ? -1 : 1)];
          if (!next) return;
          e.preventDefault();
          onMove(task.id, next);
        }}
      >
        <span class="card-title">{task.title}</span>
        <span class="card-meta" aria-hidden="true">
          <span class="card-priority">{priority ?? 'No priority'}</span>
          <span class="card-due">
            {overdue && <strong>Overdue </strong>}
            <time dateTime={task.dueDate}>{due}</time>
          </span>
        </span>
        {(task.categories.length > 0 || task.tags.length > 0) && (
          <span class="card-labels" aria-hidden="true">
            {task.categories.map((c) => (
              <span key={`c-${c}`} class="card-category">
                {c}
              </span>
            ))}
            {task.tags.map((t) => (
              <span key={`t-${t}`} class="card-tag">
                #{t}
              </span>
            ))}
          </span>
        )}
      </button>
    </li>
  );
}
