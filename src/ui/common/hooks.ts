import { useEffect, useState } from 'preact/hooks';

export type Page = 'board' | 'insights' | 'calendar';

export interface Route {
  page: Page;
  taskId: string | null;
}

const PAGES: Page[] = ['board', 'insights', 'calendar'];

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const page = PAGES.includes(path as Page) ? (path as Page) : 'board';
  return { page, taskId: new URLSearchParams(query).get('task') };
}

export function routeHref(page: Page, taskId?: string | null): string {
  return `#/${page}${taskId ? `?task=${encodeURIComponent(taskId)}` : ''}`;
}

export function navigate(page: Page, taskId?: string | null): void {
  location.hash = routeHref(page, taskId);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash));
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

/** Current time, refreshed every minute so "overdue" and "due this week" stay correct. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mql = matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
