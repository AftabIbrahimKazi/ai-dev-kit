---
name: image-gen
description: Image generation for sites and apps through the free router, plus enhance_image (ImageMagick colour grading and sharpen, no AI). Falls back to a labelled placeholder. CLI and stdio MCP tool.
trigger: generate_image — hero/feature/illustration/icon/mockup images needed for a site or app, or any request to "make/create an image"
replaces: a text/CSS/SVG placeholder, or ask the user to supply the image
transport: stdio
command: node <skill folder>/image-gen.js mcp
setup: none to download. Needs UNIFIED_API_KEY and "image": ["unified"] in .claude/ai-backends.json (install-kit asks)
auth: api-key — UNIFIED_API_KEY from the environment, the project's .env or ~/.ai-dev-kit/.env (whitelisted names only)
cost: free router, no per-image charge; it picks the model and handles its own quota
routing-default: first for any image request; fall back silently to the placeholder
verified: 2026-11-27 — live router: 1024x1024 JPEG in about 2 s through Cloudflare FLUX.1 schnell; no image-edit endpoint (404); chain, cooldown and MCP against a fake router
---

# Image Gen — One Tool, Free Router

Open models and Claude alike cannot make images. This tool asks the free router, which picks the model, and degrades to a placeholder. It never blocks a task and **reports every pause and placeholder** as a `NOTICE`.

## enhance_image — fix existing photos (no AI)
For client-supplied photos that need colour grading and basic editing, **use this, not generate_image**: traditional editing through ImageMagick (`magick`), so the subject is never changed or invented, it costs nothing, uses no network and has no quota. Needs ImageMagick installed (or `IMAGEMAGICK_BIN`); nothing else.
`enhance_image(input_path, preset?, brightness?, contrast?, saturation?, warmth?, gamma?, sharpen?, denoise?, max_width?, quality?, output_path?)` — also `node image-gen.js enhance <file> --preset natural --warmth 10 --denoise 5 --max-width 1600`.
- Presets: `natural` (default for dull photos), `vivid`, `warm`, `cool`, `matte`, `product-clean`, `bw`. Explicit numbers override a preset. Ranges: brightness/contrast/saturation/warmth -100..100, gamma 0.2..5, sharpen 0..5, denoise 0..20 %.
- Order applied: denoise, auto-level, gamma, brightness/contrast, warmth, saturation, resize (downscale only), sharpen. Output is `<name>-enhanced.<ext>` next to the original, which is never overwritten. JPEG quality 92 by default; EXIF rotation is applied.
- Compare with the original and re-run with adjusted numbers. It cannot add detail to a low-resolution photo. There is no AI edit tool: the router has no image-edit endpoint.

## Tool (generate_image)
`generate_image(prompt, style?, aspect?, output_path?)` (about 3 s) — also `node image-gen.js generate "<prompt>" [--style s] [--aspect 16:9] [--out file]`. Returns the saved path and who made it, plus any notices.
- `style` presets: `saas-illustration`, `isometric`, `business-photo`, `icon-3d`, `product-mockup` — a look is appended to your prompt. For plain gradients use CSS, not an image.
- `aspect`: 1:1, 16:9 (default), 9:16, 4:3, 3:4, 3:2, 2:3 — a hint; the model may return its own size (crop in CSS with `object-fit`).

## When you get a placeholder
A labelled placeholder (placehold.co, or a local SVG offline), always marked `PLACEHOLDER (not a generated image)`, replaces the image when: the project has not allowed the router, there is no key, a 429/401/403 paused the router for an hour, or any other failure (temporary, not paused). `node image-gen.js status` shows allowed, key, today's count and the pause; `reset` ends a pause early. Notices are also appended to `~/.ai-dev-kit/image-gen/notices.log`.

## Rules
- Describe subject and setting; never ask for exact text, logos or real people's likenesses. Generate once and show the path; do not loop regenerating.
- Tell the user who made the image. The model is strong but not final: it can invent gibberish text on signs and screens and real brand logos.
- **Relay every NOTICE to the user in your reply, in plain words, in the same message as the result.** Never hide a pause or a placeholder.
- A placeholder is final until the user acts: do not retry, do not try other image tools, do not describe it as generated. Remind the user to replace it before shipping.
- Prompts go to the router and the model provider behind it: no secrets, client-confidential or personal data.

## Setup for the user
Put `UNIFIED_API_KEY=` in `~/.ai-dev-kit/.env` (or the project's `.env`; never in config files) and tick the Unified API for images in install-kit, or add `"image": ["unified"]` to `.claude/ai-backends.json`.

## Credits and terms
FLUX.1 [schnell] — Black Forest Labs — Apache-2.0, served by the router through Cloudflare Workers AI. Placeholders — placehold.co (third-party, fetched at runtime; local SVG fallback). Full list: [CREDITS.md](../../CREDITS.md).
