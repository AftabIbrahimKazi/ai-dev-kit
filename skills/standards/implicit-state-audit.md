---
name: implicit-state-audit
description: Use whenever UI code keeps state in several boolean flags (isLoading, isError, isOpen), in classes or data attributes set from many places, or in timers; also a bug that "only happens in some order". Load this BEFORE reviewing or fixing such state.
---

# Implicit State Audit — find the hidden state machine

Scattered flags hide a state machine nobody wrote down. Impossible combinations (`isLoading` and `isSuccess` both true) then become reachable, and the bug appears only in some order. This skill finds them with a script first and a model only for the files the script flags.

## Self-improvement (do this first and last)
1. **At start:** apply `learnings.md` if the `learnings-inject` mod supplied it. Do not search for it.
2. **At end:** append one dated bullet only for a new, non-obvious lesson (a pattern the scan missed, a false alarm it keeps raising). Most uses add nothing. Merge instead of duplicating; delete disproven bullets.

## The tool
`node <skill-root>/implicit-state-audit/scan.js [file|folder ...] [--changed] [--json]` (`/state-audit`). Plain Node, no model, no network, results cached by file hash. With no path it scans the changed files, else the whole project. Read its table; do not re-derive it.

| Rule | Level | Means |
|---|---|---|
| `bool-flags` | WARN, or FAIL when loading + error + success flags all exist | 3 or more boolean flags in one scope |
| `scattered-toggle` | WARN | 3 or more distinct classes or attributes changed in 2 or more functions |
| `timer-sequencing` | WARN | 2 or more `setTimeout` callbacks that change state |

Not machine-checked: a transition that ignores the current state, and state split across files. Judge those by reading, or give the file to the reviewer.

## Fix pattern
1. Name the states that can really occur (for example `idle`, `loading`, `success`, `error`).
2. Replace the flags with one variable holding one of them: a union type, or one `data-state="..."` value that CSS reads.
3. Put every change through one function that checks the current state and sets the next one. A transition not listed is refused.
4. Delete the old flags. Rerun the scan: it must report 0 FAIL.

A WARN on flags that are truly independent (a drawer open and a map ready) is a false alarm: say so in one line and leave it.

## The reviewer (optional)
`<skill-root>/implicit-state-audit/ask.txt` is the prompt for a second model. `<skill-root>/plan-first/reviewer.js --prompt <prompt> --file <file>` sends one file to Gemini, then a local Ollama model, and prints only WARN or FAIL. It runs only when the project's `.claude/state-audit.json` sets `"reviewer": "auto"` or `"ollama"`; the default is `"static"` (no network). Free-tier Gemini may keep inputs: use `"ollama"` for private code. A reviewer that is down or rate-limited is skipped, never an error.

## Rules
- Run the scan on changed UI files before a UI task is called done; a FAIL blocks "done".
- Never paste a file into a prompt to find these: the scan already did, for 0 tokens.
- Do not add a state library to fix a WARN. One union variable is enough.
