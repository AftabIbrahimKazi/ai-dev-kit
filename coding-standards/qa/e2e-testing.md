# QA — End-to-End Testing (Playwright)

Read [index.md](index.md) first.

Playwright is the standard E2E tool. The goal of this file is to make E2E
testing cheap to repeat and expensive to skip: write the reusable plumbing
once per project, then every test after that is a small addition, not a
from-scratch script.

---

## RULE QA-E2E-01 — Fixtures and Page Objects are shared, not regenerated

Every project's E2E setup lives in a small, fixed set of reusable files, not
one throwaway script per test:

- `playwright.config.ts` — project root, one per project
- `tests/e2e/fixtures.ts` — Playwright [fixtures](https://playwright.dev/docs/test-fixtures)
  covering universal concerns: app boot/dev-server reuse, navigation helpers,
  console-error assertions, clipped screenshots
- `tests/e2e/*.pom.ts` — one [Page Object](https://playwright.dev/docs/pom)
  per feature area (e.g. `node-editor.pom.ts`, `export.pom.ts`), holding the
  selectors and interactions for that area
- `tests/e2e/*.spec.ts` — thin spec files that call fixtures/POM methods

Before writing a new spec, Claude must check whether `fixtures.ts` and a
relevant `*.pom.ts` already exist and extend them rather than duplicating
setup inline in the spec.

```ts
// Wrong — hand-rolled setup duplicated in every spec
test('add cube', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.waitForSelector('[data-tfg-app-ready]');
  // ...
});

// Right — reuses shared fixture and POM
test('add cube', async ({ app, nodeEditor }) => {
  await nodeEditor.addNode('Cube');
  await expect(nodeEditor.nodeCount()).toBe(1);
});
```

---

## RULE QA-E2E-02 — Install-time scope is a smoke test only

At install time, the only spec generated automatically is a smoke test
(`smoke.spec.ts`): the app boots, the root route renders, no console errors.
Nothing feature-specific is generated blind — the installer does not know
what UI the project contains, and a guessed selector is worse than no test.
Feature specs are authored the first time that feature actually needs
coverage, using RULE QA-E2E-01's structure.

---

## RULE QA-E2E-03 — Generated-but-unverified specs are always flagged as such

If Claude proposes a batch of starter specs by inspecting routes/components
(rather than writing one spec at a time against a stated requirement), each
proposed spec must be presented to the developer as generated and unverified
before being committed — never silently treated as equivalent to
hand-written, developer-confirmed coverage.

---

## RULE QA-E2E-04 — Specs are updated or removed in the same change as the behaviour they cover

When a code change alters behaviour an existing spec or POM method covers,
the spec must be updated in the same branch/commit — never left red, and
never commented out. When a feature is removed or replaced outright, its
spec and any now-unused POM methods are deleted deliberately as part of that
change.

A spec that passes without still being true (stale-but-green) is worse than
no spec — it is a false signal. This is a promotion blocker at the same tier
as leftover debug artifacts (`branch-gates.md` RULE QA-GATE-01).

---

## RULE QA-E2E-05 — Ephemeral run output is never committed

Playwright's own run artifacts — `test-results/`, traces, run-scoped
screenshots — are gitignored, not committed. A one-off diagnostic script
Claude writes mid-task to sanity-check something is disposable and must be
removed once its purpose is served; it is never mistaken for, or left
alongside, the persistent fixtures/POM/spec files RULE QA-E2E-01 defines.
