# Stage 5 findings (Kaggle T4 x2, measured 2026-11-16 and 2026-11-17)

| Item | Result |
|---|---|
| SDXL base | 27.6 s per 1024px image (30 steps), load 41 s, 10.4 GB VRAM |
| RealVisXL V5.0 (openrail++) | 32.4 s median, 6 runs, load 43.8 s |
| DreamShaper XL v2 Turbo (openrail++) | 10.4 s median, 6 runs, load 38.7 s |
| Wan 2.2 5B load | 286-295 s from Hugging Face every session |
| Wan 2.2 5B 33 frames | 73.9 s and 80.8 s (two runs) |
| Wan 81 frames | NOT measured, host killed it twice; scaled ESTIMATE 3.0-3.3 min |

Video gate: accepted on the estimate (user decision 2026-11-17), well under the 20 min limit.
Image gate: waiting for the user's side-by-side rating against Cloudflare.
Not measured: two workers, Dataset-vs-HF load, Flux (gated, no HF token), Wan 2.2 5B native fps (exported at 16).
Dropped: Juggernaut-X (single-file NSFW-tuned checkpoint, not diffusers weights).

## Quality test 2026-11-17 (FAILED for commercial use)
- Job mode ran clean: 2 images + 4 chained clips in 763 s; 1 image + 3 clips in 633 s (clips 68-81 s); host RAM flat at 25.5 GB.
- Output quality: abstract test unusable (user); human test (keyframe fine) melts by clip 2-3: hands and cup dissolve, face drifts. Chaining from the last frame compounds it. Humans are a no on this setup.
- Next: re-anchor each clip to a fresh keyframe, single short clips, more steps or the 14B model, 720p. See handover.md Next steps 0.
