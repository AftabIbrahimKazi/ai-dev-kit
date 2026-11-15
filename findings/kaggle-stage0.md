# Kaggle stage 0: measurement job (2026-11-16)

Kernel `aftabkazi/kaggle-measure-stage0`, private, GPU + internet, qwen3-coder:30b via Ollama 0.40.16. Raw numbers: `kaggle-stage0-results.json`.

- Hardware: 2x Tesla T4 (15 GB each), 4 CPUs, 20 GB disk. Model runs **100% GPU** at every context size (19 GB at 8k, 22 GB at 32k, 26 GB at 64k, split over both cards). The prototype's "Unable to detect GPU" line was only the installer; inference was fine.
- Speed: 65-67 tok/s generation at 16k (prototype logged 25-30). 37 tok/s with 30k tokens in context; 61 tok/s with 6k. Prompt processing 1.3-2.2k tok/s, so a 30k-token prompt costs ~25 s.
- Cold start: apt+Ollama 28 s, model pull 168 s, first load 87 s. About 4.8 min before the first answer.
- Three sample tasks (two files each): 17-24 s each, 829-1579 tokens. Whole job 490 s wall.
- `num_ctx` 64k works (26 GB). The 64k test only filled ~33k tokens (filler tokenised short), so the 64k fill limit is not yet proven.
- Not measured: session cap, queue wait (started immediately), model-cache dataset vs pull, sample quality (sample1-3 outputs not yet read by a reviewer), concurrent-session limit.

Implication: per-plan cost is dominated by the ~5 min cold start; each task is seconds. Batch one job per plan, as designed. Default caps proposed: 32k `num_ctx`, task prompt up to ~20k tokens, output up to 4k.
