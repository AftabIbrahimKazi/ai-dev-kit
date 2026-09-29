# Handover — ai-dev-kit

Updated: 2026-09-29 · Branch: main

## Current state

Local `main` is at `e5a6e54` (matches `origin/main` as of the last push). **Uncommitted, not yet pushed:** the Claude 5.5 lineup update and the new `comment-style` skill below (5 new skill files + edits to `claude-all-models`, the three previous-gen skills, `install-kit`, `skills/README.md`, root `README.md`, `skill-scope.md`). Review `git diff` / `git status`, then commit.

## Last session

Updated the kit for the Sonnet 5.5 / Opus 5.5 release, plus caught up two models the lineup had missed (Opus 5, Fable 5.1). Facts (IDs, pricing, API rules, behavioral prompts) came from the bundled `claude-api` skill's model-migration guide, cache dated 2026-09-25 — not from memory.

- **New skills** in `skills/models/claude/`: `sonnet-5-5`, `opus-5-5`, `opus-5`, `fable-5-1`. Same format as existing model skills (staleness guard, self-improvement, hard API rules, prompting patterns). No `compat` field — they encode model behavior and API rules, not tool mechanisms, so they stay universal like `sonnet-5`/`opus-4-8`. Only `hooks-enforcement` is `compat: claude-code-only`.
- **`claude-all-models`**: lineup table now Fable 5.1 / Opus 5.5 / Sonnet 5.5 / Haiku 4.5, with a previous-generation line (Fable 5, Opus 5, Opus 4.8, Sonnet 5); API-difference section rewritten (forced `tool_choice` 400s on the 5.5/Fable 5.1 tier, `between_tools`, Opus 5.5 `medium` default effort, preserved thinking, `fallbacks: "default"` with beta `server-side-fallback-2026-07-01`).
- **Previous-gen skills** (`fable-5`, `opus-4-8`, `sonnet-5`) kept for pinned projects, each with a one-line pointer to its successor. `sonnet-5.md` price corrected to $2/$10 (the old $3/$15 + intro-pricing note no longer matches the live table).
- **Catalogs synced:** `skills/README.md`, root `README.md` (table row + "Recent additions" bullet), `skill-scope.md` model-detection row.

Also added `skills/standards/comment-style.md` — a universal permanent-pinned skill (in `skill-scope`) setting a project-wide comment level: `none` (default) / `terse` / `descriptive`. The level lives in one `**Active level: …**` line in the installed copy; `install-kit` Step 2 asks it at install (all three options explained, default none) and ignores that line when comparing on re-install. Exceptions that apply even at `none`: escape-hatch justifications (TS `as`, suppression-directive reasons), tool-consumed pragmas/license headers, JSDoc-as-type-system. Changes later only on an explicit in-session statement. Wired into `skill-scope`, `install-kit`, both READMEs.

Then added the **Context code** to the `[CX]` rule: `CLAUDE.md` can set a 2–4 char code (e.g. `X7`) and every response starts `[CX X7]` instead of `[CX]`; bare `[CX]` still works when none is set. Changed only AI-01/AI-03 in `ai-standards.md` (AI-04 onward byte-identical, verified via git diff), plus `CLAUDE.example.md`, `coding-standards/README.md`, `install-kit` Step 3 (asks for the code, 'none' allowed), and a `UserPromptSubmit` reminder hook in `hooks-enforcement`. Sandbox-tested with fresh agents: code X7, code Q9 (no carry-over from a distractor X7), and no code — all correct; install flow set the row. Not tested in a real long Claude Code session.

## Decisions & why

- **Context code is a fixed proxy, not a counter.** User chose a fixed code (`X7`) over a per-response counter; AI-01 says plainly it can still be copied forward mid-session, so a missing/wrong code is a reliable lost-context signal but a correct one is not proof. A counter (`[CX 001]`…) would catch copy-forward if this proves too weak.
- **`[CX][ON]`/`[OFF]` self-report rejected** — a drifted model can't detect its own drift, so it would always say ON.
- **Test-prompt gotcha:** asking a Sonnet 5.5 agent for a verbatim log of everything it wrote triggers the `reasoning_extraction` safeguard; ask for opening lines only.

- **Comment-style bookmark/footnote sidecar levels were dropped.** A sidecar doc means extra reads and writes and drifts on refactor; revisit only if a measured session shows it saves tokens.
- **`descriptive` deliberately loosens RULE AI-11** (why-only) for the project; `ai-standards.md` text left untouched (byte-identical rule).

- **Universal, not tool-tagged.** The kit is tool-agnostic by design; model protocols apply to whatever tool drives that model, so they carry no `compat` tag and mention no Claude Code mechanisms.
- **Previous-gen skills kept, not deleted or renamed.** Projects can be pinned to an older model ID; no `RENAMES.md` row is needed since nothing was renamed.
- **`opus-as-fable` left as-is** (targets Opus 4.8). Opus 5.5 already verifies unprompted and delegates freely, so the emulation directives likely need re-baselining before being pointed at it — untested, deliberately not changed.

## Known issues

- Model facts will drift again; each new skill carries a staleness guard pointing at the Models API / `claude-api` skill.
- `haiku-4-5.md` untouched — its staleness guard still says verified 2026-07; the live table shows no newer Haiku.

## Next steps

- Review and commit the uncommitted lineup update (suggested message: `feat: add Sonnet 5.5, Opus 5.5, Opus 5, Fable 5.1 model protocols and update fleet routing`).
- Decide whether `opus-as-fable` should get a 5.5 counterpart or be retired.
- Planned separately: a hardcoded version-bump script (cache-busting `script`/`link` tags) as the first candidate for deterministic scripts replacing hand-written Edit sweeps — still needs the user's folder/versioning convention. Additive class/`data-*` insertion scripts deferred behind it.
- GitHub repo topics/tags still unset (suggested: `claude-code`, `ai-agents`, `skills`, `llm-tooling`) — user hasn't decided.

## Don't touch / gotchas

- **`ai-standards.md`'s RULE AI-01–AI-16 body text must stay byte-identical** unless a rule is genuinely being changed.
- **`hooks-enforcement.md`'s hard rule (never touch `handover/`) is load-bearing** — don't let future hook-command edits cross that boundary.
- This repo has no `.claude/skills/` of its own (doesn't dogfood its own install layout) — skill files live at `skills/<category>/<name>.md` in source form; intentional.
- `skills/README.md` and root `README.md` both reference the skill catalog independently — when adding a skill, both need updating, plus `skill-scope.md` for model skills.
