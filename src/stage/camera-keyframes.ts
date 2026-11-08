import type { CameraKeyframe } from "@/types/kit-stage";
import {
  CAMERA_FAN_FOV,
  CAMERA_FAN_MIN_RADIUS,
  CAMERA_FAN_PHI,
  CHAPTER_COMMANDS,
  CHAPTER_MAP,
  CHAPTER_MODS,
  CHAPTER_SKILLS,
  CHAPTER_STANDARDS,
  CLAUDE_POSITION,
  YOU_POSITION,
} from "./stage-config";

export interface ChapterBounds {
  chapter: number;
  x: number;
  y: number;
  z: number;
  fit: number;
  axisX: number;
  axisZ: number;
}

const FULL_TURN = Math.PI * 2;
const HALF_TURN = Math.PI;
const AXIS_EPSILON = 0.001 as const;
const HERO_RADIUS = 78 as const;
const HERO_PHI = 1.5 as const;
const HERO_FOV = 50 as const;
const PROMPT_THETA = Math.PI / 2;
const PROMPT_PHI = 1.42 as const;
const PROMPT_FOV = 52 as const;
const MAP_THETA = 0.8 as const;
const MAP_PHI = 1.2 as const;
const MAP_FOV = 58 as const;
const MODULES_TARGET: readonly [number, number, number] = [0, 0, 30];
const MODULES_RADIUS = 270 as const;
const MODULES_THETA = 2.3 as const;
const MODULES_PHI = 1.12 as const;
const MODULES_FOV = 60 as const;
const SIDE_LEFT = -1 as const;
const SIDE_RIGHT = 1 as const;
const NO_FIT = 0 as const;
const FAN_SIDES: Readonly<Record<number, number>> = {
  [CHAPTER_SKILLS]: SIDE_LEFT,
  [CHAPTER_STANDARDS]: SIDE_RIGHT,
  [CHAPTER_MODS]: SIDE_LEFT,
  [CHAPTER_COMMANDS]: SIDE_RIGHT,
};

function nearestTurn(theta: number, reference: number): number {
  return theta + FULL_TURN * Math.round((reference - theta) / FULL_TURN);
}

function sideOnTheta(axisX: number, axisZ: number, reference: number): number {
  if (Math.hypot(axisX, axisZ) < AXIS_EPSILON) return reference;
  const first = nearestTurn(Math.atan2(axisZ, -axisX), reference);
  const second = nearestTurn(Math.atan2(axisZ, -axisX) + HALF_TURN, reference);
  return Math.abs(first - reference) <= Math.abs(second - reference) ? first : second;
}

export function buildCameraKeyframes(bounds: ChapterBounds[]): CameraKeyframe[] {
  const frames: CameraKeyframe[] = [
    { target: [YOU_POSITION[0], YOU_POSITION[1], YOU_POSITION[2]], radius: HERO_RADIUS, fit: NO_FIT, theta: 0, phi: HERO_PHI, side: SIDE_LEFT, fov: HERO_FOV },
  ];
  const promptCenter: [number, number, number] = [
    (YOU_POSITION[0] + CLAUDE_POSITION[0]) / 2,
    (YOU_POSITION[1] + CLAUDE_POSITION[1]) / 2,
    (YOU_POSITION[2] + CLAUDE_POSITION[2]) / 2,
  ];
  const promptFit = Math.hypot(YOU_POSITION[0] - CLAUDE_POSITION[0], YOU_POSITION[1] - CLAUDE_POSITION[1], YOU_POSITION[2] - CLAUDE_POSITION[2]) / 2;
  frames.push({ target: promptCenter, radius: CAMERA_FAN_MIN_RADIUS, fit: promptFit, theta: PROMPT_THETA, phi: PROMPT_PHI, side: SIDE_RIGHT, fov: PROMPT_FOV });
  [CHAPTER_SKILLS, CHAPTER_STANDARDS, CHAPTER_MODS, CHAPTER_COMMANDS].forEach((chapter) => {
    const entry = bounds.find((item) => item.chapter === chapter);
    if (!entry) return;
    const previous = frames[frames.length - 1].theta;
    frames.push({
      target: [entry.x, entry.y, entry.z],
      radius: CAMERA_FAN_MIN_RADIUS,
      fit: entry.fit,
      theta: sideOnTheta(entry.axisX, entry.axisZ, previous),
      phi: CAMERA_FAN_PHI,
      side: FAN_SIDES[chapter],
      fov: CAMERA_FAN_FOV,
    });
  });
  const whole = bounds.find((item) => item.chapter === CHAPTER_MAP);
  const mapTarget: [number, number, number] = whole ? [whole.x, whole.y, whole.z] : [0, 0, 0];
  const lastTheta = frames[frames.length - 1].theta;
  frames.push({ target: mapTarget, radius: CAMERA_FAN_MIN_RADIUS, fit: whole ? whole.fit : NO_FIT, theta: nearestTurn(MAP_THETA, lastTheta), phi: MAP_PHI, side: SIDE_LEFT, fov: MAP_FOV });
  frames.push({
    target: [MODULES_TARGET[0], MODULES_TARGET[1], MODULES_TARGET[2]],
    radius: MODULES_RADIUS,
    fit: NO_FIT,
    theta: nearestTurn(MODULES_THETA, frames[frames.length - 1].theta),
    phi: MODULES_PHI,
    side: 0,
    fov: MODULES_FOV,
  });
  return frames;
}
