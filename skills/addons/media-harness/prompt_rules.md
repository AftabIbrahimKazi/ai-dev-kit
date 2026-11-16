# Prompt rules (SDXL line and Wan 2.2 5B)

- Images: subject, setting, light, lens or medium, style, in that order, comma separated. 20-60 words.
- Describe what is there. Put exclusions only in the safety negative prompt the harness adds; do not stack negatives.
- DreamShaper Turbo: 6 steps, guidance about 2. RealVisXL: 30 steps, guidance about 5.
- Wan clips: one subject, one camera move ("slow push in", "static"), one lighting state. Motion verbs in present tense. 33 frames is about 2 s, so ask for one action only.
- Chained shots: write the first frame of clip N+1 as the last frame of clip N (same subject, light, palette).
- Never ask for real people's faces, logos or restricted content. The harness guard screens prompts and outputs.
