"use client";

import { useEffect, useRef } from "react";
import { INTRO_DIALOG_LABEL, INTRO_SKIP_LABEL, INTRO_SOUND_HINT, INTRO_TAGLINE, INTRO_TITLE } from "@/content/intro";
import type { ToneName } from "@/sound/sound-config";
import { soundEngine } from "@/sound/sound-engine";
import { INTRO_ATTRIBUTE, INTRO_DONE, INTRO_LIFT, INTRO_PHASE_EVENT, INTRO_PLAY, STAGE_READY, STAGE_READY_ATTRIBUTE, STAGE_READY_EVENT } from "@/stage/stage-config";
import type { IntroPhaseDetail } from "@/types/kit-stage";
import { INTRO_STORAGE_KEY, IS_INTRO_ONCE } from "./intro-config";
import "./landing-intro.css";

interface IntroStep {
  phase: string;
  ms: number;
  tone: ToneName;
}

const STEPS: readonly IntroStep[] = [
  { phase: "draw", ms: 1000, tone: "intro-swell" },
  { phase: "pulse", ms: 700, tone: "intro-spark" },
  { phase: "arrive", ms: 600, tone: "intro-chime" },
  { phase: INTRO_LIFT, ms: 500, tone: "intro-whoosh" },
];
const LIFT_STEP = 3 as const;
const READY_MAX_MS = 5000 as const;
const HINT_LOCKED = "locked" as const;
const HINT_READY = "ready" as const;
const SKIP_KEY = "Escape" as const;

export default function LandingIntro() {
  const overlayRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const skipActionRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const overlay = overlayRef.current;
    const root = document.documentElement;
    if (!overlay || root.getAttribute(INTRO_ATTRIBUTE) !== INTRO_PLAY) return undefined;
    let timer = 0;
    let readyTimer = 0;
    let stepIndex = -1;
    let isCancelled = false;
    let isStarted = false;

    try {
      if (IS_INTRO_ONCE) localStorage.setItem(INTRO_STORAGE_KEY, "1");
    } catch {
      /* storage blocked: the intro may replay next visit */
    }

    const runStep = (index: number): void => {
      if (isCancelled) return;
      const step = STEPS[index];
      stepIndex = index;
      overlay.dataset.phase = step.phase;
      if (index === LIFT_STEP) root.setAttribute(INTRO_ATTRIBUTE, INTRO_LIFT);
      window.dispatchEvent(new CustomEvent<IntroPhaseDetail>(INTRO_PHASE_EVENT, { detail: { phase: step.phase, ms: step.ms } }));
      soundEngine.play(step.tone);
      timer = window.setTimeout(() => (index + 1 < STEPS.length ? runStep(index + 1) : root.setAttribute(INTRO_ATTRIBUTE, INTRO_DONE)), step.ms);
    };

    const start = (): void => {
      if (isStarted || isCancelled) return;
      isStarted = true;
      window.clearTimeout(readyTimer);
      window.removeEventListener(STAGE_READY_EVENT, start);
      overlay.dataset.soundHint = soundEngine.getEnabled() && soundEngine.isLocked() ? HINT_LOCKED : HINT_READY;
      skipRef.current?.focus({ preventScroll: true });
      runStep(0);
    };

    skipActionRef.current = (): void => {
      if (!isStarted) {
        start();
        return;
      }
      if (stepIndex >= LIFT_STEP) return;
      window.clearTimeout(timer);
      runStep(LIFT_STEP);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === SKIP_KEY) skipActionRef.current();
    };

    const stopUnlock = soundEngine.onUnlock(() => {
      overlay.dataset.soundHint = HINT_READY;
      if (stepIndex >= 0) soundEngine.play(STEPS[stepIndex].tone);
    });

    document.addEventListener("keydown", onKeyDown);
    soundEngine.init().then(() => {
      if (isCancelled) return;
      if (root.getAttribute(STAGE_READY_ATTRIBUTE) === STAGE_READY) {
        start();
        return;
      }
      window.addEventListener(STAGE_READY_EVENT, start);
      readyTimer = window.setTimeout(start, READY_MAX_MS);
    });

    return () => {
      isCancelled = true;
      window.clearTimeout(timer);
      window.clearTimeout(readyTimer);
      window.removeEventListener(STAGE_READY_EVENT, start);
      document.removeEventListener("keydown", onKeyDown);
      stopUnlock();
    };
  }, []);

  return (
    <div ref={overlayRef} className="rk-intro" role="dialog" aria-modal="true" aria-label={INTRO_DIALOG_LABEL} data-phase="wait" data-sound-hint={HINT_READY}>
      <button
        ref={skipRef}
        type="button"
        className="rk-intro-skip rk-glass rk-link cursor-pointer fs-[var(--font-size-sm)] p-[var(--space-xs)_var(--space-md)] rounded-[var(--radius-pill)]"
        onClick={() => skipActionRef.current()}
      >
        {INTRO_SKIP_LABEL}
      </button>
      <div className="rk-intro-title rk-glass align-items-center d-flex flex-column p-[var(--space-md)_var(--space-lg)] rounded-[var(--radius-outer)] row-gap-[var(--space-xxs)] text-center">
        <p className="fs-[var(--font-size-xxl)] fw-[var(--font-weight-black)] text-[var(--color-text-body)]">{INTRO_TITLE}</p>
        <p className="fs-[var(--font-size-default)] text-[var(--color-text-muted)]">{INTRO_TAGLINE}</p>
      </div>
      <p className="rk-intro-hint fs-[var(--font-size-sm)] text-[var(--color-text-muted)]" aria-live="polite">
        {INTRO_SOUND_HINT}
      </p>
    </div>
  );
}
