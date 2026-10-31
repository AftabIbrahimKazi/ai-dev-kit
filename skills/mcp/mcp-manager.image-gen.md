---
name: image-gen
description: Image generation for websites and apps, plus enhance_image (ImageMagick colour grading/levels/sharpen for existing photos, no AI) and ai_edit_image (small AI edits, as an extra) — Gemini "Nano Banana", then Cloudflare FLUX.1 [schnell], switching before limits are hit, then a labelled placeholder. CLI + stdio MCP tool; tells the user about every switch and pause.
trigger: generate_image — hero/feature/illustration/icon/mockup images needed for a site or app, or any request to "make/create an image"
replaces: a text/CSS/SVG placeholder, or ask the user to supply the image
transport: stdio
command: node <skill folder>/image-gen.js mcp
setup: none to download. Keys (each optional; at least one needed): GEMINI_API_KEY (paid — see Cost), CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (free allowance)
auth: api-key — env vars above, or the project's .env (read by the script; whitelisted names only)
cost: Gemini image models need billing (free tier returned 429 on a fresh key, tested 2026-10-04); Cloudflare free 10,000 neurons/day, resets 00:00 UTC; one 1024x1024 4-step FLUX image = 57.6 neurons (4 tiles x 4.8 + 4 steps x 9.6, per Cloudflare's pricing page) = ~173 free images/day; beyond that calls fail on the free plan (paid ~US$0.0006/image)
routing-default: first for any image request; fall back silently to the placeholder
verified: 2026-10-04 — live Gemini (key valid, free tier 429 -> fallback) and live Cloudflare FLUX.1 schnell (6 images, ~2.8 s each, 1024x1024 JPEG, free); chain, caps, cooldowns, .env loading and MCP also against fake servers
---

# Image Gen — One Tool, Provider Fallback

Open models and Claude alike cannot make images. This tool calls hosted models and degrades cleanly: **Gemini → Cloudflare FLUX → placeholder**. It never blocks a task, never spends past your caps, and **reports every switch, warning, pause and placeholder** as a `NOTICE`.

## enhance_image — fix existing photos (no AI)
For client-supplied photos that need colour grading and basic editing, **use this, not generate_image**: traditional editing through ImageMagick (`magick`), so the subject is never changed or invented, it costs nothing, uses no network and has no quota. Needs ImageMagick installed (or `IMAGEMAGICK_BIN`); nothing else.
`enhance_image(input_path, preset?, brightness?, contrast?, saturation?, warmth?, gamma?, sharpen?, denoise?, max_width?, quality?, output_path?)` — also `node image-gen.js enhance <file> --preset natural --warmth 10 --denoise 5 --max-width 1600`.
- Presets: `natural` (default for dull photos), `vivid`, `warm`, `cool`, `matte`, `product-clean`, `bw`. Explicit numbers override a preset. Ranges: brightness/contrast/saturation/warmth -100..100, gamma 0.2..5, sharpen 0..5, denoise 0..20 %.
- Order applied: denoise, auto-level, gamma, brightness/contrast, warmth, saturation, resize (downscale only), sharpen. Output is `<name>-enhanced.<ext>` next to the original, which is never overwritten. JPEG quality 92 by default; EXIF rotation is applied.
- Compare with the original and re-run with adjusted numbers. It cannot add detail to a low-resolution photo (no AI upscaling).

## ai_edit_image — small AI edits, only when traditional editing can't
`ai_edit_image(input_path, prompt, strength?, output_path?)` — also `node image-gen.js ai-edit <file> "remove the blue cast from the background" [--strength 0.35] [--out f]`. Sends the photo plus your instruction to Gemini "Nano Banana"; if Gemini is unavailable it falls back to Cloudflare Stable Diffusion 1.5 img2img (`strength` applies only there). Same keys, daily caps, 80%/90% rules and cooldowns as generate_image, shared counters. Writes `<name>-ai-edit.<ext>` beside the original, which is never overwritten.
- **Order of preference for client photos: `enhance_image` first.** Use this only for things sliders cannot do (local colour casts, dim backgrounds, small cleanups), with a specific, minimal prompt. The wrapper already tells the model to keep subject, faces, products, text and logos unchanged.
- It re-renders the whole image, so details can drift and resolution may change. **Always compare with the original and tell the user it was AI-edited.** The Cloudflare fallback is weaker (SD 1.5, lower resolution) and its notice says so.
- Unlike generate_image it never returns a placeholder: if no provider works it errors, the original stays untouched, and the message points to `enhance_image`.
- Prompts and the photo go to Google/Cloudflare: do not send confidential or personal photos without the user's OK.
- Verified 2026-10-31 against fake servers only (request shape, fallback, notices, MCP listing); live calls could not run because the stored Gemini and Cloudflare keys returned 401.

## Tool (generate_image)
`generate_image(prompt, style?, aspect?, output_path?)` (~3 s via Cloudflare) — also `node image-gen.js generate "<prompt>" [--style s] [--aspect 16:9] [--out file]`. Returns the saved path, which provider made it, and which providers were skipped and why. The file extension is corrected to the real format (Cloudflare returns JPEG).
- `style` presets: `saas-illustration`, `isometric`, `business-photo`, `icon-3d`, `product-mockup` — a look is appended to your prompt. For plain gradients use CSS, not an image.
- `aspect`: 1:1, 16:9 (default), 9:16, 4:3, 3:4, 3:2, 2:3 — Gemini only; Cloudflare returns 1024×1024 (crop in CSS with `object-fit`).

## Staying out of the limit trap (what happens, in order)
1. **Heads-up at 80%** of a provider's daily cap: a notice, nothing changes.
2. **Switch at 90%** (`IMAGE_SOFT_LIMIT_PCT`): the provider is skipped *before* it can fail or bill past the cap, and the next one is used (notice names the counts).
3. **Quota/auth error** (429/401/403): that provider is paused until Google/Cloudflare's retry time (else 1 h) and the next one is used (notice).
4. **All providers at their limits:** image generation is **paused until 00:00 UTC** (05:30 IST). No provider is called again until then; every request gets a placeholder and a notice.
5. **Placeholder:** a labelled image from placehold.co at the right aspect size (`Placeholder: <your prompt>`), or a local SVG if the web is unreachable. Always marked `PLACEHOLDER (not a generated image)`.
`node image-gen.js reset` ends a pause/cooldown early (e.g. after enabling billing). All notices are also appended to `~/.ai-dev-kit/image-gen/notices.log`. The counter only counts this tool's images — other Workers AI/Gemini usage on the same account is not seen.

## Provider chain and limits
- `IMAGE_PROVIDERS` (default `gemini,cloudflare`) sets the order. A provider is skipped when its key is missing, its **daily cap** is reached (`GEMINI_DAILY_CAP` default 10, `CLOUDFLARE_DAILY_CAP` default 150), or it is **cooling down** after a 401/403/429 (honours Google's `retryDelay`, else 1 h).
- `node image-gen.js status` shows keys, usage today and cooldowns; `node image-gen.js reset` clears cooldowns — run it after enabling billing. Usage and cooldowns live in `~/.ai-dev-kit/image-gen/usage.json`.
- `GEMINI_IMAGE_MODEL` (default `gemini-3.1-flash-image`, "Nano Banana 2"). Other ids from the live list: `gemini-2.5-flash-image`, `gemini-3-pro-image`, `gemini-3.1-flash-lite-image`. Confirm with `GET /v1beta/models` — ids change.

## Rules
- Describe subject and setting; never ask for exact text, logos or real people's likenesses. Generate once and show the path; do not loop regenerating.
- Tell the user which provider produced the image. FLUX output is strong but not final: in testing faces and hands were good, but it can invent gibberish text on signs/screens (an isometric diagram showed "Tune") and real brand logos (an Apple logo on a laptop). Tell the user to check for both before shipping.
- **Relay every NOTICE to the user in your reply, in plain words, in the same message as the result** — each switch, heads-up, pause and placeholder. Never hide or summarise away a pause or a placeholder.
- A placeholder is final until the user acts: do not retry, do not try other image tools, do not describe it as a generated image. Remind the user to replace it before shipping and when generation resumes.
- Prompts go to Google/Cloudflare: no secrets, client-confidential or personal data.
- Cost: with Gemini billing on, each image costs money (third-party figure ~US$0.04). The default cap of 10/day bounds spend; lower it with `GEMINI_DAILY_CAP`.

## Setup for the user (interview step)
1. Cloudflare (free): create an account at dash.cloudflare.com → AI → Workers AI → "Use REST API" → create an API token **from the Workers AI template** (a token with only Images/Stream permissions verifies but fails with 401 code 10000) and copy the Account ID. Tokens may expire (a 7-day default was seen) — set a longer expiry.
2. Gemini (paid): aistudio.google.com/apikey → create a key; image models need billing on that project.
3. Put the values in the project's `.env` (`GEMINI_API_KEY=`, `CLOUDFLARE_ACCOUNT_ID=`, `CLOUDFLARE_API_TOKEN=`); never in config files. Claude Code/OpenCode do not read `.env`, but this script does.

## Credits and terms
- Gemini "Nano Banana" — Google — Gemini API terms apply. Cloudflare Workers AI — Cloudflare terms apply.
- FLUX.1 [schnell] — Black Forest Labs — Apache-2.0 (hosted by Cloudflare as `@cf/black-forest-labs/flux-1-schnell`).
- Placeholders — placehold.co (third-party service, fetched at runtime; local SVG fallback). Full list: [CREDITS.md](../../CREDITS.md).
