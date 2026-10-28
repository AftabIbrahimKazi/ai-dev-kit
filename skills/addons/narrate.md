---
name: narrate
description: Opt-in add-on. Use when the user wants Claude's replies read aloud (text to speech).
---

# Narrate — Replies Read Aloud

**Opt-in only.** The scripts live in `<skill-root>/narrate/` once installed (in the kit repo they are `skills/addons/narrate.<name>`). Local, never talks to Claude, costs no tokens.
- `speak.js` (Node): a Stop hook that reads the final reply aloud. Code, tables and links are dropped (and announced as "on screen"); the reply is read in full, in sentence-sized pieces so speech starts quickly (a reading is limited by time, 5 minutes by default, converted to characters at your current speed; past it the voice says "the rest is on screen"); replies from parallel sessions queue and play in order (the newest three are kept), never cutting each other off; `stop` and `mute` cut in at once.

## Install
1. **Voices (Piper, free, offline) — tell the user it downloads about 125 MB, then run** `node setup.js --voices`. It pip-installs `piper-tts`, downloads a British female (`en_GB-jenny_dioco-medium`, Jenny (Dioco), attribution required) and a British male (`en_GB-northern_english_male-medium`, CC-BY-SA 4.0) voice into `~/.claude/voices/`, skips files already there, and writes the config in step 2 if it is missing. Without Piper the script falls back to the built-in Windows voice, which sounds dated.
2. **Config** `~/.claude/narrate.json`: `{"engine":"piper","piper":{"exe":"<full path to python>","args":["-m","piper"]}}`. Written by step 1.
3. **Stop hook** in `~/.claude/settings.json`:
```json
{ "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "node \"<skill-root>/narrate/speak.js\"" }] }] } }
```
4. **Controls:** the `/narration` slash command (`mute|voice|volume|speed|pitch|play|mode`): run `node setup.js --controls commands [--project <dir>]`. The kit has no keyboard hotkeys or dictation; for on-screen buttons in VS Code, install `extensions/narrate-buttons` (see the README).

## Controls
The same settings are reachable as `/narration <setting>` (commands), from the VS Code controls, or as `node speak.js --<setting>`:

| Setting | Effect |
|---|---|
| `mute` / `unmute` | silence or restore narration; `mute` also stops speech in progress |
| `voice male` / `voice female` | pick the voice |
| `volume 0-100` | loudness |
| `speed 0.5-2` | pace; pitch is unaffected |
| `pitch -12..12` | semitones up or down; pace is unaffected (piper only) |
| `maxSeconds 30-1800` | longest reading, in seconds of speech (default 1110, which the 12000-character cap shortens to about 12 minutes at speed 1); `status` shows the character limit it gives at the current speed |
| `stop`, `status` | cut off speech now; show the current settings |
| `play` / `replay` | read the latest reply (the play button); a reply is otherwise spoken exactly once |
| `mode manual` / `mode auto` | `manual` (default, like the play button on claude.ai): the hook only keeps the reply until you play it; `auto`: every reply is spoken as soon as it arrives |

`--say "text"` speaks a sample so you can tune a voice. Settings persist in `narrate.json`. The `sapi` fallback supports voice, speed and volume but not pitch.

## Platforms
Playback always uses the system's current default output, so headphones, Bluetooth and HDMI are followed on every platform.

| Platform | Reply playback | Without Piper |
|---|---|---|
| Windows | built-in media player (SoundPlayer fallback) | Windows voices |
| macOS | `afplay` | `say` |
| Linux | first of `paplay`, `pw-play`, `aplay`, `ffplay`, `play` | `spd-say`, `espeak-ng`, `espeak` |
| Android (Termux) | `termux-media-player` (install `termux-api`) | `termux-tts-speak` |

Only Windows has been run on a real machine. The other rows are covered by tests of the player choice, not by listening. Piper itself runs on all four (on Termux it may need a build from source).

## Your own voice
Offer this at install: the user may keep the defaults, or bring their own voice for either slot.
- **Another Piper voice** (any `.onnx` with its `.onnx.json`, from the Piper voice list or one they trained): `node setup.js --add-voice male|female <file.onnx or https://...onnx>`. A local file is used where it is; a URL is downloaded with its `.json` into `~/.claude/voices/`. Then `--voice male|female` selects it. Browse voices and licences at `huggingface.co/rhasspy/piper-voices`.
- **A cloned or character voice** (GPT-SoVITS, RVC, Fish Speech): `"engine":"command"` runs any program that reads text on stdin and writes a wav to `{wav}`; volume and pitch still apply.

Licences are the user's to check. Never commit a custom voice, its model or its reference audio to a shared repo, and do not share the output: a character's voice is someone else's copyrighted work.
