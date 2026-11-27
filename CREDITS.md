# Credits and third-party notices

This repository (skills, standards, scripts) is [MIT-licensed](LICENSE). It builds on the work below. **Nothing listed here is bundled in this repo:** binaries and model weights are downloaded from their original publishers when you run a setup command, and hosted services are called with your own accounts and keys. Each project keeps its own licence; follow it.

## Models and runtimes (downloaded at setup)

| Component | Created by | Licence | Used for | Source |
|---|---|---|---|---|
| Qwen3-VL-2B / 4B-Instruct (GGUF) | Qwen Team, Alibaba Cloud | Apache-2.0 | `local-vision` — reading images | [huggingface.co/Qwen](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF) |
| llama.cpp (pinned build b11390) | ggml-org and contributors | MIT | runs the Qwen model locally | [github.com/ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp) |
| Laya (421M typed-decision model) and its `laya` package | Convai Innovations (repository: Nandha Kishor M) | Apache-2.0 | `system1-prefilter` / `prefilter` — ranking candidates | [huggingface.co/convaiinnovations/laya](https://huggingface.co/convaiinnovations/laya), [github.com/NandhaKishorM/laya](https://github.com/NandhaKishorM/laya) |
| Piper (`piper-tts`) | Open Home Foundation / Rhasspy | GPL-3.0-or-later | `narrate` — offline text to speech; installed with pip and run as a separate program, never bundled or linked | [github.com/OHF-Voice/piper1-gpl](https://github.com/OHF-Voice/piper1-gpl) |
| Piper voices `en_GB-jenny_dioco-medium`, `en_GB-northern_english_male-medium` (older installs may still use `en_US-ljspeech-medium`, `en_US-joe-medium`) | Jenny (Dioco): dioco-group/jenny-tts-dataset, voice must be credited as "Jenny (Dioco)"; Northern English Male: OpenSLR 83, Google (CC-BY-SA 4.0) | custom attribution licence (commercial use permitted) / CC-BY-SA 4.0 | `narrate` — default female and male voices, downloaded by the user, never shipped | [huggingface.co/rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices) |

## Hosted services (your own accounts and keys)

| Service | Operated by | Used for | Terms |
|---|---|---|---|
| FLUX.1 [schnell] (model, Apache-2.0) on Cloudflare Workers AI | Black Forest Labs (model); Cloudflare (hosting) | `image-gen`, served by the free router | [Cloudflare terms](https://www.cloudflare.com/service-specific-terms-application-services/), [model card](https://huggingface.co/black-forest-labs/FLUX.1-schnell) |
| Google Stitch MCP | Google | `stitch` — UI prototyping | [stitch.withgoogle.com](https://stitch.withgoogle.com) |
| placehold.co | its maintainers | labelled placeholder images when every generator is exhausted | [placehold.co](https://placehold.co) — fetched at runtime; falls back to a local SVG if unreachable |

The Laya server speaks a "Jev-compatible" wire protocol (per Laya's own documentation); the typed-decision contract that `system1-prefilter` is written against follows that shape.

## Adapted from MIT-licensed skills

Both are MIT-licensed; their notices are kept here. The kit's versions are condensed rewrites, not copies, and the originals are not bundled.

| Source | Created by | Used for |
|---|---|---|
| [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill) | Cloudflare | `security-audit` skill and `QA-SEC-14` to `QA-SEC-20`: five-part finding bar, `confirmed` vs `needs_validation`, attack classes, sandbox-before-run rule |
| [Nutlope/hallmark](https://github.com/Nutlope/hallmark) | Nutlope (Together AI) | `ui-design` skill and `design-standards.md`: Floor/Reflex/Finish tiers, job-first shape, ask-once, Picks block |

## Ideas borrowed (no text or data copied)

- **ASD-STE100 Simplified Technical English** — ASD, the AeroSpace and Defence Industries Association of Europe. `skill-writer`'s controlled-writing rule borrows its disambiguation principles (one term per concept, explicit conditions, short imperative steps). No part of the specification or its dictionary is reproduced; the specification is ASD's and is obtained from them.
- **Model Context Protocol** — Anthropic and the MCP community; `mcp-manager` configures MCP servers and the bundled scripts implement a minimal stdio subset.

## Evaluated during development, not shipped

Local image-generation options were tested end to end and dropped for speed and face quality; none is part of the kit. Credit to: stable-diffusion.cpp (leejet, MIT), Stable Diffusion Turbo (Stability AI, Community License), SDXS (IDKiro et al., OpenRAIL++), TAESD (madebyollin, MIT), FLUX.2-klein-4B (Black Forest Labs, Apache-2.0).

## Other directories and references

Shopify's AI toolkit skills ([github.com/Shopify/Shopify-AI-Toolkit](https://github.com/Shopify/Shopify-AI-Toolkit), MIT) are pulled live from Shopify's own repository at install time and are never stored or forked here (see `skills/stack/shopify-toolkit-install.md`). Three.js, Astro, Bootstrap and other frameworks named in the skills and standards belong to their respective authors.

## Corrections

Missing or incorrect credit? Open an issue or a pull request against this file and it will be fixed promptly.

## Ideas adapted

| Project | Created by | Licence | What we took | Source |
|---|---|---|---|---|
| stack-diagram | caru-ini | MIT | The idea of a script-built architecture diagram with real brand logos, light and dark output and a self-contained HTML file. The layout engine, checks, detection and renderer in `diagram.cli.ts` are our own; no code or assets were copied. | [github.com/caru-ini/stack-diagram](https://github.com/caru-ini/stack-diagram) |
| teardown | elvarofficial | MIT | The idea of a machine simulator that is one offline page with live readouts driven by the same model that moves the parts, a tour that hands control to the visitor, a still-frame review loop, recording by stepping a pure render function, and a score built on the same timeline (the `teardown-film` and `teardown-sound` add-ons). It builds on whaleyxbt/claude-motion (MIT). The scaffold, checks, bundler-free build, capture and Triforge integration in `teardown.cli.ts` are our own; no code, assets or sounds were copied. | [github.com/elvarofficial/teardown](https://github.com/elvarofficial/teardown) |
| goldfish plan review | Google (google/elephant-goldfish-model) | Apache-2.0 | The idea of reviewing a plan with fresh subagents that start with no conversation and read only the plan and the files it names, in several stages (zoom-out, comprehension, critic, implementation readiness). The stage prompts, bundle builder, local-model path and commands in `plan-first.goldfish.ts` are our own; no code or prompt text was copied. | https://github.com/google/elephant-goldfish-model |
| modern-web-guidance | Chrome team (GoogleChrome/modern-web-guidance-src) | Apache-2.0 | Nothing copied. The `modern-web` add-on calls the published package (pinned to 1.0.0) at run time and turns its `legacy-scan` JSON into a short table; the wrapper, cache and kit-standards notes are ours. | https://github.com/GoogleChrome/modern-web-guidance-src |
| FreeLLMAPI | tashfeenahmed | MIT | Nothing copied. The free OpenAI-compatible router that `/api-mode free` and the unified-router backends talk to. The kit can fetch its source (pinned tag, opt-in) into `~/.ai-dev-kit/external/` when no router is running; it is never bundled. | https://github.com/tashfeenahmed/freellmapi |
| Obscura | h4ckf0r0day | Apache-2.0 | Nothing copied. A headless browser the kit may call for page reads when you opt in; fetched as the pinned default release (never the stealth builds) into `~/.ai-dev-kit/external/`, hash-checked, never bundled. | https://github.com/h4ckf0r0day/obscura |
| SkillOpt | Microsoft | MIT | The idea of a validation gate that refuses a skill change when any task gets worse (`gate_no_regression`). Nothing copied: `ab-gate` is our own arithmetic over score files. | https://github.com/microsoft/SkillOpt |
| claude-plugins-official | Anthropic | Apache-2.0 | The idea of mining retries from transcripts to find skills that fail, and the plugin and hook layout the kit's mods follow. Nothing copied. | https://github.com/anthropics/claude-plugins-official |
| Playwright | Microsoft | Apache-2.0 | The browser test driver the `e2e-scaffold` templates generate tests for. Installed by the user's own `npm`, never bundled. | https://github.com/microsoft/playwright |
| Kaggle, Ollama, Qwen | Kaggle (free notebook GPUs and CLI); Ollama (runtime); Alibaba Qwen (qwen3-coder, Apache-2.0) | see each | Nothing copied. The `kaggle` add-on calls the Kaggle CLI and, inside the user's own private notebook, installs Ollama and pulls the model at run time; the plan schema, worker, gates and ledger are ours. | https://www.kaggle.com |
