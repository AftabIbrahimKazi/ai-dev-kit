interface LedgerReadoutProps {
  figure: string;
  unit: string;
  label: string;
  qualifier: string;
  measure: string;
}

export default function LedgerReadout({ figure, unit, label, qualifier, measure }: LedgerReadoutProps) {
  return (
    <>
      <div className="rk-glass max-w-[var(--measure-text)] p-[min(var(--space-md),2dvh)_var(--space-md)] rounded-[var(--radius-outer)]">
        <p className="rk-readout fs-[min(var(--font-size-display),11dvh,13vw)] fw-[var(--font-weight-black)]">
          {figure} <span className="fs-[min(var(--font-size-xl),4dvh)]">{unit}</span>
        </p>
        <p className="rk-snug fs-[max(var(--font-size-xs),min(var(--font-size-md),3dvh))]">{label}</p>
        <p className="rk-snug fs-[max(var(--font-size-xs),min(var(--font-size-sm),2.6dvh))] text-[var(--color-text-muted)]">{qualifier}</p>
      </div>
      <p className="rk-short-hide rk-snug fs-[var(--font-size-sm)] max-w-[var(--measure-text)] mt-[min(var(--space-md),2dvh)] text-[var(--color-text-body)]">
        {measure}
      </p>
    </>
  );
}
