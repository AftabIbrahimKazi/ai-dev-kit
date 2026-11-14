# Environment variables the kit reads

Every variable a kit script or mod reads from the environment, with what it does and who reads it. This page is for people and scripts. The AI never needs it: scripts read these themselves, and the AI is never asked to read or print a value. `tests/env-dictionary.test.js` fails when code reads a variable this page does not list.

Secrets (marked **secret**) belong in your shell or your OS user environment, never in a project file, a prompt or a commit. Everything else is a tunable with a safe default.

| Variable | Purpose | Read by | Secret |
|---|---|---|---|
| `AI_DEV_KIT_HOME` | Folder for the kit's per-user data (default `~/.ai-dev-kit`) | install-kit, plan-first, session-budget | no |
| `AI_DEV_KIT_INTERACTIVE` | `1` forces the installer's prompts even when input is piped (tests) | install-kit | no |
| `AI_DEV_KIT_NO_MENUS` | `1` uses numbered prompts instead of arrow-key menus | install-kit | no |
| `AI_ROLE` | Role a parallel session starts as | aiignore-guard mod | no |
| `NO_COLOR` | Turns installer colour off | install-kit | no |
| `NARRATE` | `0` mutes spoken narration | narrate | no |
| `NARRATE_TMP` | Folder for narration audio files | narrate | no |
| `CHROME`, `CHROME_PATH` | Chrome or Edge executable for headless runs | figma-code, teardown | no |
| `CLAUDE_CODE_BIN` | Path to the Claude Code executable, for delegated headless runs | plan-first delegate | no |
| `FFMPEG` | ffmpeg executable for teardown film | teardown-film | no |
| `IMAGEMAGICK_BIN` | `magick` executable for image conversion | image-gen | no |
| `LAYA_HOME` | Folder for the Laya prefilter's venv and models | laya-ctl, aiignore-guard | no |
| `LAYA_PORT` | Port of the Laya prefilter server (default 8000) | laya-ctl, prefilter-mcp, aiignore-guard | no |
| `LAYA_PYTHON` | Python used to build the Laya venv | laya-ctl | no |
| `LAYA_MODELS` | Which Laya models to fetch | laya-ctl | no |
| `LAYA_IDLE_UNLOAD_SECONDS` | Seconds idle before Laya unloads its model | laya-ctl | no |
| `LAYA_FAKE_HW` | Pretend hardware for the Laya preflight (tests) | laya-ctl | no |
| `VISION_HOME` | Folder for the local-vision model | local-vision | no |
| `VISION_PORT` | Port of the local-vision server | local-vision | no |
| `VISION_IDLE_SECONDS` | Seconds idle before local-vision unloads | local-vision | no |
| `VISION_FAKE_HW` | Pretend hardware for the vision preflight (tests) | local-vision | no |
| `IMAGE_GEN_HOME` | Folder for image-gen's usage log | image-gen | no |
| `IMAGE_PROVIDERS` | Provider order, for example `gemini,cloudflare` | image-gen | no |
| `IMAGE_WARN_PCT`, `IMAGE_SOFT_LIMIT_PCT` | Free-tier usage percentages that warn and that stop | image-gen | no |
| `GEMINI_API_KEY` | Key for Gemini image generation and for the optional Gemini reviewer | image-gen, plan-first reviewer | **secret** |
| `GEMINI_IMAGE_MODEL` | Gemini image model name | image-gen | no |
| `GEMINI_REVIEW_MODEL` | Gemini model the state-audit and plan reviewer asks (default `gemini-2.5-flash`) | plan-first reviewer | no |
| `GEMINI_DAILY_CAP` | Daily image cap for Gemini | image-gen | no |
| `GEMINI_API_BASE` | Override of the Gemini API base URL (tests) | image-gen | no |
| `CLOUDFLARE_API_TOKEN` | Token for Cloudflare Workers AI images | image-gen | **secret** |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id | image-gen | **secret** |
| `CLOUDFLARE_DAILY_CAP` | Daily image cap for Cloudflare | image-gen | no |
| `CLOUDFLARE_API_BASE` | Override of the Cloudflare API base URL (tests) | image-gen | no |
| `PLACEHOLDER_API_BASE` | Override of the placeholder image provider URL (tests) | image-gen | no |
| `SYSTEM1_API_KEY`, `SYSTEM1_BASE_URL` | A hosted prefilter provider instead of Laya | aiignore-guard | **secret** (key) |

Operating-system variables the kit also reads and never sets: `HOME`, `USERPROFILE`, `PREFIX`, `PROGRAMFILES`, `PROGRAMFILES(X86)`, `LOCALAPPDATA`.
