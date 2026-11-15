# cloud/

**Rule:** any feature that calls an API or MCP server over the internet as its job lives under `cloud/<platform>/`. A platform with several services gets one subfolder each (`cloud/<platform>/<service>/`). Everything here is opt-in: the installer never offers it in Everything or Auto-detect, only when you ask.

Local-only features stay where they are: Ollama on this machine, `local-vision`, Laya, the CDP browser calls in `teardown`. A feature that only downloads files once (fonts, voices, icons) is not a cloud feature.

## Folder map

| Folder | What | Command |
|---|---|---|
| `cloud/kaggle/` | Run a finished plan's coding tasks on a free Kaggle GPU (qwen3-coder) | `/kaggle` |

## Candidates scanned but not moved yet (2026-11-16)

Each needs a migration for installed projects (the installed skill would change place), so they move one platform per commit, after a decision.

| File | Platform and service | Verdict |
|---|---|---|
| `mcp/mcp-manager.image-gen.*` | Google Gemini and Cloudflare Workers AI image APIs | move later: `cloud/google/image-gen` and `cloud/cloudflare/image-gen` need a split into two files |
| `mcp/mcp-manager.stitch.md` | Google Stitch MCP | move later: `cloud/google/stitch` |
| `workflow/plan-first.reviewer.*` | Gemini backend next to Ollama and static | stays: one reviewer file serves all three backends; split only if a second cloud backend appears |
| `addons/diagram.cli.*` | public icon sources (svgl, devicon), optional | stays: optional downloads |
| `addons/figma-code.cli.*` | Google Fonts download, optional | stays: optional downloads |
| `addons/narrate.setup.*` | one-time voice download from Hugging Face | stays |
| `mcp/mcp-manager.local-vision.*`, `addons/system1-prefilter.*`, `addons/teardown.*` | local servers on 127.0.0.1 | stay: local |

When you add a cloud feature, put it here, add its row above, and the lint check (`skill-writer.lint.js`) will flag network-calling companions outside this folder.
