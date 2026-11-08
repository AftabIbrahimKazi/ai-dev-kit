import { hlName } from "@/content/skills-scene";
import { Hand, ToggleRight, Zap, type LucideIcon } from "lucide-react";
import type { GuideSkill, SkillMode } from "@/types/skills-guide";

const MODE_LABEL: Record<SkillMode, string> = {
  auto: "Automatic",
  manual: "Manual",
  "opt-in": "Opt-in",
};

const MODE_ICON: Record<SkillMode, LucideIcon> = {
  auto: Zap,
  manual: Hand,
  "opt-in": ToggleRight,
};

const FIELDS = [
  { key: "does", label: "What it does", act: "does" },
  { key: "when", label: "When it applies", act: "when" },
  { key: "you", label: "Your role", act: "you" },
  { key: "ai", label: "AI's role", act: "ai" },
] as const;

interface SkillEntryProps {
  skill: GuideSkill;
}

export default function SkillEntry({ skill }: SkillEntryProps) {
  const ModeIcon = MODE_ICON[skill.mode];
  return (
    <details id={`skill-${skill.name}`} data-hl={hlName(skill.name)} data-act={skill.mode} className="rk-hl-ts rk-more rk-module-ts rk-glass rounded-[var(--radius-outer)]">
      <summary className="rk-more-summary rk-tile-summary p-[var(--space-default)_var(--space-md)]">
        <span className="rk-tile-title">
          <span className="rk-icon-badge">
            <ModeIcon size={24} strokeWidth={2.25} aria-hidden="true" />
          </span>
          <code>{skill.name}</code>
        </span>
        <span className="rk-tile-meta">{MODE_LABEL[skill.mode]}</span>
      </summary>
      <dl className="rk-rise rk-guide-grid d-grid p-[0_var(--space-md)_var(--space-sm)]">
        {FIELDS.map((field) => (
          <div key={field.key} data-act={field.act}>
            <dt className="fs-[var(--font-size-xs)] fw-[var(--font-weight-bold)] text-[var(--color-text-muted)]">{field.label}</dt>
            <dd className="fs-[var(--font-size-sm)] ms-[0] text-[var(--color-text-body)]">{skill[field.key]}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
