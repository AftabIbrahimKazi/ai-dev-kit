import type { StandardsLayer } from "@/content/standards";

interface StandardsLayersProps {
  layers: readonly StandardsLayer[];
  intro: string;
}

export default function StandardsLayers({ layers, intro }: StandardsLayersProps) {
  return (
    <>
      <p className="rk-short-hide fs-[var(--font-size-sm)] max-w-[var(--measure-text)] text-[var(--color-text-muted)]">
        {intro}
      </p>
      <ol className="d-flex flex-column list-unstyled mt-[min(var(--space-md),2dvh)] row-gap-[min(var(--space-sm),1.5dvh)]">
        {layers.map((layer) => (
          <li
            key={layer.id}
            className="rk-glass max-w-[var(--measure-text)] p-[min(var(--space-sm),1.5dvh)_var(--space-md)] rounded-[var(--radius-outer)]"
          >
            <p className="rk-snug rk-tiny-hide fs-[max(var(--font-size-xs),min(var(--font-size-sm),2.4dvh))] text-[var(--color-text-muted)]">
              {layer.layer}, {layer.scope}
            </p>
            <p className="rk-snug fs-[max(var(--font-size-xs),min(var(--font-size-md),3dvh))] fw-[var(--font-weight-bold)]">
              <code>{layer.ruleId}</code> {layer.ruleTitle}
            </p>
            <p className="rk-short-hide rk-snug fs-[max(var(--font-size-xs),min(var(--font-size-sm),2.6dvh))] text-[var(--color-text-body)]">
              {layer.ruleText}
            </p>
          </li>
        ))}
      </ol>
    </>
  );
}
