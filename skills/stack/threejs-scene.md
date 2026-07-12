---
name: threejs-scene
description: Three.js discipline — shader pitfalls, disposal, scroll cameras, textures, render-loop hygiene. Trigger on scenes, meshes, shaders, materials, cameras, scroll/animation bindings, or visual glitches.
---

# Three.js Scene — Hard-Won Patterns

General Three.js discipline plus the bug classes that keep recurring in scroll-driven planetary/3D sites. The `learnings.md` loop matters more here than in any other skill — every solved rendering bug should land there.

## Staleness guard
Three.js moves fast and API facts here (colorspace handling, disposal semantics, loop APIs) can drift across releases. Check the project's installed `three` version (`node_modules/three/package.json`); if a rule contradicts observed behavior on that version, trust the version's migration notes/source over this file and log the correction in `learnings.md` with the version number.

## Self-improvement (do this first and last)
1. **At start:** read `learnings.md` in this skill's folder if it exists. Apply relevant lessons — past rendering bugs WILL recur in new form.
2. **At end of every use:** append one dated bullet — symptom → cause → fix for any visual bug solved; any pattern that kept a scene clean. Merge instead of duplicating; delete disproven bullets.

## Shaders
- **A failed shader compile fails silently in production paths** — the mesh just doesn't render or renders wrong (ghost/black objects). After any GLSL edit, check the console for `THREE.WebGLProgram` errors before debugging anything else.
- Edit uniforms in place (`uniform.value = x`); replacing the uniforms object breaks the binding.
- `onBeforeCompile` string-patching is brittle across Three versions — pin the injection to a stable chunk name and assert the replacement actually matched (`if (!shader.includes(...)) throw`).
- Precision/branching: avoid divergent branches in fragment shaders on mobile; prefer `mix`/`step`.

## Disposal — the leak class
Removing from the scene frees nothing. On teardown (page nav, component unmount, planet switch):
- `geometry.dispose()`, `material.dispose()` (each material if array), and **every texture on the material** (`map`, `normalMap`, `roughnessMap`, …).
- Render targets, composers/passes need explicit `.dispose()` too.
- Kill the render loop (`cancelAnimationFrame` / `renderer.setAnimationLoop(null)`) and remove resize/scroll listeners — a zombie loop on a dead canvas is a common MPA-navigation bug.
- Verify with `renderer.info.memory` (geometries/textures counts) before and after teardown.

## Scroll-driven cameras
- **One source of truth:** derive camera state from a normalized scroll progress (0–1 per section), never accumulate deltas — accumulation drifts and breaks on refresh mid-page.
- Ease in the interpolation (damped lerp toward target), not in the scroll mapping — keeps scrubbing reversible.
- Camera paths: define keyframes (position + lookAt/quaternion per waypoint), interpolate between them; slerp quaternions, don't lerp Euler angles (gimbal flips).
- Decouple scroll read from render write: read scroll in the event/observer, consume in the rAF tick.

## Textures & assets
- Size for the largest on-screen appearance, not the source: power-of-two where mipmaps matter; compress (KTX2/basis or at minimum sized JPEG/WebP variants per breakpoint).
- Set `colorSpace = SRGBColorSpace` on color maps (washed-out or too-dark textures = colorspace, 90% of the time).
- `anisotropy` on planet/ground textures viewed at grazing angles.
- Preload before reveal; a texture popping in one frame late reads as a flash bug.

## Render loop hygiene
- No allocation inside the tick — reuse Vector3/Quaternion scratch objects; `new` in rAF = GC hitches.
- Render on demand when the scene is static (dirty-flag), continuous only during animation.
- Cap pixel ratio: `Math.min(devicePixelRatio, 2)`.
- One renderer per page; multiple canvases → share via scissor or destroy/recreate on route change.

## Debugging visual glitches — order of checks
1. Console (shader compile, texture load 404s)
2. Does it reproduce with a plain `MeshBasicMaterial`? (isolates material vs geometry/camera)
3. `renderer.info` (draw calls, memory) for leaks/duplicates
4. Camera near/far + object scale (z-fighting, disappearing at distance)
5. Only then read the scene code.
