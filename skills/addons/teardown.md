---
name: teardown
description: Opt-in add-on. Use whenever the user asks for a 3D simulator, cutaway, exploded view or interactive explainer of any machine, mechanism or 3D model. Load this BEFORE writing any scene code.
---

# Teardown — Interactive 3D Simulators of Any Machine or Model, Built on Triforge

**This is opt-in only, never part of any default install.** Once installed, load it on its own when a request matches the description. The user can also type `/teardown`. A hand-built simulator drifts (the gauges disagree with the motion), hides its failures (a shader that does not compile draws nothing) and costs tokens on every redraw. A script detects, scaffolds, checks, builds and photographs the page. Claude supplies only what a script cannot: the real dimensions, the reference, and the machine's own geometry. The page is machine-agnostic: it takes any set of named parts and gives each one isolate, cutaway, a camera that frames it and a tour stop.

## Self-improvement (do this first and last)
1. **At start:** apply `learnings.md` if the `learnings-inject` mod supplied it. Do not search for it.
2. **At end:** append one dated bullet only for a new, non-obvious lesson (a frame that looked wrong, a Triforge gap, a check that missed). Most uses add nothing. Merge instead of duplicating; delete disproven bullets.

## First run (a person typing, no experience needed)
1. Type `node -v` and press Enter. A number of 22 or more, such as `v24.12.0`, means yes. If you see "not recognised", install Node from nodejs.org.
2. Open a terminal in your project folder. In VS Code, use Terminal, New Terminal.
3. Type `/teardown detect --about "a 3-gear reducer, 12/36/18 teeth, 1500 rpm"` in Claude Code, or `node <skill-root>/teardown/cli.js detect --about "..."` in a terminal. Your own 3D model works too: add `--model path/to/file.glb`. It prints what the project has, what is missing and the questions left open, and writes `teardown/<name>/spec.json`.
4. Answer the questions by editing `spec.json`. Add the path of a photo or drawing as `reference`.
5. Type `/teardown init <name>`, then `/teardown sheet teardown/<name>`. The sheet is a picture of five moments of your machine: `teardown-out/<name>/sheet.png`.
If you see "usage:", you mistyped a word; the line shows the five commands. If you see "blocked" with exit 3, the message names what to install.

## The tool
`node <skill-root>/teardown/cli.js <command>` (plain Node, no dependencies, no network).

| Command | Does |
|---|---|
| `detect [--about "text"] [--model FILE]` | Reports Node, `three`, the installed `@triforge/*` versions, Chrome, existing machines, reference files and every `.glb` or `.gltf` in the project. With `--about` it also picks the starter and the best-fit Triforge packages, drafts `spec.json` from the numbers in the text, and prints the open questions and the one `npm install` line. A model file always selects the `custom` starter. |
| `init <name>` | Scaffolds `teardown/<name>/`: the shared page plus one starter. The numbers come from `spec.json`; a model file is copied in. Never overwrites an edited file without `--force`. |
| `check <dir>` | Validates the spec and lints the sources. Exit 1 on an error. |
| `build <dir>` | Copies the app and only the library files it imports into `<dir>/dist`, with an import map. No bundler, no CDN. |
| `sheet <dir> [--at 0,4,8]` | Builds if needed, renders stills at the timeline beats in headless Chrome, writes one contact sheet and `timeline.json`, and fails on a console error or an empty frame. |
| `probe <dir>` | Drives the live page like a visitor in headless Chrome: drag, wheel, a part button, the cut slider, glass, the quiet-time handover back to the tour, a key press. Fails on any miss or console error. Run it after `sheet`, before calling a page done. |

Flags: `--root D`, `--name N`, `--model F`, `--json`, `--dry-run`, `--force`, `--size WxH`, `--at T,T`.

## The starters (the page is the same for all of them)
| Starter | For | What Claude does |
|---|---|---|
| `gears` | A gear train: teeth, module, input rpm and torque. | Nothing. The spec is the machine. |
| `crank` | A slider-crank engine: one cylinder, an inline row or a V (`cylinders`, `bank_angle_deg`, optional `crank_phases_deg`). Exact piston position, speed and rod angle per cylinder; a cross-plane V8 by default. Say "V8" or "inline 4" to `detect`. | Nothing. Set `crank_phases_deg` only if the real shaft differs. |
| `custom` | Anything else, or any 3D model. | With a `.glb` or `.gltf`: list the part names in `spec.json` if the defaults are wrong. Without one: replace the placeholder blocks in `machine.js` with real geometry, and put the real math in `kin.js`. |

Every starter is two files: `kin.js` (the numbers: `thetaAt(t)`, `readouts(theta)` returning `[{label, value}]`, and optionally `charts`: `[{label, unit, period, f(theta)}]`) and `machine.js` (`buildMachine()` returning `{root, parts: [{id, label, object, note?}], update(theta), info?}`). The shared files (`main.js`, `stage.js`, `film.js`, `console.js`, `index.html`) read only that contract. They give every machine:
- a camera framed from the real part bounds, and a tour of the 12 largest parts;
- isolate (every other part fades) and glass mode;
- a capped cut: closed meshes write the stencil, one plane fills the cut face. Mark an open shell or glass mesh `userData.noCap = true`, or its cap fills wrongly;
- a callout with a leader line (the part's label, `note` and real size) for the isolated part;
- one small chart per `charts` entry, with a marker at the current input angle;
- a studio look: a bright environment for metal, soft shadows, a shadow-only floor, and ambient occlusion on the full quality tier (`?look=plain` turns the post-processing off);
- every shader compiled before the first frame.

Never edit the shared files to suit one machine; change `kin.js` or `machine.js`.

## Workflow
1. **Run `detect --about "<the user's words>"`.** Do not read the project yourself. This is also how you decide the work is in scope: if the user's words name no machine, stop and ask what to build.
2. **Ask the open questions in one message**, and ask for a reference (photo, manual drawing, clip). Without a reference the machine comes out generic. Never guess a dimension silently.
3. **Edit only `spec.json`.** Run `init <name> --force` after a change.
4. **Install packages only after the user agrees.** `detect` prints the `npm install` line; it uses the network and says so first. Pin the versions it reports.
5. **Run `check`.** Fix every error. A warning about a missing reference is not an error but is never skipped without telling the user.
6. **Write the machine** only where the starter table says so, and only in `kin.js` and `machine.js`.
7. **Run `sheet`.** Read `sheet.png`, then read single tiles to zoom. Fix, run again. Stop when one full pass finds nothing. Then run `probe`. Never report a machine as done without reading the sheet of the current build and a passing probe.
8. **Hand over:** `build` output path, and that `dist/` needs any static server (`npx serve dist`), because a module page cannot open from `file://`.

## Theme (the project's look, never the kit's)
The page ships neutral. To match a project, add an optional `theme` block to `spec.json` and run `init --force`: `font`, `radius` (panels), `radiusBtn` (buttons), `cap` (the cut face), and the colour roles `bg`, `ink`, `mute`, `panel`, `line`, `accent`, either at the top or inside `light` and `dark` blocks. The page picks the block from `?theme=light|dark` (a host page passes the site's choice) or else the system scheme. Take the values from the project's own tokens; never invent a look. A machine's shapes and materials are its own: read `SPEC.theme` in `machine.js` to colour them. No theme: the neutral defaults, unchanged.

## Rules
- **Start from a reference, never from imagination.** Build against it and compare tile by tile.
- **Real numbers, one source.** `kin.js` holds the dimensions and every readout; it has no `three` in it. Check one number by hand: 12 teeth at module 3 is a 36 mm pitch diameter.
- **One input drives everything.** Pose from one angle or one stroke. The page, the sheet and any recording use the same timeline.
- **`render(t)` is pure.** No `Math.random`, `Date` or `performance.now` in `kin.js`, `machine.js` or `film.js`; `check` fails the build if one appears.
- **The part doing the work opens up.** Isolate it, cut it, or put the camera inside.
- **Light studio, one accent.** The accent marks the part that works now.
- **Fix a collision with a number** in `spec.json`. Never hide it with the camera.
- **Keep `index.html` under 1 MB.** Big models go in files next to it. Libraries sit in `dist/vendor`.

## Triforge (the user's own library; the repo wins over this file)
- **Use Triforge before raw three.js.** The starter uses `@triforge/modifier-core` (Array, Bevel), `@triforge/keyframe` (the tour is a clip on one `parameters` object) and `@triforge/render-budget-core` (quality tier from real probes). `detect` names more per machine kind: `curve-core` for tubes, `geometry-nodes` for blades on points, `animation-core` for joint rigs, `compositor-core` for bloom.
- **Animate `parameters`, never internals.** Every Triforge node exposes them, and the console panels read from the same object.
- **Before using a package,** follow the `triforge` skill: check the repo's version, `FINDINGS.md` and `BACKLOG.md` first.
- **Known gaps (2026-11-08, modifier-core 0.1.2, compositor-core 0.1.3):** `ArrayModifier` is linear only, so there is no radial tooth pattern; the gears are extruded profiles. `CompositorOutput` built its render target with no stencil buffer and its SSAO pass could not take the cut's clipping plane, so the stage uses three's `EffectComposer` and `GTAOPass` directly. Both are fixed in the repo (`stencil`, `samples` and `clippingPlanes` options; see its `FINDINGS.md`) but not published: when a release carries them, move the stage to `CompositorOutput({ stencil: true, samples: 4 })` and `SSAO({ clippingPlanes: [clip] })`. There is still no GTAO pass. A loaded model keeps its own materials and is not rebuilt from Triforge nodes. Log a gap in the package's `FINDINGS.md` when you meet one. Do not work around it in the machine.
- **`check` prints `triforge:` notes** where raw `TubeGeometry` or `InstancedMesh` appears and a package covers the job. Act on each or say why not.

## Review checklist (read against every tile)
- Parts that should touch touch; nothing passes through anything; the readouts match the pose.
- One focal point. Nothing important within 60 px of an edge. Labels never cover the part they name.
- Near-white parts on a pale ground get an outline or a darker ground.
- Each state holds long enough to read: 1 s for a short phrase and 0.25 s per word beyond three.

## Failure mode this prevents
A simulator that only works for the one machine it was written for, whose gauges disagree with its motion, a shader that fails to compile and draws nothing, a frame that is empty and nobody looked, a CDN link that breaks offline, and a model spending thousands of tokens on a scaffold a script writes in milliseconds.

Adapted in idea from [elvarofficial/teardown](https://github.com/elvarofficial/teardown) (MIT, built on whaleyxbt/claude-motion, MIT). The scaffold, checks, bundler and capture are our own. Video and sound are separate opt-in add-ons, `teardown-film` and `teardown-sound`; `sheet` writes the beats to `teardown-out/<name>/timeline.json`, the one timeline both follow. The probe runs on a software renderer, so its frame rate says nothing about a real GPU.
