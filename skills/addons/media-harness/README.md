# media-harness (opt-in add-on, local side)

Plan an image or video job on your own machine, then send it to Kaggle. Start here:

```
mkdir my-job && cd my-job
node <kit>/skills/addons/media-harness/harness.js init
node <kit>/skills/addons/media-harness/harness.js interview     # answer A-D, or E for your own wording
node <kit>/skills/addons/media-harness/harness.js plan          # GPU-minute estimate from measured numbers
```

Video is built from 33-frame clips (about 2 s) chained end to end, because the T4 host cannot do 81 frames in one pass. Estimates use the measured numbers in `bench/FINDINGS.md`.

Built: init, interview, plan, status, stitch (ffmpeg, every frame a keyframe for scroll-scrub). Generation: `submit` pushes the job to Kaggle (`--dry-run` first), `fetch` copies the images and clips back, then `stitch`. Untested live: submit and fetch have only been dry-run. Image routing against Cloudflare (Stage 6) waits for your rating of the bench images.
