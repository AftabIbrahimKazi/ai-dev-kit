# New features audit — 2026-10-27

Status: work-in-progress on branch `experiment/new-features-audit`. Written to be picked up later for a proper pass.

## What was added

| Feature | Type | Entry point |
|---|---|---|
| RULE AI-17, clickable file links | Standard | `coding-standards/ai-standards.md` |
| RULE AI-18, response shape follows the data | Standard | `coding-standards/ai-standards.md`, `CLAUDE.example.md` |
| `/format` | Command | `skills/commands/format.md` |
| `/resolve-conflicts` | Skill, script, command | `skills/workflow/resolve-conflicts*` |
| `/responsive-check` | Skill, 2 scripts, command | `skills/workflow/responsive-check*` |
| `/optimize-assets` | Skill, script, command | `skills/workflow/optimize-assets*` |
| `project-context` addon, `/ctx`, `/figma` | Opt-in addon, script, 2 commands | `skills/addons/project-context*` |
| `install-kit` removes itself after a clean install | Script flag | `install-kit.verify.js --finish` |
| Pre-commit BLOCK on staged `project-context/` files | Check rule | `pre-commit.check.js` |
| Skill Triggers table in the contract | Template section | `CLAUDE.example.md` |

## How it was tested

- Unit and integration tests: 14 files, 238 checks, all pass at the time of writing.
- Scratch projects with the kit installed the way `install-kit` installs it (flat skill folders, renamed companions, CommonJS shield, filled-in `CLAUDE.md`), no `handover.md`.
- Live runs with `claude -p` (Claude Code 2.1.311), model `haiku`, one fresh session per prompt, no skill named in any prompt, 1 to 2 runs per prompt. Small sample on a weak model: read rates as directional, not as statistics.
- Token counts are estimates at about 4 characters per token, measured against the git baseline (`HEAD` before this work). Windows CRLF was normalized before counting.

## Results

### 1. Working as intended
| Area | Result |
|---|---|
| Test suite | 14 files, 238 checks pass |
| Installed scripts run from a scratch project | Pass (responsive-check plan and detect, optimize-assets scan and dry run, resolve-conflicts on a real merge conflict, project-context init) |
| `/resolve-conflicts` role scope | In-scope file checked, out-of-scope file left for its owner |
| AI-18 live | Comparison came back as a table, single fact as one line, yes/no question got a long answer (partial) |
| Not testable here | Real conversions (no converter installed), `/figma` (connector not authorized), VS Code panel |

### 2. Conflicts with existing features
| Finding | Status |
|---|---|
| `/context` collides with Claude Code's built-in `/context` (listed in the kit README) | Renamed to `/ctx` |
| `guard`, `standards-chain`, `precommit-gate` mods | No conflict found |
| `code-audit`, `edit-check` walking `project-context/` | Now skip it |
| `standards-chain` mod skip list (TypeScript) does not include `project-context/` | Open |
| AI-17 versus `file:line` lists in other skills | Reconciled: script output is quoted as printed |
| 13 skills not named in `skill-scope.md` (image-gen, local-vision, open-model skills) | Pre-existing, open |

### 3. Token cost (always-on, typical Claude Code install)
| Item | Before | After | Delta |
|---|---|---|---|
| Skill descriptions (36 to 39 skills) | 1861 | 1998 | +137 |
| `CLAUDE.md` contract | 1251 | 1412 | +161 |
| Command descriptions (only if installed) | 193 | 303 | +110 |
| `ai-standards.md` (read when standards load) | 2081 | 2410 | +329 |

Always-on growth is about +300 tokens per session (about 10% of the 3.1k base), plus +329 when the standards load. `install-kit` grew about 350 tokens, but it deletes itself after setup.

### 4. Reductions applied
| Change | Saved (tokens) |
|---|---|
| Shortened new skill descriptions | about 60 |
| Shortened new command descriptions | about 65 |
| Compressed AI-17 and AI-18 | about 170 |
| Shortened contract bullets | about 30 |

The first measurement was +262 always-on, cuts took it to +202, the Skill Triggers table brought it back to about +300. Bigger lever if needed: make the three workflow skills opt-in (about 140 tokens per session, loses auto-triggering).

### 5. Other AI tools
| Area | OpenCode | Codex |
|---|---|---|
| Skills and plain-Node scripts | Work | Work |
| Commands (`$ARGUMENTS`, `!` injection) | Expected to work | No commands folder: ask in words |
| Role file location | `.claude/`, `.opencode/` or `.agents/` all found | Same |
| AI-17 | Conditional on tools that render links | Same |
| Image preset | `vision`, `claude` kept as alias | Same |

All by inspection. OpenCode and Codex were not run.

### 6. Skill triggering without a handover
| Prompt group | Result |
|---|---|
| New features, nothing named (14 runs) | 14 of 14 (was 13 of 14 before the `responsive-check` description was reworded) |
| File-editing task | Standards index read in 4 of 4, through the `CLAUDE.md` contract |
| `pre-commit` on "commit what I have" | 1 of 2, then 4 of 4 after the Skill Triggers table |
| `debug-protocol` on failing build, tests, blank page | 0 of 2, then 1 of 6 even after rewording the trigger row |
| Control question | No false triggers (2 of 2) |
| `[CX X7]` marker present | about 6 of 10 replies |

Skills load by the model's own judgment and `debug-protocol` often does not. The kit's earlier measurement found the same, so this is not new. The reliable layers are the contract (loads the standards) and the mechanical checks (git hook; on Claude Code the `edit-check`, `standards-chain`, `precommit-gate` mods). These are opt-in, so a baseline install has none. `install-kit` now tells the user this once at the end of every install and offers them.

## Bugs found and fixed during the audit

| Bug | Fix |
|---|---|
| `optimize-assets scan` invented image sizes for files that were not the format their name claimed | Check the file signature before reading dimensions |
| `/ctx init` offered the kit's own `coding-standards/` files as project docs | `coding-standards` is skipped in detection |
| `responsive-check` description missed "works from 320px to 1440px" | Description reworded, 2 of 2 now |
| Empty, never-analyzed `project-context` folders counted as stale | Fixed earlier, with a test |
| Role file only read from `.claude/` | Also `.opencode/` and `.agents/` |
| Wrong companion file name for the roles example after install | Skill text gives both names |

## Open items for the proper pass

| Item | Note |
|---|---|
| Make the git hook and the three mods default for Claude Code installs | Decision for the owner. Closes the skill-loading gap, changes the "opt-in only" rule |
| `debug-protocol` triggering | Wording does not fix it. Needs a different mechanism or acceptance |
| AI-18 yes/no compliance | Long answers to a yes/no question. Re-test on Sonnet and Opus |
| `[CX]` marker compliance | About 60% on haiku. Re-test on stronger models |
| Live tests used haiku only | Repeat on the models people actually use |
| `standards-chain` skip list | Add `project-context` and run `claude plugin test` |
| Real converter run for `/optimize-assets` | Needs sharp, ImageMagick, ffmpeg or oxipng installed |
| `/figma` | Untested, the Figma connector was not authorized |
| Interactive-mode name collisions | `-p` mode cannot show built-in commands. `/hooks` (pre-existing) overlaps a Claude Code built-in too |
| OpenCode and Codex runs | By inspection only |
| Stale docs | README and older docs still mention `/install-kit` as a project command; the "Tested" line in the README predates the new commands |
| Not built | Pending-task Stop hook, personality skill, mod button for `/optimize-assets` |

## Reproduce

All scripts are plain Node, in `findings/harness/`. Paths are arguments.

```
node findings/harness/mkproject.js <kit repo> <out dir>          # install the kit into a scratch project
# then delete OpenCode-only open-model skills from <out dir>/.claude/skills, git init, commit
node findings/harness/trigger.js <proj> <claude.exe> <out.json> 2    # live trigger run on haiku
node findings/harness/audit.js <kit repo> <proj>                 # token and structure audit against git HEAD
```

Raw results from this audit: `findings/data/` (`trigger-before.json`, `trigger-after.json`, `trigger-final.json`, `audit-before.txt`, `audit-final.txt`). On Git Bash for Windows, `MSYS_NO_PATHCONV=1` is needed when a prompt starts with `/`, and must not be set when passing file paths to Node.
