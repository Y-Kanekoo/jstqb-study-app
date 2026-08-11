import { defineConfig, devices } from '@playwright/test';

const port = 4173;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 2 } : {}),
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/e2e.xml' }]]
    : [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results/playwright',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    serviceWorkers: 'allow',
  },
  expect: { timeout: 10_000 },
  webServer: [
    {
      command: 'pnpm preview:web',
      env: { E2E_FIXTURES_ENABLED: 'true', PORT: String(port) },
      port,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'node scripts/serve-e2e-api.mjs',
      env: { E2E_API_PORT: '4174' },
      port: 4174,
      reuseExistingServer: !process.env.CI,
      timeout: 10_000,
    },
  ],
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
