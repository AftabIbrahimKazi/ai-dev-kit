"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { SOUND_OFF, SOUND_ON, SOUND_OWN_ATTRIBUTE } from "@/sound/sound-config";
import { soundEngine } from "@/sound/sound-engine";

type SoundState = typeof SOUND_ON | typeof SOUND_OFF;

export default function SoundToggle() {
  const [state, setState] = useState<SoundState>(SOUND_ON);

  useEffect(() => {
    let isCancelled = false;
    soundEngine.init().then(() => {
      if (!isCancelled) setState(soundEngine.getEnabled() ? SOUND_ON : SOUND_OFF);
    });
    return () => {
      isCancelled = true;
    };
  }, []);

  function onToggleClick(): void {
    const isEnabled = state === SOUND_OFF;
    soundEngine.setEnabled(isEnabled);
    setState(isEnabled ? SOUND_ON : SOUND_OFF);
    soundEngine.unlock();
    soundEngine.play(isEnabled ? "toggle-on" : "toggle-off");
  }

  const ownAttribute = { [SOUND_OWN_ATTRIBUTE]: "" };

  return (
    <button
      type="button"
      aria-label="Sound effects"
      aria-pressed={state === SOUND_ON}
      data-sound-state={state}
      className="rk-theme-toggle rk-glass rk-link cursor-pointer rounded-[var(--radius-pill)]"
      onClick={onToggleClick}
      {...ownAttribute}
    >
      <Volume2 className="rk-theme-icon rk-sound-on" size={20} strokeWidth={2.25} />
      <VolumeX className="rk-theme-icon rk-sound-off" size={20} strokeWidth={2.25} />
    </button>
  );
}
