# E2E Scaffold — Templates

Referenced by `e2e-scaffold.md` Step 3. Adapt the `{{PORT}}` / `{{DEV_COMMAND}}` placeholders to what Step 2 detected.

`playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';

const PORT = {{PORT}};
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: '{{DEV_COMMAND}}',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

`tests/e2e/fixtures.ts`:
```ts
import { test as playwrightBase, expect, type Page, type Locator } from '@playwright/test';

/**
 * Obscura driver. node e2e-scaffold/drive.js sets E2E_CDP (a loopback CDP address) when Obscura runs the suite; it is empty or unset for the
 * project's own browser, and then none of this applies. With E2E_CDP the tests connect to Obscura instead of launching a browser, reuse its
 * default context (so there are no per-test traces or screenshots: a failure is re-run on Chrome when both drivers are chosen), and relative
 * goto() calls are resolved against baseURL (a reused context carries no baseURL option).
 */
const CDP = process.env.E2E_CDP;
const base = CDP
  ? playwrightBase.extend({
      browser: [async ({ playwright }, use) => {
        const b = await playwright.chromium.connectOverCDP(CDP);
        await use(b);
        await b.close();
      }, { scope: 'worker', timeout: 0 }],
      context: async ({ browser }, use) => { await use(browser.contexts()[0] ?? (await browser.newContext())); },
      page: async ({ context, baseURL }, use) => {
        const page = await context.newPage();
        if (baseURL) {
          const go = page.goto.bind(page);
          page.goto = (url, options) => go(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : new URL(url, baseURL).toString(), options);
        }
        await use(page);
        await page.close();
      },
    })
  : playwrightBase;

/**
 * Universal fixtures only. Feature-specific Page Objects (one *.pom.ts per feature
 * area) get added as fixtures here the first time that feature needs coverage —
 * never duplicated inline in a spec.
 */

type Fixtures = {
  app: Page;
};

export const test = base.extend<Fixtures>({
  app: async ({ page }, use) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await use(page);

    expect(consoleErrors, `Console errors on ${page.url()}:\n${consoleErrors.join('\n')}`).toEqual([]);
  },
});

export { expect };

/** Clips a screenshot to a locator's bounding box — avoids the element-screenshot
 *  timeout that continuously animated content (canvas/WebGL, live charts) triggers. */
export async function screenshotClipped(page: Page, locator: Locator, path: string) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('screenshotClipped: locator has no bounding box (not visible?)');
  await page.screenshot({ path, clip: box });
}
```

`tests/e2e/smoke.spec.ts`:
```ts
import { test, expect } from './fixtures';

test('app boots and renders with no console errors', async ({ app }) => {
  await expect(app.locator('body')).toBeVisible();
  await expect(app).toHaveTitle(/.+/);
});
```
