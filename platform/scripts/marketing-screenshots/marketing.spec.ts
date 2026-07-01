import { test } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const outDir = 'public/marketing';
if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

type RouteCase = {
  name: string;
  path: string;
  wait: string;
  screenshotBeforeNetworkidle?: boolean;
};

const routes: readonly RouteCase[] = [
  { name: 'landing', path: '/?landing', wait: '#top' },
  { name: 'styleguide', path: '/?ui', wait: '.sg-title' },
];

const mobileRoutes: readonly RouteCase[] = [
  { name: 'app-home', path: '/?app', wait: '.app-shell', screenshotBeforeNetworkidle: true },
];

const baseURL = 'http://localhost:4173';

test.describe.configure({ mode: 'serial' });

test.describe('marketing screenshots (desktop)', () => {
  for (const route of routes) {
    test(route.name, async ({ page }) => {
      const url = baseURL + route.path;
      await page.goto(url);
      await waitForSelectorWithText(route.name, route.wait, page);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.screenshot({ path: `${outDir}/${route.name}.png`, fullPage: true });
      writeFileSync(`${outDir}/${route.name}.meta.json`, JSON.stringify({ url }, null, 2));
    });
  }
});

test.describe('marketing screenshots (mobile app)', () => {
  for (const route of mobileRoutes) {
    test(route.name, async ({ browser }) => {
      const context = await browser.newContext({
        ...(await browser.devices['Desktop Chrome']),
        hasTouch: true,
        locale: 'en-US',
      });
      const page = await context.newPage();

      const url = baseURL + route.path;
      await page.goto(url);
      await waitForSelectorWithText(route.name, route.wait, page);
      await page.screenshot({ path: `${outDir}/${route.name}-start.png`, fullPage: true });
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.screenshot({ path: `${outDir}/${route.name}.png`, fullPage: true });
      writeFileSync(`${outDir}/${route.name}.meta.json`, JSON.stringify({ url }, null, 2));

      await context.close();
    });
  }
});

async function waitForSelectorWithText(name: string, _wait: string, page: { waitForSelector(selector: string, _options: { state: string; timeout: number }): Promise<void> }): Promise<void> {
  try {
    await page.waitForSelector(_wait, { state: 'visible', timeout: 30_000 });
  } catch (error) {
    throw new Error(`[${name}] timed out waiting for "${_wait}": ${(error as Error).message}`);
  }
}
