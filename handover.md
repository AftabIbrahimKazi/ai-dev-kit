# Handover — ai-dev-kit

Updated: 2026-09-02 · Branch: main

## Current state
Pushed to `origin/main` as of commit `e6c86dd`. Working tree clean, local `main` matches remote exactly — no pending changes.

## Last session
Ran a feasibility study of the kit against an "AI-native SDLC" framework (discovery → spec/plan → build/test → governance), then staged and shipped 4 changes, each self-contained and independently verified:
1. **`skills/workflow/intent-capture.md`** (new) — Goal/Constraints/Done-when protocol before `plan-first`, for genuinely ambiguous asks. Cross-referenced from `plan-first.md`.
2. **`skills/workflow/pre-merge-gate.md`** (new) — self-check a diff against loaded standards before commit/handoff; scoped to files actually touched (in `role-session` mode, exactly the author's own lock rows — never a whole-tree diff). Wired into `role-session.md` step 4. Rule 2 names `skill-writer.md` as the applicable chain when the changed files are skills themselves, not application code.
3. **`skills/models/claude/hooks-enforcement.md`** (new) — optional, Claude Code-only sample `SessionStart`/`PreToolUse` hook config that mechanically *assists* (never replaces) `ai-standards.md`'s AI-01–AI-03. Carries an explicit hard rule: never read/write/gate on any path under `handover/`, so it can't race `role-session`'s lock file.
4. **`skills/models/claude/claude-all-models.md`** — appended a short "Regression eval — not yet built" section with a concrete trigger condition, deliberately not built yet.

Companion edits: `skills/README.md` (3 new catalog rows), `install-kit.md` (opt-in hook-merge step + "travels together" advisories for the 3 new skills), `ai-standards.md` (2-line pointer only — RULE text is byte-identical, 0 deletions confirmed), `README.md` root (SEO framing + fixed a stale repo-layout description that predated these changes).

Two independent audits ran against the actual diff (not prior summaries): a general exploration pass, and a dedicated Opus audit checking agnosticism, JSON validity, install mechanics, and the `role-session`/`handover/` isolation claims. All 8 checked goals passed; one advisory (rule 2's standards-chain naming) was found and fixed same-session.

Two commits, both pushed:
- `e60c11d` — the 3 new skills + companion edits
- `e6c86dd` — README SEO/accuracy pass

## Decisions & why
- **Discovery → spec artifacts stopped at prose skills, not committed `/intent` or `/spec` files.** The video that prompted this used file-based artifact chains, but this kit is markdown-instruction-only with no build/CI layer to consume such files — a prose protocol (`intent-capture`) gets the same discipline without inventing a file format nothing reads.
- **Hooks isolated under `skills/models/claude/`, not woven into `ai-standards.md`.** The kit's stated identity is tool-agnostic (Claude Code, OpenCode, "any agent that reads markdown"); hook mechanics are Claude Code-only, so they're strictly additive and pointed-to, never a dependency.
- **Autonomous maintenance loop and a real cross-model eval harness were explicitly declined**, per the user's own call — deprioritized as scope creep without a proven need. Only a documented trigger condition was added for the eval piece.
- **Local clone vs. GitHub reconciled mid-session**: at one point local was verified ahead of origin by 5 commits; later the user correctly flagged that GitHub was actually the live truth (origin had 1 commit — a README badge — that local hadn't fetched). Fast-forwarded local to match before any further edits. Lesson: don't trust a single `ls-remote` read as final; re-verify direction of drift before treating either copy as canonical.

## Known issues
None outstanding. The one advisory the Opus audit raised (pre-merge-gate not naming `skill-writer.md` for skill-file diffs) was fixed in the same session, before commit.

## Next steps
- No open work. If continuing this thread: consider whether `intent-capture` and `pre-merge-gate` need real-world dogfooding inside a project install before calling them stable — they're new and unused in practice.
- `claude-all-models.md`'s regression-eval trigger ("drift observed on a skill after ≥2 routing changes") is the thing to watch for — if it fires, that's the next stage to actually build.

## Don't touch / gotchas
- **`ai-standards.md`'s RULE AI-01–AI-16 body text must stay byte-identical** unless a rule is genuinely being changed — the only sanctioned edit there is the 2-line pointer near the top. Any future diff touching that file should be checked with `git diff --numstat` for surprise deletions before committing.
- **`hooks-enforcement.md`'s hard rule (never touch `handover/`) is load-bearing** — any future edit to its sample hook commands must preserve that boundary, or it can silently corrupt `role-session` lock coordination in a way the dev won't see happening.
- This repo has no `.claude/skills/` of its own (doesn't dogfood its own install layout) — skill files live at `skills/<category>/<name>.md` in source form; that's intentional, not an oversight.
