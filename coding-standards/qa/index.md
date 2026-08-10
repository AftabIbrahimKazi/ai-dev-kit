# QA Standards — Index

## Purpose

QA is not one discipline, it is an umbrella over several: definition of done, branch
promotion gates, logic/error checking, security, end-to-end testing, and bug
reporting. Each lives in its own file so a new QA concern (a new tool, a new
test layer) can be added as a sibling file without renumbering everything
that already exists.

QA is not a separate phase — it is part of every change. Claude is responsible
for code-level QA. The developer is responsible for browser-level visual and
interaction verification.

---

## Responsibilities

| Check | Responsible |
|---|---|
| Standards compliance | Claude |
| Logic errors and edge cases | Claude |
| Security vulnerabilities | Claude |
| State and data attribute coverage | Claude |
| Cross-file impact assessment | Claude |
| Accessibility and SEO compliance | Claude |
| End-to-end test fixtures/specs (see `e2e-testing.md`) | Claude |
| Visual correctness in browser | Developer |
| Interaction feel and UX | Developer |
| Device and browser testing | Developer |

---

## Reading Order

1. Open this file — understand the umbrella and which sub-file governs what
2. `definition-of-done.md` — what "done" means for any task, and the self-QA pass
3. `branch-gates.md` — what must be true before dev → test → beta → main
4. `logic-and-error-checks.md` — code-path tracing, async errors, null checks, state coverage
5. `security-checks.md` — XSS, secrets, eval, CSP, dependency risk, and the rest of OWASP-adjacent checks
6. `e2e-testing.md` — Playwright fixture/POM discipline, when specs are written, how they're kept current
7. `bug-reporting.md` — the standard format and severity levels for anything Claude finds

---

## Rule ID Scheme

Each sub-file owns its own prefix and counter so adding a new file never
requires renumbering an existing one:

| Prefix | File |
|---|---|
| `QA-DOD-*` | `definition-of-done.md` |
| `QA-GATE-*` | `branch-gates.md` |
| `QA-LOGIC-*` | `logic-and-error-checks.md` |
| `QA-SEC-*` | `security-checks.md` |
| `QA-E2E-*` | `e2e-testing.md` |
| `QA-REPORT-*` | `bug-reporting.md` |

A future QA sub-skill (a new tool, a new test layer) adds a new file and a
new prefix here — it never touches another file's numbering.

---

## QA Sub-Files

| File | Covers |
|---|---|
| [definition-of-done.md](definition-of-done.md) | What "done" means; Claude's self-directed QA pass |
| [branch-gates.md](branch-gates.md) | dev → test → beta → main promotion checklists |
| [logic-and-error-checks.md](logic-and-error-checks.md) | Code-path tracing, async error handling, null checks, state coverage |
| [security-checks.md](security-checks.md) | XSS, secrets, eval, CSP, dependency vulnerabilities, and related checks |
| [e2e-testing.md](e2e-testing.md) | Playwright fixtures/POM reuse, when specs are authored, keeping specs current |
| [bug-reporting.md](bug-reporting.md) | Standard bug report format and severity levels |
