import { ANATOMY_ROWS, FLOW_STEPS, SHELF_DIM, SHELF_LIT } from "@/content/skills-guide";
import { hlName } from "@/content/skills-scene";
import type { GuideVisual } from "@/types/skills-guide";

const FLOW_ACTS: readonly string[] = ["say", "when", "ai"];
const ANATOMY_ACTS: readonly string[] = ["does", "when", "ai"];
const NODE = "rk-glass p-[var(--space-default)_var(--space-md)] rounded-[var(--radius-outer)]";

function Flow() {
  return (
    <ol className="rk-flow d-flex list-unstyled">
      {FLOW_STEPS.map((step, index) => (
        <li key={step.label} className={`${NODE} rk-hl-ts rk-reveal rk-reveal-d${index} position-relative`} data-reveal="idle" data-hl={hlName(SHELF_LIT)} data-act={FLOW_ACTS[index]}>
          <span className="d-block fs-[var(--font-size-xs)] text-[var(--color-text-muted)]">{step.label}</span>
          <span className="d-block fs-[var(--font-size-md)] fw-[var(--font-weight-bold)]">{step.value}</span>
          {index < FLOW_STEPS.length - 1 ? (
            <span aria-hidden="true" className="rk-flow-arrow">
              →
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function Shelf() {
  return (
    <ul className="d-flex flex-wrap list-unstyled col-gap-[var(--space-xs)] row-gap-[var(--space-xs)]">
      {SHELF_DIM.map((name) => (
        <li key={name} data-hl={hlName(name)} className="rk-hl-ts rk-glass fs-[var(--font-size-sm)] opacity-[var(--opacity-dim)] p-[var(--space-xs)_var(--space-sm)] rounded-[var(--radius-pill)]">
          <code>{name}</code>
        </li>
      ))}
      <li data-hl={hlName(SHELF_LIT)} className="rk-hl-ts rk-glass rk-lit fs-[var(--font-size-sm)] fw-[var(--font-weight-black)] p-[var(--space-xs)_var(--space-sm)] rounded-[var(--radius-pill)]">
        <code>{SHELF_LIT}</code>
      </li>
    </ul>
  );
}

function Anatomy() {
  return (
    <dl data-hl={hlName(SHELF_LIT)} className={`${NODE} rk-hl-ts d-flex flex-column row-gap-[var(--space-sm)] max-w-[var(--measure-text)]`}>
      {ANATOMY_ROWS.map((row, index) => (
        <div key={row.label} data-act={ANATOMY_ACTS[index]}>
          <dt className="fs-[var(--font-size-xs)] fw-[var(--font-weight-bold)] text-[var(--color-text-muted)]">{row.label}</dt>
          <dd className="fs-[var(--font-size-sm)] ms-[0]">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const VISUALS: Record<GuideVisual, () => React.JSX.Element> = { flow: Flow, shelf: Shelf, anatomy: Anatomy };

interface StoryVisualProps {
  kind: GuideVisual;
}

export default function StoryVisual({ kind }: StoryVisualProps) {
  const Visual = VISUALS[kind];
  return <Visual />;
}
