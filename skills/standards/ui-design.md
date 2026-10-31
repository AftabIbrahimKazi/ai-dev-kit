---
name: ui-design
description: Designing a new page, screen or component from scratch with no design doc or Figma, or a UI/UX audit request. Load BEFORE writing markup; with an existing design it only offers an audit.
---

# UI Design — Decide What to Make

`coding-standards` keeps the code clean; this skill decides what the UI should be. The laws are `coding-standards/design-standards.md` (DES-01–15). This file is the process. Adapted from Hallmark (Nutlope/hallmark, MIT; see CREDITS.md).

## Self-improvement (do this first and last)
1. **At start:** apply `learnings.md` if the `learnings-inject` mod supplied it. Do not search for it.
2. **At end:** append one dated bullet only for a new, non-obvious lesson (a tell that slipped through, a direction that worked for a category, a question the user always answered the same way). Most uses add nothing. Merge instead of duplicating; delete disproven bullets.

## When it applies
**Lead only when designing from scratch**: no design doc, no Figma file, no existing design system. Then run the flow and make the design decisions.

**A design source exists** (`design.md`/`DESIGN.md`, a Figma file or link, an existing design system or tokens, a styled project): this skill does not lead and does not change anything on its own. The source wins. Build to it exactly. Then, once per task, offer a second opinion in one line, for example "Want a UI/UX audit of this against the design standards?". Run the audit only on a yes. An audit reports findings against DES-01–15 and the source, with `file:line` where possible, and fixes nothing until the user approves each change or the whole list. A finding that contradicts the design source is reported as a suggestion, never applied.

**Component only** ("just the button"): skip Shape and Direction; apply the Floor and the eight states (DES-14), inside the project's system if one exists.

## Flow
1. **Pre-flight.** Read before asking: `design.md`/`DESIGN.md`, a Figma file or link (if any exists, stop here and follow "When it applies"), the existing tokens, fonts, palette and framework, and anything the product itself shows (running dev server, screenshots). Report what you found in two lines.
2. **Ask once**, in one message, unless the prompt already answers it or the run is headless:
   - **Material:** screenshots, photos, real numbers, quotes with a named source, logos they may use. Without them, placeholders; never invented facts (DES-05).
   - **Audience** and **use** (the one action the page drives).
   - **Tone:** an extreme (DES-11) plus the vibe in a few words and an anchor colour if any.
   Skipped answers are opt-outs: infer, state the inference in one line, move on.
3. **Shape.** List the real material, the pictures, and what is absent. Name the visitor's job (DES-09). Design the page from that: how it opens, each section's single point, the nav, the footer, what carries the hero.
4. **Direction.** Choose tone, palette, type and surface treatment as a set, and make them differ from the last build in this project. Write them as tokens first (DES-01).
5. **Picks block**, once, printed as text before the first file is written, so the user can redirect: shape, tone, palette and type, hero, the memorable thing, sections, material (real / pictures / absent).
6. **Build.** Tokens, then hero, then the rest. Build in as few writes as possible; do not rewrite a file to tweak one value. Check the hero at 1280 x 800 and 360px before building sections. Keep to DES-06 and DES-10.
7. **Sweep.** Walk DES-01–08 as a checklist on the output; run `code-audit` for the css/html/a11y rules. Fix every Floor miss. Fix or justify every Reflex miss. Answer DES-15. Then ask for the one piece of material that would most improve the page.

## Fresh-eyes review
Before handing back a full page, re-read the output cold: what looks generated, what a stranger would not grasp in five seconds, which Floor rule fails. Use a subagent only if `agent-usage` approves one.

## Full Hallmark (optional)
Hallmark adds a 50-theme catalog and a rendering linter (`sloplint`, needs Node and a browser): `npx skills add nutlope/hallmark`. Not vendored here. When installed and named, follow its `SKILL.md`; it may also serve as the second-opinion auditor, on approval only.

## Rules for the model
1. Never invent facts; an empty labelled slot beats a plausible number.
2. With a design source, suggest the audit and wait for approval.
3. Report `Floor n fail, Reflex n (waived: ids)` only from checks actually run.
