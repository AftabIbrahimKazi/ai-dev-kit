---
description: Cheat sheet - which ai-dev-kit command to use for the situation you are in
---
Answer from this table only. If the user typed a situation after `/kit`, name the single best command for it and one line on how to use it; otherwise print the table.

| Situation | Use |
|---|---|
| Health check of the whole project | `/audit` (optional: `--standard css,html`, a path) |
| About to commit | `/commit-check` (optional: `--message "feat: x"`) |
| Session feels expensive | `/token-report` or the mod's `/budget` |
| A noisy test or build run | `/quiet npm test` |
| Something fails, cause unknown | `/debug-protocol <what happened>` |
| Big or many-file task | `/plan-first <task>` |
| Vague request | `/intent-capture <request>` |
| Start or end a session | `/handover` |
| Memory notes may be out of date | `/stale` |
| Check or install git hooks | `/hooks` |
| Set up a project | `/install-kit` |

Most checks run without a command (mods and git hooks). Commands are for the moments you choose.
