---
name: untrack
description: The user says "don't track X", "hide X from git", "stop showing X in changes", or "track X again". Manual only; load before running the tool.
---

# Untrack — Hide Files From the Changes Tree, On Command

Hides files from `git status` and the VS Code Changes tree even when they are edited locally. Runs only when the user asks; never on its own, never as a side effect of another task. Not committing a file is a separate, existing behaviour: a file that merely shows in the tree is fine and needs no action.

## The tool
`node <skill-root>/untrack/hide.js <hide|show|list> [paths…] [--cwd D]`. Plain Node + git, no dependencies. Paths may be files, folders or globs.

| Command | Does |
|---|---|
| `hide <paths>` | Tracked files get `git update-index --skip-worktree` (edits stay invisible). Untracked matches go in a marked block in `.git/info/exclude` (a folder hides its future files too). |
| `show <paths>` | Reverses exactly that: `--no-skip-worktree` and removes the exclude entry. |
| `list` | Shows everything currently hidden. |

Everything is local to this clone: nothing is committed, `.gitignore` is not touched, teammates see no change.

## Steps
1. Map the user's words to paths. "Don't track X" and "hide X" → `hide`; "track X again" and "show X" → `show`. If the paths are ambiguous, ask once; otherwise act.
2. Run it and report each line verbatim.
3. For a tracked file, say once: if upstream changes that file, `git pull` will refuse until it is shown again (`show <path>`, pull, then `hide` again). Mention it only the first time in a session.
4. Never stage, commit or edit `.gitignore` as part of this.
