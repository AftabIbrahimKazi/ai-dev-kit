import type { SkillExample } from "@/content/skills";

interface SkillsRackProps {
  skills: readonly SkillExample[];
  intro: string;
  caveat: string;
}

export default function SkillsRack({ skills, intro, caveat }: SkillsRackProps) {
  return (
    <>
      <p className="rk-short-hide fs-[var(--font-size-sm)] max-w-[var(--measure-text)] text-[var(--color-text-muted)]">
        {intro}
      </p>
      <ul className="d-flex flex-column list-unstyled mt-[min(var(--space-md),2dvh)] row-gap-[min(var(--space-sm),1.5dvh)]">
        {skills.map((skill, index) => (
          <li
            key={skill.name}
            className={`${index > 0 ? "rk-compact-hide " : ""}rk-glass max-w-[var(--measure-text)] p-[min(var(--space-sm),1.5dvh)_var(--space-md)] rounded-[var(--radius-outer)]`}
          >
            <p className="rk-snug fs-[max(var(--font-size-xs),min(var(--font-size-md),3dvh))] fw-[var(--font-weight-bold)]">
              <code>{skill.name}</code>
            </p>
            <p className="rk-snug fs-[max(var(--font-size-xs),min(var(--font-size-sm),2.6dvh))] text-[var(--color-text-body)]">
              {skill.trigger}
            </p>
          </li>
        ))}
      </ul>
      <p className="rk-snug fs-[max(var(--font-size-xs),min(var(--font-size-sm),2.6dvh))] max-w-[var(--measure-text)] mt-[min(var(--space-sm),1.5dvh)] text-[var(--color-text-muted)]">
        {caveat}
      </p>
    </>
  );
}
