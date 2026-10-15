import { useId, useState } from 'preact/hooks';
import { renderMarkdown } from '../../logic/markdown';

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Opens on the rendered view, for existing tasks that already have notes. */
  startInPreview?: boolean;
}

type Tab = 'write' | 'preview';

export function MarkdownField({ value, onChange, startInPreview = false }: Props) {
  const id = useId();
  const [tab, setTab] = useState<Tab>(startInPreview && value.trim() ? 'preview' : 'write');

  const tabButton = (name: Tab, label: string) => (
    <button
      type="button"
      role="tab"
      id={`${id}-${name}-tab`}
      aria-selected={tab === name}
      aria-controls={`${id}-${name}`}
      tabIndex={tab === name ? 0 : -1}
      class="tab"
      onClick={() => setTab(name)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          const next: Tab = tab === 'write' ? 'preview' : 'write';
          setTab(next);
          document.getElementById(`${id}-${next}-tab`)?.focus();
        }
      }}
    >
      {label}
    </button>
  );

  return (
    <div class="field">
      <div class="field-row">
        <span class="label" id={`${id}-label`}>
          Description
        </span>
        <div role="tablist" aria-labelledby={`${id}-label`} class="tabs">
          {tabButton('write', 'Write')}
          {tabButton('preview', 'Preview')}
        </div>
      </div>
      {tab === 'write' ? (
        <div role="tabpanel" id={`${id}-write`} aria-labelledby={`${id}-write-tab`}>
          <textarea
            aria-labelledby={`${id}-label`}
            aria-describedby={`${id}-hint`}
            rows={9}
            value={value}
            onInput={(e) => onChange(e.currentTarget.value)}
          />
          <p class="hint" id={`${id}-hint`}>
            Markdown works here: lists, task lists, tables, links and code.
          </p>
        </div>
      ) : (
        <div role="tabpanel" id={`${id}-preview`} aria-labelledby={`${id}-preview-tab`} class="preview" tabIndex={0}>
          {value.trim() ? (
            <div class="markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }} />
          ) : (
            <p class="empty-note">No description yet. Switch to Write to add one.</p>
          )}
        </div>
      )}
    </div>
  );
}
