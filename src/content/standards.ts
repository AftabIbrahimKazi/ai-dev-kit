export interface StandardsLayer {
  id: string;
  layer: string;
  scope: string;
  ruleId: string;
  ruleTitle: string;
  ruleText: string;
  source: string;
}

export const STANDARDS_INTRO = {
  text: "An agent reads the layers top down for every file it edits. Framework rules extend or override the universal ones.",
  source: "coding-standards/index.md, Reading Order and Override Notation",
} as const;

export const STANDARDS_LAYERS: readonly StandardsLayer[] = [
  {
    id: "global",
    layer: "Layer 1",
    scope: "Universal global",
    ruleId: "RULE 14",
    ruleTitle: "No !important",
    ruleText: "Banned everywhere, no exceptions. Fix the selector instead.",
    source: "coding-standards/css-standards.md, RULE 14",
  },
  {
    id: "file-type",
    layer: "Layer 2",
    scope: "Universal file-type",
    ruleId: "RULE T-05",
    ruleTitle: "Semantic colours reference the palette",
    ruleText: "--color-text-body: var(--color-slate-200); never a hardcoded value.",
    source: "coding-standards/css-standards/token-files.md, RULE T-05",
  },
  {
    id: "framework",
    layer: "Layer 3",
    scope: "Framework",
    ruleId: "RULE SC-05",
    ruleTitle: "No !-prefixed variants",
    ruleText: "Utilities carry no !important by design, so the !m-0 variants are banned.",
    source: "coding-standards/frameworks/strata-css.md, RULE SC-05",
  },
];
