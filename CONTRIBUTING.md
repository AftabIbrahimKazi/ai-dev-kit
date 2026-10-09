# Contributing to AI Dev Kit

Thanks for helping. This repository is the canonical home of the skills and standards; projects hold copies.

## Before you start

- **Open an issue first** for anything larger than a typo or a small fix, so the direction is agreed before you spend time on it.
- **A bug report needs:** the tool and version you use (Claude Code, OpenCode, Codex), the skill or file involved, what you expected and what happened.

## Adding or changing a skill

- Follow the quality bar in [skills/meta/skill-writer.md](skills/meta/skill-writer.md): a trigger-rich `description`, checkable rules, a short body.
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
- A mod lives in `mods/<name>/`. Validate and test it with `claude plugin validate` and `claude plugin test` from inside its folder. Read [skills/meta/mod-writer.md](skills/meta/mod-writer.md) first.
- Do not edit a regex through a shell heredoc; backslashes get mangled. Use an editor.

## Commits and pull requests

- Commits follow [git-standards](coding-standards/git-standards.md): `type: summary`, with a type from `feat fix patch style refactor chore docs test remove`, a header of at most 50 characters, no trailing period, present tense.
- Keep a pull request to one purpose and say how you checked it.

## Licence

By contributing you agree your work is released under the repository's [MIT licence](LICENSE).
