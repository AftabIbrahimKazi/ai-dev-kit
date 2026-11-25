---
name: plan-first
description: Task touches 3+ files, has ambiguous scope or several deliverables, or plan mode for big work. Load BEFORE the first edit.
---

# Plan First — Cheap Insurance Before Expensive Runs

A wrong interpretation on a big run wastes the whole run. Five lines of plan costs ~100 tokens and catches it before execution.

## Learnings
Apply `learnings.md` if the `learnings-inject` mod supplied it (never search). At end, add one dated bullet only for a new, non-obvious lesson (did the plan catch a misinterpretation? Was planning overhead wasted on a task too small for it?); merge, don't duplicate.

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
3. **Checkpoints are resumable points, never stops.** Stages are self-contained so each one is clean and recoverable, not so you can pause. At each checkpoint write a one-line note (what finished, next estimate) and keep going in the same turn; never end the turn or ask "Should I proceed to Stage N?". For a background or parallel chain with no one to report to synchronously, write the same checkpoint note into `handover.md` or the task's own status output (per `mode-kernel`'s background-mode rules) so it's there when checked.
4. On-demand, the same information is available any time via the `/eta` command — this rule is what makes asking for it usually unnecessary, not a replacement for it.

## Delegated execution (plan mode only)
In plan mode, or when asked to plan a big or repetitive task with defined rules, read `delegated.md` in this skill's folder first. Skip it for small fixes and ordinary runs.

## Plans for the Kaggle executor (opt-in `kaggle` add-on)
If the user will run the plan with `/kaggle`, read the add-on `kaggle.md` for the executor-ready format: `## Task <n>` sections with Target, Check, Standards, Context and a self-contained text, one or two files each. Decompose small; inline the code excerpts the model needs.

## Rules
- **Enumerate files by actually checking** (glob/grep), not from memory — the plan's value is that it's grounded.
- **One plan, then execute without pausing.** No re-asking permission at each step; the plan WAS the permission. Stop mid-run only for scope changes or destructive surprises.
- **Executing an approved multi-stage plan: run ALL stages, start to finish, in one continuous run.** Do not stop between stages to summarize or ask permission. Stop early only on a blocking error or failing test you cannot resolve after 2 attempts, or when a stage genuinely needs user input (a well-made plan rarely does, but exceptions exist). Report once, after the final stage is complete and verified. Stopping between stages is opt-in: do it only when the user asks for it in the prompt (e.g. "stop after each stage", "pause at Stage 3"). Otherwise the default is never to stop; the stop must come from the user's instruction, not from your own caution.
- **"Won't do" is load-bearing** — it's where scope creep and over-engineering get declined in advance.
- **Enforce the no-stop rule with a Stop hook (optional):** write the stages as `- [ ]` lines in `PLAN.md` with `<!-- plan-gate -->` on its own line, tick each as it finishes, and register `node <skill-root>/plan-first/gate.js` as a Stop hook. It blocks the stop while stages remain, names the next one, and releases after 2 blocks with no progress, or when `PLAN.md` carries `<!-- plan-gate: off -->`. Plans without the marker are never gated.
- **A block needed in 2 or more files is copied by script, never retyped.** Wrap the source in `<!-- dupe:name -->` ... `<!-- /dupe:name -->`, write one JSON of per-file literal values, run `node <skill-root>/plan-first/dupe.js --from <file> --block name --to a,b --slots slots.json` (`/dupe`). For a framework with includes or components, make one shared component instead. Measured: 5 pages, Haiku, 3 runs per arm, same 5/5 correct, 14 turns and 4,760 output tokens by hand versus 6 turns and 2,630 with the script.
- **A plan that will cost real work (more than 5 steps, or hard to undo) gets a goldfish review before it runs:** `/goldfish prepare <plan.md>` (runs the five stages inline on Claude; subagents only if you ask) or `/goldfish local <plan.md>` (a local or Gemini model, no Claude tokens; needs a reviewer set in `.claude/state-audit.json`). Reviewers advise; you decide. Measured 2026-11-15: letting a 1.5B local model draft the plan first cost Claude MORE (+13%, 3 runs per arm, Haiku), so plans are still written by you.
- If execution reveals the plan was wrong, say so in one line and state the correction — don't silently diverge.
- Plans are not deliverables: no headers, no prose padding, no restating the user's request back at length.
