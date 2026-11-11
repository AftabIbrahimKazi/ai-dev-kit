---
name: figma-code
description: Opt-in add-on. Use whenever the user wants an exported Figma SVG turned into HTML and CSS, or a page checked pixel for pixel against a design export. Load this BEFORE writing markup or CSS from a design by hand.
---

# Figma Code: Exported SVG to Pixel-Matched HTML, No Model in the Loop

**This is opt-in only, never part of any default install.** Writing markup from a design by eye costs tokens and drifts a few pixels at a time. This add-on reads the SVG, writes the HTML and CSS itself, and proves the result with a pixel diff against the SVG rendered in a headless browser. Claude does not draw or tune layout; it runs the script and reports what the diff says.

## Self-improvement (do this first and last)
1. **At start:** apply `learnings.md` if the `learnings-inject` mod supplied it. Do not search for it.
2. **At end:** append one dated bullet only for a new, non-obvious lesson (an SVG shape that needed a fallback, a font whose metrics were wrong, a rule that always reverted). Most uses add nothing. Merge instead of duplicating; delete disproven bullets.

## First run (a person typing, no experience needed)
1. Check Node is installed: type `node -v` and press Enter. A version number such as `v24.12.0` means yes. If you see "not recognised", install Node from nodejs.org. You also need Chrome or Edge.
2. In Figma, select the frame. In the right panel, under Export, choose **SVG**, open its settings and **uncheck "Outline text"** (otherwise text becomes drawings and cannot become real text). Export it, and also export the same frame as PNG if you want a picture to look at.
3. **Give Claude the file's path in the message; never attach or paste the SVG.** An attached file is pasted into the prompt as text, and a real Figma page export is often 5 to 15 MB (embedded images), which the chat rejects with "Prompt is too long" before any script runs. The script reads the file itself and no model ever sees it. Put the SVG in your project, for example `design/home.svg`. Open a terminal in the project folder (in VS Code: Terminal, New Terminal).
4. Type `/figma-code build design/home.svg --download-fonts` in Claude Code, or `node <skill-root>/figma-code/cli.js build design/home.svg --download-fonts` in a terminal, and press Enter. Put the path in double quotes if it has spaces. `--download-fonts` fetches the fonts the design uses from Google Fonts (it says which first) and saves them in the output folder; leave it off and nothing touches the network. It writes a folder `figma-code-out/home/` with `index.html`, `styles.css` and `assets/` and prints how many pixels differ from the SVG. `PASS` means the page matches.
5. Open `figma-code-out/home/index.html` in a browser to look at it.
If you see "FONTS NOT AVAILABLE", the design uses a font this machine does not have, and a missing font looks like a layout bug in the diff: run again with `--download-fonts`, or give your own `.ttf` or `.otf` files with `--fonts "C:\my\fonts"`. An SVG never contains font files, only their names. If you see "NOT FOUND on Google Fonts", the font is a custom one: ask the designer for the files. If you see "no Chrome or Edge found", install one or set the `CHROME` environment variable to the browser file. If you see "usage:", you mistyped a word; the line lists the five commands.

**With the project-context add-on:** put the SVG in `project-context/design/` (and any custom font files in `project-context/design/fonts/`) and type just `/figma-code build --download-fonts`. It uses the only SVG there, tells you it assumed it, reads that fonts folder, and after the build writes one row per frame into `project-context/design/figma-code.md` (diff, text lines, inline layers, missing fonts, output folder) so a later session sees the state without opening the output. The generated code never goes into that private folder. `--no-record` skips the row.

## The tool
`node <skill-root>/figma-code/cli.js <command>` (plain Node, no dependencies, no network).

| Command | Does |
|---|---|
| `detect` | Shows the browser, Node version, framework found in the project and the SVG files near you. |
| `build <file.svg>` | Writes `index.html`, `styles.css`, `meta.json`, `reference.png` (the SVG rendered) and `render.png` (your page rendered) into `--out` (default `figma-code-out/<name>/`), then diffs them. |
| `diff <a> <b>` | Diffs two PNG, HTML or SVG files (give `--width` and `--height` for HTML and SVG). |
| `standards <dir>` | Applies the rules in `standards.json` to a build folder, re-rendering after the risky ones and reverting any that move the diff. |
| `adapt <dir>` | Writes a component for the project's framework and diffs it again. |

Flags: `--download-fonts` (fetch the design's fonts from Google Fonts into `assets/`; the only network use), `--fonts DIR` (your own `.ttf` and `.otf` files; `.woff` and `.woff2` are skipped), `--photo-tol N` (tolerance inside photo boxes, default 48), `--no-record` (do not write the project-context row), `--max-diff P` (percent of pixels allowed to differ, default 1), `--tol N` (per-channel difference counted as a difference, default 16 of 255), `--name N`, `--out DIR`, `--rules FILE`, `--root D`, `--framework next|astro|laravel|plain`, `--dry-run`, `--force`, `--no-fail` (exit 0 even on a failed gate, for slash commands), `--json`.
Exit codes: 0 done, 1 the diff is over the limit, 2 bad usage, 3 no browser.

## What `build` does (and what it will not guess)
- **Real HTML text.** Each text line is a positioned `<span>` using the font's ascent and descent, so the baseline lands where the SVG puts it. Ascent, descent and whether the font is present are measured in the same browser that draws the diff, for every family, weight and style the design uses (a built-in table of common fonts is only the fallback). A family that is neither installed nor supplied is reported first, with the command that fixes it.
- **Fonts.** With `--download-fonts` or `--fonts`, the files are copied to `assets/`, written into `styles.css` as `@font-face` (self-hosted, no CDN), and also loaded when the reference SVG is drawn, so the diff does not depend on what is installed. A family not found on Google Fonts is retried once as "<name> Pro"; the CSS keeps the name the design uses.
- **Photos.** A Figma image fill (a rect painted by a pattern holding one embedded image) becomes a box with the image saved in `assets/` and placed by CSS `background-size` and `background-position` from the pattern's matrix. Browsers resample photos differently in SVG and CSS, so photo boxes are diffed at a looser tolerance (`--photo-tol`); everything else is strict. Rotated photos stay inline SVG.
- **Boxes and circles** become divs with the exact size, fill and radius. A box inside another box becomes its child when that cannot change what paints on top of what.
- **Flex rows and columns** are written only where neighbouring boxes share a top (or a left edge) and one equal gap, so the flex layout reproduces the SVG geometry exactly. Anything else stays absolutely positioned.
- **Inline SVG** is used, and reported, for what CSS cannot draw exactly: gradients, paths, strokes (SVG centers a stroke on the edge, CSS borders do not), filters, masks, images, rotations and odd clips. The result is still pixel-exact; it is just not a div.
- **An SVG with no text nodes** gets a note to export again with "Outline text" unchecked.

## Workflow
1. **Run `build`.** Give the path, never attach the file. If the design is in `project-context/design/`, name no file. Add `--download-fonts` unless the user declined the network. Read the report only: fonts first, then the diff and its worst regions. Do not open the generated files unless a region needs explaining.
2. **A failing gate** is fixed in this order: install a missing font, re-export with "Outline text" unchecked, then look at the named region in `reference.png` against `render.png` (one image at a time). Never edit the diff limit to pass.
3. **Run `standards`** to apply the project's naming and value rules. Safe rules (class names, short hex) are applied as one batch; a risky rule (px to rem, rounding) is applied alone and reverted if the diff moves. Report which rules applied and which were reverted.
4. **Run `adapt`** when the project uses Next, Astro or Laravel. It refuses to overwrite a file without `--force`. Use `--dry-run` first when unsure which folder it will write to.
5. Give the user the component path and the final diff. State the limits below.

## Setup (when the user asks for this add-on)
- `install-kit` copies the skill and its scripts; nothing runs on its own.
- **The standards layer is edited by AI once, during setup.** Claude reads the project's standards (`coding-standards/`, `CLAUDE.md`, the class naming already used in the code) and edits `<skill-root>/figma-code/standards.json` to match: the class scheme (`bem`, `kebab` or `prefix` with the project's prefix), the optional `colors-to-tokens` rule pointed at the project's token file, and which risky rules stay enabled. Tell the user this before doing it. If they decline, the default file ships unchanged and still works.
- Every rule must carry `"kind": "safe"` (a rename or move, cannot change a pixel) or `"kind": "risky"` (changes a value or unit). Never tag a value change as safe.

## Limits to tell the user
- Pixel match is guaranteed only at the exported width. Between widths the page behaves by the kit's responsive rules and is untested unless more widths are exported and diffed.
- The diff needs the same font files as the design. A different font looks like a layout error.
- The pixel gate catches differences you can see. It does not prove the markup is semantic or accessible; run `/audit` on the result.
- `standards` runs on the build folder and `adapt` after it, so class names in the component are already renamed.

## Review checklist
- [ ] Fonts reported first, before the diff
- [ ] The gate was not loosened to pass
- [ ] Inline SVG layers and assumed font metrics were reported, not hidden
- [ ] Nothing written outside `--out` and the framework folders the report names
- [ ] The user was told the limits above
