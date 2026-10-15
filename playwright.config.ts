import { defineConfig, devices } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// Runs the same suite against the static build served over HTTP (like GitHub Pages)
// and opened straight from disk with file://.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'http', use: { baseURL: 'http://localhost:4173/' } },
    { name: 'file', use: { baseURL: pathToFileURL(path.resolve('dist/index.html')).href } },
  ],
});
