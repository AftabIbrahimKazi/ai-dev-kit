# Design Standards

These rules say **what to make**, not how to write the code. `css-standards`, `html-standards` and `accessibility-standards` keep the code clean; this file keeps the result from looking generated. They apply to any new page, screen or component. Where a design doc, Figma file or design system exists, it wins; these rules then serve only as an audit lens, and findings are suggestions until the user approves.

Three tiers. **Floor** rules never ship broken. **Reflex** rules are the defaults a model falls into; break one only with a one-line reason in the handover or a CSS comment. **Finish** rules are craft checks: answer them, they never block.

Adapted from Hallmark (Nutlope/hallmark, MIT). See CREDITS.md.

---

## Floor — never ship broken

## RULE DES-01 — Every colour and font is a token

Colours and `font-family` are declared once as tokens at `:root`. No literal colour or font stack after the token block.

---

## RULE DES-02 — Motion is cheap, optional and safe

Never `transition: all`. Never animate `width`, `height`, `top` or `left`; animate `transform` and `opacity`. Every animation has a `prefers-reduced-motion: reduce` fallback, and content is visible with scripting off.

---

## RULE DES-03 — Focus is visible and instant

Every interactive element has a `:focus-visible` style that appears with no transition. Hover and focus are never the only way to reach content.

---

## RULE DES-04 — The page never scrolls sideways

`overflow-x: clip` on `html` and `body`, never `hidden` and never `100vw`. Grid tracks that hold images use `minmax(0, 1fr)`. Display headings carry `overflow-wrap: break-word` and `min-width: 0`.

---

## RULE DES-05 — Nothing is invented

No made-up metric, testimonial, logo wall, customer count, case study or review. A missing fact is an empty, labelled slot the owner fills. Placeholder images are marked as placeholders and credited if they come from a library.

---

## RULE DES-06 — The first screen carries the point

At 1280 x 800 the hero shows its headline, one sentence and the primary action with no scroll. The hero text is those three things and nothing else. About 80 words on any one screen.

---

## RULE DES-07 — The container is capped

The content width is capped and centred. On wide screens the gutters grow; the text measure and grids do not.

---

## RULE DES-08 — No stock-AI tells

Never: a purple-to-blue gradient, a card inside a card, an emoji used as an icon, a hand-drawn browser or OS window, an eyebrow label, labels in tracked capitals, middle-dot-joined meta strings, arrows glued to link text, decorative status dots, or one italic word inside a roman heading.

---

## Reflex — defaults to break on purpose

## RULE DES-09 — Start from the job, not a template

Name the one thing the visitor comes to do (subscribe, book, buy, try, hire, read). Build the page from how real sites in that category serve that job. Do not default to hero, three feature cards, steps and an email band.

---

## RULE DES-10 — One idea per screen

Each section makes one point, set big. Six to nine sections including hero and footer. Fullness comes from scale and real pictures, not more words.

---

## RULE DES-11 — Pick a tone at an extreme

Choose one: editorial, brutalist, soft, utilitarian, luxury, playful, technical, austere. "Clean and modern" is not a tone. Two consecutive builds for different clients must not land on the same layout, palette and type.

---

## RULE DES-12 — Show the real thing

Prefer the user's photos, screenshots of the real product, or the product built live in the hero. Do not use drawn illustration, empty gradient washes or rows of counting marks as pictures.

---

## RULE DES-13 — Page invariants

One primary button style, one container width, one column gap below the hero, one radius per nesting level. Body text 16px or larger; two type families at most.

---

## RULE DES-14 — Every control has all its states

Default, hover, focus-visible, active, disabled, loading, error and success where they apply. A form with no backend yet says so, instead of pretending to submit.

---

## Finish — craft, never blocking

## RULE DES-15 — Answer the finish questions

Before handing back, answer each in one line or fix it: does the display head wrap cleanly at 360px; do numbers align in tables; is the longest word in each column handled; does the page hold at 200% zoom; is there one memorable thing a visitor would repeat.
