# Credits and third-party notices

This repository (skills, standards, scripts) is [MIT-licensed](LICENSE). It builds on the work below. **Nothing listed here is bundled in this repo:** binaries and model weights are downloaded from their original publishers when you run a setup command, and hosted services are called with your own accounts and keys. Each project keeps its own licence; follow it.

## Models and runtimes (downloaded at setup)

| Component | Created by | Licence | Used for | Source |
|---|---|---|---|---|
| Qwen3-VL-2B / 4B-Instruct (GGUF) | Qwen Team, Alibaba Cloud | Apache-2.0 | `local-vision` — reading images | [huggingface.co/Qwen](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF) |
| llama.cpp (pinned build b11390) | ggml-org and contributors | MIT | runs the Qwen model locally | [github.com/ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp) |
| Laya (421M typed-decision model) and its `laya` package | Convai Innovations (repository: Nandha Kishor M) | Apache-2.0 | `system1-prefilter` / `prefilter` — ranking candidates | [huggingface.co/convaiinnovations/laya](https://huggingface.co/convaiinnovations/laya), [github.com/NandhaKishorM/laya](https://github.com/NandhaKishorM/laya) |

## Hosted services (your own accounts and keys)

| Service | Operated by | Used for | Terms |
|---|---|---|---|
| FLUX.1 [schnell] (model, Apache-2.0) on Cloudflare Workers AI | Black Forest Labs (model); Cloudflare (hosting) | `image-gen` fallback | [Cloudflare terms](https://www.cloudflare.com/service-specific-terms-application-services/), [model card](https://huggingface.co/black-forest-labs/FLUX.1-schnell) |
| Gemini "Nano Banana" image models | Google | `image-gen` first choice (needs billing) | [Gemini API terms](https://ai.google.dev/gemini-api/terms) |
| Google Stitch MCP | Google | `stitch` — UI prototyping | [stitch.withgoogle.com](https://stitch.withgoogle.com) |
| placehold.co | its maintainers | labelled placeholder images when every generator is exhausted | [placehold.co](https://placehold.co) — fetched at runtime; falls back to a local SVG if unreachable |

The Laya server speaks a "Jev-compatible" wire protocol (per Laya's own documentation); the typed-decision contract that `system1-prefilter` is written against follows that shape.

## Ideas borrowed (no text or data copied)

- **ASD-STE100 Simplified Technical English** — ASD, the AeroSpace and Defence Industries Association of Europe. `skill-writer`'s controlled-writing rule borrows its disambiguation principles (one term per concept, explicit conditions, short imperative steps). No part of the specification or its dictionary is reproduced; the specification is ASD's and is obtained from them.
- **Model Context Protocol** — Anthropic and the MCP community; `mcp-manager` configures MCP servers and the bundled scripts implement a minimal stdio subset.

## Evaluated during development, not shipped

Local image-generation options were tested end to end and dropped for speed and face quality; none is part of the kit. Credit to: stable-diffusion.cpp (leejet, MIT), Stable Diffusion Turbo (Stability AI, Community License), SDXS (IDKiro et al., OpenRAIL++), TAESD (madebyollin, MIT), FLUX.2-klein-4B (Black Forest Labs, Apache-2.0).

## Other directories and references

Shopify's AI toolkit skills are pulled live from Shopify's own repository at install time and are never stored or forked here (see `skills/stack/shopify-toolkit-install.md`). Three.js, Astro, Bootstrap and other frameworks named in the skills and standards belong to their respective authors.

## Corrections

Missing or incorrect credit? Open an issue or a pull request against this file and it will be fixed promptly.
