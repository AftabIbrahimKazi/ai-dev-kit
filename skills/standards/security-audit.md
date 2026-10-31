---
name: security-audit
description: Security audit or review, "is this safe", vulnerability hunt in a codebase, API or service. Load BEFORE reading code.
---

# Security Audit — Boundary, Evidence, Fix

A finding is a crossed trust boundary with a result, not a checklist gap. The rules live in `coding-standards/qa/security-checks.md` (QA-SEC-01–20); this skill is the procedure for hunting violations of them and for anything the rules do not cover. Method adapted from Cloudflare's MIT-licensed `security-audit-skill` (see CREDITS.md).

## Self-improvement (do this first and last)
1. **At start:** apply `learnings.md` if the `learnings-inject` mod supplied it. Do not search for it.
2. **At end:** append one dated bullet only for a new, non-obvious lesson (a false positive that looked real, a class that paid off, a validation shortcut that worked). Most uses add nothing. Merge instead of duplicating; delete disproven bullets.

## Modes
- **Focused (default):** a question, one feature, a diff, triage. Read the relevant code, answer, write no files.
- **Full audit:** only when the user asks for a whole-codebase audit or report. Runs the phases below and writes `security-audit/REPORT.md`. If the request is ambiguous, ask one question first.

## Safety
- Reading source is free. Run target code only in a sandbox (no network, empty env, read-only target); if that cannot be enforced, do not run it.
- Dummy data only. Never probe a live or shared system. Never install dependencies to test.
- Stop validating at the smallest effect that proves the boundary. No payload chains, no load tests.
- Per `agent-usage`, subagents are off by default. Hunt by subsystem in the main session unless the user approves a fan-out.

## What counts as a finding
Name all five, or it is not a finding:
1. the **lower-trust principal** (anonymous caller, tenant A, a plugin)
2. the **input or action** they control
3. the **intended control** that should stop it
4. the **boundary crossed**
5. the **observed result** (data read, state changed, code run, cost incurred)

Missing a deployment fact (proxy headers, IAM, env)? Mark `needs_validation` and state the fact plus the safe check that settles it. Never assume it. Only `confirmed` findings get a severity.

## Phases (full audit)
1. **Recon.** Entry points (routes, handlers, CLI args, queues, webhooks), principals and roles, data stores, outbound calls, secrets, build/release path. Output a half-page map, not a tour.
2. **Pick classes** from the table below that fit the app type; skip the rest. Split a large codebase by subsystem and list what was and was not covered.
3. **Hunt** each class: trace untrusted input to its sink, then check the guard on each path to the same state change.
4. **Validate** by trying to disprove each candidate (upstream check? reachable? does the sink get the value?). Drop what fails, with a one-line reason.
5. **Report** (format below). Fix confirmed findings only on request, smallest change, with a regression test (QA-SEC-20).

## Attack classes
| Class | Look for |
|---|---|
| Injection | input reaching SQL, shell, HTML, template, path, redirect, deserialiser; second-order (stored, then used elsewhere); keys and headers, not only values |
| Access control | authn without authz; weaker check on a parallel path; body fields overriding permission; bulk/export/import skipping per-item checks |
| Files and fetch | path traversal (symlinks, encoding), SSRF (redirects, DNS rebinding), zip slip, TOCTOU |
| Crypto and secrets | weak randomness for tokens, hardcoded or logged secrets, nonce reuse, timing on compare, failure falling back to no-crypto |
| Business logic | skipped or replayed steps, check-then-act races, negative/zero/overflow quantities, defaults when config is missing |
| Feature abuse | export as exfiltration, import as injection, search/sort as oracle, enumeration via errors/timing, draft or preview leakage, user-set webhook URLs |
| Chains | A validates, B assumes more; capability growth after delegation or refresh; undo/restore skipping current authorization |
| Client side | DOM XSS, `postMessage` origin trust, storage of tokens, CORS, service workers |
| AI and agents | prompt injection into tool calls, memory poisoning, tool permissions wider than the user's, MCP server identity |
| Supply chain | unpinned deps, CI secrets, install scripts, unsigned release or update path |
| Obvious things | secrets in source or history, `TODO: add auth`, debug flags, seed credentials, unprotected `/admin` `/env` `/metrics`, `.env` committed |

Read half-finished, legacy and `temp`/`hack` code; verify any comment claiming "this is safe".

## Report format
One file, or the reply for Focused mode. Per finding:

```
[ID] Title — severity (critical|high|medium|low|info) — confirmed
Principal / Action / Control / Boundary / Result: one line each
Evidence: file:line, plus the check that confirmed it
Fix: smallest change + regression test
```

Then `needs_validation` items (fact needed + safe check), then **coverage**: classes and subsystems checked, and what was not. State plainly that one pass is not proof of absence.

## Rules for the model
1. Checklist gaps and missing headers are info, not vulnerabilities. Never assume deployment behaviour; mark `needs_validation`.
2. Report prose matches evidence; never claim a check you did not run.
3. Report first; fix only what the user approves.
4. Severity: critical = unauthenticated code execution or full data access; high = cross-tenant access or privilege escalation; medium = bounded exposure or partial bypass; low = unusual preconditions.
