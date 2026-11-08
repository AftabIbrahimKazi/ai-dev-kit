import type { Color, Vector3 } from "three";

export type ActorIndex = 0 | 1 | 2 | 3;

export type KitGraphNodeRow = [string, string, string, ActorIndex, number, number, number];

export type KitGraphEdgeRow = [number, number];

export interface KitGraph {
  groups: string[];
  nodes: KitGraphNodeRow[];
  edges: KitGraphEdgeRow[];
}

export interface StageNode {
  index: number;
  id: string;
  label: string;
  group: string;
  actor: ActorIndex;
  position: Vector3;
  radius: number;
}

export interface StagePalette {
  actors: Color[];
  background: Color;
  fan: Color[];
  isDark: boolean;
}

export interface CameraKeyframe {
  target: [number, number, number];
  radius: number;
  fit: number;
  theta: number;
  phi: number;
  side: number;
  fov: number;
}

export interface CameraFocus {
  target: Vector3;
  radius: number;
  blend: number;
}

export interface CameraPose {
  tx: number;
  ty: number;
  tz: number;
  radius: number;
  fit: number;
  theta: number;
  phi: number;
  side: number;
  fov: number;
}

export interface SignalFanSpec {
  chapter: number;
  source: Vector3;
  targets: Vector3[];
  paletteIndex: number;
}

export interface IntroPhaseDetail {
  phase: string;
  ms: number;
}

export interface HoverFanSpec {
  source: Vector3;
  targets: Vector3[];
  actor: ActorIndex;
}

export interface StageElements {
  canvas: HTMLCanvasElement;
  chapters: HTMLElement[];
  rail: HTMLElement[];
  typed: HTMLElement | null;
  modules: HTMLElement | null;
  root: HTMLElement;
}

export interface ModuleFocus {
  slug: string;
  groups: readonly string[];
}

export interface StageLoopSample {
  frameCount: number;
  elapsedMs: number;
}

export interface SceneSection {
  id: string;
  groups: readonly string[];
  lit: number;
  outside: number;
  theta: number;
  phi: number;
  fov: number;
  side: number;
  scale: number;
  label: string;
}
