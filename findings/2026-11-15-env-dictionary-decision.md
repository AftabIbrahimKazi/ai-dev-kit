# Env dictionary and project AI env: decision, 2026-11-15

## Inventory

The kit's scripts and mods read 32 environment names (plus 6 OS names). 3 are secrets (`GEMINI_API_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`), all read only by the image-gen add-on, and one optional hosted-prefilter key (`SYSTEM1_API_KEY`). The rest are folders, ports, executables and test overrides with safe defaults. Scripts read `process.env` directly; no kit file stores keys, and no instruction tells the AI to read an env file.

## Token math (real tokens = chars / 4 x 1.5)

| Option | Tokens the AI spends | Notes |
|---|---|---|
| Today: scripts read `process.env` | 0 | the AI never sees a name or a value |
| Full dictionary read by the AI (32 rows, about 2,900 chars) | about 1,100 per read | only if something tells it to read it; nothing does |
| Project `.ai-kit.env` with the names a project uses (about 6 rows) | about 150 per read | adds a secret-bearing file per project |
| Script resolves the 1 or 2 variables a task needs | 0 | what already happens |

## Decision

Built: `docs/env-variables.md` (names, purpose, reader, secret flag; no values) and `tests/env-dictionary.test.js`, which fails if the code reads a variable the page does not list. Cost to the AI: 0 tokens, because nothing loads it.

Rejected, with the numbers above: the per-project `.ai-kit.env`, the `env-resolve.js` resolver, the installer step that writes stubs, and the guard that blocks reading `.ai-kit.env`. They would save 0 tokens (scripts already resolve what they need), add a copy of each secret to every project folder, and add a guard to maintain for a file the design itself creates. Revisit if a feature needs a project-specific key that the user's shell cannot supply.
