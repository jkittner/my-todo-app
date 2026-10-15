import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { column, openApp, stored, STORAGE_KEY } from './helpers';

test('insights shows charts, flow figures, and the month table', async ({ page }) => {
  await openApp(page, '#/insights');
  await expect(page.getByRole('heading', { name: 'Insights' })).toBeVisible();
  for (const title of [
    'Tasks by status',
    'Tasks by priority',
    'Tasks by category',
    'Priority and status',
    'Completed and overdue per week',
  ])
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('Rescheduled tasks')).toBeVisible();
  const table = page.getByRole('region', { name: 'Due in October 2026' });
  await expect(table.getByRole('row')).toHaveCount(8);
  await table.getByRole('link', { name: 'Book bike service' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit task' })).toBeVisible();
  await expect(page).toHaveURL(/#\/insights\?task=t-bike$/);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/insights$/);
  await expect(page.getByRole('heading', { name: 'Insights' })).toBeVisible();
});

test('calendar shows tasks on their day and opens them', async ({ page }) => {
  await openApp(page, '#/calendar');
  const day = page.getByRole('gridcell', { name: 'Tuesday, October 13' });
  await day.getByRole('link', { name: /Send October invoice/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit task' });
  await expect(dialog.getByLabel('Title')).toHaveValue('Send October invoice to Lindqvist & Partner');
  await expect(page).toHaveURL(/#\/calendar\?task=t-invoice$/);
  await expect(page.getByRole('grid', { name: 'October 2026' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Next month' }).click();
  await expect(page.getByRole('heading', { name: 'November 2026' })).toBeVisible();
  // Opening a task keeps the calendar on the month you were looking at.
  await page
    .getByRole('gridcell', { name: 'Wednesday, November 4' })
    .getByRole('link', { name: 'Read the RFC 5545 VTODO section' })
    .click();
  await expect(page.getByRole('dialog', { name: 'Edit task' })).toBeVisible();
  await expect(page.getByRole('grid', { name: 'November 2026' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/calendar$/);
  await expect(page.getByRole('heading', { name: 'November 2026' })).toBeVisible();
});

test('exports iCalendar files for Thunderbird', async ({ page }) => {
  await openApp(page, '#/calendar');
  const [cal] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export calendar (.ics)' }).click(),
  ]);
  expect(cal.suggestedFilename()).toBe('todo-board-calendar-2026-10-15.ics');
  const calText = await readFile((await cal.path()) as string, 'utf8');
  expect(calText.match(/BEGIN:VEVENT/g)).toHaveLength(10);
  const [todo] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export tasks for Thunderbird (.ics)' }).click(),
  ]);
  const todoText = await readFile((await todo.path()) as string, 'utf8');
  expect(todoText.match(/BEGIN:VTODO/g)).toHaveLength(10);
  expect(todoText).toContain('STATUS:IN-PROCESS');
  expect(todoText).toContain('SUMMARY:Send October invoice to Lindqvist & Partner');
});

test('backs up, clears, and restores tasks', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Data' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Back up tasks (.json)' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('todo-board-backup-2026-10-15.json');
  const file = (await download.path()) as string;

  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your board is empty' })).toBeVisible();

  await page.getByTestId('restore-input').setInputFiles(file);
  await page
    .getByRole('dialog', { name: 'Restore from backup' })
    .getByRole('button', { name: 'Replace tasks' })
    .click();
  await expect(page.getByRole('status')).toContainText('Restored 10 tasks from backup');
  await expect(column(page, 'To do').getByText('Book bike service')).toBeVisible();
  await expect.poll(async () => (await stored(page)).tasks.length).toBe(10);
});

test('rejects files that are not backups', async ({ page }) => {
  await openApp(page);
  await page
    .getByTestId('restore-input')
    .setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(page.getByRole('status')).toContainText('not a Todo board backup');
});

test('keeps all data in local storage only', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await openApp(page);
  await page.getByRole('button', { name: /^Book bike service/ }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  const external = requests.filter(
    (u) => !u.startsWith('http://localhost:4173') && !u.startsWith('file://') && !u.startsWith('data:'),
  );
  expect(external).toEqual([]);
});

test('works on a phone-sized screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openApp(page, '#/calendar');
  await expect(page.getByRole('grid')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Tuesday, October 13' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test.describe('when the app cannot start', () => {
  test('the source page explains how to run the app', async ({ page }) => {
    await page.goto(pathToFileURL(path.resolve('index.html')).href);
    await expect(page.getByText('This is the source page, which only runs through the dev server.')).toBeVisible();
  });

  test('the built page asks for JavaScript', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(baseURL as string);
    await expect(page.getByText('Todo board needs JavaScript to run.')).toBeVisible();
    await context.close();
  });

  test('the note never shows once the app runs', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('.boot-note')).toHaveCount(0);
  });
});

test('restores the 1,500-task example backup', async ({ page }) => {
  await openApp(page, '#/board', {
    schemaVersion: 1,
    tasks: [],
    tags: [],
    categories: [],
    prefs: { sort: { key: 'due', dir: 'asc' }, hideDone: false },
  });
  await page.getByTestId('restore-input').setInputFiles(path.resolve('examples/sample-1500-tasks.json'));
  await page.getByRole('button', { name: 'Replace tasks' }).click();
  await expect(page.getByRole('status')).toContainText('Restored 1500 tasks from backup');
  await expect.poll(async () => (await stored(page)).tasks.length).toBe(1500);
});
