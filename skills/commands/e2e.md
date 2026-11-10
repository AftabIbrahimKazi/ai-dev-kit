---
description: Playwright scaffold: status, or init the config, fixtures and smoke test
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Scaffold report:

!`node {{skill-root}}/skill-scope/auto.js run e2e-scaffold init.js $ARGUMENTS`

Use the `e2e-scaffold` skill if it is installed. Arguments: `status` (default when empty), or `init [--port N] [--command "pnpm dev"] [--dry-run] [--force]`. `init` writes `playwright.config`, `tests/e2e/fixtures` and `tests/e2e/smoke.spec`, adds `test:e2e` to `package.json` and the output folders to `.gitignore`; it installs nothing. If it printed an install line, ask before running it. If it refused because the scaffold exists, extend the existing fixtures instead. Reply in at most 6 lines.
