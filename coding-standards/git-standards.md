# Git Standards

These rules apply to all git operations across all projects.

---

## Branching Strategy

```
main
 └── beta
      └── test
           └── dev
                └── [temporary branches]
```

| Branch | Purpose |
|---|---|
| `main` | Production. Protected — requires owner approval before any merge. |
| `beta` | Pre-production. Stable enough for final review before main. |
| `test` | QA and testing. Code is tested here before moving to beta. |
| `dev` | Active development. All development work starts here. |
| `[temporary]` | Feature, fix, or experiment branches. Created off `dev`, deleted once merged. |

---

## RULE G-01 — All work begins on dev or a temporary branch off dev

No work is started directly on `test`, `beta`, or `main`. All development originates from `dev` or a temporary branch created off `dev`.

---

## RULE G-02 — Branch flow is always sequential, never skipped

Code must be tested and verified on each branch before advancing to the next. The only permitted flow is:

```
dev → test → beta → main
```

No branch may be skipped. A fix on `dev` goes to `test` first — it never jumps directly to `beta` or `main`.

---

## RULE G-03 — main is protected

No direct push to `main` is permitted under any circumstance. A pull request from `beta` is required. Owner review and approval is mandatory before merge. No exceptions.

---

## RULE G-04 — Temporary branches are deleted after merging

Once a temporary branch has been merged it must be deleted immediately. No dead branches are left in the repository.

---

## RULE G-05 — Temporary branch naming

Temporary branches follow this pattern:

```
[type]/[short-description]
```

| Type | When to use |
|---|---|
| `feature/` | New functionality |
| `fix/` | Bug fixes |
| `experiment/` | Exploratory or trial work |
| `refactor/` | Code restructuring with no behaviour change |
| `chore/` | Tooling, config, dependency updates |
| `docs/` | Documentation only |

```bash
# Examples
feature/dark-mode-toggle
fix/modal-close-bug
experiment/new-grid-layout
chore/upgrade-eslint
```

---

## RULE G-06 — Commit messages follow Conventional Commits

All commit messages must follow the Conventional Commits standard:

```
[type]: [short summary]

[optional body]

[optional footer]
```

---

## RULE G-07 — Commit types

| Type | When to use |
|---|---|
| `feat` | A new feature was added |
| `fix` | A bug was fixed |
| `patch` | A minor patch or adjustment — not a full bug fix |
| `style` | CSS or UI changes — no logic changes |
| `refactor` | Code restructured — no new feature, no bug fix |
| `chore` | Maintenance tasks — dependency updates, config changes |
| `docs` | Documentation added or updated |
| `test` | Test code added or updated |
| `remove` | Code, files, or features intentionally removed |

---

## RULE G-08 — Commit summary rules

- 50 characters maximum
- Present tense, imperative mood — "add button" not "added button"
- No period at the end
- Clear enough to understand without reading the body

```
# Wrong
added the dark mode toggle to header.
Updated modal so it closes when you click outside

# Right
feat: add dark mode toggle to header
fix: resolve modal not closing on outside click
```

---

## RULE G-09 — Commit body rules

The body is optional. Use it when the summary alone is not enough to understand the change.

- Separated from the summary by a blank line
- Explains what changed and why — not how
- Wrapped at 72 characters per line

```
fix: correct line height on mobile cards

Line height was inheriting from a component override that was
missed during the global definition pass. Removed the override
and deferred to the global body rule.
```

---

## RULE G-10 — Breaking changes must be declared in the footer

Breaking changes must be declared in the commit footer with `BREAKING CHANGE:`. Issues or tickets may also be referenced here.

```
feat: overhaul grid system for container queries

BREAKING CHANGE: previous percentage-based grid classes are
removed. Update all layout components to use the new system.
Closes #42
```

---

## RULE G-11 — Pull before push

Always pull the latest changes from the remote branch before pushing.

```bash
git pull origin [branch-name]
git push origin [branch-name]
```

---

## RULE G-12 — Pre-push checklist

Before every push the following must be true:

- Code is tested and working on the current branch
- Version number is bumped according to versioning standards
- npm and GitHub versions are in sync
- Commit message is clean and follows this standard

---

## Quick Reference

| Scenario | Type | Example |
|---|---|---|
| New feature added | `feat` | `feat: add image lazy loading` |
| Bug resolved | `fix` | `fix: correct padding on nav links` |
| Minor patch | `patch` | `patch: adjust button hover timing` |
| CSS or UI only | `style` | `style: update card border radius` |
| Code cleanup | `refactor` | `refactor: simplify modal state logic` |
| Docs updated | `docs` | `docs: add versioning standards file` |
| Config or deps | `chore` | `chore: upgrade eslint to v9` |
| Code removed | `remove` | `remove: delete legacy grid classes` |
| Breaking change | `feat` + footer | See RULE G-10 |
