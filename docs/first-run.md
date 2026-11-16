# First run: which local models do I need?

You can skip this page. With nothing extra installed the kit still works: script routes, git hooks, standards and mods all run. Two optional local models add a little on top, and this page shows how to check whether your machine can take them, install them, and take them off again.

## The walkthrough (about 5 minutes)

1. **Install the kit** in your project (`install-kit`). Its last step runs the device check.
2. **Run the check any time:** type `/device` in Claude Code, or in a terminal:
   ```
   node .claude/skills/skill-scope/device.js
   ```
3. **Read the report.** It has three parts:
   - a table of what you **HAVE** and what is **MISSING** (RAM, disk, GPU, Python, ffmpeg, Laya, local-vision, Ollama, Kaggle),
   - three presets (`lite`, `standard`, `full`) with download sizes,
   - a **Next** list: the exact commands to run.
4. **Run the one command you want.** The check never installs anything. Each Next command downloads files, so it only happens when you run it.
5. **Verify** with the command listed under each model below, then run `/device` again: the row changes from MISSING to HAVE.

Example of what you see:

```
  HAVE     Python 3.10+                   Python 3.11
  MISSING  Laya (prefilter ranking)       not installed
Presets
  > standard fits, download 3.8 GB. Skip it and you lose: the media harness...
Next
  node ~/.ai-dev-kit/mcp/laya-ctl.js setup    (about 2.2 GB; weights download on first start)
```

## The three presets

| Preset | What it means | If you skip it |
|---|---|---|
| `lite` | Scripts and hooks only. No local models. | You lose `prefilter` ranking and `describe_image`. Everything else works. |
| `standard` | Lite plus Laya and local-vision. | You lose the media harness (images and video on Kaggle). |
| `full` | Standard plus what the Kaggle media harness needs (Kaggle CLI, credentials, ffmpeg). | Nothing, but Kaggle still needs a phone-verified account and a one-time model upload. |

Force one to see its report: `/device --preset full`. Machine-readable: `/device --json`.

## Laya (file ranking for `prefilter`)

- **Does:** ranks which files are relevant to a task, on your machine, so Claude reads fewer files.
- **Without it:** a plain keyword (BM25) script does the ranking. It was measured as accurate and cheaper; Laya is opt-in.
- **Cost:** about 2.2 GB on CPU (about 5.5 GB with an NVIDIA GPU), roughly 2.5 GB RAM while running. Needs Python 3.10 or newer.
- **Set up:** `node ~/.ai-dev-kit/mcp/laya-ctl.js preflight` (read-only plan), then `setup`, then `start`.
- **Verify:** `node ~/.ai-dev-kit/mcp/laya-ctl.js health` prints `ok`.
- **Remove:** `node ~/.ai-dev-kit/mcp/laya-ctl.js stop`, then delete the folder `~/.ai-dev-kit/laya`.

## local-vision (`describe_image`)

- **Does:** a small Qwen3-VL model describes an image locally, so you do not spend Claude tokens or send the image anywhere.
- **Without it:** `describe_image` is unavailable; Claude can still read images directly.
- **Cost:** about 1.6 GB (2B model; about 3 GB with a 6 GB or larger GPU), about 2 GB RAM while loaded, unloads after 10 idle minutes. No Python needed.
- **Set up:** `node ~/.ai-dev-kit/mcp/local-vision.js preflight`, then `setup`.
- **Verify:** `node ~/.ai-dev-kit/mcp/local-vision.js status`.
- **Remove:** `node ~/.ai-dev-kit/mcp/local-vision.js stop`, then delete `~/.ai-dev-kit/vision`.

## Ask your AI to do it

Paste this into your assistant:

> Run `node .claude/skills/skill-scope/device.js` and show me the full report. Tell me which preset it recommends and what each Next command downloads. Do not run any Next command until I say which one. Before any download, tell me the size and wait for my yes.

## What is tested, and what is not

- **Tested:** Windows 11, 8-core CPU (16 threads), 14.9 GB RAM, integrated AMD graphics, no discrete GPU. The scan, both preflights and the CPU paths of Laya and local-vision.
- **Not tested:** CUDA, Vulkan on a discrete GPU, Metal, and Linux or macOS. The scan runs there and the sizes are estimates from the model cards; treat them as unverified.
- **GPU memory:** on machines without `nvidia-smi` the scan cannot read VRAM (Windows reports at most 4 GB through its own API), so it lists the card without a size and treats integrated graphics as CPU.
- **Privacy:** the scan reads hardware facts and checks whether Kaggle credentials exist. It never opens or prints them.
