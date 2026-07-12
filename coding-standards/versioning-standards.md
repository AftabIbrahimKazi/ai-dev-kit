# Versioning Standards

These rules apply to all packages and sub-packages across all projects.

---

## Version Format

```
[major].[feature].[patch]
```

**Example:** `1.2.5`

| Segment | Meaning |
|---|---|
| `major` | Codebase changed entirely or significantly — not directly compatible with previous versions |
| `feature` | Number of new features added since last major version |
| `patch` | Number of bug fixes or patches applied |

---

## RULE V-01 — Major segment (`1.x.x`)

Increment `major` when the codebase undergoes a complete or significant overhaul that makes it incompatible with previous versions. This is rare — only when the change is truly breaking.

When `major` increments, `feature` and `patch` reset to `0`.

```
1.4.3 → 2.0.0
```

---

## RULE V-02 — Feature segment (`x.2.x`)

Increment `feature` once per new feature added. Strictly for additions — not bug fixes, not refactors.

When `feature` increments, `patch` resets to `0`.

```
1.2.5 → 1.3.0
```

---

## RULE V-03 — Patch segment (`x.x.5`)

Increment `patch` once per bug fix or patch applied. Strictly for fixes — not new features. Does not reset `feature` or `major`.

```
1.2.4 → 1.2.5
```

---

## RULE V-04 — Version bumps happen at push time only

Version numbers are updated only at the time of pushing to the repository. No version changes during local development. The version bump is the last step before a push.

One push = one version increment. Multiple changes in one push still result in a single version bump.

---

## RULE V-05 — npm and GitHub versions must match exactly

The version number in `package.json` and the version on GitHub must always be an exact match. If they are out of sync the version is considered invalid and must be corrected before the next push.

---

## RULE V-06 — Sub-packages are versioned independently

All sub-packages follow the same `[major].[feature].[patch]` convention. A sub-package is versioned independently from the parent package. A feature update in a sub-package does not automatically bump the parent and vice versa.

---

## RULE V-07 — Do not modify a released version

Once a version has been pushed and tagged, its changelog entry must not be edited and its version number must not be reused. Corrections go into a new patch release.

---

## RULE V-08 — Every release requires a changelog entry

Every version bump must be accompanied by a changelog entry in `CHANGELOG.md`. Each entry must include the version number, date, and a description of what changed under the relevant headings: `Added`, `Changed`, `Fixed`, `Removed`.

```markdown
## [1.3.0] — 2026-06-21

### Added
- Planet overlay component

### Fixed
- Z-index stacking issue on mobile
```

---

## RULE V-09 — Pre-release versions use standard notation

Pre-release versions must use the following suffixes in order:

```
1.3.0-alpha.1   — early, unstable
1.3.0-beta.1    — feature complete, may have bugs
1.3.0-rc.1      — release candidate, ready for final testing
```

No custom suffixes (`-wip`, `-new`, `-test`) are permitted.

---

## Quick Reference

| Scenario | Action |
|---|---|
| Added a new feature | Bump `feature`, reset `patch` to `0` |
| Fixed a bug | Bump `patch` |
| Major breaking overhaul | Bump `major`, reset `feature` and `patch` to `0` |
| Working locally | No version change |
| Pushing to repo | Bump version as last step before push |
| npm and GitHub out of sync | Fix immediately before next push |
| Sub-package updated | Bump sub-package version only |
