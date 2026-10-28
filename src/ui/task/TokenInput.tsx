import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { cleanLabels } from '../../model/task';

interface Props {
  label: string;
  /** Singular noun used in hints and button labels, e.g. "tag". */
  noun: string;
  values: string[];
  suggestions: string[];
  onChange: (values: string[]) => void;
  /** Adds a "Delete" entry to the right-click menu of each label. Omit for no menu. */
  onDeleteValue?: (name: string) => void;
}

interface Menu {
  name: string;
  x: number;
  y: number;
}

/** Picks existing labels or creates new ones. Enter or comma adds; Backspace on empty removes. */
export function TokenInput({ label, noun, values, suggestions, onChange, onDeleteValue }: Props) {
  const id = useId();
  const [text, setText] = useState('');
  const [menu, setMenu] = useState<Menu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const lowerValues = new Set(values.map((v) => v.toLowerCase()));
  const available = suggestions.filter((s) => !lowerValues.has(s.toLowerCase()));

  useEffect(() => {
    if (!menu) return;
    // A press outside the menu, or Escape, closes it.
    const onPointer = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const commit = () => {
    const next = cleanLabels([...values, ...text.split(',')]);
    if (next.length !== values.length) onChange(next);
    setText('');
  };

  return (
    <div class="field">
      <label for={id}>{label}</label>
      <div class="tokens">
        {values.map((v) => (
          <span
            class="token"
            key={v}
            onContextMenu={(e) => {
              if (!onDeleteValue) return;
              e.preventDefault();
              setMenu({ name: v, x: e.clientX, y: e.clientY });
            }}
          >
            {v}
            <button
              type="button"
              class="token-remove"
              aria-label={`Remove ${noun} ${v}`}
              onClick={() => onChange(values.filter((x) => x !== v))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          class="token-input"
          list={`${id}-list`}
          value={text}
          placeholder={values.length ? '' : `Add a ${noun}`}
          aria-describedby={`${id}-hint`}
          onInput={(e) => {
            const value = e.currentTarget.value;
            // Picking from the suggestion list adds the label straight away.
            if (available.some((s) => s === value)) {
              onChange(cleanLabels([...values, value]));
              setText('');
            } else setText(value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Backspace' && !text && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={commit}
        />
        <datalist id={`${id}-list`}>
          {available.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      <p class="hint" id={`${id}-hint`}>
        Pick one or type a new {noun} and press Enter.
        {onDeleteValue && ` Right-click a ${noun} to delete it.`}
      </p>
      {menu && onDeleteValue && (
        <div class="token-menu" role="menu" ref={menuRef} style={{ left: `${menu.x}px`, top: `${menu.y}px` }}>
          <button
            type="button"
            role="menuitem"
            class="token-menu-delete"
            onClick={() => {
              setMenu(null);
              onDeleteValue(menu.name);
            }}
          >
            Delete {noun}
          </button>
        </div>
      )}
    </div>
  );
}
