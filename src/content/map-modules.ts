import { MAP_LINK_TARGETS } from "./map-link-targets";

export interface MapModule {
  slug: string;
  label: string;
  groups: readonly string[];
}

export const MAP_MODULES: readonly MapModule[] = [
  { slug: "skills", label: "Skills", groups: ["skills-workflow", "skills-standards", "skills-meta", "skills-memory", "skills-models"] },
  { slug: "commands", label: "Commands", groups: ["skills-commands"] },
  { slug: "mods", label: "Mods", groups: ["mods"] },
  { slug: "coding-standards", label: "Standards", groups: ["standards", "partials", "frameworks", "script-partials", "qa"] },
  { slug: "mcp", label: "MCP", groups: ["skills-mcp"] },
  { slug: "add-ons", label: "Add-ons", groups: ["skills-addons"] },
  { slug: "libraries", label: "Libraries", groups: ["skills-libraries", "skills-stack"] },
];

export function moduleOfGroup(group: string): MapModule | null {
  return MAP_MODULES.find((entry) => entry.groups.includes(group)) ?? null;
}

const GROUP_SECTION: Readonly<Record<string, string>> = {
  standards: "layers",
  partials: "item-files",
  "script-partials": "item-files",
  frameworks: "item-frameworks",
  qa: "item-qa",
  "skills-workflow": "type-workflow",
  "skills-standards": "type-standards",
  "skills-meta": "type-meta",
  "skills-memory": "type-memory",
  "skills-models": "type-models",
};

export function docsHrefForNode(nodeId: string, group: string): string | null {
  const owner = moduleOfGroup(group);
  if (!owner) return null;
  const section = MAP_LINK_TARGETS[nodeId] ?? GROUP_SECTION[group];
  return section ? `/docs/${owner.slug}#${section}` : `/docs/${owner.slug}`;
}
