import type { ComponentChildren } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { STATUS_LABEL, type Status, type Task } from '../../model/task';
import { DRAG_TYPE, TaskCard } from './TaskCard';

interface Props {
  status: Status;
  tasks: Task[];
  now: Date;
  note?: string;
  savedId: string | null;
  onOpen: (id: string) => void;
  onMove: (id: string, status: Status) => void;
  empty: string;
  footer?: ComponentChildren;
}

/** Cards rendered per step; long columns grow on request so large boards stay responsive. */
export const PAGE_SIZE = 100;
const count = new Intl.NumberFormat('en');

export function Column({ status, tasks, now, note, savedId, onOpen, onMove, empty, footer }: Props) {
  const [over, setOver] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const headingId = `column-${status}`;
  const hidden = Math.max(0, tasks.length - limit);
  // Re-create card elements only when something they show changes, so unrelated updates
  // (a toast, opening the modal, dragging over the column) skip diffing every card.
  const cards = useMemo(
    () =>
      tasks
        .slice(0, limit)
        .map((t) => (
          <TaskCard key={t.id} task={t} now={now} justSaved={t.id === savedId} onOpen={onOpen} onMove={onMove} />
        )),
    [tasks, limit, now, savedId, onOpen, onMove],
  );

  const accepts = (e: DragEvent) => (e.dataTransfer as DataTransfer).types.includes(DRAG_TYPE);

  return (
    <section
      class={`column ${over ? 'is-drop-target' : ''}`}
      aria-labelledby={headingId}
      data-status={status}
      onDragOver={(e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        (e.dataTransfer as DataTransfer).dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        setOver(false);
        const id = (e.dataTransfer as DataTransfer).getData(DRAG_TYPE);
        if (!id) return;
        e.preventDefault();
        onMove(id, status);
      }}
    >
      <header class="column-head">
        <h2 id={headingId}>{STATUS_LABEL[status]}</h2>
        <span class="column-count" aria-label={`${tasks.length} tasks`}>
          {count.format(tasks.length)}
        </span>
        {note && <span class="column-note">{note}</span>}
      </header>
      {tasks.length ? (
        <ul class="card-list" aria-labelledby={headingId}>
          {cards}
        </ul>
      ) : (
        <p class="column-empty">{empty}</p>
      )}
      {hidden > 0 && (
        <button type="button" class="button-secondary column-more" onClick={() => setLimit(limit + PAGE_SIZE)}>
          Show {Math.min(PAGE_SIZE, hidden)} more ({count.format(hidden)} not shown)
        </button>
      )}
      {footer}
    </section>
  );
}
