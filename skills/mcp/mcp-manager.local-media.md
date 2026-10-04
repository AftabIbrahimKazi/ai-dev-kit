---
name: local-media
description: Local free image reading and image generation (Qwen3-VL-2B vision, SDXS fast diffusion) via one stdio MCP server — for models that cannot read or create images.
trigger: describe_image — read/OCR/inspect an image when the active model has no vision; generate_image — draft/placeholder/concept images
replaces: describe_image → skip the image, or ask the user to describe it; generate_image → no image (text/CSS/SVG placeholder)
transport: stdio
command: node <skill folder>/local-media.js mcp
setup: node <skill folder>/local-media.js setup [vision|image|all]   (~2.3 GB total: vision ~1.6 GB, image ~0.7 GB, plus ~50 MB runtimes)
auth: none
cost: free, offline, CPU-only
routing-default: generate_image first; describe_image first only when the model lacks vision (OpenCode open models), else explicit
verified: 2026-10-04 (run end to end on Ryzen 7 7730U, 13.8 GB RAM, no discrete GPU)
---

# Local Media — Eyes and a Sketchpad for Any Model

Open models in OpenCode cannot read or write images. This server adds both, offline and free. Claude can already read images, so `describe_image` mainly saves Claude's image tokens; `generate_image` gives Claude a capability it lacks.

## Tools
- `describe_image(image_path, prompt?)` — Qwen3-VL-2B (Q4_K_M). First call starts the model (~5 s extra); then ~7–12 s. Reads UI text well, with occasional character slips ("METROS" for "METRICS") — treat exact strings and numbers as unverified.
- `generate_image(prompt, output_path?, width?, height?, seed?)` — SDXS-512, 1 step. ~6 s at 512×512 (256–768, multiples of 64). Draft quality: mockups, concepts, placeholders. No negative prompt, no faces/text fidelity.

## Why these models (measured on this CPU)
| Candidate | Time (512²) | Verdict |
|---|---|---|
| SDXS-512 (Q8) | 6 s | **chosen** — speed first, decent quality |
| SD-Turbo, 1 step | 28 s | slower; decoder alone 21 s |
| SD-Turbo, 4 steps | 45 s | better light and composition, 7× slower; rejected on speed |
| Vulkan build | no gain | the AMD iGPU was not used |
Larger vision (Qwen3-VL-4B, Q4 2.5 GB) is the upgrade path if 2B misreads too much; it fits in RAM but is slower.

## Rules
- Keep prompts for `generate_image` concrete (subject, setting, light, style). Generate at 512 and let the user ask for more; never loop regenerating.
- Always tell the user the output path; never claim photoreal or final-quality art.
- `describe_image`: ask a specific question ("list every button label") rather than "describe".
- Memory: vision uses ~2 GB while loaded and unloads after 10 idle minutes (`MEDIA_IDLE_SECONDS`). `node local-media.js stop` frees it at once.
- On any failure (not set up, timeout, bad file) fall back per `replaces`; never block.

## Credits and licences (keep when redistributing or mirroring)
- Qwen3-VL-2B-Instruct (GGUF) — Qwen Team, Alibaba Cloud — Apache-2.0 — huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF
- llama.cpp — ggml-org — MIT — github.com/ggml-org/llama.cpp (pinned b11390)
- stable-diffusion.cpp — leejet — MIT — github.com/leejet/stable-diffusion.cpp (pinned master-929-3f8527a)
- SDXS-512-0.9 — Yuda Song, Zehao Sun, Xuanwu Yin (IDKiro/sdxs) — CreativeML OpenRAIL++ (use-based restrictions apply; read it before commercial use) — GGUF by concedo/sdxs-512-tinySDdistilled-GGUF
