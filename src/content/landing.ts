import { KIT_MODULES } from "./modules";
import { SKILLS_INTRO } from "./skills";
import { STANDARDS_INTRO } from "./standards";
import { MODS_INTRO } from "./mods";

export type ChapterSide = "left" | "right" | "center";
export type ChipKind = "name" | "path";

export interface LandingChapter {
  id: string;
  railLabel: string;
  eyebrow: string;
  eyebrowActor: number;
  titleLead: string;
  titleAccent: string;
  lead: string;
  chips: readonly string[];
  chipKind: ChipKind;
  side: ChapterSide;
  source: string;
}

export interface ActorLegendItem {
  name: string;
  actor: number;
  text: string;
  source: string;
}

const partsOf = (slug: string): readonly string[] => KIT_MODULES.find((kitModule) => kitModule.slug === slug)?.parts ?? [];

const MOD_HIGHLIGHTS: readonly string[] = ["guard", "standards-chain", "edit-check", "precommit-gate", "output-compact", "debug-nudge"];
const COMMAND_HIGHLIGHTS: readonly string[] = ["kit", "next", "wrap-up", "pickup", "audit"];
const STANDARD_HIGHLIGHT_COUNT = 8;

const STANDARD_FOLDERS: Readonly<Record<string, readonly string[]>> = {
  javascript: ["js-standards", "js-and-ts-standards"],
  typescript: ["ts-standards", "js-and-ts-standards"],
  qa: ["qa"],
  frameworks: ["frameworks"],
  tooling: ["tooling"],
};
const COMMAND_PREFIX = /^\//;

export function highlightKey(kind: ChipKind, chip: string): string {
  if (kind === "name") return `name:${chip.replace(COMMAND_PREFIX, "")}`;
  const folders = STANDARD_FOLDERS[chip] ?? [`${chip}-standards`];
  return `path:${folders.map((folder) => `coding-standards/${folder}`).join("|")}`;
}

export const LANDING_HERO = {
  titleLines: ["You type.", "The kit does", "the rest."],
  lead: "Agent skills, optional MCP tools, and layered coding standards for AI-assisted development.",
  source: "site hero copy, README overview",
} as const;

export const LANDING_PROMPT = {
  text: "Add a dark-mode toggle to the header",
  label: "Example prompt",
  source: "illustrative prompt, not a quoted session",
} as const;

export const LANDING_CHAPTERS: readonly LandingChapter[] = [
  {
    id: "rk-ch-prompt",
    railLabel: "Prompt",
    eyebrow: "Step 1 · You",
    eyebrowActor: 0,
    titleLead: "It starts with",
    titleAccent: "your words",
    lead: "You ask for a change in plain language. The prompt goes straight to Claude, and everything the kit does happens around it.",
    chips: [],
    chipKind: "name",
    side: "right",
    source: "README overview",
  },
  {
    id: "rk-ch-skills",
    railLabel: "Skills",
    eyebrow: "Step 2 · Claude",
    eyebrowActor: 1,
    titleLead: "Skills",
    titleAccent: "load themselves",
    lead: SKILLS_INTRO.text,
    chips: ["plan-first", "pre-merge-gate", "pre-commit", "debug-protocol"],
    chipKind: "name",
    side: "left",
    source: "skills/workflow/*.md, description lines; SKILLS_INTRO",
  },
  {
    id: "rk-ch-standards",
    railLabel: "Standards",
    eyebrow: "Step 3 · Claude",
    eyebrowActor: 1,
    titleLead: "Rules it reads",
    titleAccent: "before it writes",
    lead: STANDARDS_INTRO.text,
    chips: partsOf("coding-standards").slice(0, STANDARD_HIGHLIGHT_COUNT),
    chipKind: "path",
    side: "right",
    source: "coding-standards/index.md; KIT_MODULES coding-standards parts",
  },
  {
    id: "rk-ch-mods",
    railLabel: "Mods",
    eyebrow: "Step 4 · Automatic",
    eyebrowActor: 2,
    titleLead: "Hooks",
    titleAccent: "guard every move",
    lead: MODS_INTRO.text,
    chips: MOD_HIGHLIGHTS.filter((name) => partsOf("mods").includes(name)),
    chipKind: "name",
    side: "left",
    source: "README, Claude Code mods section; KIT_MODULES mods parts",
  },
  {
    id: "rk-ch-commands",
    railLabel: "Commands",
    eyebrow: "Your side · You",
    eyebrowActor: 0,
    titleLead: "Commands",
    titleAccent: "are yours",
    lead: "Slash commands you type to run a kit action.",
    chips: COMMAND_HIGHLIGHTS.filter((name) => partsOf("commands").includes(name)).map((name) => `/${name}`),
    chipKind: "name",
    side: "right",
    source: "KIT_MODULES commands summary and parts",
  },
  {
    id: "rk-ch-map",
    railLabel: "The map",
    eyebrow: "The whole kit",
    eyebrowActor: 1,
    titleLead: "One map,",
    titleAccent: "four kinds of actor",
    lead: "Every file in the kit belongs to you, to Claude, to the hooks, or to the people who maintain it.",
    chips: [],
    chipKind: "name",
    side: "left",
    source: "kit repository folder layout",
  },
];

export const ACTOR_LEGEND: readonly ActorLegendItem[] = [
  { name: "You", actor: 0, text: "Commands, the README and the docs. You type or read them.", source: "kit repository skills/commands/ and root docs" },
  { name: "Claude", actor: 1, text: "Skills and standards. Claude loads them by matching descriptions.", source: "README, guaranteed-versus-model-judged table" },
  { name: "Automatic", actor: 2, text: "Mods and their scripts. They fire on tool calls and nobody asks.", source: "README, Claude Code mods section" },
  { name: "Maintainers", actor: 3, text: "Tests and audit write-ups. Never part of a prompt.", source: "kit repository tests/ and findings/" },
];

export const MODULE_GROUPS: Readonly<Record<string, readonly string[]>> = {
  skills: ["skills-workflow", "skills-standards", "skills-meta", "skills-memory", "skills-models"],
  commands: ["skills-commands"],
  mods: ["mods"],
  "coding-standards": ["standards", "partials", "frameworks", "script-partials", "qa"],
  mcp: ["skills-mcp"],
  "add-ons": ["skills-addons", "extensions"],
  libraries: ["skills-libraries", "skills-stack"],
};

export const STAGE_TAGS = {
  you: "You",
  claude: "Claude",
  chapters: { 2: "Skills", 3: "Coding standards", 4: "Mods", 5: "Commands" } as Readonly<Record<number, string>>, // keyed by chapter index so the stage can look labels up by number
} as const;

export const RAIL_LABELS: readonly string[] = ["Start", ...LANDING_CHAPTERS.map((chapter) => chapter.railLabel), "Modules"];
