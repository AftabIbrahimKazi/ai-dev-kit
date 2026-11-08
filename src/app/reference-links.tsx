import type { ReferenceLink } from "@/content/reference";

interface ReferenceLinksProps {
  links: readonly ReferenceLink[];
}

const COMPACT_KEEP: readonly string[] = ["readme", "license"];

export default function ReferenceLinks({ links }: ReferenceLinksProps) {
  return (
    <ul className="d-flex flex-column list-unstyled row-gap-[min(var(--space-sm),1.5dvh)]">
      {links.map((link) => (
        <li key={link.id} className={`${COMPACT_KEEP.includes(link.id) ? "" : "rk-compact-hide "}max-w-[var(--measure-text)]`}>
          <a
            href={link.href}
            className="rk-glass rk-link align-items-center col-gap-[var(--space-md)_var(--space-md)] d-flex justify-content-between p-[min(var(--space-xs),1.2dvh)_var(--space-md)] rounded-[var(--radius-pill)]"
          >
            <span className="rk-snug fs-[max(var(--font-size-xs),min(var(--font-size-md),3dvh))] fw-[var(--font-weight-bold)]">{link.label}</span>
            <span className="rk-snug rk-short-hide fs-[max(var(--font-size-xs),min(var(--font-size-sm),2.6dvh))] text-[var(--color-text-muted)]">{link.note}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
