import type { StageElements } from "@/types/kit-stage";

const CHAPTER_SELECTOR = ".rk-chapter-ts" as const;
const RAIL_SELECTOR = ".rk-rail-ts" as const;
const TYPED_SELECTOR = ".rk-typed-ts" as const;
const MODULES_SELECTOR = ".rk-modules-ts" as const;

export class StageElementLoader {
  public load(canvas: HTMLCanvasElement): StageElements {
    return {
      canvas,
      chapters: Array.from(document.querySelectorAll<HTMLElement>(CHAPTER_SELECTOR)),
      rail: Array.from(document.querySelectorAll<HTMLElement>(RAIL_SELECTOR)),
      typed: document.querySelector<HTMLElement>(TYPED_SELECTOR),
      modules: document.querySelector<HTMLElement>(MODULES_SELECTOR),
      root: document.documentElement,
    };
  }
}
