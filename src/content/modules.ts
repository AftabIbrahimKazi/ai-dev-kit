export interface KitModule {
  slug: string;
  name: string;
  navLabel?: string;
  summary: string;
  metaDescription: string;
  source: string;
  parts: readonly string[];
}

export const MODULES_INTRO = {
  text: "Each part of the kit has its own page. Start with the one you need.",
  source: "kit repository folder layout",
} as const;

export const KIT_MODULES: readonly KitModule[] = [
  {
    slug: "skills",
    name: "Skills",
    summary: "Instruction files an agent loads when a trigger matches, grouped by category.",
    metaDescription: "A short story of what a skill is, how the AI Dev Kit uses them, and every skill in the kit with its modes and roles. Free and MIT licensed.",
    source: "kit repository skills/ folder",
    parts: ["workflow", "standards", "meta", "memory", "mcp", "libraries", "stack", "addons", "models"],
  },
  {
    slug: "commands",
    name: "Commands",
    summary: "Slash commands you type to run a kit action.",
    metaDescription: "Slash commands you type to run an AI Dev Kit action, such as archiving skills or picking up a handover. Each command is listed with what it does.",
    source: "kit repository skills/commands/ folder",
    parts: [
      "archive", "audit", "commit-check", "ctx", "diagram", "e2e", "eta", "figma", "figma-code", "format", "githooks", "kit", "narration", "next",
      "optimize-assets", "perf", "persona", "pickup", "quiet", "recon", "resolve-conflicts", "responsive-check", "stale", "teardown", "teardown-film",
      "teardown-sound", "unarchive", "untrack", "version-bump", "wrap-up",
    ],
  },
  {
    slug: "mods",
    name: "Mods",
    summary: "Hook-based plugins that run in code and can block an action.",
    metaDescription: "Hook-based plugins in the AI Dev Kit that run in code on tool calls and can block an action. See what each mod does and how to enable it.",
    source: "kit repository mods/ folder",
    parts: [
      "aiignore-guard", "budget-ledger", "debug-nudge", "design-audit-offer", "edit-check", "eta-nudge", "feature-usage", "guard",
      "gap-log", "learnings-inject", "marker-guard", "output-compact", "precommit-gate", "prefilter-rank", "session-journal", "skill-hint", "standards-chain",
    ],
  },
  {
    slug: "coding-standards",
    name: "Coding standards",
    navLabel: "Standards",
    summary: "Layered rules for CSS, HTML, scripts, git, SEO, performance, accessibility, QA, design and AI behaviour.",
    metaDescription: "Layered rules for CSS, HTML, scripts, git, SEO, performance, accessibility, QA, design and AI behaviour, read by the agent before it edits a file.",
    source: "kit repository coding-standards/ folder",
    parts: [
      "css", "html", "javascript", "typescript", "git", "versioning", "seo", "performance", "accessibility", "qa", "design", "ai", "frameworks", "tooling",
    ],
  },
  {
    slug: "mcp",
    name: "MCP servers",
    navLabel: "MCP",
    summary: "Optional tool servers, set up through the mcp-manager skill.",
    metaDescription: "Optional MCP tool servers for the AI Dev Kit, set up through the mcp-manager skill. See which servers the kit supports and how to wire them in.",
    source: "kit repository skills/mcp/ folder",
    parts: ["mcp-manager", "image-gen", "local-vision", "stitch"],
  },
  {
    slug: "add-ons",
    name: "Add-ons",
    summary: "Opt-in extras: reply personas, read-aloud, project docs, the prefilter, diagrams and 3D simulators.",
    metaDescription: "Opt-in AI Dev Kit extras: reply personas, read-aloud, project docs, the prefilter, diagrams and 3D simulators. Install only the ones you need.",
    source: "kit repository skills/addons/ and extensions/ folders",
    parts: ["personality", "narrate", "project-context", "system1-prefilter", "diagram", "figma-code", "teardown", "teardown-film", "teardown-sound", "narrate-buttons"],
  },
  {
    slug: "libraries",
    name: "Libraries and stack",
    navLabel: "Libraries",
    summary: "Guides for the Strata CSS and Triforge libraries and for stack-specific work.",
    metaDescription: "Guides for the Strata CSS and Triforge libraries and for stack-specific work in the AI Dev Kit, so agents build with the right tools.",
    source: "kit repository skills/libraries/ and skills/stack/ folders",
    parts: ["strata-css", "triforge", "astro-page", "shopify-toolkit-install", "threejs-scene"],
  },
];

export function findModule(slug: string): KitModule | undefined {
  return KIT_MODULES.find((kitModule) => kitModule.slug === slug);
}
