---
name: perf-audit
description: Performance, slowness, bundle size, Lighthouse or page weight on a web project, or a pre-release check. Load BEFORE auditing or optimizing.
---

# Perf Audit — Measure, Rank, Fix the Top Item

Performance work fails two ways: optimizing without measuring (fixing the wrong thing) and reporting a wall of findings nobody acts on. This pass produces a ranked shortlist with numbers.

## Self-improvement (do this first and last)
1. **At start:** apply `learnings.md` if the `learnings-inject` mod supplied it. Do not search for it.
2. **At end:** append one dated bullet only for a new, non-obvious lesson (the biggest win found and its measured impact, or a check that produced noise). Most uses add nothing. Merge instead of duplicating; delete disproven bullets.

## Step 1 — Weigh the payload (static, no server needed)
Run the production build, then the script; read its table, do not re-list files by hand:
```
node <skill-root>/perf-audit/weigh.js [--dist <build folder>]
```
It prints JS and CSS totals (raw and gzip), chunks over 150 KB gzip, images over 200 KB, PNG/JPEG with no WebP/AVIF sibling, video, font count and `font-display`, and unhashed asset names. With no build folder it weighs the source and says so. `--json` for a script.
Still by hand (the script cannot see these): an asset larger than its largest displayed size, missing responsive variants, what is inside a heavy chunk (build analyzer if the project has one), and dead weight: grep for imports of libraries used once trivially (a 30 KB dep for one function).

## Step 2 — Loading strategy
The same run lists, per HTML file: blocking scripts in `<head>`, synchronous third-party scripts and stylesheets, `<img>` without `loading="lazy"`, no `fetchpriority="high"` image or image preload (that is usually LCP), `<img>` without width and height, Google Fonts without a preconnect. Confirm each on the page before ranking it: the script reads markup, not the rendered fold.
Framework-specific: below-fold islands lazy (`client:visible` in Astro), hashed filenames on static assets (the script counts unhashed ones).

## Step 3 — Runtime behavior (needs the app running)
- Long tasks on load and on scroll (DevTools performance trace or judgement from code: heavy work in scroll handlers?).
- Layout thrash: reads (`getBoundingClientRect`, `offsetHeight`) interleaved with writes in the same frame — batch reads then writes, or use IntersectionObserver/rAF.
- Listeners: scroll/resize handlers doing real work directly instead of flagging for rAF; missing `passive: true` on scroll/touch.
- Animations: compositor-friendly (`transform`/`opacity`) vs layout properties (`top/left/width`); `will-change` used sparingly, not sprayed.

## 3D/animation-heavy extras (when applicable)
- Texture memory is the mobile killer: total decoded texture MB (width×height×4 per texture, mipmaps +33%); flag > ~100MB.
- Draw calls per frame (`renderer.info.render.calls`); flag hundreds — merge/instance.
- Pixel ratio capped ≤ 2; render-on-demand for static scenes; zombie render loops after navigation.
- GC hitches: allocation inside the rAF tick.

## Step 4 — Report
Ranked table, max ~7 rows: finding · measured size/impact · fix · effort (S/M/L). Lead with the single highest-impact item and offer to fix it. Don't fix unprompted — the audit is the deliverable unless asked to apply. Gate behavior across session modes: see `mode-kernel`.
