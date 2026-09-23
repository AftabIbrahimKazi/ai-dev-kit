---
name: system1-prefilter
description: Optional add-on — fast, provider-agnostic typed-decision model (calibrated probabilities, no text generation) to prefilter candidates before full-content reads, or answer the user's own binary/MCQ questions. Trigger only when configured (endpoint set up per Setup) — never assume available, never install by default.
---

# System-1 Prefilter — Typed-Decision Add-On

**This is opt-in only, never part of any default install.** It adds an external network dependency (or a local server) and a user-supplied API key. Every rule below must degrade cleanly to "skip prefiltering, do it the normal way" if unconfigured — this skill must never block or fail a task on its own account.

## What this is, precisely

A System-One-typed-decision provider takes a state string + one or more typed questions and returns, per question, a chosen option plus a calibrated probability per option and an overall confidence — never generated text. This skill is a thin, provider-agnostic client against that contract (reference shape: `POST <base_url>/v1/systemone`, Bearer auth). It works unchanged against any compatible provider — hosted or self-hosted — because only `base_url` changes, never the logic. It must never be pointed at a general chat/completion LLM: those don't return real calibrated probabilities, and the escalation logic below depends on the numbers being trustworthy.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — a case where the ladder escalated correctly/incorrectly, a provider quirk. Merge instead of duplicating; delete disproven bullets.

## Setup (once per project, at install or whenever the user opts in later)

1. Ask hosted vs. local endpoint; get the `base_url`.
2. Ask: "Have you already set the API key as an environment variable?"
   - **No** → create `SYSTEM1_API_KEY=` in the project's `.env` (gitignored) with an empty/placeholder value; tell the user to paste the real key in afterward. Use this exact name — never invent a different one.
   - **Yes** → ask for the existing variable's name; use that instead of the default. Never grep `.env` to find it — ask directly, it's cheaper and unambiguous.
3. Store `base_url` the same way, under `SYSTEM1_BASE_URL`, same yes/no/name logic.
4. **Health-check before first real use:** send one trivial request (a single boolean question against dummy state) to confirm the endpoint responds and the key is valid. Report success/failure plainly. A local endpoint that refuses the connection is a distinct, expected failure mode — report it as "server not running," not as a generic error.
5. If the check fails or either variable is unset when this skill would otherwise fire: skip prefiltering silently and do the task the normal way. Never treat missing config as a blocking error mid-task.

## Scope — apply only to these (proven, from the feasibility session log)

- File-relevance narrowing after Glob/Grep, before Read.
- Code-review triage (deep-review vs. quick-skim per changed file).
- Test-selection (which tests are likely affected by a diff).
- Skill triggering/installing decisions (is skill X applicable to this task/project).
- The user's own binary/MCQ-shaped validation questions asked directly in chat (e.g. "did you do X", "is Y true", "should this be A or B") — **only** when the question is already binary/MCQ-shaped as asked. Validated live: a factual closed question (`noul: 0.97`, accepted, no Claude reasoning spent) vs. a design-judgment question forced into yes/no shape (`noul: 0.38`, below floor, escalated to manual reasoning anyway — round-trip cost paid on top of, not instead of, the thinking).

**Never use for:** rubric/security/safety pass-fail checks (a real miss was found here — a plaintext-secret leak scored a wrong "pass" at 0.36 confidence); picking directly between solution approaches (unproven, no validated test); or open-ended questions answered by first inventing a candidate answer set to force MCQ/boolean shape — generating that candidate set already requires the same reasoning the shortcut is meant to save, so it both fails to save tokens and risks the candidate list quietly biasing the real answer. For session-mode selection, only feed it decomposed yes/no factual sub-questions (e.g. "does this touch security/auth/payment logic") — the mode decision itself stays deterministic logic, never a direct model pick.

## Question-shape rule

- **Single correct target** → one MCQ (single-choice) question across all candidates. Apply the confidence ladder (below) to the ranked distribution.
- **Possibly multiple correct targets** → independent boolean (yes/no) questions, one per candidate, sent in a single batched call. Apply per-item re-verification (below) to any low-confidence item.
- Never use single-choice MCQ when more than one candidate can legitimately be correct — an MCQ can score a genuinely-correct candidate at exactly 0 probability, which no amount of escalation can recover.

## Escalation — deterministic, zero extra LLM tokens

Run `ladder.js` (companion script, Node, no dependencies) against the raw API response — never re-derive these thresholds in-context:
- **MCQ:** below 90% confidence, also read the runner-up; below 80%, read top-3; and so on. A candidate that scored exactly 0 probability is a coverage failure the ladder cannot fix — if suspected (task description likely too thin to connect a candidate), enrich the candidate descriptions and re-run rather than trusting the ladder to recover it.
- **Boolean:** any single item below 70% confidence gets manually re-verified (read that one file/item directly) rather than trusted as-is. This is not a runner-up expansion — there's no ranking in a boolean batch, only per-item confidence.

## Never wired into install-kit's default set

Per `skill-scope`: this is an **opt-in addon**, a category of its own — not stack-scanned like `threejs-scene`, not task-toggled like `perf-audit`. It installs only when the user explicitly asks for it, at initial install or later, and stays pinned once configured (its presence is the user's own persistent choice, not something to re-derive per session).
