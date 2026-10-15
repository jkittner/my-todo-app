import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/preact';
import { afterEach, vi } from 'vitest';

// jsdom has no matchMedia; tests switch layouts by overriding `matches` per query.
export const media = { matches: (_q: string) => false };
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: media.matches(query),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }),
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  location.hash = '';
  media.matches = () => false;
  document.body.className = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
});
