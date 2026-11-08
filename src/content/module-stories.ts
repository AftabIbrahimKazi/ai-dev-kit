import type { SceneSection } from "@/types/kit-stage";
import type { ModuleGuide, ModuleMotion } from "@/types/module-guide";
import { ADDONS_GUIDE } from "./addons-guide";
import { CODING_STANDARDS_GUIDE } from "./coding-standards-guide";
import { COMMANDS_GUIDE } from "./commands-guide";
import { LIBRARIES_GUIDE } from "./libraries-guide";
import { MCP_GUIDE } from "./mcp-guide";
import { MODS_GUIDE } from "./mods-guide";
import { buildStoryScene } from "./story-scene";

export interface ModuleStoryEntry {
  guide: ModuleGuide;
  scene: readonly SceneSection[];
  motion: ModuleMotion;
}

const MOTION_ADDONS: ModuleMotion = { act: "opt-in", thetaStep: 0.5, phiCycle: [1.4, 1.25, 1.5], fovBias: 0 };
const MOTION_COMMANDS: ModuleMotion = { act: "manual", thetaStep: 1.3, phiCycle: [1.5, 1.2, 1.6], fovBias: 4 };
const MOTION_MODS: ModuleMotion = { act: "when", thetaStep: 0.2, phiCycle: [1.45, 1.5], fovBias: -4 };
const MOTION_STANDARDS: ModuleMotion = { act: "does", thetaStep: 0.35, phiCycle: [0.9, 1.0, 0.85, 1.05], fovBias: 0 };
const MOTION_MCP: ModuleMotion = { act: "ai", thetaStep: 0.9, phiCycle: [1.1, 1.4, 1.2], fovBias: 8 };
const MOTION_LIBRARIES: ModuleMotion = { act: "auto", thetaStep: 0.6, phiCycle: [1.6, 1.3, 1.5, 1.2], fovBias: -2 };

function entry(guide: ModuleGuide, groups: readonly string[], motion: ModuleMotion): ModuleStoryEntry {
  return { guide, scene: buildStoryScene(guide, groups, motion), motion };
}

export const MODULE_STORIES: Readonly<Record<string, ModuleStoryEntry>> = {
  [ADDONS_GUIDE.slug]: entry(ADDONS_GUIDE, ["skills-addons"], MOTION_ADDONS),
  [COMMANDS_GUIDE.slug]: entry(COMMANDS_GUIDE, ["skills-commands"], MOTION_COMMANDS),
  [MODS_GUIDE.slug]: entry(MODS_GUIDE, ["mods"], MOTION_MODS),
  [CODING_STANDARDS_GUIDE.slug]: entry(CODING_STANDARDS_GUIDE, ["standards", "partials", "frameworks", "script-partials", "qa"], MOTION_STANDARDS),
  [MCP_GUIDE.slug]: entry(MCP_GUIDE, ["skills-mcp"], MOTION_MCP),
  [LIBRARIES_GUIDE.slug]: entry(LIBRARIES_GUIDE, ["skills-libraries", "skills-stack"], MOTION_LIBRARIES),
};
