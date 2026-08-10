---
name: e2e-scaffold
description: Scaffold a reusable Playwright fixtures/config/smoke-test layer once per project, so every later test reuses it instead of being generated from scratch. Trigger on "set up e2e/playwright testing", "add playwright", or before writing the first Playwright spec in a project that doesn't have one yet.
---

# E2E Scaffold — Write the Plumbing Once, Reuse It Forever

Generating a full Playwright script from scratch for every test case burns tokens on
setup that never changes. This skill scaffolds the reusable layer — config, fixtures,
a smoke test — once per project. After that, new coverage is a few lines against
existing fixtures/Page Objects, not a new script.

Pairs with `coding-standards/qa/e2e-testing.md` (RULE QA-E2E-01–05) if the standards
system is installed — that file is the *rule*, this skill is the *scaffold* that makes
following it the path of least resistance. Works standalone if standards aren't installed.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — a stack this needed extra handling
   for, a detection heuristic that guessed wrong. Merge instead of duplicating.

## Step 1 — Check whether the scaffold already exists

Look for `playwright.config.ts`/`.js` at the project root and a `tests/e2e/fixtures.*`
file. If both exist, **do not re-scaffold** — read the existing `fixtures.ts` and any
`*.pom.ts` files and extend them for whatever new coverage was asked for. Re-running
this skill on a project that already has the layer is a bug, not idempotent setup.

## Step 2 — Detect the stack

Read `package.json` (or the project's manifest) to determine:
- Dev command and default port (`next dev` → 3000, `vite` → 5173, `astro dev` → 4321, etc. — verify the actual configured port rather than assuming the framework default, since projects often override it)
- Package manager (npm/pnpm/yarn) from the lockfile present
- Whether `@playwright/test` is already a dependency

If `@playwright/test` is missing, tell the user what will be installed and why, then
install it as a dev dependency — this is a `package.json` change and follows the same
confirm-before-acting posture as any other dependency addition. Also ensure the
Chromium browser binary is installed (`playwright install chromium`).

## Step 3 — Write the scaffold

Create these three files, adapting the placeholders to what Step 2 found. Keep the
fixtures file to **universal concerns only** — no feature-specific selectors, no
guessed Page Object methods. Feature coverage is written later, per Step 5.

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
import { test as base, expect, type Page, type Locator } from '@playwright/test';

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

## Step 4 — Wire it up

- Add a `"test:e2e": "playwright test"` script to `package.json`.
- Add to `.gitignore` (create the block if absent):
  ```
  /test-results
  /playwright-report
  /blob-report
  /playwright/.cache
  ```
- If `coding-standards/qa/e2e-testing.md` is installed, it needs no edits — it already
  documents this layer. If the project has no coding-standards system, briefly note to
  the user that RULE QA-E2E-01–05's discipline (specs updated in the same commit as the
  behaviour they cover, never left stale-but-green) still applies even without the file.

## Step 5 — Verify, then stop

Run `test:e2e` and confirm the smoke test passes before reporting done — an unverified
scaffold is worse than none. **Do not** generate additional feature-specific specs at
this point; that's the next request, done against the fixtures/POM layer just built,
not a blind batch of guessed coverage (see QA-E2E-02/03 if the standard is installed).
