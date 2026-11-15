---
name: kaggle
description: Opt-in add-on. Use when the user wants to run a finished plan's coding tasks on a free Kaggle GPU (qwen3-coder) instead of spending Claude tokens, or asks about /kaggle. Load this BEFORE writing a plan meant for it or running any GPU job.
---

# Kaggle executor — plan on Claude, code on a free GPU

**Opt-in only, never part of any default install.** Claude plans and reviews; a private Kaggle notebook running `qwen3-coder:30b` (Ollama, 2x T4) writes the files. Nothing runs by itself: every step is a `/kaggle` subcommand you type. Without them, Claude works as before.

## Self-improvement (do this first and last)
1. **At start:** apply `learnings.md` if the `learnings-inject` mod supplied it. Do not search for it.
2. **At end:** append one dated bullet only for a new, non-obvious lesson (a task shape the model gets wrong, a Kaggle limit that changed). Most uses add nothing. Merge instead of duplicating; delete disproven bullets.

## First run (a person typing, no experience needed)
1. Make a free account at kaggle.com and verify your phone (GPU needs it). In Settings, API, create a token.
2. Install the Kaggle command line: type `pip install kaggle` and press Enter.
3. Put the token in a file called `.env` inside the folder `.ai-dev-kit` in your home folder, as one line: `KAGGLE_API_TOKEN=<your token>`.
4. In Claude Code, type `/kaggle setup --user <your kaggle username>`. It says what is missing.
5. Write a plan in the format below, then `/kaggle plan plan.md` (free: checks the plan and estimates GPU minutes).
6. `/kaggle run plan.md` pushes it, waits, and prints how many tasks passed the local checks. Allow about 5 minutes of start-up plus a minute or less per task.

## Plan format (the model cannot ask questions)
One section per task:

```
## Task 1: Debounce helper
Target: src/debounce.js
Check: node --test tests/debounce.test.js
Standards: CX-1
Context: src/util.js
Write src/debounce.js exporting debounce(fn, ms) with a cancel() method. No dependencies. ...
```

Rules: one or two files per task; the task text stands alone (no "see above"); exact names and signatures; `Context:` lists only files the model must see (it sees nothing else, about 20k tokens at most); a `Check:` that is a command or `none`. Name the module style and the exact export form in every task that touches another file ("CommonJS, `module.exports = slugify`"): in the live test a test file written without it used ESM `import { slugify }` against a CommonJS module and failed. The `Check:` line is for Claude: it is run after the staged files are copied into the repo, not by the add-on. No planning, debugging, architecture or repo-wide changes: those stay with Claude.

## Subcommands
`setup [--user name]`, `plan <plan.md> [--standards <dir>]`, `run <plan.md> [--force] [--no-wait]`, `fetch`, `retry`, `status`, `stop`, `usage`, `review`. Files from the model land in a staging folder under `~/.ai-dev-kit/kaggle/<project>/staging/`, never in the repo. Local gates (placeholders, JS syntax, JSON, cut-off HTML, missing or extra files) run on them; `retry` re-asks failed tasks with the findings, twice at most, then Claude takes over (two failures, route up).

## Rules
- **GPU quota is real.** About 30 hours a week free; the local ledger tracks use and `run` refuses over 90% or while a session is open (`--force` overrides). The Kaggle account page is the truth.
- **Kaggle has no cancel.** `stop` deletes the notebook. The notebook also exits on its own after a wall-clock cap (40 min) and stops after 3 failures in a row.
- **Never review the model's work with the model.** Claude reads failures and the diff, fixes, and runs the project tests and the pre-commit check.
- **Secrets:** the token stays in `.env`; plans and prompts go to Kaggle, so never put production data or secrets in a plan. The notebook is private, with internet on (needed to pull the model).
- **Measured** (findings/kaggle-stage0.md): 65 tok/s, about 5 min cold start, 100% GPU at 32k context.

## Credit
Kaggle (kaggle.com) for the free notebook GPUs and CLI; Ollama and Qwen for the runtime and model. The kit calls them at run time and copies nothing. See `CREDITS.md`.
