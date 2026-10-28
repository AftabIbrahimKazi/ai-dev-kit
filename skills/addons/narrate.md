---
name: narrate
description: Opt-in add-on. Use when the user wants Claude's replies read aloud (text to speech) or voice dictation into the chat.
---

# Narrate — Replies Read Aloud, Dictation Typed In

**Opt-in only.** The scripts live in `<skill-root>/narrate/` once installed (in the kit repo they are `skills/addons/narrate.<name>`). Two independent scripts, both local, neither talks to Claude, neither costs tokens.
- `speak.js` (Node): a Stop hook that reads the final reply aloud. Code, tables and links are dropped (and announced as "on screen"); the reply is read in full, in sentence-sized pieces so speech starts quickly (a reading is limited by time, 5 minutes by default, converted to characters at your current speed; past it the voice says "the rest is on screen"); replies from parallel sessions queue and play in order (the newest three are kept), never cutting each other off; `stop`, `mute` and the hotkeys cut in at once.
- `listen.py` (Python): voice mode. A hotkey starts and stops recording; the speech is transcribed offline and typed into the focused window, the chat box included.

## Install
1. **Voices (Piper, free, offline) — tell the user it downloads about 125 MB, then run** `node setup.js --voices`. It pip-installs `piper-tts`, downloads a British female (`en_GB-jenny_dioco-medium`, Jenny (Dioco), attribution required) and a British male (`en_GB-northern_english_male-medium`, CC-BY-SA 4.0) voice into `~/.claude/voices/`, skips files already there, and writes the config in step 2 if it is missing. Without Piper the script falls back to the built-in Windows voice, which sounds dated.
2. **Config** `~/.claude/narrate.json`: `{"engine":"piper","piper":{"exe":"<full path to python>","args":["-m","piper"]}}`. Written by step 1.
3. **Stop hook** in `~/.claude/settings.json`:
```json
{ "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "node \"<skill-root>/narrate/speak.js\"" }] }] } }
```
4. **Controls — ask the user which they want:** **commands** (`/narration mute|voice|volume|speed|pitch`), **hotkeys** (global keys that work in any window), or **both**. Then run `node setup.js --controls commands|hotkeys|both [--project <dir>]`. Hotkeys need Python 3 and a terminal-less launcher: `--startup` starts it hidden at login (Windows). Ask whether they also want **voice mode** (dictation typed into the chat box); if so add `--dictate`, which also installs faster-whisper, sounddevice and numpy (about 150 MB plus a speech model download on first use).

## Controls
The same settings are reachable three ways: `/narration <setting>` (commands), the hotkeys below, or `node speak.js --<setting>`:

| Setting | Effect |
|---|---|
| `mute` / `unmute` | silence or restore narration; `mute` also stops speech in progress |
| `voice male` / `voice female` | pick the voice |
| `volume 0-100` | loudness |
| `speed 0.5-2` | pace; pitch is unaffected |
| `pitch -12..12` | semitones up or down; pace is unaffected (piper only) |
| `maxSeconds 30-1800` | longest reading, in seconds of speech (default 300); `status` shows the character limit it gives at the current speed |
| `stop`, `status` | cut off speech now; show the current settings |
| `play` / `replay` | read the latest reply (the play button); a reply is otherwise spoken exactly once |
| `mode manual` / `mode auto` | `manual` (default, like the play button on claude.ai): the hook only keeps the reply until you play it; `auto`: every reply is spoken as soon as it arrives |

**Keyboard hotkeys.** While the hotkey launcher runs (`~/.claude/narrate-hotkeys.cmd`, or `python listen.py --no-dictate`), these work in any window and each change is spoken back:

| Keys | Effect |
|---|---|
| `Ctrl+Alt+D` | start / stop dictation (voice mode only) |
| `Ctrl+Alt+M` | mute / unmute (a low or high beep, nothing spoken) |
| `Ctrl+Alt+X` | stop speaking now |
| `Ctrl+Alt+R` | replay the last reply |
| `Ctrl+Alt+G` | switch male / female |
| `Ctrl+Alt+Up` / `Down` | volume +10 / -10 |
| `Ctrl+Alt+Right` / `Left` | speed +0.1 / -0.1 |
| `Ctrl+Alt+PageUp` / `PageDown` | pitch +1 / -1 semitone |

`--say "text"` speaks a sample so you can tune a voice. Settings persist in `narrate.json`. The `sapi` fallback supports voice, speed and volume but not pitch.

## Platforms
Playback always uses the system's current default output, so headphones, Bluetooth and HDMI are followed on every platform.

| Platform | Reply playback | Without Piper | Hotkeys and dictation |
|---|---|---|---|
| Windows | built-in media player (SoundPlayer fallback) | Windows voices | works as is |
| macOS | `afplay` | `say` | terminal needs Accessibility permission |
| Linux | first of `paplay`, `pw-play`, `aplay`, `ffplay`, `play` | `spd-say`, `espeak-ng`, `espeak` | `keyboard` needs root |
| Android (Termux) | `termux-media-player` (install `termux-api`) | `termux-tts-speak` | no global hotkeys: use `/narration` and the phone keyboard's microphone |

Only Windows has been run on a real machine. The other rows are covered by tests of the player choice, not by listening. Piper itself runs on all four (on Termux it may need a build from source).

## Your own voice
Offer this at install: the user may keep the defaults, or bring their own voice for either slot.
- **Another Piper voice** (any `.onnx` with its `.onnx.json`, from the Piper voice list or one they trained): `node setup.js --add-voice male|female <file.onnx or https://...onnx>`. A local file is used where it is; a URL is downloaded with its `.json` into `~/.claude/voices/`. Then `--voice male|female` selects it. Browse voices and licences at `huggingface.co/rhasspy/piper-voices`.
- **A cloned or character voice** (GPT-SoVITS, RVC, Fish Speech): `"engine":"command"` runs any program that reads text on stdin and writes a wav to `{wav}`; volume and pitch still apply.

Licences are the user's to check. Never commit a custom voice, its model or its reference audio to a shared repo, and do not share the output: a character's voice is someone else's copyrighted work.
