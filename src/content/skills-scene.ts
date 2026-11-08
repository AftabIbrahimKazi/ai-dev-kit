import type { SceneSection } from "@/types/kit-stage";

const SKILL_GROUPS: readonly string[] = [
  "skills-workflow", "skills-standards", "skills-meta", "skills-memory", "skills-mcp",
  "skills-libraries", "skills-stack", "skills-addons", "skills-models",
];
const ALL_NODES: readonly string[] = [];
const SIDE_ASIDE = -1.35 as const;
const HERO_SIDE = -1.2 as const;
const SHELF_SCALE = 0.65 as const;
const SHELF_CONTEXT = 0.12 as const;

function frame(id: string, groups: readonly string[], lit: number, outside: number, theta: number, phi: number, fov: number, scale: number, label = "", side: number = SIDE_ASIDE): SceneSection {
  return { id, groups, lit, outside, theta, phi, fov, side, scale, label };
}

function shelf(id: string, group: string, theta: number, phi: number, fov: number, label: string): SceneSection {
  return frame(`type-${id}`, [group], 1, SHELF_CONTEXT, theta, phi, fov, SHELF_SCALE, label);
}

export const SKILLS_SCENE: readonly SceneSection[] = [
  frame("skills-hero", ALL_NODES, 0.35, 0.35, 0.2, 1.05, 60, 0.55, "", HERO_SIDE),
  frame("card", SKILL_GROUPS, 0.6, 0.1, 0.9, 1.65, 56, 0.7),
  frame("shelf", SKILL_GROUPS, 0.2, 0.06, 1.6, 1.15, 58, 0.65),
  frame("anatomy", ["skills-workflow"], 0.95, SHELF_CONTEXT, 2.3, 0.95, 42, 0.9),
  frame("modes", SKILL_GROUPS, 0.75, 0.1, 3, 1.55, 60, 0.7),
  frame("types", SKILL_GROUPS, 0.9, SHELF_CONTEXT, 3.7, 1.1, 58, 0.65),
  shelf("workflow", "skills-workflow", 4.4, 1, 48, "Workflow"),
  shelf("standards", "skills-standards", 5.1, 1.6, 52, "Standards"),
  shelf("meta", "skills-meta", 5.8, 1.15, 46, "Meta"),
  shelf("memory", "skills-memory", 6.5, 1.75, 54, "Memory"),
  shelf("mcp", "skills-mcp", 7.2, 0.95, 48, "MCP"),
  shelf("libraries", "skills-libraries", 7.9, 1.55, 52, "Libraries"),
  shelf("stack", "skills-stack", 8.6, 1.1, 46, "Stack"),
  shelf("addons", "skills-addons", 9.3, 1.7, 54, "Add-ons"),
  shelf("models", "skills-models", 10, 1, 50, "Models"),
  frame("finder", SKILL_GROUPS, 0.6, 0.1, 10.7, 1.3, 58, 0.65),
  frame("next", ALL_NODES, 0.45, 0.45, 11.4, 1.2, 62, 0.55),
];

export const SKILL_NODE_OVERRIDES: Readonly<Record<string, string>> = {
  "local-vision": "mcp-manager.local-vision",
  "image-gen": "mcp-manager.image-gen",
  stitch: "mcp-manager.stitch",
};

export const HL_NAME = "name" as const;
export const HL_GROUP = "group" as const;
export const HL_SEPARATOR = ":" as const;

export function hlName(skill: string): string {
  return `${HL_NAME}${HL_SEPARATOR}${SKILL_NODE_OVERRIDES[skill] ?? skill}`;
}

export function hlGroup(typeId: string): string {
  return `${HL_GROUP}${HL_SEPARATOR}skills-${typeId}`;
}
