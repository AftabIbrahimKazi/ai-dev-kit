export interface SkillExample {
  name: string;
  trigger: string;
  source: string;
}

export const SKILLS_INTRO = {
  text: "The agent reads each skill's short description and loads the skill when the situation matches.",
  source: "README, guaranteed-versus-model-judged table",
} as const;

export const SKILL_EXAMPLES: readonly SkillExample[] = [
  {
    name: "plan-first",
    trigger: "Task touches 3+ files, has ambiguous scope or several deliverables, or plan mode for big work. Load BEFORE the first edit.",
    source: "skills/workflow/plan-first.md, description",
  },
  {
    name: "pre-merge-gate",
    trigger: "A change is about to be called done, ready for review, handed off or committed. Load BEFORE saying done or committing.",
    source: "skills/workflow/pre-merge-gate.md, description",
  },
];

export const SKILLS_CAVEAT = {
  text: "Loading is model-judged, not guaranteed. The mods are what enforce the critical gates.",
  source: "README line 25 and the guaranteed-versus-model-judged table",
} as const;
