# Media harness measurement (Stage 5)

Measures what the plan only claims: Flux and Wan speed on a Kaggle T4. Nothing in the harness is built on those numbers until this has run.

## Automatic run (uses your Kaggle token, about 1-2 of your 30 free GPU hours)

```
node skills/addons/media-harness/bench/run.js --dry-run     # see what would be pushed, no network
node skills/addons/media-harness/bench/run.js               # push, wait, download, print the numbers
node skills/addons/media-harness/bench/run.js --no-wait     # push and leave; later: run.js --fetch
```

It needs the Kaggle token (`KAGGLE_API_TOKEN`, or the line in `~/.ai-dev-kit/.env` the `kaggle` add-on already uses) and a phone-verified account. It makes one private kernel named `media-bench`. Flux Dev is gated, so it runs only if `HF_TOKEN` is set in your shell (the token is written into the private kernel source) or `MODEL_DATASET` is set; otherwise Schnell and Wan only. The only step left for you is the side-by-side rating of the images (step 6 below).

## Manual run (same thing by hand)

1. On kaggle.com, make a new notebook. Settings: Accelerator **GPU T4 x2**, Internet **on**. Phone verification is needed for both.
2. Optional but recommended: upload the model weights once as a private Dataset (`flux-schnell/`, `flux-dev/`, `wan22-5b/` folders) and add it to the notebook. Then set `MODEL_DATASET` to its name. Without it, the run times the Hugging Face download instead (Flux Dev is gated: log in to Hugging Face and accept its licence first).
3. Paste `bench.py` into one cell and run it. A failed step is recorded and the run continues.
4. Download `/kaggle/working/bench_results.jsonl` and the PNGs `flux-schnell_*.png` and `flux-dev_*.png`.
5. Print the numbers: `node skills/addons/media-harness/bench/parse.js bench_results.jsonl`.
6. Render the same six prompts (in `bench.py`) through the current Cloudflare path and compare side by side. Then rerun with `--rating clearly-better` or `--rating not-better`.

## Gates

- Image backend ships only if you rate Kaggle Flux clearly better on the art and abstract prompts.
- Video continues only if one 5 s clip takes under 20 minutes.

`bench.py` was written without a GPU to test on. Treat the first run as a test of the script too.
