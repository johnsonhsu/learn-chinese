import { test } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const outDir = "public/marketing";
if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

type RouteCase = {
  name: string;
  path: string;
  wait: string;
};

const routes: readonly RouteCase[] = [
  { name: "landing", path: "/?landing", wait: "#top" },
  { name: "styleguide", path: "/?ui", wait: ".sg-title" },
];

const baseURL = "http://localhost:4173";

test.describe.configure({ mode: "serial" });

test.describe("marketing screenshots", () => {
  for (const route of routes) {
    test(route.name, async ({ page }) => {
      const url = baseURL + route.path;
      await page.goto(url);
      try {
        await page.waitForSelector(route.wait, { state: "visible", timeout: 30_000 });
      } catch (error) {
        throw new Error(
          `[${route.name}] timed out waiting for "${route.wait}": ${(error as Error).message}`,
        );
      }

      await page.waitForLoadState("networkidle").catch(() => {});
      await page.screenshot({ path: `${outDir}/${route.name}.png`, fullPage: true });
      writeFileSync(`${outDir}/${route.name}.meta.json`, JSON.stringify({ url }, null, 2));
    });
  }
});
