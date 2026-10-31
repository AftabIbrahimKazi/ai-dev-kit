---
name: plan-first
description: Use when a task touches 3+ files, has ambiguous scope or several deliverables, or plan mode is on for big work. Load BEFORE the first edit.
---

# Plan First — Cheap Insurance Before Expensive Runs

A wrong interpretation on a big run wastes the whole run. Five lines of plan costs ~100 tokens and catches it before execution.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — did the plan catch a misinterpretation? Was planning overhead wasted on a task too small for it? Merge instead of duplicating; delete disproven bullets.

## When it applies
- Task will touch **3+ files**, OR
- The request has **two plausible interpretations**, OR
- The work is **destructive/hard to reverse** (schema changes, deletions, rewrites).

Below that threshold: just do the work. Planning a one-file edit is its own waste.

For genuinely ambiguous intent specifically (two+ readings, no stated success condition), run `intent-capture` first — its Goal/Constraints/Done-when feed this plan's Approach line.

## The format (hard cap: 5 lines + file list)

```
Plan: <one-sentence goal as I understand it>
Approach: <the how, 1–3 lines — the decision points, not the obvious steps>
Files: <path> (new|edit|delete) — <one clause each>
Won't do: <adjacent things deliberately out of scope, if any>
Verify by: <how I'll prove it works>
```

Then: "Proceeding unless you redirect" for routine work, or an explicit question when a genuine fork exists (present the fork as 2 options with a recommendation, not an open question).

## Time estimate & checkpointing

Applies whenever a task is estimated to take **more than 5 minutes**, OR will run **backgrounded** (`run_in_background: true`), OR is part of a **sequential or parallel chain** of steps — regardless of file count, so this can trigger even below the 3-file planning threshold above.

1. **State a time estimate before starting**, as a range, not a false-precision single number (e.g. "~8-12 min," not "9 minutes"). This is a judgment call, not a measurement. `session-budget.report.js`'s duration section (real wall-clock time, from `budget-ledger`) can be checked afterward against what was estimated, but nothing feeds that back into the estimate automatically — use it to calibrate judgment over time, don't claim more rigor than a single data point warrants. Add it as a line in the plan format above (`Estimate: ~X-Y min`) when a plan is already being written; state it as one line on its own otherwise.
2. **Break the task into checkpoints by design**, each one self-contained: a safe, resumable stopping point with nothing left half-done (a passing test, a committed-or-cleanly-stashed state, a file fully written rather than mid-edit — same bar as `handover`'s "exact resume point"). Target **≤10 minutes per checkpoint**, worst case **≤15 minutes**; go longer only when a single step is genuinely atomic and cannot be split further (e.g. one long-running test suite, one external build) — say so plainly when that happens rather than silently exceeding the budget.
3. **Report at each checkpoint**, not just at the end: what finished, the next checkpoint's own estimate, and whether anything changed the overall estimate. For a background or parallel chain with no one to report to synchronously, write the same checkpoint note into `handover.md` or the task's own status output (per `mode-kernel`'s background-mode rules) so it's there when checked.
4. On-demand, the same information is available any time via the `/eta` command — this rule is what makes asking for it usually unnecessary, not a replacement for it.

## Delegated execution (plan mode only)
In plan mode, or when asked to plan a big or repetitive task with defined rules, read `delegated.md` in this skill's folder first. Skip it for small fixes and ordinary runs.

## Rules
- **Enumerate files by actually checking** (glob/grep), not from memory — the plan's value is that it's grounded.
- **One plan, then execute without pausing.** No re-asking permission at each step; the plan WAS the permission. Stop mid-run only for scope changes or destructive surprises.
- **"Won't do" is load-bearing** — it's where scope creep and over-engineering get declined in advance.
- If execution reveals the plan was wrong, say so in one line and state the correction — don't silently diverge.
- Plans are not deliverables: no headers, no prose padding, no restating the user's request back at length.
