import type { GateAttempt } from "@/content/mods";

interface ModGatesProps {
  attempts: readonly GateAttempt[];
  intro: string;
  caveat: string;
}

const COMPACT_KEEP: readonly string[] = ["secret", "clean"];

export default function ModGates({ attempts, intro, caveat }: ModGatesProps) {
  return (
    <>
      <p className="rk-short-hide fs-[var(--font-size-sm)] max-w-[var(--measure-text)] text-[var(--color-text-muted)]">
        {intro}
      </p>
      <ul className="d-flex flex-column list-unstyled mt-[min(var(--space-md),2dvh)] row-gap-[min(var(--space-sm),1.5dvh)]">
        {attempts.map((attempt) => (
          <li
            key={attempt.id}
            className={`${COMPACT_KEEP.includes(attempt.id) ? "" : "rk-compact-hide "}rk-glass align-items-center col-gap-[var(--space-md)_var(--space-md)] d-flex justify-content-between max-w-[var(--measure-text)] p-[min(var(--space-xs),1.2dvh)_var(--space-md)] rounded-[var(--radius-pill)]`}
          >
            <code className="rk-snug fs-[max(var(--font-size-xs),min(var(--font-size-sm),2.8dvh))] min-w-0 text-[var(--color-text-body)]">
              {attempt.attempt}
            </code>
            <span
              className="rk-verdict rk-snug fs-[max(var(--font-size-xs),min(var(--font-size-sm),2.8dvh))] fw-[var(--font-weight-bold)] rounded-[var(--radius-pill)]"
              data-state={attempt.verdict}
            >
              {attempt.verdictLabel}
            </span>
          </li>
        ))}
      </ul>
      <p className="rk-snug fs-[max(var(--font-size-xs),min(var(--font-size-sm),2.6dvh))] max-w-[var(--measure-text)] mt-[min(var(--space-sm),1.5dvh)] text-[var(--color-text-muted)]">
        {caveat}
      </p>
    </>
  );
}
