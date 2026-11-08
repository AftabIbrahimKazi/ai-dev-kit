import { easeInOutCubic } from "@triforge/keyframe";

const HOLD_END = 0.5 as const;
const MAX_CHAPTER_INDEX = 7 as const;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function smoothstep(edgeStart: number, edgeEnd: number, value: number): number {
  const t = clamp((value - edgeStart) / (edgeEnd - edgeStart), 0, 1);
  return t * t * (3 - 2 * t);
}

export function getDampFactor(rate: number, deltaSeconds: number): number {
  return 1 - Math.exp(-rate * deltaSeconds);
}

export function getChapterWeights(chapter: number, weights: number[]): void {
  weights.fill(0);
  const index = Math.min(MAX_CHAPTER_INDEX, Math.floor(chapter));
  if (index >= MAX_CHAPTER_INDEX) {
    weights[MAX_CHAPTER_INDEX] = 1;
    return;
  }
  const t = easeInOutCubic(clamp((chapter - index - HOLD_END) / (1 - HOLD_END), 0, 1));
  weights[index] = 1 - t;
  weights[index + 1] = t;
}
