import { useEffect } from 'preact/hooks';

export interface ToastMessage {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

export function Toast({ message, onDone }: { message: ToastMessage | null; onDone: () => void }) {
  useEffect(() => {
    if (!message || message.tone === 'error') return;
    const id = setTimeout(onDone, 3500);
    return () => clearTimeout(id);
  }, [message, onDone]);

  return (
    <div class="toast-region" role="status" aria-live="polite">
      {message && (
        <div key={message.id} class={`toast toast-${message.tone}`}>
          <span>{message.text}</span>
          <button type="button" class="button-quiet" onClick={onDone}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
