---
description: Cheat sheet: which kit command fits your situation
disable-model-invocation: true
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
| How long is this going to take | `/eta` |
| Vague request | `/intent-capture <request>` |
| Start a session | `/pickup` |
| End a session | `/wrap-up` (optional: the next task) |
| Memory notes may be out of date | `/stale` |
| Check or install git hooks | `/githooks` |
| Merge or rebase stopped with conflicts | `/resolve-conflicts` (optional: `ours`, `theirs`, `step`, `--role backend`) |
| Does this page work at every screen size | `/responsive-check` (optional: `--range 600-900`, `--width 375`, `--detect`) |
| Bump a package version and its changelog entry | `/version-bump <major|feature|patch|alpha|beta|rc|release>` (optional: a scope path, `--dry-run`) |
| Images, video or fonts are too heavy | `/optimize-assets` (optional: `convert src/img --to webp,avif`, `precompress dist`) |
| A project with requirement docs, brand notes or Figma | `/ctx init`, then `/figma <export folder>` (opt-in add-on) |
| Read answers aloud, mute or tune the voice | `/narration mute|unmute|voice male|volume 80|speed 1.2|pitch 2` (opt-in `narrate` add-on) |
| Change how answers are worded for your skill level | `/persona set female|male novice|mid|pro`, `/persona off` (opt-in `personality` add-on) |
| Change how answers are shaped | `/format table|bullets|oneline|bool` (`/format reset` for the default) |
| Set up or update a project | run `install-kit` from the ai-dev-kit repo; it removes its own copy from a project once setup verifies clean |

Most checks run without a command (mods and git hooks). Commands are for the moments you choose.
