import { Info, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface ChapterProps {
  id: string;
  kicker: string;
  title: string;
  line: string;
  icon?: LucideIcon;
  fullHeight?: boolean;
  moreLabel?: string;
  more?: readonly string[];
  children?: ReactNode;
}

export default function Chapter({ id, kicker, title, line, icon: KickerIcon, fullHeight = true, moreLabel, more, children }: ChapterProps) {
  const titleId = `${id}-title`;
  const height = fullHeight ? "min-h-[calc(100dvh_-_var(--size-chrome))] " : "";

  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={`rk-section rk-column ${height}d-flex flex-column justify-content-center row-gap-[var(--space-md)] p-[var(--space-xl)_0]`}
    >
      <header className="rk-reveal" data-reveal="idle">
        <p className="rk-eyebrow align-items-center col-gap-[var(--space-xs)] d-flex fs-[var(--font-size-xs)] fw-[var(--font-weight-bold)]">
          <span className="rk-dot rk-dot-claude" aria-hidden="true" />
          {KickerIcon ? <KickerIcon size={16} strokeWidth={2.25} aria-hidden="true" /> : null}
          {kicker}
        </p>
        <h2 id={titleId} className="fs-[var(--font-size-xxxl)] fw-[var(--font-weight-black)] max-w-[16ch]">
          {title}
        </h2>
        <p className="fs-[var(--font-size-lg)] max-w-[var(--measure-text)] mt-[var(--space-sm)] text-[var(--color-text-muted)]">{line}</p>
      </header>
      {children ? (
        <div className="rk-reveal rk-reveal-d1" data-reveal="idle">
          {children}
        </div>
      ) : null}
      {more && moreLabel ? (
        <details className="rk-more rk-module-ts rk-glass max-w-[var(--measure-text)] rounded-[var(--radius-outer)]">
          <summary className="rk-more-summary fw-[var(--font-weight-bold)] p-[var(--space-default)_var(--space-md)]">
            <Info className="text-[var(--color-accent)] flex-shrink-0" size={18} strokeWidth={2.25} aria-hidden="true" />
            {moreLabel}
          </summary>
          <div className="d-flex flex-column p-[0_var(--space-md)_var(--space-sm)] row-gap-[var(--space-xs)]">
            {more.map((paragraph) => (
              <p key={paragraph} className="fs-[var(--font-size-sm)] text-[var(--color-text-body)]">
                {paragraph}
              </p>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
