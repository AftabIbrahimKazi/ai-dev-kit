---
name: optimize-assets
description: Converting, compressing, shrinking or optimizing images, video, fonts or SVG; webp/avif. Load BEFORE converting any asset.
---

# Optimize Assets — Convert and Compress Without Losing the Original

Heavy assets cost page weight, repo size and, for images an AI model reads, tokens. This skill finds them, converts or compresses them with the converters the machine already has, and leaves every original in place until the user decides.

## Self-improvement (do this first and last)
1. **At start:** apply `learnings.md` if the `learnings-inject` mod supplied it. Do not search for it.
2. **At end:** append one dated bullet only for a new, non-obvious lesson (a quality setting that looked wrong, or a converter that failed on a file type). Most uses add nothing. Merge instead of duplicating; delete disproven bullets.

## The tool
`node <skill-root>/optimize-assets/convert.js <command>`. Plain Node; it drives sharp, ImageMagick, ffmpeg, svgo, woff2_compress and oxipng when they are installed. It never edits or deletes an original.

| Command | Does |
|---|---|
| `tools` | Shows which converters are installed. Run it first. |
| `scan [dir]` | Lists heavy (`--min-kb`, default 200), oversized (`--wide`, default 2560 px) and legacy assets, with a suggested target. |
| `convert <paths> --to <fmt>` | Changes format: `webp`, `avif`, `jpg`, `png`, `svg`, `mp4`, `webm`, `mp3`, `opus`, `woff2`. A comma list (`--to webp,avif`) writes both. |
| `compress <paths>` | Same format, smaller file. `--lossless` sends PNG through oxipng. |
| `precompress <paths>` | Writes `.gz` and `.br` copies of css, js, html, svg, json, wasm and fonts. No converter needed. |
| `refs <assets>` | Lists the files and lines that mention each asset. |

Options: `--quality N` (default 80), `--max-edge N` (longest side), `--crf N` (video), `--out DIR`, `--force`, `--keep-larger`, `--dry-run`, `--engine NAME`, `--preset vision|web`.

## Steps
1. Run `tools`. If the converter for the job is missing, say which one to install and stop. Do not substitute a different format silently.
2. Run `scan` on the folder. Show the table, then ask which assets and which target. Do not convert by guess.
3. Run with `--dry-run` first when the batch is more than 20 files. Show the plan in one line.
4. Convert or compress. Report the table: file, before KB, after KB, status.
5. Run `refs` on each converted asset. Update references only after the user approves, and only the lines `refs` listed. Never delete an original unless the user asks.

## Rules
1. **Pick the target by use.**
   - Web photos: `--to webp,avif`, with a `<picture>` fallback to the original. AVIF encodes slowly and needs sharp, or ImageMagick built with libheif.
   - Screenshots and images for an AI model: `--preset vision` (JPEG, 1568 px longest side, quality 80; `claude` is an alias, and other models have their own limits). Image tokens scale with pixel count, so a smaller image costs fewer tokens.
   - Animated GIF: `--to mp4` (or `webm`). The tool refuses image targets for a GIF, because they keep one frame. `--first-frame` overrides that on purpose.
   - Transparency: never `--to jpg` for a PNG that may have transparency. Use webp or avif.
2. **A result that is not smaller is dropped.** The tool deletes it and reports `kept-original`. Keep it only with `--keep-larger`, for example when a format is required.
3. **Lossy is lossy.** `compress` on JPEG, WebP and AVIF re-encodes. Do not run it twice on the same file. Prefer `convert` from the original source.
4. **SVG and fonts:** SVG goes through svgo, fonts through `--to woff2`. Subsetting fonts is out of scope; name it as a follow-up.
5. **`precompress` is for a static host** that serves `.br` or `.gz` by `Accept-Encoding`. Say that the host configuration is a separate step; do not edit server config unasked.
6. **Report only measured numbers.** Sizes come from the tool's output. Do not estimate savings before a run.

## Failure mode this prevents
A converter run that overwrites a source file, flattens an animated GIF to one frame, turns a transparent PNG into a black-background JPEG, ships a larger "optimized" file, or leaves markup pointing at files that no longer exist.
