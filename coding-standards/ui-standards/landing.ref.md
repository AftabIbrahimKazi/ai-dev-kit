# UI Standards — Landing and Marketing Pages (reference)

Read when: the task covers layout, type, navigation, cms-ready content. The everyday rules are in `ui-standards/landing.md`.

## Layout, type, navigation

- **UI-LND-16** Marketing type scale, desktop (phone below 768 px): h1 54 px / 800 / 1.1 (30 px / 800 / 1.15), h2 36 px / 750 / 1.2 (24 px), h3 28 px / 750 (21 px), lead 19 px / 1.55 (16 px), body, cards and FAQ 15 to 17 px (15 to 16 px), inputs 16 px both, section spacing 104 px (56 px), content width max 1200 px with text max 680 px (full width with 20 px sides).
- **UI-LND-17** The large button (48 px, 16 px text, 15 px on phones) is for the hero CTAs and the final CTA band only; header, pricing and other buttons are 40 px. On phones hero buttons are full width.
- **UI-LND-18** The header is sticky (64 px desktop, 56 px phone, translucent surface with a 1 px bottom border). The link for the section in view has `aria-current="true"`, semibold, and a 2 px primary underline. Sections set `scroll-margin-top` so headings never hide under the header. On phones anchors move into a ☰ menu with 48 px links.
- **UI-LND-02** No auto-advancing carousel and no autoplay video with sound. Muted autoplay has a pause control and stops under `prefers-reduced-motion`. Smooth anchor scrolling only when reduced motion is not set; the URL hash updates for sharing. Entrance animations are optional, at most 300 ms, and off under reduced motion.
- **UI-LND-19** Below 768 px every multi-column section stacks to one column, alternating product rows show text first, and nothing scrolls sideways at 360 px.


## CMS-ready content

- **UI-LND-23** Build pages from section components fed by data (static JSON first, CMS later); the CMS enforces the limits. Types and limits: Seo (title 50–60, description 140–160, share image 1200 × 630); Hero (eyebrow ≤ 6 words, h1 ≤ 10, lead ≤ 35, primary and secondary CTA, note ≤ 10, visual and alt); Logo 0–8 (name, image, alt, approvedForPublication); Feature 3–6 (icon, title ≤ 5 words, text ≤ 22); Step 3 (title ≤ 5, text ≤ 20); ProductRow 2–3 (title ≤ 6, text ≤ 25, 3 points ≤ 8 words, screenshot and alt); Integration ≤ 12; Testimonial 0–3 (quote ≤ 40 words, name, role, company, resultMetric, approvedForPublication); Plan 2–4 (name, audience ≤ 8 words, price or "Custom", unit, 3–6 points, ctaLabel, recommended); FaqItem 5–8 (question ≤ 12 words, answer ≤ 60); CtaBand (title ≤ 8, text ≤ 20, ctaLabel); Contact (heading, intro, email, phone, address, replyTime). Marketing edits content only; layout, order, tokens and components are not editable.
