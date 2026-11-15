# cloud/

**Rule:** any feature that calls an API or MCP server over the internet as its job lives under `cloud/<platform>/`. A platform with several services gets one subfolder each (`cloud/<platform>/<service>/`). Everything here is opt-in: the installer never offers it in Everything or Auto-detect, only when you ask.

Local-only features stay where they are: Ollama on this machine, `local-vision`, Laya, the CDP browser calls in `teardown`. A feature that only downloads files once (fonts, voices, icons) is not a cloud feature.

## Folder map

| Folder | What | Command |
|---|---|---|
| `cloud/kaggle/` | Run a finished plan's coding tasks on a free Kaggle GPU (qwen3-coder) | `/kaggle` |

## Candidates scanned and decided (2026-11-16)

Only Kaggle moved: it is new, so no installed project needs a migration. The rest stay, for stated reasons.

| File | Platform and service | Verdict |
|---|---|---|
| `mcp/mcp-manager.image-gen.*` | Google Gemini and Cloudflare Workers AI image APIs | stays: it is a server companion of `mcp-manager` (installed as `mcp-manager/image-gen.js`, selected with `mcp-manager:stitch+image-gen`); a move would break that install interface and every installed project's paths |
| `mcp/mcp-manager.stitch.md` | Google Stitch MCP | stays: same reason, a server companion |
| `workflow/plan-first.reviewer.*` | Gemini backend next to Ollama and static | stays: one reviewer file serves all three backends |
| `addons/diagram.cli.*` | public icon sources (svgl, devicon), optional | stays: optional downloads |
| `addons/figma-code.cli.*` | Google Fonts download, optional | stays: optional downloads |
| `addons/narrate.setup.*` | one-time voice download from Hugging Face | stays |
| `mcp/mcp-manager.local-vision.*`, `addons/system1-prefilter.*`, `addons/teardown.*` | local servers on 127.0.0.1 | stay: local |

The MCP server companions keep living under `mcp/` because `mcp-manager` owns where servers go. New standalone cloud features (their own skill and command) go here.

When you add a cloud feature, put it here, add its row above, and the lint check (`skill-writer.lint.js`) will flag network-calling companions outside this folder.
