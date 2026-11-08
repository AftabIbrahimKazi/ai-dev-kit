"use client";

import { useEffect } from "react";
import "@strata-packages/cursorfx/css";
import type { CursorFXInstance } from "@strata-packages/cursorfx";

const NO_HOVER_QUERY = "(hover: none)" as const;
const THEME_ATTRIBUTE = "data-st-theme" as const;
const PULSE_PARTICLES = 0 as const;
const INNER_VELOCITY = 220 as const;
const INNER_LIFE_SECONDS = 0.8 as const;
const OUTER_VELOCITY = 340 as const;
const OUTER_LIFE_SECONDS = 1.2 as const;

function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function readInnerColor(): string {
  return `${readToken("--color-lamp-hi")} ${readToken("--color-accent")}`;
}

function readOuterColor(): string {
  return `${readToken("--color-accent-hover")} ${readToken("--color-lamp-hi")}`;
}

async function mountEffects(): Promise<() => void> {
  const engineModule = await import("@strata-packages/cursorfx");
  await import("@strata-packages/cursorfx/particles");
  await import("@strata-packages/cursorfx/behaviours/origin/ring");
  await import("@strata-packages/cursorfx/behaviours/motion/ballistic");
  await import("@strata-packages/cursorfx/behaviours/render/dot");
  const burstModule = await import("@strata-packages/cursorfx/presets/click-burst");

  const engine = engineModule.default;
  engine.init();
  const inner = engine.mount(burstModule.default, { color: readInnerColor(), count: PULSE_PARTICLES, velocity: INNER_VELOCITY, life: INNER_LIFE_SECONDS, ring: true });
  const outer = engine.mount(burstModule.default, { color: readOuterColor(), count: PULSE_PARTICLES, velocity: OUTER_VELOCITY, life: OUTER_LIFE_SECONDS, ring: true });
  const instances: CursorFXInstance[] = [inner, outer];

  const observer = new MutationObserver(() => {
    inner.setColor(readInnerColor());
    outer.setColor(readOuterColor());
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [THEME_ATTRIBUTE] });

  return () => {
    observer.disconnect();
    instances.forEach((instance) => instance.unmount());
  };
}

export default function CursorFx(): null {
  useEffect(() => {
    if (window.matchMedia(NO_HOVER_QUERY).matches) return undefined;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    mountEffects().then(
      (dispose) => {
        if (cancelled) dispose();
        else cleanup = dispose;
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return null;
}
