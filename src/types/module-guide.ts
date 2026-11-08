import type { StoryAct } from "@/stage/story-pulse-scene";

export interface ModuleRow {
  label: string;
  text: string;
  hl?: string;
  act?: string;
}

export interface ModuleIntro {
  id: string;
  kicker: string;
  title: string;
  line: string;
  moreLabel: string;
  more: readonly string[];
}

export interface ModuleItem {
  id: string;
  name: string;
  hl: string;
  line: string;
  rows: readonly ModuleRow[];
  groups?: readonly string[];
  moreLabel?: string;
  more?: readonly string[];
}

export interface ModuleFinderRow {
  situation: string;
  item: string;
  hl: string;
}

export interface RailStop {
  label: string;
  ids: readonly string[];
}

export interface ModuleMotion {
  act: StoryAct;
  thetaStep: number;
  phiCycle: readonly number[];
  fovBias: number;
}

export interface ModuleGuide {
  slug: string;
  title: string;
  line: string;
  intro: readonly ModuleIntro[];
  itemsKicker: string;
  items: readonly ModuleItem[];
  finder: readonly ModuleFinderRow[];
}
