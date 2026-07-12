---
name: triforge
description: Triforge (user's own @triforge Three.js node-workflow suite) — package selection, APIs, debugging, fixing at source; verifies against the live repo. Trigger on any @triforge package (shader-core, geometry-nodes, particle-core, physics-core, compositor-core, etc.) or Blender-style node work in Three.js.
---

# Triforge — Author's-Own-Suite Protocol

Triforge is the user's modular Three.js ecosystem: npm scope `@triforge/*`, repo at `My Projects/3D/three-js`. All packages are published and functional. Because the user owns it, bugs are fixable at the source — and known gaps are already tracked in-repo (e.g. shader-core's `FINDINGS.md`). This skill must never argue with the repo — the repo wins over anything remembered here.

## Adaptive rule — the repo is the source of truth
Facts below WILL drift as packages get updates. Before relying on any node name, parameter, or behavior:
1. Compare the installed version (`node_modules/@triforge/<pkg>/package.json`) against the repo package's version; the repo's `HANDOVER.md` / `BACKLOG.md` and each package's docs describe in-flight and planned changes.
2. Confirm APIs in the repo — each package folder (`st-<name>/`), plus `README.md`, `TUTORIAL.md`, `examples/` — never from memory.
3. **Check the package's `FINDINGS.md`/known-gaps notes before debugging**: the "bug" may be a documented gap. If so, don't burn a session rediscovering it — decide whether to work around or fix at source.
4. If the repo contradicts this skill, follow the repo AND log the correction in `learnings.md` so the skill self-heals.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons.
2. **At end of every use:** append one dated bullet — a gap discovered (and whether it was logged in the package's FINDINGS/backlog), an API surprise, a package-combination pattern that worked. Record package versions with version-sensitive facts. Merge instead of duplicating; delete bullets obsoleted by updates.

## Core model (verified against repo — re-verify on version change)
- **One job per package; no cross-package imports** (only `@triforge/core-types` is shared). Packages communicate through Three.js primitives only: `BufferGeometry`, `Material`, `Texture`.
- **Blender naming everywhere** — node, parameter, and socket names match Blender exactly. When unsure of an API name, the Blender name is the first guess; the source is the confirmation.
- **`parameters` object on every node/modifier** — the public animation surface for GSAP/keyframe integration. Animate via `parameters`, not internals.
- **Non-destructive** — nodes/modifiers never mutate inputs.
- Install independently: `npm install three @triforge/<pkg>` — no monorepo setup needed in consumers.
- Package map (repo folders `st-*`): shader-core (75 surface shader nodes incl. PrincipledBSDF/Noise/Voronoi), geometry-nodes, modifier-core, curve-core, radius-parametric-geometry, uv-core, particle-core, physics-core, animation-core, keyframe, compositor-core (28 post passes), pathtracer-core, hair-core, fluid-core, metaball-core, volume-core, core-types.
- Repo-level docs: `README.md`, `TUTORIAL.md`, `THREE_JS_ECOSYSTEM.md`, `HANDOVER.md`, `BACKLOG.md`, `examples/`, `coding-standards/`.

## Using Triforge in a project
- **Pick the smallest package set** for the job — the one-job-per-package design means pulling compositor-core for one bloom pass is correct, pulling three packages "to be safe" is not.
- Prefer Triforge over hand-rolling when a package covers the need (shader nodes over raw GLSL patching, keyframe over ad-hoc lerp code) — using it exercises and hardens the user's own library.
- Wire packages together at the mesh level, matching the repo's `examples/` patterns.
- Version pinning: consumers should pin versions; after a source fix + publish, bump consumers deliberately.

## When a package misbehaves (owner's privilege)
1. Check the package's `FINDINGS.md`/known gaps first — may already be documented.
2. Reproduce minimally in the repo's `examples/` (Playwright is available in the repo for verification).
3. Diagnose in the package source (`st-<name>/`), honoring the repo's `coding-standards/`. Workaround in the consuming project only as flagged tech debt pointing at the real fix.
4. New gap discovered → log it in that package's FINDINGS/`BACKLOG.md` per existing format, even if not fixing now — the log is the suite's improvement engine.
5. After a source fix: run the package's tests/examples, changelog per repo convention, and surface "fixed in repo, needs npm publish + consumer bump" explicitly — publishing is the user's call.
