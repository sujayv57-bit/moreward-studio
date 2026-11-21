import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'off', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } }, testIgnore: /mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile/ },
  ],
  webServer: {
    // Fresh demo database for every run, production build served by the API.
    command: `npx vite build --logLevel error && DATABASE_PATH=data/e2e.db UPLOADS_DIR=data/e2e-uploads npx tsx server/cli.ts reset && NODE_ENV=production COOKIE_SECURE=false PORT=${PORT} DATABASE_PATH=data/e2e.db UPLOADS_DIR=data/e2e-uploads npx tsx server/index.ts`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
