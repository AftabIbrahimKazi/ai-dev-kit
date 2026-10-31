---
name: version-bump
description: A push is about to happen in a project following versioning-standards.md, or "bump the version" / "cut a release". Load BEFORE git push.
---

# Version Bump — Mechanical [major].[feature].[patch] + Changelog

Version bumps happen at push time only, as the last step before a push (RULE V-04), and every bump needs a changelog entry (RULE V-08). This skill does both in one mechanical step so neither is ever missed or hand-typed inconsistently.

## Self-improvement (do this first and last)
1. **At start:** apply `learnings.md` if the `learnings-inject` mod supplied it. Do not search for it.
2. **At end:** append one dated bullet only for a new, non-obvious lesson (a scope or changelog edge case that surprised you). Most uses add nothing. Merge instead of duplicating; delete disproven bullets.

## The tool
`node <skill-root>/version-bump/bump.js <major|feature|patch|alpha|beta|rc|release> [scope] [options]`. Plain Node, no dependencies. It edits `package.json`'s `"version"` field in place (regex substitution, so the rest of the file's formatting is untouched) and inserts a `## [x.y.z] — date` block into the sibling `CHANGELOG.md`, newest entry first.

**Scope** picks how wide the bump reaches, matching RULE V-06 (sub-packages version independently):
- Omitted → every `package.json` found under the current directory (skipping `node_modules` and dotdirs), each bumped independently. This is the base/default level.
- A subfolder path → only the `package.json` file(s) under that subtree — scope to one group (e.g. a frontend/ or backend/ folder, or a specific module).
- A direct path to one `package.json` → exactly that package, nothing else.

**Options:**
| Option | Does |
|---|---|
| `--added/--changed/--fixed/--removed <text>` | Repeatable; each becomes a changelog bullet under that heading (RULE V-08). At least one is required unless `--no-changelog`. |
| `--no-changelog` | Skip the changelog requirement — only for a package genuinely untracked by one. |
| `--for <major\|feature\|patch>` | Required the first time a package enters `-alpha/-beta/-rc` with no existing prerelease suffix — computes the base version first. |
| `--force` | Allow a prerelease stage to move backward (e.g. `-rc` → `-alpha`), normally blocked. |
| `--date YYYY-MM-DD` | Override today's date. |
| `--dry-run` | Compute and print the plan; write nothing. |
| `--json` | Machine-readable output. |

## Steps
1. Confirm this is actually push time (RULE V-04) — never bump mid-development.
2. Decide bump type from the change itself: a new feature → `feature`; a bug fix → `patch`; a breaking, incompatible overhaul → `major`. Pre-release work uses `alpha`/`beta`/`rc`; `release` strips the suffix for the final cut.
3. Decide scope: whole project, one group, or one package — see above.
4. Write the changelog bullets from what actually changed this push, not a restatement of the diff. Run with `--dry-run` first if more than one package.json will be touched.
5. Run it for real. Report each line verbatim (old → new version, changelog updated/skipped).
6. The script never runs `git tag` or `git push` — it only prints the suggested tag command. Run it, commit, and push only when asked.

## Rules
1. **One push, one increment** (RULE V-04) — do not run this more than once for the same push, and do not bump during local development.
2. **Never reuse or edit a released version's changelog entry** (RULE V-07) — if the version this would produce was already tagged, something is wrong with the current version in `package.json`; stop and ask instead of forcing it.
3. **npm and GitHub must match** (RULE V-05) — after a push, the tag from "suggested" should be created so the two stay in sync; flag it if skipped.
4. **A group-level or base-level bump touches every matching package.json with the same changelog bullets.** If different packages need different changelog text for the same push, run the script once per package (file-level scope) instead.

## Failure mode this prevents
A version bumped in `package.json` with no changelog entry (or the reverse), a `feature` bump that forgets to reset `patch`, a hand-typed version that skips a number or collides with an already-tagged release, or a prerelease stage bumped out of order (`alpha` after `rc`) without anyone noticing.
