---
name: local-media
description: Local free image reading (Qwen3-VL-2B) and SaaS/business-style image generation (SD-Turbo with style presets) via one stdio MCP server — for models that cannot read or create images.
trigger: describe_image — read/OCR/inspect an image when the active model has no vision; generate_image — draft/placeholder/concept images for websites and apps
replaces: describe_image → skip the image, or ask the user to describe it; generate_image → no image (text/CSS/SVG placeholder)
transport: stdio
command: node <skill folder>/local-media.js mcp
setup: node <skill folder>/local-media.js setup [vision|image|all] --accept-license   (~3.7 GB: vision ~1.6 GB, SD-Turbo ~2.0 GB, runtimes ~50 MB; `--image-model sdxs` = ~2.3 GB total, no licence step)
auth: none
cost: free, offline; GPU optional
routing-default: generate_image first; describe_image first only when the model lacks vision (OpenCode open models), else explicit
verified: 2026-10-04 (run end to end on Ryzen 7 7730U, 13.8 GB RAM, no discrete GPU)
---

# Local Media — Eyes and a Sketchpad for Any Model

Open models in OpenCode cannot read or write images. This server adds both, offline and free. Claude can already read images, so `describe_image` mainly saves Claude's image tokens; `generate_image` gives Claude a capability it lacks.

## Tools
- `describe_image(image_path, prompt?)` — Qwen3-VL-2B (Q4_K_M). First call starts the model (~5 s extra); then ~7–12 s. Reads UI text well, with occasional character slips ("METROS" for "METRICS") — treat exact strings and numbers as unverified.
- `generate_image(prompt, style?, quality?, output_path?, width?, height?, seed?)` — SD-Turbo + TAESD decoder, 512×512 (256–768, multiples of 64). `quality: fast` = 2 steps, ~17 s on CPU (default); `best` = 4 steps, ~26 s. Draft quality for websites and apps. Text inside images is unreliable — add real text in HTML/CSS.

## Style presets (`style`) — what each is for
| Preset | Use for | Result in testing |
|---|---|---|
| `saas-illustration` | hero/feature illustrations | clean flat-vector people-and-dashboard scenes; usable |
| `business-photo` | team/office stock-style photos | realistic, good light; faces fine at 512 |
| `icon-3d` | feature icons, badges | clean glossy icon; usable |
| `product-mockup` | laptop/device-with-dashboard shots | convincing product shot; screen content is generic |
| `isometric` | infrastructure/data diagrams | decent, can be busy |
| `gradient-bg` | hero backgrounds | cloudy, not a clean gradient — use CSS gradients instead |
The preset text is appended to your prompt; keep the prompt to subject and setting ("a team around an analytics dashboard").

## Hardware-aware setup
`node local-media.js preflight` detects CPU threads, RAM, free disk and GPU, then plans: **cuda** (NVIDIA ≥4 GB VRAM, Windows), **vulkan** (discrete AMD/Intel GPU), **metal** (Apple Silicon), else **cpu**. Vision tier is 2B by default and 4B on GPUs with ≥6 GB (or 16 GB Apple). `setup` re-checks, refuses on `blocked` (disk <1.2× need, RAM <4 GB, unmapped OS) unless `--force`, and swaps a GPU build that fails its self-test for the CPU build. Override with `--backend`/`--tier`/`--image-model`.
- **Licence step:** SD-Turbo needs `--accept-license` (Stability AI Community License). Show the user the terms below and get their yes before passing it.
- **Tested:** CPU, and the Vulkan download/extract/self-test on this machine. On this AMD iGPU Vulkan was *not* faster (image 10 s vs 6 s, vision 5.5 s vs 6.3 s), which is why integrated GPUs plan as CPU.
- **Not tested (no hardware):** CUDA, Metal, discrete-GPU Vulkan, Linux/macOS. Treat their speed claims as expectations.

## Why these models (measured on this CPU, 512²)
| Candidate | Time | Verdict |
|---|---|---|
| SDXS-512, 1 step | 6 s | fast but "painting"-like; fine for icons/isometric drafts, weak on illustration and scenes; `--image-model sdxs` |
| SD-Turbo, 4 steps, full VAE | 45 s | best look, decoder alone 20 s |
| **SD-Turbo, 4 steps, TAESD** | 26 s | same look as full VAE, 42% faster; `quality: best` |
| **SD-Turbo, 2 steps, TAESD** | 14–17 s | **default** — slightly softer, still business-usable |
Larger vision (Qwen3-VL-4B, Q4 2.5 GB) is the upgrade path if 2B misreads too much.

## Rules
- Pass a `style` whenever the image is for a website or app; keep prompts concrete (subject, setting). Generate once at 512 and let the user ask for more; never loop regenerating.
- Always tell the user the output path and that it is a draft; never claim final-quality art. Never render exact text, logos, or real people's likenesses.
- `describe_image`: ask a specific question ("list every button label") rather than "describe".
- Memory: vision uses ~2 GB while loaded and unloads after 10 idle minutes (`MEDIA_IDLE_SECONDS`). `node local-media.js stop` frees it at once.
- On any failure (not set up, timeout, bad file) fall back per `replaces`; never block.

## Credits and licences (keep when redistributing or mirroring)
- Qwen3-VL-2B-Instruct (GGUF) — Qwen Team, Alibaba Cloud — Apache-2.0 — huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF
- llama.cpp — ggml-org — MIT — github.com/ggml-org/llama.cpp (pinned b11390)
- stable-diffusion.cpp — leejet — MIT — github.com/leejet/stable-diffusion.cpp (pinned master-929-3f8527a)
- SD-Turbo — Stability AI — **Stability AI Community License (5 Jul 2024)**: free for research, non-commercial and commercial use by individuals/organisations under US$1M annual revenue; above that an Enterprise licence is required; attribution/notice terms apply when distributing — read https://stability.ai/license. GGUF conversion: Green-Sky/SD-Turbo-GGUF
- TAESD — Ollin Boer Bohan (madebyollin/taesd) — MIT
- SDXS-512-0.9 (optional) — Yuda Song, Zehao Sun, Xuanwu Yin (IDKiro/sdxs) — CreativeML OpenRAIL++ (use-based restrictions apply) — GGUF by concedo/sdxs-512-tinySDdistilled-GGUF
