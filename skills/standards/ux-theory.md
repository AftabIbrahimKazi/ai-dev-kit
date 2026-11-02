---
name: ux-theory
description: Use whenever creating a theme or design system, extending one with a new element (button, card, variant), or reviewing visual design: palette, type, spacing, hierarchy, motion. Load this BEFORE choosing any visual value.
---

# UX Theory — The Designer's Vocabulary

Field terms in the topic files are the instruction: apply each term as a practitioner would. Terms are never defined here. If a term is unclear, look it up; do not guess.

`ui-design` decides what to build. `design-standards.md` (DES-01–15) is the law. This skill supplies the craft values behind a theme. It is not needed once a theme is built and its tokens exist.

## Self-improvement (do this first and last)
1. **At start:** apply `learnings.md` if the `learnings-inject` mod supplied it. Do not search for it.
2. **At end:** append one dated bullet only for a new, non-obvious lesson (a value that tested badly, a term the model misread). Most uses add nothing. Merge instead of duplicating; delete disproven bullets.

## State decides what to read
| State | Evidence | Do |
|---|---|---|
| No theme | no design doc and no tokens file | Read every topic. Write the result as tokens (DES-01) and a theme doc with a component inventory. |
| Theme exists | theme doc (`DESIGN.md`) with a `## Component inventory` heading, and a tokens file | Read only the topics the new element needs. Reuse existing tokens first. Add a token only for a real gap. |
| Theme revision | the user asks to change a token | Treat as "No theme" for the affected topic. Update every consumer of the token. |

A theme that exists wins over this file. Never change a token to suit a theory.

## Topics (open only what the task needs)
| Topic | Covers | Typical trigger |
|---|---|---|
| `topics/color.md` | color theory, roles, contrast, dark mode | palette, any new colour |
| `topics/type.md` | typography, typeface, font, scale, measure | type scale, a new text style |
| `topics/composition.md` | layout, hierarchy, visual hierarchy, proximity, alignment, balance, white space | a new card, section or page |
| `topics/motion.md` | transitions, easing, micro-interactions | any animated state |
| `topics/fx.md` | sfx, vfx | sound, blur, glow, particles, canvas |

New element → topics: button = color + motion; card = composition + color; form field = type + composition + motion; modal = composition + motion; hero or page = all but fx.

## Rules
1. Record every chosen value as a token with a role name, never a raw value in a component (DES-01).
2. Pass the squint test (blur the view: one focal point still shows) before handing back a layout.
3. Check contrast numerically; do not judge it by eye.
4. A new element ships with all its states (DES-14) and an entry in the theme doc's component inventory.
5. When a theme is finished, add a `## Component inventory` heading to its theme doc listing every component. That heading is the lock: `skill-scope` then restores this skill only on expansion phrases ("new card", "variant", "revision"), not on every colour or spacing mention.
6. Fall back to a topic's stated default when the task gives no direction. State the default you used in one line.
