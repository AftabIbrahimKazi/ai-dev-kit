---
name: session-budget
description: Token discipline — grep before read, targeted ranges, no re-reads, no restating code, cheap-model delegation. Trigger at session start on long tasks, when context fills, or on mention of tokens, cost, budget.
---

# Session Budget — Drive Efficiently

The model skills pick the gear; this skill drives it. Every rule targets the actual waste patterns: redundant reads, oversized reads, restated content, and premium-model grunt work.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — the biggest token sink observed this session and how to avoid it. Merge instead of duplicating; delete disproven bullets.

## Reading discipline (input tokens)
- **Grep/glob before read.** Locate the target line range, then read that range — not the whole file. Reading a 2000-line file to edit 10 lines is a 100× overspend.
- **Never re-read a file you just wrote or edited** — the harness tracks state; the write would have errored if it failed.
- **Never re-derive established facts.** If it's in the conversation, the handover, or a memory, use it.
- **One targeted read beats three speculative ones.** Form a hypothesis about where the code lives before opening files.
- Docs/config: read the section, not the document.

## Output discipline (output tokens — 5× the price of input)
- **Never restate code back to the user** — reference `file:line` instead of quoting.
- No preamble restating the task; no trailing summary re-listing every edit. One outcome sentence + what matters.
- Edits over rewrites: change the lines that change, don't regenerate whole files.
- Working notes between tool calls: one line or none.

## Delegation discipline
- **Fan-out grunt work goes to cheap subagents** (search across many files, per-item checks, bulk classification) — keep the premium model as orchestrator.
- Give subagents only the slice of context they need, never the whole session.
- Escalate on demonstrated failure, not anticipated difficulty (see the `claude-all-models` skill for routing).

## Measure, then shrink (scripts, any tool)
- `node <skill-root>/session-budget/report.js` reports tokens, cost, cache hit rate, the biggest tool-result sinks, re-reads of unchanged files, whole-file reads and low-cache turns. It reads the ledger written by the optional `budget-ledger` mod (Claude Code, installed with `mod-setup`; adds `/budget`). Without the mod there is no ledger.
- Run a command that prints 150+ lines (verbose test reporters, long builds) as `node <skill-root>/session-budget/compact.js -- <command>`. The exit code is unchanged and every failure line survives; passing-test lines, progress, library stack frames and duplicates are dropped, and the full output is kept in `~/.ai-dev-kit/raw` (newest 20; `--no-save-raw` turns it off). Arguments keep their quoting; a single argument is used as the whole command line. Measured: 59% smaller on a verbose passing log, about 0% on lint or type-check failures, so use it for verbose output only.

## Session shape
- Front-load the expensive thinking: plan once at high effort, execute the plan at working effort.
- When context grows long, consolidate: the handover file is cheaper than dragging dead history through every request.
- Batch independent tool calls in parallel — same tokens, less wall-time, fewer "where was I" re-orientations.
- Don't optimize past the point of damage: a re-read that prevents a wrong edit is cheap; a wrong edit is not.
