---
name: stitch
description: Google Stitch MCP — AI UI design generation (screens, variants, design systems) for rapid prototyping before code.
trigger: New UI mockups, screen/layout exploration, "show me how it looks", design variants — before any code is written
replaces: Claude artifact / plain HTML prototype (the normal flow)
transport: http (remote)
url: https://stitch.googleapis.com/mcp
auth: api-key — header `X-Goog-Api-Key`, default env var `STITCH_API_KEY` (key from stitch.withgoogle.com/settings → API Keys)
cost: free for now, with usage limits — expect it to change
routing-default: first
verified: 2026-10-04 (live endpoint: initialize, tools/list, list_projects with good/bad/no key; Google's docs page was not machine-readable)
---

# Stitch — Prototype UI Here First, Code Later

Offloads UI exploration to Stitch so the main model spends tokens on code, not on drafting mockups.

## Use for
- Generating a screen from a text brief, editing it, producing variants for comparison.
- Design-system creation/application when the user wants consistent look across screens.

## Tools (live `tools/list`, 2026-10-04 — re-compare at health-check)
`create_project`, `get_project`, `list_projects`, `delete_project`, `list_screens`, `get_screen`, `generate_screen_from_text`, `edit_screens`, `generate_variants`, `create_design_system`, `create_design_system_from_design_md`, `upload_design_md`, `update_design_system`, `list_design_systems`, `apply_design_system`.

## Health-check
Call `list_projects` (read-only, authenticated). `tools/list` is unauthenticated — a bad key passes it. Bad/missing key → HTTP 200 with `isError:true` ("API keys are not supported…" / "missing required authentication credential"): report as bad key and fall back. Never call `delete_project` unless the user names the project.

## Timeout (tested 2026-10-04)
`generate_screen_from_text` took ~59s; Claude Code's default tool timeout cut it off and the fallback fired, leaving an empty project behind. Setup must set `MCP_TOOL_TIMEOUT=300000` (Claude Code, env/settings) or the equivalent for the tool. After a timeout, `list_screens` on the project before regenerating — the screen may still have completed.

## Flow
1. Reuse an existing Stitch project for the repo if one exists (`list_projects`); otherwise `create_project` once and note its id in the project's instruction file.
2. Generate from a brief that states: purpose, audience, key content, constraints. Keep it short — Stitch does the layout.
3. Show the user the result; iterate with `edit_screens` / `generate_variants` until approved.
4. **Conversion to code is a separate step done by us:** treat Stitch output as a visual/structural reference and write the real code to the project's coding-standards. Never commit Stitch's raw output as-is.

## Quirks (tested 2026-10-04)
- `get_screen` / `list_screens` return file `downloadUrl`s for `htmlCode` and `screenshot`; `get_screen` takes the full resource name `projects/<id>/screens/<id>`, not separate ids.
- 3D requests yield a standalone Three.js widget (~512×512, loaded from a CDN at r125), not a full page. Output can be broken — a photoreal prompt emitted `THREE.CapsuleGeometry` (r139+) against r125 and rendered blank. Check the console/render before showing it.

## Never
- Use it for realistic 3D: it writes procedural primitives, no GLTF/HDRI/textures. Use real models + the project's own Three.js (`threejs-scene`); Stitch is for 3D mood/layout only.
- Use it for implementation, logic, refactors, or anything that isn't visual exploration.
- Send proprietary client data or secrets in briefs — use placeholder copy.
- Loop on rate-limit/quota errors — fall back to the normal prototype flow at once.
