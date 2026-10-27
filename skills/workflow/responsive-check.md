---
name: responsive-check
description: Use whenever the user asks if a layout works at screen sizes or widths, on phones or tablets, or reports horizontal scroll or breakpoint bugs. Load this BEFORE changing any media query.
---

# Responsive Check — Range-Based Viewport Check and Fix

Responsive bugs hide at breakpoint edges and bleed across zones. This skill fixes the zones to check, measures each one in a real browser, and writes every fix as an isolated range (`css-standards.md` RULE 17).

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — a breakpoint pattern that hid a bug, or a check that gave a false finding. Merge instead of duplicating; delete disproven bullets.

## Step 1 — Plan the viewports
Run `node <skill-root>/responsive-check/probes.js [flags]`. It prints the probe list and any warnings. Show the plan in one line before measuring.

| Flag | Query type | Probes |
|---|---|---|
| none | The six RULE 17 zones | Lower edge, midpoint, upper edge of each (320 to 1920) |
| `--range a-b[,c-d]` (repeatable) | Range-based; bounds used as typed | Lower edge, midpoint, upper edge |
| `--min N` | `min-width` only, non-standard | N−0.02, N, each standard lower edge above, 1920 |
| `--max N` | `max-width` only, non-standard | N, N+0.02, each standard upper edge below, 320 |
| `--width W[,W]` | One size, no query logic | Only W |
| `--ranges a-b,…` | Replaces the six default zones | As for the default |
| `--detect` | Reports the project's own breakpoints | None unless combined with a check flag |

Rules:
- `--min` and `--max` with no value take their values from the detected queries.
- Flags combine. Overlapping ranges are warned about, not blocked.
- Exit 3 means the plan is over 24 viewports (`--max-probes N` changes the cap). Ask the user to confirm before measuring.
- `--min` and `--max` are never the default. Run them only when the user names them, and repeat the RULE 17 warning once.

## Step 2 — Detect (only when asked, or when a project uses its own breakpoints)
`--detect` alone prints the breakpoints, the query style counts, overlaps, uncovered standard zones, off-standard edges and unresolved queries (SCSS variables, mixins). It measures nothing. Show the report, then ask which ladder to use: the standard six, the detected set, or both. Mostly min-only or max-only projects get a mode suggestion with the RULE 17 warning. `--detect --run` accepts the suggestion without asking. `--built` reads compiled CSS, where variables are already resolved.

## Step 3 — Measure
Run `node <skill-root>/responsive-check/measure.js --url <url> --widths <viewport values from the plan> [--shots dir]`. It needs Playwright in the project; if it is missing, offer the `e2e-scaffold` skill and stop. Whole-pixel viewports mean 767.98 is measured at 767. Findings per width: overflow-x, tap targets under 44 px (inline links exempt), clipped text.

## Step 4 — Report
Group findings that share one cause across widths into a single finding: "starts at 768, persists to 992". Table: check, result, finding. No other summary.

## Step 5 — Fix (only after the user approves)
1. Propose each fix before editing. Do not apply any fix unasked.
2. Write every fix as a range per RULE 17, never `min-width` only, even when the check ran with `--min` or `--max`.
3. Converting an existing `min-width` rule to a range stops it applying above the new upper bound. List the zones the rule reaches today, and ask whether to repeat it in each zone or close it.
4. Re-run Steps 1 and 3 for the zone the fix touched. After a `--min` or `--max` fix, re-run the whole ladder, because those changes bleed.

## Failure mode this prevents
A fix that passes at 768 and breaks at 992 because it bled, a gap or overlap at 575.98 versus 576 that no mid-zone check sees, and a mobile-first rewrite that quietly breaks the isolated-zone standard.
