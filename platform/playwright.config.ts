import { defineConfig, devices } from '@playwright/test';

const outDir = './public/marketing';

export default defineConfig({
  testDir: './scripts/marketing-screenshots',
  timeout: 60_000,
  reporter: 'list',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: 'en-US',
    screenshot: 'only-on-failure',
    video: 'off',
    trace: 'off',
  },
  projects: [
    { name: 'mobile', use: { ...devices['iPhone 14 Pro Max'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  outputDir: outDir,
  webServer: {
    command: 'npm -w platform run preview',
    port: 4173,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
