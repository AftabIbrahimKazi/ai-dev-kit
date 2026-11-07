---
name: diagram
description: Opt-in add-on. Use whenever the user asks for an architecture, stack or project-structure diagram, or a diagram for a README or website. Load this BEFORE drawing or hand-writing SVG or HTML.
---

# Diagram — Script-Drawn Stack and Structure Diagrams

**This is opt-in only, never part of any default install.** Hand-drawn diagrams put arrows through text, drift from the code and cost tokens on every redraw. This add-on has a script detect, lay out, check and render the diagram from a small spec file. Claude only supplies what a script cannot: roles, wording and confirmation of guessed links.

## Self-improvement (do this first and last)
1. **At start:** apply `learnings.md` if the `learnings-inject` mod supplied it. Do not search for it.
2. **At end:** append one dated bullet only for a new, non-obvious lesson (a layout that broke, a detection miss, a label that never fit). Most uses add nothing. Merge instead of duplicating; delete disproven bullets.

## First run (a person typing, no experience needed)
1. Check Node is installed: type `node -v` and press Enter. A version number such as `v24.12.0` means yes. If you see "not recognised", install Node from nodejs.org.
2. Open a terminal in your project folder. In VS Code, use Terminal, New Terminal.
3. Type `/diagram detect` in Claude Code, or `node <skill-root>/diagram/cli.js detect` in a terminal, and press Enter. It prints what it found and the questions left open, and writes `diagram/stack.spec.json`.
4. Type `/diagram build diagram/stack.spec.json`. It writes three files next to the spec and prints a snippet to paste into your README.
5. Open the `.html` file in a browser to look at it.
If you see "unknown flag" or "usage:", you mistyped a word; the line shows the four commands. If you see "already exists", add `--force` to replace the old file.

## The tool
`node <skill-root>/diagram/cli.js <command>` (plain Node, no dependencies, no network except `icons`).

| Command | Does |
|---|---|
| `detect [--structure]` | Reads manifests, Docker, CI, hosting config and `.env.example` names (or the folder tree and imports with `--structure`) and writes `diagram/<mode>.spec.json`. Prints the open questions. |
| `check <spec>` | Validates the spec and the layout. Exit 1 on an error; warnings are printed. |
| `build <spec>` | Writes `<name>.light.svg`, `<name>.dark.svg` and `<name>.html` next to the spec, and prints the README `<picture>` snippet. |
| `icons <name>...` | Downloads brand logos once into `.diagram/icons/`. The only command that uses the network. |

Flags: `--root D`, `--out PATH`, `--name N`, `--icons DIR`, `--tokens FILE`, `--json`, `--dry-run`, `--force`.

## Workflow
1. **Pick the mode.** "How is it built" is `detect` (stack). "How is the code laid out" is `detect --structure`. If the user describes a stack in words, skip to step 3 and write the spec.
2. **Run `detect`.** Read only the open questions it prints. Do not read the manifests yourself.
3. **Finish the spec** (format below). Change only what the script could not know: `role` captions, missing nodes, wrong or guessed edges. Set `guess` to `false` on each edge the user confirms. Ask the user to confirm guessed edges in one message; never keep a guess silently.
4. **Run `check`.** Fix every error. A label warning means shorten the label.
5. **Run `icons <slugs>` only if the user accepts a download.** It uses the network and says so first. Without logos the build draws a glyph for the node's role, or a monogram. Never recolour or redraw a logo.
6. **Run `build`.** Give the user the snippet it prints. For a website, link the `.html` or inline its `<svg>`; for a README, use the snippet.
7. **Look at the result** (headless browser screenshot or the user's browser) before calling it done.

## Spec format
```json
{ "title": "…", "description": "one sentence for screen readers",
  "nodes": [ { "id": "web", "label": "Next.js", "role": "app", "icon": "nextjs", "glyph": "folder", "group": "host" } ],
  "groups": [ { "id": "host", "label": "Vercel", "parent": "optional, one level only" } ],
  "edges": [ { "from": "user", "to": "web", "label": "HTTPS", "kind": "primary|secondary|deploy", "guess": false } ] }
```
- `role` is the caption under the label and picks the drawn glyph (`user web app api db cache queue host ci auth payments storage ai email monitor proxy tool folder`). `glyph` overrides the glyph.
- `kind`: `primary` is the main request flow, `secondary` an internal link, `deploy` a build or deploy step (dashed).
- Limits: 24 nodes, 36 characters per label, groups nest one level. Layout runs left to right by edge direction; do not set coordinates.

## Rules
- Run `detect` first. Never write coordinates or SVG by hand.
- Write `title` and `description` every time; `check` fails without them (screen readers).
- Never change a generated file by hand; change the spec and run `build` again.
- A README diagram uses the `<picture>` snippet so light and dark both work. Output colours are the generator's own tokens; pass `--tokens` to map them to a project's tokens.
- Detection reads names only. It never reads `.env` values and prints no secrets.
- A diagram of a folder structure shows what imports what; it does not show dynamic or aliased imports. Say so when it matters.

## Failure mode this prevents
A diagram that is wrong the day it is drawn, a hand-placed arrow through a label, a README image that is unreadable in dark mode, and a model spending thousands of tokens placing boxes a script places in milliseconds.
