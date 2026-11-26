---
name: kaggle
description: Opt-in. Use to run a finished plan's coding tasks on a free Kaggle GPU (qwen3-coder) instead of Claude tokens, or on /kaggle. Load BEFORE writing a plan for it or running a GPU job.
---

# Kaggle executor — plan on Claude, code on a free GPU

**Opt-in only, never part of any default install.**
<!--if ai.coding~kaggle-->
Claude plans and reviews; a private Kaggle notebook running `qwen3-coder:30b` (Ollama, 2x T4) writes the files. Nothing runs by itself: every step is a `/kaggle` subcommand you type.
<!--else-->
Claude plans and reviews; the free router writes the files. Nothing runs by itself: every step is a `/kaggle` subcommand you type.
<!--/if-->

## Learnings
Apply `learnings.md` if the `learnings-inject` mod supplied it (never search). At end, add one dated bullet only for a new, non-obvious lesson; merge, don't duplicate.

## First run (a person typing, no experience needed)
<!--if ai.coding~kaggle-->
1. Make a free account at kaggle.com and verify your phone (GPU needs it). In Settings, API, create a token.
2. Install the Kaggle command line: type `pip install kaggle` and press Enter.
3. Put the token in a file called `.env` inside the folder `.ai-dev-kit` in your home folder, as one line: `KAGGLE_API_TOKEN=<your token>`.
4. In Claude Code, type `/kaggle setup --user <your kaggle username>`. It says what is missing.
5. Write a plan in the format below, then `/kaggle plan plan.md` (free: checks the plan and estimates GPU minutes).
6. `/kaggle run plan.md` pushes it, waits, and prints how many tasks passed the local checks. Allow about 5 minutes of start-up plus a minute or less per task.
<!--else-->
1. Put your router key in a file called `.env` inside the folder `.ai-dev-kit` in your home folder, as one line: `UNIFIED_API_KEY=<your key>`.
2. Write a plan in the format below, then `/kaggle plan plan.md` (free: checks the plan).
3. `/kaggle run plan.md` sends each task to the router and prints how many tasks passed the local checks.
<!--/if-->

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

Rules: one or two files per task; the task text stands alone (no "see above"); exact names and signatures; `Context:` lists only files the model must see (nothing else is seen, 20k tokens at most); a `Check:` that is a command or `none`. Name the module style and export form in every task that touches another file ("CommonJS, `module.exports = slugify`"): a test written without it used ESM `import` against a CommonJS module and failed. The `Check:` line is for Claude: it is run after the staged files are copied into the repo, not by the add-on. No planning, debugging, architecture or repo-wide changes: those stay with Claude.

## Subcommands
`setup [--user name]`, `plan <plan.md> [--standards <dir>]`, `run <plan.md> [--via auto|kaggle|unified] [--force] [--no-wait]`, `fetch`, `retry`, `status`, `stop`, `usage`, `review`, `learn`. `--standards` defaults to the project's `coding-standards/` and a `Standards:` id that is not a file there fails the plan. Files from the model land in a staging folder under `~/.ai-dev-kit/kaggle/<project>/staging/`, never in the repo. Local gates (placeholders, JS syntax, JSON, cut-off HTML, missing or extra files, console.* and magic numbers in JS, and each task's `node ...` Check run inside staging) run on them; `retry` re-asks failed tasks with the findings, twice at most, then Claude takes over (two failures, route up).

<!--if ai.coding~unified-->
## Who writes the code
`coding` in `.claude/ai-backends.json` lists `kaggle` and/or `unified` (no list: Kaggle only). `run` takes `--via auto|kaggle|unified`: auto tries Kaggle, then the free router (same prompts, no GPU quota). If the script prints HANDOFF, write the code yourself.
<!--/if-->

## Rules
<!--if ai.coding~kaggle-->
- **GPU quota is real.** About 30 hours a week free; the local ledger tracks use and `run` refuses over 90% or while a session is open (`--force` overrides). The Kaggle account page is the truth.
- **Kaggle has no cancel.** `stop` deletes the notebook. The notebook also exits on its own after a wall-clock cap (40 min) and stops after 3 failures in a row.
<!--/if-->
- **Never review the model's work with the model.** Claude reads failures and the diff, fixes, and runs the project tests and the pre-commit check.
- **Secrets:** the token stays in `.env`; plans and prompts leave this machine (Kaggle or the router), so put no production data or secrets in a plan.
<!--if ai.coding~kaggle-->
- **Measured:** 65 tok/s, about 5 min cold start.
<!--/if-->

## Credit
Kaggle, Ollama and Qwen are called at run time; nothing is copied. See `CREDITS.md`.

`learn` (run after copy-in and review) saves each staged file that differs from its repo copy as a (bad, fixed) pair in `pairs.jsonl`: the dataset for later lessons or fine-tuning. Staged web files get a `/modern-web` hint in the report.
