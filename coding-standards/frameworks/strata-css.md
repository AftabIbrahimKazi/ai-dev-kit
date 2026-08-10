# Framework Standards — Strata CSS

Applies to any project that declares Strata CSS (`strata-css` on npm) as its
CSS framework in `CLAUDE.md`. When active it is mandatory, not optional:
**all CSS in the project must be a Strata utility class first.** Custom CSS
is the fallback, used only where Strata has no coverage — never a stylistic
choice.

Read [css-standards.md](../css-standards.md) first for global rules. This
file governs how those rules interact with Strata; where the two conflict,
this file's ruling wins for the Strata-covered surface.

Project-specific values (token prefix, token file path, install method) are
declared in the project's own `CLAUDE.md` — this file states the universal
rules only.

---

## RULE SC-01 — Strata utilities are mandatory wherever Strata has coverage

Before writing any custom CSS rule or an inline `style` attribute, check
whether a Strata utility covers that property. Never hand-write `display`,
`flex`, `grid`, spacing, color, border, radius, shadow, or any other property
Strata already exposes as a utility.

If a needed utility appears to be missing or produces a silent no-op, do not
write a workaround — stop and tell the developer immediately. The fix
belongs in the Strata framework source the project depends on, not as
project-side custom CSS papering over a framework gap.

```tsx
// Wrong — hand-written utility-equivalent CSS
// panel.module.css: .panel { display: flex; padding: 12px; }

// Right — Strata utilities in markup
<div className="d-flex p-3">
```

---

## RULE SC-01a — Component classes are checked before utility classes, every time

RULE SC-01's precedence has three rungs, checked in order, for any UI
element:

1. A Strata **component** class (`nav`/`nav-tabs`/`nav-link`, `card`,
   `navbar`, `table`, …) — check the installed Strata source's component
   registry, not just its coverage tooling (which reports utility coverage,
   not components).
2. Strata **utility** classes combined onto that component to fill gaps or
   override a default that doesn't match the project's tokens (per RULE
   SC-09, using the arbitrary-value form).
3. Only once no component fits the actual UI pattern — not "fits
   imperfectly" or "requires one override," but structurally wrong — utility
   classes alone, or as a last resort, custom CSS per SC-02.

Don't jump straight to utilities because a component "would need
overriding" — overriding one or two token-color defaults on a component
(step 2) is normal and expected; it is not a reason to skip to step 3.

```tsx
// Wrong — reimplements tab-strip structure with utilities when nav-tabs exists
<div className="d-flex gap-[2px] border-bottom-[2px_solid_var(--color-border)]">

// Right — component supplies structure, utility overrides only the token-driven parts
<div className="nav nav-tabs" /* + a small custom-CSS color override, see SC-09 */>
```

---

## RULE SC-02 — Custom CSS is permitted only for what Strata structurally cannot cover

Strata has no state-variant syntax and no utility for these — they remain
real CSS, permanently:

- Pseudo-classes and pseudo-elements: `:hover`, `:focus`, `:focus-visible`,
  `:active`, `:disabled`, `::before`, `::after`, `::placeholder`
- JS/TS-driven state selectors on `data-*` attributes (per `css-standards.md`
  RULE 21 / the project's own state-attribute convention)
- Any property absent from the installed registry — verify against the
  installed Strata version's coverage tooling before concluding this, never
  from memory

Everything in this list stays in the component's named CSS Module file.
Nothing else does.

```css
/* Right — permitted custom CSS: pseudo-class + JS-driven state, nothing else */
.tab:hover { opacity: var(--opacity-hover); }
.tab[data-tab-state="active"] { background: var(--color-accent); }
```

---

## RULE SC-03 — No inline `style`, no component `<style>` blocks, ever

This is stricter than RULE 21's general framing: custom CSS only ever lives
in a named `.module.css` file. Inline `style={{ ... }}` props and any
component-scoped style block are both forbidden, with no exception for
one-off values — use a Strata arbitrary-value utility (`p-[13px]`,
`bg-[#ff0000]`) instead.

---

## RULE SC-04 — Never guess a Strata class name

Strata mirrors Bootstrap naming closely enough that a wrong guess feels
confident and is wrong. Two proven traps:

- Logical spacing only: `ps`/`pe`/`ms`/`me` exist; the physical Tailwind
  spellings `pl`/`pr`/`ml`/`mr` compile clean but emit nothing.
- Named spacing scale is fixed and small (`0 · .25 · .5 · 1 · 1.5 · 3rem`). A
  value that doesn't land on a step has no named utility — use the arbitrary
  form (`p-[18px]`), never snap to the nearest step.

Always confirm a class exists via the installed Strata version's coverage
tooling before using it — not from Bootstrap/Tailwind recall, not from a
prior project.

---

## RULE SC-05 — No `!`-prefixed (`!important`) variants

Strata's utilities carry no `!important` by design — specificity is handled
by `@layer`. The `!`-prefixed variants that force `!important` (`!m-0`) are
banned wherever the project's own no-`!important` posture applies.

---

## RULE SC-06 — Unlayered custom CSS beats Strata utilities by design — don't fight it with `!important`

Strata's utilities live inside `@layer`; component-scoped `.module.css`
files typically compile unlayered. Per the cascade-layers spec, unlayered
CSS always wins regardless of specificity or source order — so a
component's own state rule always overrides a Strata utility class on the
same element, and a breakpoint utility like `d-lg-none` can never be beaten
back by a component rule without the component rule itself changing. Fix
conflicts with a rule in the component's own CSS file — never with
`!important`.

---

## RULE SC-07 — Base utility + breakpoint utility on the same property must be verified in-browser

Combining a base utility with a breakpoint-scoped one on the same property
(e.g. `d-grid d-sm-flex`) is a known landmine — the breakpoint utility does
not always win. Never trust this on build-green alone; check the rendered
result in a browser before shipping.

---

## RULE SC-08 — Strata's plugin packages replace hand-built modal/off-canvas/etc. UI

Before building any modal, off-canvas panel, form-control cluster, skeleton
loader, flipbook, or similar interactive pattern, check whether a
`@strata-packages/*` plugin already covers it (`modal`, `offcanvas`,
`forms`, `picker`, `skeleton-loader`, `flipbook`, `chart`, `shopmap` — see
the Strata README's plugin table). Use the plugin instead of reimplementing
the pattern. Install only the plugin(s) an actual stage needs — do not
pre-install the full set speculatively.

---

## RULE SC-09 — Value-bearing utilities always wrap a project token, never Strata's own named scale

Strata's named scales (spacing steps, `bg-primary`/`text-*` semantic colors,
its own `--st-*` custom properties) are Bootstrap-derived defaults that
exist independently of the project's own design tokens. Using them directly
would hardcode a second, parallel value system and break single-source-of-
truth token discipline the moment a project token changes without Strata's
matching step also changing.

For any property that takes a value from the project's token file, always
use Strata's **arbitrary-value form wrapping a project token variable** —
never Strata's named scale, even when a named step happens to match the
token's current pixel value today.

```tsx
// Wrong — hardcodes Strata's own scale, silently drifts from the token
<div className="p-2 bg-primary" />

// Right — arbitrary utility, token stays the single source of truth
<div className="p-[var(--space-sm)] bg-[var(--color-accent)]" />
```

Strata's named utilities remain fine for values the project has no token for
and never will (e.g. `d-flex`, `flex-column`, `justify-content-center`,
`position-relative`) — structural/layout keywords aren't a value scale and
have nothing to drift from.

---

## RULE SC-10 — `text-[…]` is ambiguous with a `var()` token; use `fs-[…]` for font-size

`text-[…]` resolves to `font-size` only when the bracket value matches a
literal CSS length (`15px`, `1.25rem`, …); anything else, including every
`var(--*)` token reference, resolves to `color`. Since project tokens are
always passed as `var(...)` (RULE SC-09), a font-size token routed through
`text-[…]` silently becomes a `color` rule instead — a project-specific
instance of the "wrong guess feels confident" trap. Always use `fs-[…]` for
a token-driven font-size; reserve `text-[…]` for token-driven color.

```tsx
// Wrong — resolves to color, not font-size, because the value isn't a literal length
<span className="text-[var(--font-size-md)]" />

// Right
<span className="fs-[var(--font-size-md)] text-[var(--color-text-body)]" />
```

---

## Project Setup Declaration

Each project using this standard must declare, in its own `CLAUDE.md`:

- How Strata is installed (npm package vs. local `file:` dependency, and
  where the source lives if local)
- The project's CSS token prefix and token file path
- Whether `strata.config.js` is needed (only if project content isn't
  already covered by Strata's default content glob) and PostCSS wiring
- Theming mechanism (e.g. `data-*` theme attribute) and whether project
  tokens follow `prefers-color-scheme` automatically or require an explicit
  toggle

This file states the rules; the project's `CLAUDE.md` states the values.
