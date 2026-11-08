import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface GuideRow {
  id: string;
}

interface Guide {
  items: readonly GuideRow[];
}

interface SkillShape {
  name?: string;
  mode?: string;
}

const SITE_ROOT = fileURLToPath(new URL("../", import.meta.url));
const CONTENT_URL = new URL("../src/content/", import.meta.url);
const OUT_PATH = `${SITE_ROOT}src/content/map-link-targets.ts`;
const GRAPH_PATH = `${SITE_ROOT}src/content/kit-graph.json`;
const GUIDE_FILES: Readonly<Record<string, string>> = {
  commands: "commands-guide.ts",
  mods: "mods-guide.ts",
  "coding-standards": "coding-standards-guide.ts",
  mcp: "mcp-guide.ts",
  "add-ons": "addons-guide.ts",
  libraries: "libraries-guide.ts",
};
const MODULE_OF_GROUP: Readonly<Record<string, string>> = {
  "skills-commands": "commands",
  mods: "mods",
  standards: "coding-standards",
  partials: "coding-standards",
  frameworks: "coding-standards",
  "script-partials": "coding-standards",
  qa: "coding-standards",
  "skills-mcp": "mcp",
  "skills-addons": "add-ons",
  "skills-libraries": "libraries",
  "skills-stack": "libraries",
};
const SKILL_SHELVES: readonly string[] = ["workflow", "standards", "meta", "memory", "models"];
const SKILL_NODE_PREFIX = "skills-" as const;
const FILE_EXTENSION = /\.(md|ts|js|json)$/;

function baseName(id: string): string {
  const last = id.split("/").pop() ?? id;
  return last.replace(FILE_EXTENSION, "").split(".")[0];
}

function collectSkillNames(value: unknown, names: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectSkillNames(entry, names));
    return;
  }
  if (value === null || typeof value !== "object") return;
  const shape = value as SkillShape;
  if (typeof shape.name === "string" && shape.mode) names.add(shape.name);
  Object.values(value).forEach((entry) => collectSkillNames(entry, names));
}

async function loadGuide(file: string): Promise<Guide> {
  const loaded = (await import(new URL(file, CONTENT_URL).href)) as Record<string, unknown>;
  const guide = Object.values(loaded).find((entry) => typeof entry === "object" && entry !== null && "items" in entry);
  return guide as Guide;
}

async function main(): Promise<void> {
  const graph = JSON.parse(readFileSync(GRAPH_PATH, "utf8")) as { nodes: Array<[string, string, string]> };
  const guides: Record<string, Guide> = {};
  for (const [slug, file] of Object.entries(GUIDE_FILES)) guides[slug] = await loadGuide(file);
  const skillNames = new Set<string>();
  collectSkillNames(Object.values(await import(new URL("skills-guide.ts", CONTENT_URL).href)), skillNames);
  const targets: Record<string, string> = {};
  for (const [id, , group] of graph.nodes) {
    const name = baseName(id);
    const slug = MODULE_OF_GROUP[group];
    if (slug) {
      const pattern = new RegExp(`(^|[^a-z0-9-])${name.replace(/[-.]/g, "[-.]")}([^a-z0-9-]|$)`, "i");
      const item = guides[slug].items.find((row) => pattern.test(JSON.stringify(row)));
      if (item) targets[id] = `item-${item.id}`;
      continue;
    }
    const shelf = group.startsWith(SKILL_NODE_PREFIX) ? group.slice(SKILL_NODE_PREFIX.length) : "";
    if (SKILL_SHELVES.includes(shelf) && skillNames.has(name)) targets[id] = `skill-${name}`;
  }
  const lines = Object.keys(targets).sort().map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(targets[id])},`);
  const body = `export const MAP_LINK_TARGETS: Readonly<Record<string, string>> = {\n${lines.join("\n")}\n};\n`;
  writeFileSync(OUT_PATH, body);
  process.stdout.write(`${Object.keys(targets).length} of ${graph.nodes.length} nodes mapped\n`);
}

void main();
