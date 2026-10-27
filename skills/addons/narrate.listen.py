#!/usr/bin/env python3
"""Voice mode for the narrate add-on: dictate into whatever window has focus, the Claude chat box included.

Press the hotkey to start recording, press it again to stop; the speech is transcribed locally (faster-whisper, no
cloud, no tokens) and typed into the focused window. It never talks to Claude and never presses Enter unless asked.

  python narrate.listen.py                 listen with Ctrl+Alt+D
  python narrate.listen.py --key f8 --model small.en --enter
  python narrate.listen.py --file clip.wav print the transcript of a file (test the model)
  python narrate.listen.py --no-dictate    keyboard controls for narration only, no microphone or model

Narration hotkeys (work anywhere, same settings as /narration; each change is spoken back except mute):
  Ctrl+Alt+M mute/unmute   Ctrl+Alt+X stop speaking   Ctrl+Alt+R replay the last reply   Ctrl+Alt+G switch male/female
  Ctrl+Alt+Up/Down volume +/-10   Ctrl+Alt+Right/Left speed +/-0.1   Ctrl+Alt+PageUp/PageDown pitch +/-1
Needs: pip install faster-whisper sounddevice keyboard numpy
Platforms: Windows works as is. Linux needs root for the `keyboard` library (it reads /dev/input); macOS needs the
terminal to have Accessibility permission. Android (Termux) has no global hotkeys: use the /narration command and the
phone keyboard's own microphone for dictation.
"""
import argparse
import json
import os
import subprocess
import sys
import threading

HERE = os.path.dirname(os.path.abspath(__file__))
# the kit repo names it narrate.speak.js; an install renames it to speak.js inside the skill folder
SPEAK = next((p for p in (os.path.join(HERE, n) for n in ("narrate.speak.js", "speak.js")) if os.path.exists(p)), os.path.join(HERE, "speak.js"))
CLAUDE = os.path.join(os.path.expanduser("~"), ".claude")
CONF = os.path.join(CLAUDE, "narrate.json")
OFF = os.path.join(CLAUDE, "narrate.off")
LIMITS = {"volume": (0, 100, 100), "speed": (0.5, 2, 1), "pitch": (-12, 12, 0)}

RATE = 16000


def load(model_name):
    from faster_whisper import WhisperModel
    return WhisperModel(model_name, device="cpu", compute_type="int8")


def transcribe(model, audio):
    segments, _ = model.transcribe(audio, language="en", vad_filter=True, beam_size=1)
    return " ".join(s.text.strip() for s in segments).strip()


def node(*args):
    subprocess.run(["node", SPEAK, *map(str, args)], capture_output=True, check=False)


def current(key):
    try:
        with open(CONF, encoding="utf8") as f:
            return float(json.load(f).get(key, LIMITS[key][2]))
    except (OSError, ValueError):
        return float(LIMITS[key][2])


def nudge(key, step):
    lo, hi, _ = LIMITS[key]
    value = round(min(hi, max(lo, current(key) + step)), 2)
    node("--" + key, value)
    node("--say", f"{key} {value:g}")


def beep(freq):
    try:
        import winsound
        winsound.Beep(freq, 120)
    except ImportError:
        print("", end="", flush=True)  # terminal bell where winsound does not exist


def toggle_mute():
    if os.path.exists(OFF):
        node("--unmute")
        beep(1200)
    else:
        node("--mute")
        beep(500)


def switch_voice():
    try:
        with open(CONF, encoding="utf8") as f:
            gender = json.load(f).get("gender", "female")
    except (OSError, ValueError):
        gender = "female"
    new = "male" if gender == "female" else "female"
    node("--voice", new)
    node("--say", f"{new} voice")


def add_controls(keyboard):
    pairs = {
        "ctrl+alt+m": toggle_mute,
        "ctrl+alt+x": lambda: node("--stop"),
        "ctrl+alt+r": lambda: node("--replay"),
        "ctrl+alt+g": switch_voice,
        "ctrl+alt+up": lambda: nudge("volume", 10),
        "ctrl+alt+down": lambda: nudge("volume", -10),
        "ctrl+alt+right": lambda: nudge("speed", 0.1),
        "ctrl+alt+left": lambda: nudge("speed", -0.1),
        "ctrl+alt+page up": lambda: nudge("pitch", 1),
        "ctrl+alt+page down": lambda: nudge("pitch", -1),
    }
    for combo, fn in pairs.items():
        keyboard.add_hotkey(combo, fn, suppress=True)  # consumed, so VS Code's own Ctrl+Alt shortcuts do not also fire


def listen(model, key, enter):
    import keyboard
    import numpy as np
    import sounddevice as sd

    chunks, stream = [], None
    lock = threading.Lock()

    def on_audio(indata, frames, time, status):
        chunks.append(indata[:, 0].copy())

    def toggle():
        nonlocal stream
        with lock:
            if stream is None:
                chunks.clear()
                stream = sd.InputStream(samplerate=RATE, channels=1, dtype="float32", callback=on_audio)
                stream.start()
                print("recording... press", key, "to stop", flush=True)
                return
            stream.stop()
            stream.close()
            stream = None
        if not chunks:
            return
        text = transcribe(model, np.concatenate(chunks))
        print("heard:", text or "(nothing)", flush=True)
        if text:
            keyboard.write(text + " ")
            if enter:
                keyboard.send("enter")

    add_controls(keyboard)
    if model is not None:
        keyboard.add_hotkey(key, toggle, suppress=True)
    print(f"ready: narration hotkeys on" + (f", {key} starts and stops dictation" if model else "") + ", Ctrl+C quits", flush=True)
    keyboard.wait()


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--key", default="ctrl+alt+d", help="hotkey that starts and stops recording (default ctrl+alt+d)")
    p.add_argument("--model", default="base.en", help="whisper model: tiny.en, base.en, small.en (default base.en)")
    p.add_argument("--enter", action="store_true", help="press Enter after typing (sends the message)")
    p.add_argument("--no-dictate", action="store_true", help="narration hotkeys only: no microphone, no model")
    p.add_argument("--file", help="transcribe this audio file and print it, then exit")
    a = p.parse_args()
    model = None if a.no_dictate else load(a.model)
    if a.file:
        print(transcribe(model, a.file))
        return 0
    try:
        listen(model, a.key, a.enter)
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
