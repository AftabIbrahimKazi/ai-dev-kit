import { REPO_URL } from "@/app/site-nav";

export interface InstallTab {
  id: string;
  label: string;
  lines: readonly string[];
  note: string;
  source: string;
}

export const INSTALL_TABS: readonly InstallTab[] = [
  {
    id: "cli",
    label: "Terminal",
    lines: [`git clone ${REPO_URL}.git`, "cd ai-dev-kit", "node skills/meta/install-kit.cli.js install"],
    note: "Cheapest in tokens. Needs Node.js. With the kit folder inside your project, the installer uses the parent folder as the project and says so.",
    source: 'README "Installing from a terminal" steps 2-5; content-facts install (standard)',
  },
  {
    id: "root",
    label: "Kit elsewhere",
    lines: [
      'node skills/meta/install-kit.cli.js install --root "<project path>"',
      'node "<kit path>/skills/meta/install-kit.cli.js" install --root "<project path>"',
    ],
    note: "Use this when the kit folder sits outside your project. The first line runs from inside the kit folder. The second works from anywhere.",
    source: 'README "Installing from a terminal" step 4, Options A and B; content-facts install (standard)',
  },
  {
    id: "chat",
    label: "In chat",
    lines: ["read skills/README.md and install"],
    note: "Say it to your AI agent. It works, but costs more tokens than the terminal route.",
    source: "README install section; content-facts install (convenience); owner direction 2026-11-01",
  },
];

export const INSTALL_AFTERCARE = {
  text: "The installer is never copied into your project and re-verifies its own result. A fresh install starts lean: 30 per-session and niche skills are archived, not deleted (about 1,800 tokens less per turn, measured), and /next, /role or the skill-hint mod bring back what a task needs (add --keep-active to keep them all on). You may still spend your first session checking nothing was missed.",
  source: 'README "Installing from a terminal"; owner direction 2026-11-01',
} as const;
