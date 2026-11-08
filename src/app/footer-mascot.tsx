"use client";

import { useEffect, useRef } from "react";

interface FooterMascotProps {
  isActive: boolean;
  hookRef: React.RefObject<HTMLElement | null>;
}

type Mode = "walk" | "pause" | "hop" | "leap" | "exit" | "enter";

const PIXEL = 4 as const;
const GRID = 8 as const;
const SIZE = PIXEL * GRID;
const EDGE_GAP = 24 as const;
const HOOK_GAP = 12 as const;
const STEP_MS = 140 as const;
const HOP_MS = 520 as const;
const HOP_HEIGHT = 14 as const;
const LEAP_MS = 620 as const;
const LEAP_HEIGHT = 44 as const;
const LEAP_LAND = 90 as const;
const EXIT_MS = 620 as const;
const EXIT_HEIGHT = 70 as const;
const ENTER_MS = 760 as const;
const ENTER_HEIGHT = 150 as const;
const BOUNCE_COUNT = 3 as const;
const BOUNCE_DECAY = 3 as const;
const BOUNCE_GAIN = 1.15 as const;
const SPEED_MIN = 28 as const;
const SPEED_MAX = 72 as const;
const WALK_MIN_S = 1.2 as const;
const WALK_MAX_S = 5 as const;
const PAUSE_MIN_S = 0.6 as const;
const PAUSE_MAX_S = 2.8 as const;
const HOP_CHANCE = 0.25 as const;
const PAUSE_CHANCE = 0.35 as const;
const TURN_CHANCE = 0.4 as const;
const NEAR_Y = 140 as const;
const FLEE_RADIUS = 170 as const;
const FLEE_SPEED = 135 as const;
const CORNER_RADIUS = 95 as const;
const CORNER_MARGIN = 6 as const;
const COOLDOWN_MS = 900 as const;
const POINTER_IDLE_MS = 2500 as const;
const MAX_DELTA_S = 0.1 as const;
const MS_PER_SECOND = 1000 as const;
const FULL_TURN = 360 as const;
const TURN_MIN_MS = 350 as const;
const CALM_MS = 1000 as const;
const DEAD_ZONE = 14 as const;
const STORAGE_KEY = "rk-mascot" as const;
const SAVE_MS = 1000 as const;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)" as const;

const BODY: readonly string[] = ["a....a..", "aa..aa..", "bbbbbbbb", "bkbbbbkb", "bbbbbbbb", "bbbbbbbb", ".bb..bb."];
const LEGS_A = ".l....l." as const;
const LEGS_B = "l......l" as const;

function between(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function bounce(progress: number): number {
  return Math.abs(Math.cos(progress * Math.PI * BOUNCE_COUNT)) * (1 - progress) ** BOUNCE_DECAY * BOUNCE_GAIN;
}

function Sprite({ legs }: { legs: string }): React.JSX.Element {
  return (
    <g>
      {[...BODY, legs].flatMap((row, y) =>
        Array.from(row).map((cell, x) => (cell === "." ? null : <rect key={`${x}-${y}`} x={x * PIXEL} y={y * PIXEL} width={PIXEL} height={PIXEL} className={`rk-mascot-${cell}`} />)),
      )}
    </g>
  );
}

export default function FooterMascot({ isActive, hookRef }: FooterMascotProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const frameARef = useRef<SVGGElement>(null);
  const frameBRef = useRef<SVGGElement>(null);
  const activeRef = useRef<boolean>(isActive);

  useEffect(() => {
    activeRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    const root = rootRef.current;
    const shell = root?.parentElement;
    const frameA = frameARef.current;
    const frameB = frameBRef.current;
    if (!root || !shell || !frameA || !frameB) return undefined;
    const isReduced = window.matchMedia(REDUCED_MOTION_QUERY).matches;
    let x: number = EDGE_GAP;
    let direction = 1;
    let mode: Mode = "pause";
    let remaining = between(PAUSE_MIN_S, PAUSE_MAX_S);
    let speed = between(SPEED_MIN, SPEED_MAX);
    let modeAt = 0;
    let leapFrom = 0;
    let leapTo = 0;
    let stepAt = 0;
    let cooldownAt = 0;
    let turnAt = 0;
    let calmUntil = 0;
    let isStepB = false;
    let wasActive = activeRef.current;
    let savedAt = 0;
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "null") as { x?: number; direction?: number } | null;
      if (saved && typeof saved.x === "number") x = saved.x;
      if (saved && (saved.direction === 1 || saved.direction === -1)) direction = saved.direction;
    } catch {
      x = EDGE_GAP;
    }
    const save = (): void => {
      try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ x, direction }));
      } catch {
        savedAt = Number.POSITIVE_INFINITY;
      }
    };
    let last = performance.now();
    let frameId = 0;
    let pointerX = -1;
    let pointerY = -1;
    let pointerAt = 0;

    const limit = (): number => {
      const hook = hookRef.current;
      const shellBox = shell.getBoundingClientRect();
      const stop = hook ? hook.getBoundingClientRect().left - shellBox.left - HOOK_GAP : shellBox.width - EDGE_GAP;
      return Math.max(EDGE_GAP, stop - SIZE);
    };

    const begin = (next: Mode, now: number): void => {
      mode = next;
      modeAt = now;
    };

    const choose = (now: number): void => {
      const roll = Math.random();
      if (roll < HOP_CHANCE) {
        begin("hop", now);
        remaining = HOP_MS / MS_PER_SECOND;
        return;
      }
      if (roll < HOP_CHANCE + PAUSE_CHANCE) {
        begin("pause", now);
        remaining = between(PAUSE_MIN_S, PAUSE_MAX_S);
        return;
      }
      begin("walk", now);
      remaining = between(WALK_MIN_S, WALK_MAX_S);
      speed = between(SPEED_MIN, SPEED_MAX);
      if (Math.random() < TURN_CHANCE) direction *= -1;
    };

    const paint = (lift: number, spin: number, opacity: number): void => {
      root.style.transform = `translate(${x}px, ${-lift}px) rotate(${spin}deg) scaleX(${direction})`;
      root.style.opacity = String(opacity);
      frameA.setAttribute("display", isStepB ? "none" : "inline");
      frameB.setAttribute("display", isStepB ? "inline" : "none");
    };

    const stepLegs = (now: number): void => {
      if (now - stepAt > STEP_MS) {
        isStepB = !isStepB;
        stepAt = now;
      }
    };

    const onMove = (event: PointerEvent): void => {
      if (event.pointerType === "touch") return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      pointerAt = performance.now();
    };

    const onDown = (event: PointerEvent): void => {
      const box = root.getBoundingClientRect();
      const isHit = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
      const now = performance.now();
      if (!isHit || !activeRef.current || mode === "exit" || mode === "enter" || now < cooldownAt) return;
      cooldownAt = now + COOLDOWN_MS;
      begin("hop", now);
      remaining = HOP_MS / MS_PER_SECOND;
    };

    const tick = (now: number): void => {
      frameId = requestAnimationFrame(tick);
      const delta = Math.min(MAX_DELTA_S, (now - last) / MS_PER_SECOND);
      last = now;
      if (now - savedAt > SAVE_MS) {
        savedAt = now;
        save();
      }
      const isActiveNow = activeRef.current;
      if (isActiveNow !== wasActive) {
        wasActive = isActiveNow;
        begin(isActiveNow ? "enter" : "exit", now);
        isStepB = false;
      }
      if (mode === "exit") {
        const t = Math.min(1, (now - modeAt) / EXIT_MS);
        paint(Math.sin(t * Math.PI * 0.5) * EXIT_HEIGHT, t * FULL_TURN * direction, 1 - t * t);
        return;
      }
      if (!isActiveNow) {
        paint(0, 0, 0);
        return;
      }
      if (mode === "enter") {
        const t = Math.min(1, (now - modeAt) / ENTER_MS);
        paint(bounce(t) * ENTER_HEIGHT, 0, Math.min(1, t * 4));
        if (t >= 1) choose(now);
        return;
      }
      const max = limit();
      x = Math.min(max, Math.max(EDGE_GAP, x));
      const shellBox = shell.getBoundingClientRect();
      const isCursorNear = now - pointerAt < POINTER_IDLE_MS && pointerX >= shellBox.left && pointerX <= shellBox.right && Math.abs(pointerY - shellBox.top) < NEAR_Y;
      const cursorX = pointerX - shellBox.left;
      const gap = cursorX - (x + SIZE / 2);
      let lift = 0;
      if (mode === "leap") {
        const t = Math.min(1, (now - modeAt) / LEAP_MS);
        x = leapFrom + (leapTo - leapFrom) * t;
        lift = Math.sin(t * Math.PI) * LEAP_HEIGHT;
        if (t >= 1) {
          calmUntil = now + CALM_MS;
          choose(now);
        }
        paint(lift, 0, 1);
        return;
      }
      if (isCursorNear && mode !== "hop" && now >= calmUntil && Math.abs(gap) < FLEE_RADIUS) {
        const away = gap > 0 ? -1 : 1;
        const isCornered = (away < 0 && x <= EDGE_GAP + CORNER_MARGIN) || (away > 0 && x >= max - CORNER_MARGIN);
        if (isCornered && Math.abs(gap) < CORNER_RADIUS && now >= cooldownAt) {
          cooldownAt = now + COOLDOWN_MS;
          begin("leap", now);
          leapFrom = x;
          leapTo = Math.min(max, Math.max(EDGE_GAP, cursorX - SIZE / 2 - away * LEAP_LAND));
          direction = leapTo >= leapFrom ? 1 : -1;
          paint(0, 0, 1);
          return;
        }
        if (Math.abs(gap) > DEAD_ZONE && away !== direction && now - turnAt > TURN_MIN_MS) {
          direction = away;
          turnAt = now;
        }
        const before = x;
        x = Math.min(max, Math.max(EDGE_GAP, x + direction * FLEE_SPEED * delta));
        begin("walk", now);
        remaining = PAUSE_MIN_S;
        if (x !== before) stepLegs(now);
        else isStepB = false;
        paint(0, 0, 1);
        return;
      }
      if (mode === "walk") {
        x += direction * speed * delta;
        if (x >= max) {
          x = max;
          direction = -1;
        } else if (x <= EDGE_GAP) {
          x = EDGE_GAP;
          direction = 1;
        }
        stepLegs(now);
      } else {
        isStepB = false;
        if (mode === "hop") lift = Math.sin(Math.min(1, (now - modeAt) / HOP_MS) * Math.PI) * HOP_HEIGHT;
      }
      remaining -= delta;
      if (remaining <= 0) choose(now);
      paint(lift, 0, 1);
    };

    paint(0, 0, activeRef.current ? 1 : 0);
    if (!isReduced) {
      frameId = requestAnimationFrame(tick);
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerdown", onDown, { passive: true });
    }
    return () => {
      cancelAnimationFrame(frameId);
      save();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [hookRef]);

  return (
    <div ref={rootRef} className="rk-mascot" aria-hidden="true">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} shapeRendering="crispEdges">
        <g ref={frameARef}>
          <Sprite legs={LEGS_A} />
        </g>
        <g ref={frameBRef} display="none">
          <Sprite legs={LEGS_B} />
        </g>
      </svg>
    </div>
  );
}
