"use client";

import { easeInOutCubic } from "@triforge/keyframe";
import { ArrowUp } from "lucide-react";
import { useEffect, useRef } from "react";
import type { MouseEvent } from "react";

const MIN_DURATION_MS = 1100 as const;
const MAX_DURATION_MS = 2600 as const;
const MS_PER_PIXEL = 0.45 as const;
const CANCEL_EVENTS: readonly string[] = ["wheel", "touchstart", "keydown", "pointerdown"];
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)" as const;

export default function ScrollTop(): React.JSX.Element {
  const frameRef = useRef<number>(0);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      cancelRef.current?.();
    },
    [],
  );

  const onClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault();
    cancelRef.current?.();
    const from = window.scrollY;
    if (from <= 0) return;
    if (window.matchMedia(REDUCED_MOTION_QUERY).matches) {
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }
    const duration = Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, from * MS_PER_PIXEL));
    const start = performance.now();
    const stop = (): void => {
      cancelAnimationFrame(frameRef.current);
      CANCEL_EVENTS.forEach((name) => window.removeEventListener(name, stop));
      cancelRef.current = null;
    };
    const step = (now: number): void => {
      const progress = Math.min(1, (now - start) / duration);
      window.scrollTo({ top: from * (1 - easeInOutCubic(progress)), behavior: "instant" });
      if (progress < 1) frameRef.current = requestAnimationFrame(step);
      else stop();
    };
    CANCEL_EVENTS.forEach((name) => window.addEventListener(name, stop, { passive: true }));
    cancelRef.current = stop;
    frameRef.current = requestAnimationFrame(step);
  };

  return (
    <a
      href="#"
      aria-label="Back to top"
      onClick={onClick}
      className="rk-scroll-top rk-glass rk-link align-items-center d-flex justify-content-center rounded-[var(--radius-pill)]"
    >
      <ArrowUp size={20} strokeWidth={2.5} />
    </a>
  );
}
