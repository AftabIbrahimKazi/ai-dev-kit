---
name: cli-writer
description: Use whenever creating, reviewing or improving a command-line tool, installer, setup script or any kit script a person runs from a terminal. Load this BEFORE writing or editing one. Not for development work.
---

# CLI Writer — Meta-Skill

**This is for building the kit only. Never load it during normal development work.** It records how `install-kit.cli`, `narrate.setup`, `local-vision` and `version-bump` already behave, so every new tool matches them and a novice can run it cold.

A kit CLI runs on a machine the author never saw: Windows with a space in the path, no `node_modules`, no TTY, an agent instead of a person. This is the bar that survives that.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — a cold-start failure, an OS quirk, a prompt that confused a tester. Merge instead of duplicating; delete disproven bullets.

## Step 0 — Choose the tool
| Need | Use |
|---|---|
| A rule a script can check or a change a script can make, run by a person or an agent | CLI (this skill), as a skill companion `skills/<cat>/<skill>.<name>.ts` |
| Run on an event with no one typing | Git hook or mod |
| A shortcut the user types in chat | Command (`command-writer`) that calls this CLI |
| Judgment, no deterministic step | Skill |

## Hard rules
- **Zero runtime dependencies.** Node built-ins only (`node:fs`, `node:path`, `node:readline`, `node:child_process`). Adding `prompts` once crashed a fresh clone, because `node_modules` does not exist there. Before any library, write the few plain lines instead.
- **Ship as plain `.js`, edit as `.ts`.** Source is `<skill>.<name>.ts`; `npm run build` writes the `.js` next to it; commit both. No bundler, no install step for the user.
- **No network** unless the tool's purpose needs it. A tool that downloads (a model, a binary) says so before it starts and does a preflight first.
- **Never touch what it did not create.** Track created files in a manifest; update, uninstall and archive act only on manifest entries. Never overwrite an existing file without `--force`.
- **Secrets:** read only whitelisted names from the environment or `.env`; never print, log or write them.

## Command shape
- Header comment first: a usage block listing every command and flag, then one paragraph on interactive mode and what the tool never does.
- Verb subcommands (`install`, `update`, `uninstall`, `status`, `preflight`). Flags are `--kebab-case`. An unknown or missing command prints one `usage:` line and exits 2.
- Every tool that writes has `--dry-run`. Every tool whose output is read by a script has `--json`.
- `--root <target>` names the project. If it is omitted and one safe guess exists (the kit is cloned inside the project), use it and **print what was assumed**. If no safe guess exists, ask. Never guess silently.
- Re-running is safe: a second `install` on a finished install changes nothing and says so.

## Exit codes and output
- `0` done, `1` error, `2` bad usage, `3` blocked by a preflight (hardware, missing tool). Set `process.exitCode`; call `process.exit()` only when no `fetch` is open, because `exit()` during a closing `fetch` crashes Node on Windows.
- Results go to stdout; notices, warnings and errors go to stderr. `--json` prints one JSON document on stdout and nothing else.
- An error says what failed, why, and what to do next, in one or two lines. No stack trace unless `--debug`.
- Report every skip, switch and assumption. A silent fallback is a bug.

## Interactive mode (for a human at a terminal)
- Prompt only when **stdin and stdout are both a TTY**, a required flag is missing, and `--json` is not set. Otherwise fail with the usage line. A tool that waits for input under a pipe hangs the agent running it.
- Ask only for what is missing. Never re-ask a value given as a flag.
- Plain numbered menus on `node:readline`: `1) claude  2) opencode`, "type a number", the default in brackets, Enter takes it. No arrow keys, no raw mode: it must behave the same in PowerShell, cmd.exe and SSH. Multi-pick takes `1,3,4`, `all` or `none`. Re-ask on bad input; never throw.
- One shared `readline` interface, closed when prompting ends, or the process hangs on exit.
- Long lists are chunked (categories first, then items), each item with a one-line purpose, with a running tally of what is chosen.

## Colour
- Semantic palette only: bold = the question, dim = explanation, cyan = running tally, green = found or assumed, yellow = notice, red = failure.
- Colour is on only when `NO_COLOR` is unset **and** the output is a TTY. Never colour `--json` or piped output. Red is for real failures, never for something the user chose.

## Windows and paths
- Build paths with `path.join` / `path.resolve`; never concatenate with `/` or `\`. Test with a space in the path (this repo lives under `My Projects`).
- Run other programs with `execFile` and an argument array, never a shell string. Never call bare `convert` (a Windows system tool); use `magick`.
- Call external tools by name and give a clear install hint when `ENOENT`.
- Preflight before a heavy install: detect CPU, RAM, disk and GPU, print the plan, refuse an install the machine cannot hold, fall back to CPU automatically.

## Documentation (the user reads this, not the code)
- The doc **opens with a concrete walkthrough** for someone who has never used a terminal: how to check Node is installed, the exact commands to type with a real example path, "press Enter after each line", what the screen will show. The flag reference comes after it.
- Show the failure a novice will hit (wrong folder, missing Node) and its fix, with the real error text.
- Update the walkthrough whenever a prompt, default or flag changes.

## Test it
1. `node --test tests/<name>.test.js` against a temp directory and fixtures. Cover: happy path, `--json`, `--dry-run`, bad flag, missing input, second run changes nothing, uninstall removes only manifest entries.
2. **Cold start:** delete `node_modules`, run the built `.js` from a fresh clone. It must not crash.
3. **Non-TTY:** run with stdin from a pipe and no required flag. It must exit 2 with the usage line, not wait.
4. Run once from Git Bash with a space in the path. Set `MSYS_NO_PATHCONV=1` if a path argument starts with `/`.
5. Prompts: walk the interactive flow once by hand and read every line as a novice would.

## Register it
- A new skill companion: follow `skill-writer` and `skill-scope`.
- `README.md` scripts table: one row naming the script and what runs it.
- `CHANGELOG.md`: one line under `### Added`.
- A chat shortcut: add a command with `command-writer`.

## Review checklist
- [ ] Step 0 says a CLI is the right tool
- [ ] No runtime dependency; `.ts` and built `.js` both committed
- [ ] Usage block in the header; unknown command exits 2 with one usage line
- [ ] `--dry-run` if it writes, `--json` if scripted; assumptions printed
- [ ] Manifest-tracked; nothing overwritten without `--force`; re-run is safe
- [ ] Prompts only on a double TTY with a missing flag; numbered menus; no hang under a pipe
- [ ] Colour gated on TTY and `NO_COLOR`; none in JSON output
- [ ] `execFile` with arrays; `path.join`; works with a space in the path
- [ ] Walkthrough written for a novice comes before the flag reference
- [ ] Cold-start and non-TTY tests pass

## Staleness guard
Node behaviour (TTY detection, `fetch` and `exit()`, `node:test`) changes across versions. If the installed Node disagrees with this file, follow Node's docs and log the correction in `learnings.md`.
