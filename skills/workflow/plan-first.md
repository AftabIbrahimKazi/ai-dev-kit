---
name: plan-first
description: For tasks touching 3+ files or ambiguous scope — enumerate files, ≤5-line plan, confirm, execute without pausing. In plan mode on big or repetitive work, also write the plan for a cheaper executor model and verify its result. Trigger before multi-file features, refactors, redesigns, or tasks with two plausible interpretations.
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

## Delegated execution (plan mode only)
Applies only when the session is in plan mode, or the user asks for a plan on a big or repetitive task with defined rules. Do not use it for small fixes or ordinary `plan-first` runs: execute those directly.

**1. Pick the tiers.** The thinking model is the active model (read its name from the system prompt). Pecking order: Fable 5.1 > Opus 5.5 > Sonnet 5.5 > Haiku 5.5. The executor is the next tier down. Go two tiers down only if every step is atomic and has a concrete check. If the active model is Haiku, not a Claude model, or unknown, do not delegate: execute directly.

**2. Delegate only if the plan has 5 or more steps, or the executor must write a lot of code or text.** Otherwise execute directly. Each executor run has a fixed startup cost (about 140K cached tokens), so small plans lose the saving.

**3. Write the plan for the executor.** Start with this header: work only inside the project, do not commit, run no background commands, follow steps in order, stop and report on any mismatch, end with a report under 80 words (PASS or FAIL per step). Then give shared context once. Each step has:
- the file and location;
- the exact change, or a function-level spec;
- a check with its expected result;
- what not to touch.

For a Haiku executor, make every step fully explicit with one task per step and exact output formats. For a Sonnet or Opus executor, a goal per step is enough, but keep the checks. For rewrites, list every fact that must survive. Place tests before the run and forbid the executor from editing them.

**4. Run the whole plan in one call, never per step, and never with subagents.** Save the plan to a file, tell the user the tier, then run `node <skill-root>/plan-first/delegate.js <plan-file> --tier haiku|sonnet|opus` in the project directory. The script finds the `claude` binary (PATH, `CLAUDE_CODE_BIN`, newest VS Code extension copy), runs `claude -p` at `--effort low` with the plan on stdin and `git commit`/`git push` denied by the CLI (the header's "do not commit" is enforced, not just asked), and prints exit code, time, cost, tokens, the files the run changed (measured against a `git stash create` snapshot, so an already-dirty file edited again still shows) and a short executor report. It appends a row to `~/.ai-dev-kit/ledger/delegate.jsonl`. `--dry-run` shows the command. If it cannot find the binary, tell the user and either ask them to switch model with `/model` or execute directly. This runs through Bash, not the Agent tool, and the user chose it by using plan mode; `agent-usage` does not apply.

**5. The thinking model verifies and fixes.** Run the plan's checks yourself, read the diff (against the snapshot the script names, when the tree was already dirty), and confirm every must-keep fact. Fix mistakes yourself; do not send them back to the executor. A passing check does not prove quality, so read judgment-heavy output.

**6. Log the run** in `learnings.md`: executor, cost and tokens from the JSON, and any mistake the executor made.

Evidence (2026-10-09): 6 tests, plan on Haiku 5.5 vs Sonnet 5.5 at effort low. Both passed all 6. Haiku cost $0.049 and Sonnet $0.581. Haiku dropped one rule from a rewrite and once started a stray background process.

## Rules
- **Enumerate files by actually checking** (glob/grep), not from memory — the plan's value is that it's grounded.
- **One plan, then execute without pausing.** No re-asking permission at each step; the plan WAS the permission. Stop mid-run only for scope changes or destructive surprises.
- **"Won't do" is load-bearing** — it's where scope creep and over-engineering get declined in advance.
- If execution reveals the plan was wrong, say so in one line and state the correction — don't silently diverge.
- Plans are not deliverables: no headers, no prose padding, no restating the user's request back at length.
