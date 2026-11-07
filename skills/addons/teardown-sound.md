---
name: teardown-sound
description: Opt-in add-on to teardown. Use when the user asks for sound, music or a score for a teardown simulator or its video. Load this BEFORE writing any audio or synth code.
---

# Teardown Sound — A Score Built From the Tour's Timeline

**This is opt-in only, never part of any default install, and needs the `teardown` add-on.** The sound is written by a script from the tour's own timeline, so it cannot drift from the picture. Every sample is reproducible. Claude does not compose or synthesise by hand; it runs one command and reads the loudness it reports.

## Self-improvement (do this first and last)
1. **At start:** apply `learnings.md` if the `learnings-inject` mod supplied it. Do not search for it.
2. **At end:** append one dated bullet only for a new, non-obvious lesson (a hum that clashed, a level that clipped on a phone). Most uses add nothing. Merge instead of duplicating; delete disproven bullets.

## First run (a person typing, no experience needed)
1. Build the machine with the `teardown` add-on and run `/teardown sheet teardown/<name>` once. That writes the timeline the score follows.
2. Type `/teardown-sound sound teardown/<name>`. It writes `teardown-out/<name>/score.wav` and prints its length, loudness and peak.
3. Play the file. To change the take, add `--seed 2`: the structure stays, the noise changes.
4. For a video with the score, type `/teardown-film film teardown/<name>`. It finds `score.wav` on its own.
If you see "timeline.json not found", step 1 was skipped.

## The tool
`node <skill-root>/teardown-sound/cli.js <command>` (plain Node, no dependencies, no network).

| Command | Does |
|---|---|
| `sound <dir>` | Writes `score.wav`: a soft chord bed, a hum at the machine's own working frequency (gear mesh or firing rate, folded into 90 to 360 Hz), a tick on every beat, a rising whoosh on the cut. |
| `measure <file.wav>` | Reports a 16-bit mono 48 kHz WAV's length, integrated loudness and peak. |

Flags: `--out FILE`, `--seed N`, `--json`, `--dry-run`.

## Workflow
1. **Run `sound <dir> --dry-run`.** It names the output file and the hum frequency, or says there is none.
2. **Run `sound <dir>`.** The output states the loudness; it is mastered to -14 LUFS (ITU-R BS.1770 gating) with the peak at or below -2 dBFS. Report those numbers as they are.
3. **A machine with no known working frequency** (a model from a file, a custom machine) gets the bed, ticks and whoosh without a hum. Say so; do not invent a frequency.
4. **Do not edit the WAV.** Change the take with `--seed`, or fix the timeline in the machine and run `teardown sheet` again.

## Rules
- Every time in the score comes from `timeline.json`, never a typed number.
- Accent, never narrate: continuous motion stays quiet; ticks mark beats only.
- One key for every tonal sound (A minor pentatonic over A2).
- Report the file's loudness and peak from the tool's output. Never claim how it sounds.

## Failure mode this prevents
A score typed against the wrong beat times, a level that is too quiet in a feed or clips on a phone, a take nobody can reproduce, and a model spending thousands of tokens on audio code a script writes the same way every time.
