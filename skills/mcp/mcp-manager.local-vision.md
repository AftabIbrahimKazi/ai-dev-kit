---
name: local-vision
description: Free offline image reading (Qwen3-VL via llama.cpp) as a stdio MCP tool — gives models without vision (OpenCode open models) eyes on screenshots, diagrams and photos.
trigger: describe_image — read/OCR/inspect an image when the active model has no vision
replaces: skip the image, or ask the user to describe it
transport: stdio
command: node <skill folder>/local-vision.js mcp
setup: node <skill folder>/local-vision.js setup   (~1.6 GB for the 2B model, ~3 GB for 4B on GPUs with 6+ GB; plus ~20-650 MB runtime)
auth: none
cost: free, offline; GPU optional
routing-default: first when the model lacks vision; explicit for Claude (it already reads images)
verified: 2026-10-04 (run end to end on Ryzen 7 7730U, 13.8 GB RAM, no discrete GPU)
---

# Local Vision — Eyes for Models That Have None

Open models in OpenCode cannot read images. This server adds sight, offline and free. Claude already reads images, so use it for Claude only to save image tokens.

## Tool
`describe_image(image_path, prompt?)` — Qwen3-VL-2B (Q4_K_M). First call starts the model (~5 s extra); then ~7–12 s on CPU. Reads UI text well, with occasional character slips ("METROS" for "METRICS") — treat exact strings and numbers as unverified. Ask a specific question ("list every button label") rather than "describe".

## Hardware-aware setup
`node local-vision.js preflight` detects CPU threads, RAM, free disk and GPU, then plans: **cuda** (NVIDIA ≥4 GB VRAM, Windows), **vulkan** (discrete AMD/Intel GPU), **metal** (Apple Silicon), else **cpu**. Model tier is 2B by default and 4B on GPUs with ≥6 GB (or 16 GB Apple). `setup` re-checks, refuses on `blocked` (disk <1.2× need, RAM <4 GB, unmapped OS) unless `--force`, and swaps a GPU build that fails its self-test for the CPU build. Override with `--backend`/`--tier`.
- **Tested:** CPU, and the Vulkan download/extract/self-test on this machine. On this AMD iGPU Vulkan was barely faster (vision 5.5 s vs 6.3 s), which is why integrated GPUs plan as CPU.
- **Not tested (no hardware):** CUDA, Metal, discrete-GPU Vulkan, Linux/macOS. Treat their speed claims as expectations.

## Rules
- Client timeouts: the first call loads the model (~5-30 s). OpenCode needs `"timeout": 240000` on this server (its default 5 s, or any value under ~40 s, fails with MCP error -32001). Claude Code: set `MCP_TOOL_TIMEOUT`.
- Verified in real OpenCode (big-pickle, no vision): read a login screenshot's buttons and labels in 32 s total. Smaller models sometimes answer without calling the tool — the global rules tell them to call it.
- Memory: ~2 GB while loaded; unloads after 10 idle minutes (`VISION_IDLE_SECONDS`). `node local-vision.js stop` frees it at once.
- On any failure (not set up, timeout, bad file) fall back per `replaces`; never block.
- Image *generation* is not local: local models were tested and abandoned (see `nano-banana`).

## Credits and licences
- Qwen3-VL-2B/4B-Instruct (GGUF) — Qwen Team, Alibaba Cloud — Apache-2.0 — huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF
- llama.cpp — ggml-org — MIT — github.com/ggml-org/llama.cpp (pinned b11390)
