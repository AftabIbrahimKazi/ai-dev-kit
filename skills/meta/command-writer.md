---
name: command-writer
disable-model-invocation: true
description: Use whenever creating, reviewing or improving a slash command or anything in skills/commands/. Load this BEFORE writing or editing a command template. Not for development work.
---

# Command Writer — Meta-Skill

**This is for building the kit only. Never load it during normal development work.** It sets the bar for every file in `skills/commands/`, so all commands look, behave and install the same way.

A command is a markdown template the user types as `/name`. It runs a script, injects the output into the prompt, and tells the model what to do with it in a few lines. A bad command wastes tokens on every use or runs something the user did not expect.

## Self-improvement (do this first and last)
1. **At start:** apply `learnings.md` if the `learnings-inject` mod supplied it. Do not search for it.
2. **At end:** append one dated bullet only for a new, non-obvious lesson (a template trap, a quoting problem on one OS, a rule that blocked a bad command). Most uses add nothing. Merge instead of duplicating; delete disproven bullets.

## Step 0 — Choose the tool
| Need | Use |
|---|---|
| The user chooses the moment, and a script can produce the facts | Command (this skill) |
| The agent should notice the situation by itself | Skill. A command waits for the user. |
| It must run on an event, with no user typing | Git hook or mod (`mod-writer`). Never a command. |
| Only an instruction, no script (a format, a short report) | Command with no `!` line, as `format` and `eta` do |
| A command that only repeats a skill's name | Nothing. Claude Code already makes `/<skill-name>` from every installed skill. |

## Anatomy
Location: `skills/commands/<name>.md`. Copy `audit.md` or `version-bump.md` as the shape.
```markdown
---
description: <one line, under ~12 words: what it does, as a verb phrase>
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
<Heading line for the injected output>:

!`node {{skill-root}}/<skill>/<script>.js $ARGUMENTS`

<2–4 lines: what to report, the line cap, what never to do.>
```
- `disable-model-invocation: true` is mandatory. The model must never run a command by itself.
- `{{skill-root}}` is replaced at install time (see `install-kit`). Never write a real path. Never hardcode `.claude/`.
- `$ARGUMENTS` goes last in the script call so every flag passes through unchanged.
- No `!` line means no `allowed-tools`. Do not list a tool the template does not call.

## Rules
- **Script first.** The command prints a script's output; it does not ask the model to work the facts out. The script is a skill companion (`skills/<cat>/<skill>.<name>.js`, plain JS, no npm dependencies). If no script is needed, the template stays under 8 lines.
- **Smallest permission.** `allowed-tools` names one scoped pattern (`Bash(node:*)`, `Bash(git status:*)`). Never `Bash(*)`. Never a write tool.
- **No hidden writes.** A command that changes files must say so in its closing lines, support `--dry-run`, and never run `git commit`, `git tag`, `git push` or a delete unless the user asked in the same message.
- **Cap the output.** Close with the shape of the reply and a number: "under 12 lines", "worst 15 files". An uncapped command spends tokens on every run.
- **One job per command.** Two jobs means two commands, or one command with a sub-word as its first argument (`/narration mute`).
- **Name it as a verb or a noun the user would type.** Lowercase kebab, 1–2 words. It must not equal any skill name unless it wraps that skill (`/version-bump` wraps `version-bump`). Run `ls skills/commands skills/*/` and confirm no collision before choosing.
- **Work on Windows and Unix.** The `!` line calls `node`, never `sh`, `grep`, `cat` or `awk`. Use forward slashes. Never rely on shell quoting beyond `$ARGUMENTS`.
- **Say what to do when the skill is missing.** If the script's skill might not be installed, the template says "Use the `<skill>` skill if it is installed" and does not guess.
- **Write in controlled style** (see `skill-writer`): imperative lines, one term per concept, explicit conditions, no filler.

## Register it (a command that is not registered does not ship)
1. `skills/meta/install-kit.md`, Commands paragraph: add `<name>` and the skill or add-on it needs (or "needs nothing"), and add `/<name>` to the list of typed commands.
2. `skills/commands/kit.md`: add one table row, "situation → command". The cheat sheet is the only place a user learns the command exists.
3. `README.md` and `skills/README.md`: add the command where commands are listed; keep the two in step.
4. `CHANGELOG.md`: one line under today's `### Added`.
5. If the command wraps a new skill, follow `skill-writer` and `skill-scope` for the skill.

## Test it
1. Run the script by hand with each documented argument shape, with no arguments, and with a bad argument. Read the exit code.
2. If it writes, run `--dry-run` first and confirm no file changed.
3. Substitute `{{skill-root}}` with a real relative path and run the exact `!` line from the project root. A path error here is the most common failure.
4. Install into a scratch project with `install-kit` and type the command in a real session. Report which tool you ran it in. Claude Code and OpenCode load the template differently.

## Review checklist
- [ ] Step 0 says a command is the right tool
- [ ] Frontmatter has `description` (under ~12 words) and `disable-model-invocation: true`
- [ ] `allowed-tools` is one scoped pattern, or absent when there is no `!` line
- [ ] No real paths; `{{skill-root}}` and `$ARGUMENTS` only
- [ ] Script is plain JS with no npm dependencies and has `--dry-run` if it writes
- [ ] Output has a stated cap; no commit, push, tag or delete without an explicit ask
- [ ] No name collision with a skill or another command
- [ ] Registered in `install-kit.md`, `kit.md`, both READMEs and `CHANGELOG.md`
- [ ] Tested on the exact injected line, not only the script alone

## Staleness guard
Command frontmatter fields and the `!` injection syntax belong to the host tool and change. If Claude Code's own docs (or the `claude-code-guide` agent) disagree with this file, follow the docs and log the correction in `learnings.md`.
