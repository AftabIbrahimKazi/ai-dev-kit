# Handover — ai-dev-kit

Updated: 2026-10-04 · Branch: main (the only branch, local and GitHub)

## Current state

`main` = `origin/main` at `86ae64a`; clean except an untracked `.vscode/` (IDE file, ignore). The kit now ships an `mcp/` category (`mcp-manager` + servers `stitch`, `local-vision`, `image-gen`), a local Laya provider and `prefilter` MCP tool under `addons/system1-prefilter`, `CREDITS.md`, and refreshed READMEs and GitHub description/topics. On the user's machine (not in the repo) OpenCode is wired globally: `~/.config/opencode/opencode.jsonc` + `AGENTS.md`, scripts in `~/.ai-dev-kit/mcp/`, models in `~/.ai-dev-kit/{vision,laya}`; all three tools verified in a real OpenCode session. The user's own real-OpenCode test is still pending.

## Last session

Shipped the MCP tooling above, a kit-wide structural audit (all 50 skills pass; descriptions and one `install-kit` contradiction fixed), the controlled-writing rule in `skill-writer` (measured ~16% fewer tokens, equal-or-better rule-following on 2 skills; no skills actually rewritten yet), and credits for every third-party model/service. Merged 5 commits that had landed on `origin/main` from another session (tool-routed installs, pre-commit gate, parallel-session claims) — conflicts in `install-kit`, `skill-scope`, `system1-prefilter` resolved keeping both sides. Temporary branches deleted.

## Decisions & why

- **No local image generation.** SDXS, SD-Turbo(+TAESD) and FLUX.2-klein were run end to end on CPU: fast ones gave poor faces, good ones took ~4.6 min/image. `image-gen` is hosted: Gemini → Cloudflare FLUX.1 schnell (~173 free/day) → labelled placeholder. Don't re-add local diffusion without a GPU.
- **No browser automation of the Gemini web UI** — terms/account-ban risk; API keys only.
- **Global-first for local tools.** Models, runtimes, ledgers, keys live once in `~/.ai-dev-kit/`; never per project (GBs of duplication). User-level configs, rules in the tool's global instruction file.
- **Limit policy is fixed:** 80% heads-up, 90% switch provider, pause until 00:00 UTC when all are exhausted, then placeholders; every step must be relayed to the user as a notice.
- **Laya defaults:** `english` checkpoint (beats `typed-decisions` here); boolean questions put the candidate in the *state*; relative cut-offs (heuristic from 2 tasks).
- **OpenCode MCP `timeout` must exceed the cold start** (240000 set); its 5 s default breaks local-vision.
- **Gemini image models have no free API quota** on a fresh key (429); Cloudflare tokens need the *Workers AI* permission.
- **Older, still binding:** Context code is a fixed proxy, not a counter; `[CX][ON]` self-report rejected; comment-style sidecar levels dropped; previous-gen model skills kept (no rename ledger row needed); `opus-as-fable` deliberately untouched (untested against Opus 5.5).

## Known issues

- Only Windows 11 / 8-core CPU / no discrete GPU was tested. CUDA, Metal, discrete-GPU Vulkan and Linux/macOS paths in the installers are implemented but unverified.
- `pick_many` cut-offs came from 2 tasks × 6 files; `mcp-manager`'s interview has not been run end to end by a fresh agent and does not yet handle several optional keys per server.
- The user's Cloudflare token expires 2026-10-11; its only copy is `_sandbox/test-project/.env` (untracked, ignored via `.git/info/exclude`). `~/.ai-dev-kit/.env` is empty.
- `haiku-4-5.md` staleness guard still says verified 2026-07.

## Next steps

1. User tests the real OpenCode build; fix anything it finds (config at `~/.config/opencode/`).
2. Move the Cloudflare keys into `~/.ai-dev-kit/.env`, then delete `_sandbox/` (user's call; token is shown by Cloudflare only once).
3. Add Claude Code's global setup (`claude mcp add --scope user …` + `~/.claude/CLAUDE.md` rules) — only OpenCode is done.
4. Run `mcp-manager`'s interview with a fresh agent; handle optional multi-key servers.
5. Apply the controlled-writing style to skills when each is next touched, re-checking every rule survives (one rewrite dropped "ask what changed since it last worked").
6. Decide `opus-as-fable` for 5.5. Still planned: a hardcoded version-bump script (needs the user's versioning convention).

## Don't touch / gotchas

- **`ai-standards.md` RULE AI-01–AI-16 body text stays byte-identical** unless a rule truly changes.
- **`hooks-enforcement.md`'s hard rule (never touch `handover/`) is load-bearing.**
- No `.claude/skills/` in this repo on purpose; skill files live at `skills/<category>/<name>.md`.
- **Catalogs to update together:** `skills/README.md`, root `README.md`, `skill-scope.md`, and `CREDITS.md` for anything third-party.
- **Global script copies drift.** `~/.ai-dev-kit/mcp/{local-vision,image-gen,prefilter,ladder,laya-ctl}.js` are *copies* of `skills/mcp/mcp-manager.*.js` and `skills/addons/system1-prefilter.*.js`; re-copy after editing the sources.
- **Editing JS with regexes:** backslash escapes get mangled when written through shell heredocs/Python strings (`\r\n`, `\.`). Use the Edit tool or `chr(92)`, then `node --check`.
- **Node on Windows:** call `process.exitCode = n`, not `process.exit()`, after a `fetch` (exit during close crashes with a libuv assertion).
- Don't chain `git push … | tail && git push --delete …`: the pipe hides a rejected push. Check the push result first.
