import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Props {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  /** The heading is visually hidden when the content carries its own title field. */
  hideTitle?: boolean;
  size?: 'wide' | 'narrow';
}

export function Modal({ title, onClose, children, hideTitle = false, size = 'wide' }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const root = panel.current as HTMLDivElement;
    const first = root.querySelector<HTMLElement>('[data-autofocus]') ?? root.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? root).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const head = items[0];
      const tail = items[items.length - 1];
      if (e.shiftKey && document.activeElement === head) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault();
        head.focus();
      }
    };
    root.addEventListener('keydown', onKey);
    document.body.classList.add('has-modal');
    return () => {
      root.removeEventListener('keydown', onKey);
      document.body.classList.remove('has-modal');
      opener?.focus?.();
    };
  }, []);

  return (
    <div class="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panel}
        class={`modal modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
      >
        <h2 id="modal-title" class={hideTitle ? 'visually-hidden' : 'modal-heading'}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
