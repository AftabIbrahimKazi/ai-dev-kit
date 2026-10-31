# Contributing to AI Dev Kit

Thanks for helping. This repository is the canonical home of the skills and standards; projects hold copies.

## Before you start

- **Open an issue first** for anything larger than a typo or a small fix, so the direction is agreed before you spend time on it.
- **A bug report needs:** the tool and version you use (Claude Code, OpenCode, Codex), the skill or file involved, what you expected and what happened.

## Adding or changing a skill

- Follow the quality bar in [skills/meta/skill-writer.md](skills/meta/skill-writer.md): a situation-first `description` ("Use whenever … Load this BEFORE …"), checkable rules, a short body.
- File layout is `skills/<category>/<name>.md`; a script or extra file is a companion named `<name>.<companion>.<ext>`.
- Update together: `skills/README.md`, the root `README.md`, and `skills/meta/skill-scope.md` (where the skill is classified).
- A rename or merge needs a row in [migrations/RENAMES.md](migrations/RENAMES.md).
- Never commit a `learnings.md`; those belong to the project that earned them.

## Changing the coding standards

- Rules must be testable and declarative, with wrong/right examples where a rule could be misread ([index.md → Principles](coding-standards/index.md)).
- A change to a machine-checkable rule updates [coding-standards/tooling/](coding-standards/tooling/) in the same commit.
- The body text of the AI rules in `ai-standards.md` stays as it is unless a rule truly changes.

## Scripts and mods

- Scripts are plain Node with no dependencies. Run a test with `node tests/<name>.test.js`.
- A slash command lives in `skills/commands/<name>.md`. Read [skills/meta/command-writer.md](skills/meta/command-writer.md) first; it also lists where a new command must be registered.
- A CLI tool or installer follows [skills/meta/cli-writer.md](skills/meta/cli-writer.md): no runtime dependencies, plain `.js` built from `.ts`, a novice walkthrough in its doc.
- A mod lives in `mods/<name>/`. Validate and test it with `claude plugin validate` and `claude plugin test` from inside its folder. Read [skills/meta/mod-writer.md](skills/meta/mod-writer.md) first.
- Do not edit a regex through a shell heredoc; backslashes get mangled. Use an editor.

## File and folder names

- A skill name is kebab-case, 24 characters or fewer, and matches its file. Prefer the short form (`scope-check`, not `interpretation-checkpoint`). Names are read every turn in the skill list.
- A companion file is `<skill>.<role>.<ext>`. The role is a short word that does not repeat the skill name: `prefilter.mcp.js`, not `system1-prefilter.prefilter-mcp.js`.
- A skill with three or more `.md` companions keeps them in a folder named `<skill>.<kind>/` with short file names (`opencode-all-models.models/kimi-k2-6.md`).
- No file name is longer than 30 characters. `tests/naming.test.js` enforces this; its legacy list holds the old exceptions and gets no new entries.
- Renaming an existing skill for length alone is not worth it: it breaks installs and typed `/names`. If you do rename one, add a row to `migrations/RENAMES.md`.

## Commits and pull requests

- Commits follow [git-standards](coding-standards/git-standards.md): `type: summary`, with a type from `feat fix patch style refactor chore docs test remove`, a header of at most 50 characters, no trailing period, present tense.
- Keep a pull request to one purpose and say how you checked it.

## Licence

By contributing you agree your work is released under the repository's [MIT licence](LICENSE).
