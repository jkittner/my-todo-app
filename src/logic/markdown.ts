import { Marked } from 'marked';
import DOMPurify from 'dompurify';

const md = new Marked({ gfm: true, breaks: true });

let hooked = false;
function ensureLinkHook() {
  if (hooked) return;
  hooked = true;
  // Links in task notes open in a new tab so the board stays put.
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.hasAttribute('href')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

/** Renders GitHub-flavoured markdown to sanitised HTML. */
export function renderMarkdown(source: string): string {
  ensureLinkHook();
  const html = md.parse(source, { async: false });
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });
}
