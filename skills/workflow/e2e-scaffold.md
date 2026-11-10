---
name: e2e-scaffold
description: Setting up e2e/Playwright testing, or before a first Playwright spec with no fixtures layer. Load BEFORE writing any spec.
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
1. **At start:** apply `learnings.md` if the `learnings-inject` mod supplied it. Do not search for it.
2. **At end of every use:** append one dated bullet — a stack this needed extra handling
   for, a detection heuristic that guessed wrong. Merge instead of duplicating.

## Step 1 — Check whether the scaffold already exists

```
node <skill-root>/e2e-scaffold/init.js status
```
If it says `scaffold present`, **do not re-scaffold** — read the existing `fixtures.ts`
and any `*.pom.ts` files and extend them for whatever new coverage was asked for.
Re-running the scaffold on a project that already has the layer is a bug, not
idempotent setup (`init` refuses with exit 3 for that reason).

## Step 2 — Detect the stack

The same `status` line names the framework, port, package manager, dev command and
whether `@playwright/test` is installed. Confirm the port against the real dev server
once (projects override framework defaults); pass `--port` and `--command` to `init`
when the guess is wrong.

If `@playwright/test` is missing, tell the user what will be installed and why, then
run the install command the script prints — this is a `package.json` change and
follows the same confirm-before-acting posture as any other dependency addition.

## Step 3 and 4 — Write the scaffold and wire it up

```
node <skill-root>/e2e-scaffold/init.js init [--port N] [--command "pnpm dev"] [--dry-run]
```
Writes the three files from `templates.md` (config, universal fixtures, smoke test)
with the port and dev command filled in, adds `test:e2e` to `package.json`, adds the
Playwright output folders to `.gitignore`. It never installs packages and never
overwrites an existing file without `--force`. Keep the fixtures file to **universal
concerns only** — no feature-specific selectors, no guessed Page Object methods.

If `coding-standards/qa/e2e-testing.md` is installed, it needs no edits. If the project
has no coding-standards system, briefly note to the user that RULE QA-E2E-01–05's
discipline (specs updated in the same commit as the behaviour they cover, never left
stale-but-green) still applies even without the file.

## Step 5 — Verify, then stop

Run `test:e2e` and confirm the smoke test passes before reporting done — an unverified
scaffold is worse than none. **Do not** generate additional feature-specific specs at
this point; that's the next request, done against the fixtures/POM layer just built,
not a blind batch of guessed coverage (see QA-E2E-02/03 if the standard is installed).
