---
name: teardown-film
description: Opt-in add-on to teardown. Use when the user asks for a video, MP4 or recording of a teardown simulator. Load this BEFORE writing any capture or ffmpeg code.
---

# Teardown Film — Record the Tour to an MP4

**This is opt-in only, never part of any default install, and needs the `teardown` add-on.** The simulator page draws any frame from time alone, so a script can step through the tour, photograph each frame in headless Chrome and encode the frames with ffmpeg. The video is the same picture as the live page. Claude does not hand-write capture code; it runs one command and reads the result.

## Self-improvement (do this first and last)
1. **At start:** apply `learnings.md` if the `learnings-inject` mod supplied it. Do not search for it.
2. **At end:** append one dated bullet only for a new, non-obvious lesson (an encoder flag that broke a player, a frame that differed from the live page). Most uses add nothing. Merge instead of duplicating; delete disproven bullets.

## First run (a person typing, no experience needed)
1. Check ffmpeg: type `ffmpeg -version` and press Enter. A version line means yes. On Windows, if you see "not recognised", type `winget install Gyan.FFmpeg`, then open a new terminal.
2. Build the machine first with the `teardown` add-on: `/teardown sheet teardown/<name>`. That also writes the timeline the video follows.
3. Type `/teardown-film status teardown/<name>`. It lists what is ready and what is missing.
4. Type `/teardown-film film teardown/<name> --preview`. This is a quick low-resolution look. It writes `teardown-out/<name>/<name>.preview.mp4`.
5. When the preview looks right, type `/teardown-film film teardown/<name>` for the full 1920x1080 video at 30 fps.
If you see exit 3, the message names the missing tool. If a long video is slow, you have no graphics card: use `--preview`, or `--from` and `--to` to record a part.

## The tool
`node <skill-root>/teardown-film/cli.js <command>` (plain Node, no dependencies, no network).

| Command | Does |
|---|---|
| `status [<dir>]` | Reports ffmpeg, Chrome, whether the page is built, the timeline and the score. |
| `film <dir>` | Records the tour. Mutes nothing: if `teardown-out/<name>/score.wav` exists it is mixed in. |

Flags: `--preview` (640x360, 12 fps), `--size WxH`, `--fps N`, `--from S`, `--to S`, `--out FILE`, `--sound FILE|none`, `--json`, `--dry-run`.

## Workflow
1. **Run `status`.** If ffmpeg is missing, tell the user the one install line and stop. Do not install it yourself.
2. **Run `film <dir> --dry-run`.** It prints the frame count and the output file. On a machine with no graphics card, expect about a second a frame: say so before a long run.
3. **Record a `--preview` first.** Read one frame of it, or a `teardown sheet`, before the full run.
4. **Add sound only if wanted.** `teardown-sound` writes `score.wav`; `film` picks it up on its own. `--sound none` forces a silent video.
5. **Report the file path, the length and the size.** Never claim a look you did not check.

## Rules
- Never change the page to suit the video. If a frame looks wrong, fix `kin.js` or `machine.js` and run `teardown sheet` again.
- Frames are exact: `render(t)` is pure, so two runs of the same range give the same frames.
- The video has no narration or captions. It is the tour and, if present, the score.

## Failure mode this prevents
A hand-written recorder that drifts from the live page, a video with frames out of order, a long render that fails at the end with no message, and a model spending thousands of tokens on a capture loop a script runs the same way every time.
