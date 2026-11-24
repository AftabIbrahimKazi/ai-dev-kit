---
name: readme-writer
description: Use whenever a README.md is written, restructured, trimmed or fact-checked, or the user says "project description", "docs landing page", "readme is too long". Load this BEFORE editing a README.
---

# README Writer — hook first, every claim counted

A README decides in the first screen whether a developer installs the project. This skill stops the two usual failures: a wall of flags before the pitch, and numbers or flags copied from old text instead of the code.

## Learnings
Apply `learnings.md` if the `learnings-inject` mod supplied it (never search). At end, add one dated bullet only for a new, non-obvious lesson (a claim the audit missed, a section shape that read badly); merge, don't duplicate.

## Principles
1. **Hook first, manual second.** The first screen holds the pain, the differentiator and a 3-line quickstart. Flag tables and novice walkthroughs come after.
2. **The code is the source.** Never copy a count, file name, flag or default from old README text or memory. Count and read the repository first.
3. **Measured, not promised.** Every number states its sample size, the model or machine, and its caveat. A platform nobody ran is labelled untested.
4. **Progressive disclosure.** The main scan path stays at 250 lines or fewer (hard limit 400). Flag tables, OS walkthroughs and niche add-ons go in `<details>` or `docs/`.
5. **Plain headings.** H1 to H3 use the words a developer would search for ("Deterministic hooks", "Token savings"), not buzzwords.

## Phase 1 — Audit the repository (before the first edit)
- **Inventory:** count the real folders and files for each asset the README names (skills, mods, scripts, rules, commands). The hero text, headings and tables must carry the same numbers.
- **Entry points:** read `package.json` and the CLI source. Every flag and default you will show must exist. The quickstart must work in 3 steps or fewer.
- **Evidence:** read the tests and `CHANGELOG.md`. Separate environments that were run live from ones that were only unit-tested or never run.
- **Differentiator:** write one sentence on what the code enforces deterministically that a plain prompt library only asks for.
- Run `node <skill-root>/readme-writer/audit.js README.md` now. It lists the existing count, link, flag and sample-size problems.

## Phase 2 — Structure, in this order
1. **Hero:** H1 `<Name>: <5 to 8 word category>`; one sentence (who, which pain, which mechanism); three differentiator bullets that contrast manual or probabilistic work with enforced work; a status line (license, runtime, dependency count, docs link).
2. **30-second quickstart:** the fastest install in 3 to 5 lines, one real command and its real output. Put OS walkthroughs and flag tables in a `<details>` right below.
3. **How it works:** a small flow diagram, then features grouped by when they run: automatic (hooks, linters, guards), on demand (skills, commands, MCP), optional extensions (one table row each).
4. **Proof:** a table `Metric | Baseline | With kit | Sample and conditions`, then a Verified versus Untested block.
5. **Map and lifecycle:** an annotated folder tree of 15 lines or fewer, the update and uninstall commands, Contributing, License.

## Phase 3 — Formatting
- Start every outcome with a verb: what the code blocks, enforces or saves.
- Use a 3 or 4 column table for any group of 3 or more parallel items.
- Give every metric its test command, model and sample size on the same line.
- Any add-on longer than 15 lines in the README moves to `docs/<feature>.md`; leave a 3-line summary and a relative link.

## Phase 4 — Gate (before you hand back)
- [ ] `audit.js` reports 0 fail; each warning is fixed or answered in one line.
- [ ] Count parity across hero text, headings and tables.
- [ ] Core value, differentiator and quickstart all sit in the first 100 lines.
- [ ] Every flag matches the CLI source.
- [ ] Sample sizes and untested paths are stated.
- [ ] Novice guides and niche add-ons are collapsed or moved to `docs/`.

## The tool
`node <skill-root>/readme-writer/audit.js [README.md] [--root <dir>] [--json]`. Plain Node, no dependencies, no network. It checks relative links, the "N skills, mods, commands" claims in the first 60 lines against the folders, `--flags` on lines that name `install-kit` against the script sources, measured claims with no sample size, and README size outside `<details>`. Exit 0 means no failure; exit 1 means at least one failure. It reads files only and never edits the README.
