---
name: image-gen
description: Image generation for websites and apps — Gemini "Nano Banana" first, Cloudflare Workers AI FLUX.1 [schnell] as the free fallback, then a placeholder. One CLI, also a stdio MCP tool, with daily caps.
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

Open models and Claude alike cannot make images. This tool calls hosted models and degrades cleanly: **Gemini → Cloudflare FLUX → placeholder**. It never blocks a task.

## Tool
`generate_image(prompt, style?, aspect?, output_path?)` (~3 s via Cloudflare) — also `node image-gen.js generate "<prompt>" [--style s] [--aspect 16:9] [--out file]`. Returns the saved path, which provider made it, and which providers were skipped and why. The file extension is corrected to the real format (Cloudflare returns JPEG).
- `style` presets: `saas-illustration`, `isometric`, `business-photo`, `icon-3d`, `product-mockup` — a look is appended to your prompt. For plain gradients use CSS, not an image.
- `aspect`: 1:1, 16:9 (default), 9:16, 4:3, 3:4, 3:2, 2:3 — Gemini only; Cloudflare returns 1024×1024 (crop in CSS with `object-fit`).

## Provider chain and limits
- `IMAGE_PROVIDERS` (default `gemini,cloudflare`) sets the order. A provider is skipped when its key is missing, its **daily cap** is reached (`GEMINI_DAILY_CAP` default 10, `CLOUDFLARE_DAILY_CAP` default 150), or it is **cooling down** after a 401/403/429 (honours Google's `retryDelay`, else 1 h).
- `node image-gen.js status` shows keys, usage today and cooldowns; `node image-gen.js reset` clears cooldowns — run it after enabling billing. Usage and cooldowns live in `~/.ai-dev-kit/image-gen/usage.json`.
- `GEMINI_IMAGE_MODEL` (default `gemini-3.1-flash-image`, "Nano Banana 2"). Other ids from the live list: `gemini-2.5-flash-image`, `gemini-3-pro-image`, `gemini-3.1-flash-lite-image`. Confirm with `GET /v1beta/models` — ids change.

## Rules
- Describe subject and setting; never ask for exact text, logos or real people's likenesses. Generate once and show the path; do not loop regenerating.
- Tell the user which provider produced the image. FLUX output is strong but not final: in testing faces and hands were good, but it can invent gibberish text on signs/screens (an isometric diagram showed "Tune") and real brand logos (an Apple logo on a laptop). Tell the user to check for both before shipping.
- On "no image produced", use the placeholder and say that keys/quota are the cause. Never retry in a loop.
- Prompts go to Google/Cloudflare: no secrets, client-confidential or personal data.
- Cost: with Gemini billing on, each image costs money (third-party figure ~US$0.04). The default cap of 10/day bounds spend; lower it with `GEMINI_DAILY_CAP`.

## Setup for the user (interview step)
1. Cloudflare (free): create an account at dash.cloudflare.com → AI → Workers AI → "Use REST API" → create an API token **from the Workers AI template** (a token with only Images/Stream permissions verifies but fails with 401 code 10000) and copy the Account ID. Tokens may expire (a 7-day default was seen) — set a longer expiry.
2. Gemini (paid): aistudio.google.com/apikey → create a key; image models need billing on that project.
3. Put the values in the project's `.env` (`GEMINI_API_KEY=`, `CLOUDFLARE_ACCOUNT_ID=`, `CLOUDFLARE_API_TOKEN=`); never in config files. Claude Code/OpenCode do not read `.env`, but this script does.

## Credits and terms
- Gemini "Nano Banana" — Google — Gemini API terms apply. Cloudflare Workers AI — Cloudflare terms apply.
- FLUX.1 [schnell] — Black Forest Labs — Apache-2.0 (hosted by Cloudflare as `@cf/black-forest-labs/flux-1-schnell`).
