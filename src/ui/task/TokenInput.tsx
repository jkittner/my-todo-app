import { useId, useState } from 'preact/hooks';
import { cleanLabels } from '../../model/task';

interface Props {
  label: string;
  /** Singular noun used in hints and button labels, e.g. "tag". */
  noun: string;
  values: string[];
  suggestions: string[];
  onChange: (values: string[]) => void;
}

/** Picks existing labels or creates new ones. Enter or comma adds; Backspace on empty removes. */
export function TokenInput({ label, noun, values, suggestions, onChange }: Props) {
  const id = useId();
  const [text, setText] = useState('');
  const lowerValues = new Set(values.map((v) => v.toLowerCase()));
  const available = suggestions.filter((s) => !lowerValues.has(s.toLowerCase()));

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
          <span class="token" key={v}>
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
      </p>
    </div>
  );
}
