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
3. **Stop hook:** run `node setup.js --hook`. It copies `speak.js` to `~/.claude/skills/narrate/` and points the Stop hook in `~/.claude/settings.json` at that copy, adding the hook or repairing one that names another copy. The file is user-wide, so a hook pointing into one project's folder goes stale when the kit updates (an old script has no `mode` and speaks every reply). Re-run it after a kit update; `node speak.js --status` must list `mode`.
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
| `pause` / `resume` | hold the speech where it is and continue from the same spot (a clip in progress is held in place on Windows; elsewhere the hold takes effect at the next sentence piece). `stop` below cuts speech and clears the queue instead |
| `alerts on` / `alerts off` | spoken alerts in a second voice when a reply ends on a question (see "Spoken alerts"); off by default |
| `alertVoice male` / `alertVoice female` | which voice speaks alerts (default: the other voice from your narration voice) |
| `alertIdle 0-600` | seconds without keyboard or mouse before an alert is spoken (default 30; `0` = always) |
| `stop`, `status` | cut off speech now; show the current settings |
| `play` / `replay` | read the latest reply (the play button); a reply is otherwise spoken exactly once |
| `mode manual` / `mode auto` | `manual` (default, like the play button on claude.ai): the hook only keeps the reply until you play it; `auto`: every reply is spoken as soon as it arrives |

## Spoken alerts
For long sessions you leave running: when Claude ends a reply on a question to you, a second voice says so, so you do not sit at a prompt that is waiting for you.

1. Turn it on: `/narration alerts on` (or the "Spoken alerts" row in the VS Code tray). It says "Alerts are on." in the alert voice so you know which voice it is.
2. Walk away from the keyboard. When Claude replies "…Should I commit this?", after the reply you hear, in the other voice: "Your input is needed. Should I commit this?"
3. Come back and answer. If you were at the keyboard (input within the last 30 seconds) nothing is spoken: the alert is for when you are away.

Details:
- It uses the same Stop hook as narration, costs no tokens and never talks to Claude. The alert reads only the question, never the whole reply, and works in the default `manual` mode; muting narration also mutes alerts.
- In `mode auto` the reply itself is read and already ends on the question, so no extra alert is spoken.
- The idle check is real on Windows. Elsewhere it cannot be read, so an alert is always spoken.
- Wording is its own persona, separate from the narration voice. Change it in `~/.claude/narrate.json`: `"alertPhrases": ["Boss, {q}", "Hey. {q}"]` (`{q}` is the question). `"voices": {"alert": "<file.onnx>"}` gives the alert a voice of its own.
- **A richer voice just for alerts:** `node speak.js --alertCommand "<command {wav}>"` sends the alert text to your own engine (text on stdin, audio written to `{wav}`, the same contract as `"engine":"command"`), for example a local cloned-voice server that sounds more expressive than Piper. Alerts are short and spoken while you are away, so a slower engine fits them. Opt-in, two setups: **all Piper** (the default; nothing to set) or **half-way** (replies on Piper, alerts on your engine). `--alertEngine piper|custom` switches between them without losing the saved command; `--alertCommand off` forgets it. The custom engine is meant to be the same voice as your narration, so if it fails or takes over 150 seconds the alert falls back to your narration voice in Piper (never a different voice, and never lost). Normal reply narration is unaffected and stays on Piper.
- **Render once, replay forever:** an alert is a fixed lead-in plus the question, and each piece is rendered on its own and kept as a wav in `~/.claude/narrate-cache` (your folder, never the repo; up to 300 clips). So a lead-in or a question you have heard before costs no render. `node speak.js --alertPrerender` records the lead-in lines and a dozen common questions ("Should I commit this?") ahead of time in one go, so most alerts play at once and the engine only runs for a question it has never spoken. Changing the engine command starts a fresh cache; `--alertCache status|clear` shows or empties it (clear it if you change the voice inside the engine).
- Test the sound any time: `node speak.js --alert "Do you want me to continue?"`.

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
- **A cloned or character voice** (GPT-SoVITS, RVC, Fish Speech): `"engine":"command"` runs any program that reads text on stdin and writes a wav to `{wav}`; volume and pitch still apply. The kit starts the command hidden. If your command starts a background server itself (to keep a model loaded), start that server windowless too on Windows: use `pythonw.exe` (not `python.exe`, whose venv launcher opens a console window of its own) or `CREATE_NO_WINDOW` without `DETACHED_PROCESS`.

Licences are the user's to check. Never commit a custom voice, its model or its reference audio to a shared repo, and do not share the output: a character's voice is someone else's copyrighted work.
