import type { ComponentChildren, RefObject } from 'preact';
import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
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

/** Drag-over highlight and drop handling for anything that takes task cards. */
function useDropTarget(status: Status, onMove: (id: string, status: Status) => void) {
  const [over, setOver] = useState(false);
  const accepts = (e: DragEvent) => (e.dataTransfer as DataTransfer).types.includes(DRAG_TYPE);
  const handlers = {
    onDragOver: (e: DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      (e.dataTransfer as DataTransfer).dropEffect = 'move';
      setOver(true);
    },
    onDragLeave: (e: DragEvent) => {
      if (!(e.currentTarget as Element).contains(e.relatedTarget as Node | null)) setOver(false);
    },
    onDrop: (e: DragEvent) => {
      setOver(false);
      const id = (e.dataTransfer as DataTransfer).getData(DRAG_TYPE);
      if (!id) return;
      e.preventDefault();
      onMove(id, status);
    },
  };
  return { over, handlers };
}

export function Column({ status, tasks, now, note, savedId, onOpen, onMove, empty, footer }: Props) {
  const { over, handlers } = useDropTarget(status, onMove);
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

  return (
    <section
      class={`column ${over ? 'is-drop-target' : ''}`}
      aria-labelledby={headingId}
      data-status={status}
      {...handlers}
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

/** Keeps `label` in the middle of the part of `box` that is on screen while the page scrolls. */
function useCenterInView(box: RefObject<HTMLElement | null>, label: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = box.current as HTMLElement;
    const inner = label.current as HTMLElement;
    const place = () => {
      const r = el.getBoundingClientRect();
      const mid = (Math.max(r.top, 0) + Math.min(r.bottom, innerHeight)) / 2 - r.top;
      const h = inner.offsetHeight;
      const y = Math.min(Math.max(mid - h / 2, 0), Math.max(r.height - h, 0));
      inner.style.transform = `translateY(${Math.round(y)}px)`;
    };
    place();
    addEventListener('scroll', place, { passive: true });
    addEventListener('resize', place);
    // The strip grows and shrinks with the columns beside it.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    ro?.observe(el);
    return () => {
      removeEventListener('scroll', place);
      removeEventListener('resize', place);
      ro?.disconnect();
    };
  }, []);
}

/** Stands in for a hidden column: a narrow strip that still takes dropped cards, and shows the column when clicked. */
export function DropStrip({
  status,
  onMove,
  onShow,
}: {
  status: Status;
  onMove: (id: string, status: Status) => void;
  onShow: () => void;
}) {
  const { over, handlers } = useDropTarget(status, onMove);
  const box = useRef<HTMLButtonElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  useCenterInView(box, label);
  const name = `Show ${STATUS_LABEL[status].toLowerCase()} tasks`;
  return (
    <button
      type="button"
      ref={box}
      class={`drop-strip ${over ? 'is-drop-target' : ''}`}
      data-status={status}
      aria-label={name}
      title={name}
      onClick={onShow}
      {...handlers}
    >
      <span class="drop-strip-label" ref={label}>
        <strong>{STATUS_LABEL[status]}</strong> Drop here
      </span>
    </button>
  );
}
