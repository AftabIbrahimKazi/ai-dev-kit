# QA — Branch Promotion Gates

Read [index.md](index.md) first.

---

## RULE QA-GATE-01 — dev → test promotion checklist

Before code moves from `dev` to `test` the following must be verified:

- All coding standards are followed across every changed file
- No commented-out code, console.logs, or debug artifacts remain
- All data attribute states are defined and handled in CSS
- All event listeners have a corresponding cleanup path
- No hardcoded values that should be tokens
- No `!important` anywhere in changed CSS
- No inline styles anywhere in changed markup
- Any E2E spec touching changed behaviour is updated, added, or deliberately
  removed — not left stale (see `e2e-testing.md` RULE QA-E2E-04)
- Version number has been bumped
- npm and GitHub versions are in sync
- Commit messages follow git standards

---

## RULE QA-GATE-02 — test → beta promotion checklist

Before code moves from `test` to `beta` the following must be verified:

- All items from the dev → test checklist pass
- Developer has completed browser visual check
- All interactive states work correctly in the browser
- No console errors in browser developer tools
- No network request failures
- Accessibility landmarks and heading structure are correct
- All images have alt text
- Page title and meta description are present and correct

---

## RULE QA-GATE-03 — beta → main promotion checklist

Before code moves from `beta` to `main` the following must be verified:

- All items from the test → beta checklist pass
- Full security check has been completed on all changed files
- No known vulnerabilities in any added or updated dependencies
- Performance check completed — no new render-blocking resources introduced
- Core Web Vitals targets are still met
- All package exceptions are documented with the standard comment block
- Owner has reviewed and approved the pull request
