import { ArrowLeft, ArrowRight, LayoutGrid } from "lucide-react";
import Link from "next/link";
import { KIT_MODULES } from "@/content/modules";

interface RkPagerProps {
  slug: string;
}

const PILL = "rounded-[var(--radius-outer)]" as const;

export default function RkPager({ slug }: RkPagerProps): React.JSX.Element | null {
  const index = KIT_MODULES.findIndex((entry) => entry.slug === slug);
  if (index < 0) return null;
  const total = KIT_MODULES.length;
  const previous = index > 0 ? KIT_MODULES[index - 1] : null;
  const next = index < total - 1 ? KIT_MODULES[index + 1] : null;

  return (
    <nav aria-label="Docs pages" className="rk-pager">
      <p className="fs-[var(--font-size-sm)] text-[var(--color-text-muted)]">
        Page {index + 1} of {total}
      </p>
      <ol className="rk-pager-stops list-unstyled">
        {KIT_MODULES.map((entry, position) => (
          <li key={entry.slug}>
            <Link
              href={`/docs/${entry.slug}`}
              className="rk-chip rk-pager-stop"
              aria-current={position === index ? "page" : undefined}
              aria-label={`Page ${position + 1}: ${entry.navLabel ?? entry.name}`}
              title={entry.navLabel ?? entry.name}
            >
              {position + 1}
            </Link>
          </li>
        ))}
      </ol>
      <div className="rk-pager-row">
        {previous ? (
          <Link href={`/docs/${previous.slug}`} rel="prev" className={`rk-btn-ghost rk-pager-link rk-pager-prev ${PILL}`}>
            <ArrowLeft className="rk-btn-icon" size={28} strokeWidth={2.25} aria-hidden="true" />
            <span className="d-grid row-gap-[var(--space-xxs)]">
              <span className="rk-pager-hint">Previous page</span>
              <span className="rk-pager-name">{previous.name}</span>
            </span>
          </Link>
        ) : (
          <span aria-hidden="true" />
        )}
        {next ? (
          <Link href={`/docs/${next.slug}`} rel="next" className={`rk-lamp rk-pager-link rk-pager-next ${PILL}`}>
            <span className="d-grid row-gap-[var(--space-xxs)]">
              <span className="rk-pager-hint">Next page</span>
              <span className="rk-pager-name">{next.name}</span>
              <span className="rk-pager-summary">{next.summary}</span>
            </span>
            <ArrowRight className="rk-btn-icon" size={32} strokeWidth={2.25} aria-hidden="true" />
          </Link>
        ) : (
          <Link href="/docs" className={`rk-lamp rk-pager-link rk-pager-next ${PILL}`}>
            <span className="d-grid row-gap-[var(--space-xxs)]">
              <span className="rk-pager-hint">That was the last page</span>
              <span className="rk-pager-name">Back to all docs</span>
            </span>
            <LayoutGrid className="rk-btn-icon" size={32} strokeWidth={2.25} aria-hidden="true" />
          </Link>
        )}
      </div>
    </nav>
  );
}
