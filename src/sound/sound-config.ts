export type ToneName = "hover" | "focus" | "press" | "click" | "theme" | "toggle-on" | "toggle-off" | "intro-swell" | "intro-spark" | "intro-chime" | "intro-whoosh";

export interface ToneSpec {
  volume?: number;
  randomness?: number;
  frequency?: number;
  attack?: number;
  sustain?: number;
  release?: number;
  shape?: number;
  shapeCurve?: number;
  slide?: number;
  deltaSlide?: number;
  pitchJump?: number;
  pitchJumpTime?: number;
  repeatTime?: number;
  noise?: number;
  modulation?: number;
  bitCrush?: number;
  delay?: number;
  sustainVolume?: number;
  decay?: number;
  tremolo?: number;
}

export const TONE_PARAMETER_ORDER: ReadonlyArray<keyof ToneSpec> = [
  "volume",
  "randomness",
  "frequency",
  "attack",
  "sustain",
  "release",
  "shape",
  "shapeCurve",
  "slide",
  "deltaSlide",
  "pitchJump",
  "pitchJumpTime",
  "repeatTime",
  "noise",
  "modulation",
  "bitCrush",
  "delay",
  "sustainVolume",
  "decay",
  "tremolo",
];

export const TONES: Readonly<Record<ToneName, ToneSpec>> = {
  hover: { volume: 0.32, randomness: 0.03, frequency: 1500, attack: 0.002, sustain: 0.004, release: 0.05 },
  focus: { volume: 0.4, randomness: 0.02, frequency: 880, attack: 0.002, sustain: 0.02, release: 0.09, pitchJump: 220, pitchJumpTime: 0.03 },
  press: { volume: 0.6, randomness: 0.02, frequency: 190, attack: 0.002, sustain: 0.02, release: 0.09, slide: -2 },
  click: { volume: 0.55, randomness: 0.02, frequency: 1100, attack: 0.001, sustain: 0.012, release: 0.07, shape: 1, pitchJump: 400, pitchJumpTime: 0.015 },
  theme: { volume: 0.45, randomness: 0, frequency: 660, attack: 0.004, sustain: 0.06, release: 0.28, shape: 1, pitchJump: 330, pitchJumpTime: 0.08, delay: 0.05 },
  "toggle-on": { volume: 0.5, randomness: 0, frequency: 520, attack: 0.004, sustain: 0.06, release: 0.12, pitchJump: 260, pitchJumpTime: 0.06 },
  "toggle-off": { volume: 0.5, randomness: 0, frequency: 520, attack: 0.004, sustain: 0.06, release: 0.12, pitchJump: -200, pitchJumpTime: 0.06 },
  "intro-swell": { volume: 0.5, randomness: 0, frequency: 60, attack: 0.9, sustain: 0.2, release: 0.5, slide: 0.9, shapeCurve: 1.2 },
  "intro-spark": { volume: 0.5, randomness: 0, frequency: 1100, attack: 0.005, sustain: 0.01, release: 0.35, shape: 1, pitchJump: 500, pitchJumpTime: 0.02, delay: 0.08 },
  "intro-chime": { volume: 0.6, randomness: 0, frequency: 523, attack: 0.005, sustain: 0.12, release: 0.6, pitchJump: 261, pitchJumpTime: 0.08, delay: 0.1 },
  "intro-whoosh": { volume: 0.45, randomness: 0, frequency: 220, attack: 0.25, sustain: 0.1, release: 0.5, shape: 4, slide: 3, noise: 0.5 },
};

export const MIN_GAP_MS: Readonly<Record<ToneName, number>> = {
  hover: 70,
  focus: 90,
  press: 40,
  click: 40,
  theme: 120,
  "toggle-on": 120,
  "toggle-off": 120,
  "intro-swell": 0,
  "intro-spark": 0,
  "intro-chime": 0,
  "intro-whoosh": 0,
};

export const SOUND_STORAGE_KEY = "sound" as const;
export const SOUND_ON = "on" as const;
export const SOUND_OFF = "off" as const;
export const MASTER_VOLUME = 0.3 as const;
export const AUDIO_RUNNING = "running" as const;
export const INTERACTIVE_SELECTOR = "a[href], button, [role='button'], [role='tab'], summary, .rk-hl-ts, .rk-module-ts" as const;
export const DISABLED_SELECTOR = "[aria-disabled='true'], :disabled" as const;
export const SOUND_OWN_ATTRIBUTE = "data-rk-sound-own-ts" as const;
export const SOUND_CLICK_ATTRIBUTE = "data-rk-sound-click-ts" as const;
export const FOCUS_VISIBLE_SELECTOR = ":focus-visible" as const;
export const TOUCH_POINTER = "touch" as const;
