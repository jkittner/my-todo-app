import { expect, test, type Page } from '@playwright/test';
import { column, openApp } from './helpers';

// The native folder picker cannot be driven by tests, so it hands back the browser's private
// file system instead: a real directory handle that is written, stored and restored the same way.
// That file system is not available to file:// pages, so this runs over HTTP only.
test.skip(({ baseURL }) => !baseURL?.startsWith('http'), 'needs an http origin');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = () =>
      navigator.storage.getDirectory();
  });
});

const backupFile = (page: Page) =>
  page.evaluate(async () => {
    const dir = await navigator.storage.getDirectory();
    try {
      const file = await dir.getFileHandle('todo-board-backup.json');
      return JSON.parse(await (await file.getFile()).text());
    } catch {
      return null;
    }
  });

test('backs up every change to the chosen folder and keeps doing so after a reload', async ({ page }) => {
  await openApp(page);
  expect(await backupFile(page)).toBeNull();

  await page.getByRole('button', { name: 'Data' }).click();
  await page.getByRole('button', { name: 'Back up to a folder automatically' }).click();
  const dialog = page.getByRole('dialog', { name: 'Back up to a folder' });
  await dialog.getByRole('button', { name: 'Choose folder' }).click();
  await expect(dialog.getByText('Last backup')).toBeVisible();
  await expect.poll(async () => (await backupFile(page))?.tasks.length).toBe(10);
  const first = await backupFile(page);
  expect(first).toMatchObject({ app: 'todo-board', version: 1 });
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('button', { name: /^Backed up/ })).toBeVisible();

  // A change on the board reaches the file shortly after.
  await column(page, 'To do').getByText('Book bike service').dragTo(column(page, 'Done').locator('.column-head'));
  await expect
    .poll(async () => (await backupFile(page))?.tasks.find((t: { id: string }) => t.id === 't-bike').status)
    .toBe('done');

  // After a reload the remembered folder is used again without asking.
  await page.reload();
  await expect(page.getByRole('button', { name: /^Backed up/ })).toBeVisible();
  await page.getByRole('button', { name: /^Collect receipts/ }).click();
  await page.getByLabel('Title').fill('Collect receipts for the 2026 tax return');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect
    .poll(async () => (await backupFile(page))?.tasks.find((t: { id: string }) => t.id === 't-tax').title)
    .toBe('Collect receipts for the 2026 tax return');

  // Turning it off stops the backups, also after a reload.
  await page.getByRole('button', { name: /^Backed up/ }).click();
  await page.getByRole('button', { name: 'Turn off' }).click();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('button', { name: /^Backed up/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: /^Backed up/ })).toHaveCount(0);
});
