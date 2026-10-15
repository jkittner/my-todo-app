import { expect, type Page } from '@playwright/test';
import { NOW, SAMPLE_DB } from './fixtures';

export const STORAGE_KEY = 'todoboard.v1';

/** Opens the app at a fixed "today" with the sample board (or the given data) stored. */
export async function openApp(page: Page, hash = '#/board', db: unknown = SAMPLE_DB) {
  await page.clock.setFixedTime(NOW);
  await page.goto('#/board');
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify(db)] as const);
  await page.goto(hash);
  await page.reload();
  await expect(page.getByRole('link', { name: 'Todo board' })).toBeVisible();
}

export async function stored(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), STORAGE_KEY);
}

export const column = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

export const cardTitles = (page: Page, name: string) => column(page, name).locator('.card-title').allTextContents();
