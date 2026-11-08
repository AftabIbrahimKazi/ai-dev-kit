import { LayoutGrid, MessageSquareText } from "lucide-react";
import { LANDING_HERO } from "@/content/landing";

export default function LandingHero(): React.JSX.Element {
  return (
    <section id="rk-hero" aria-labelledby="rk-hero-title" className="rk-chapter rk-chapter-hero rk-chapter-ts">
      <div className="rk-pin max-w-[var(--size-container)] ms-auto me-auto p-[min(var(--space-md),1.5dvh)_var(--size-gutter)]">
        <div
          data-state="active"
          className="rk-glass rk-pane rk-pane-ts rk-stack rk-pane-side rk-pane-wide me-auto p-[min(var(--space-lg),3dvh)_var(--space-md)] rounded-[var(--radius-outer)]"
        >
          <h1
            id="rk-hero-title"
            className="rk-short-title fs-[min(var(--font-size-display),8dvh,10vw)] fw-[var(--font-weight-black)]"
          >
            {LANDING_HERO.titleLines.map((line, index) => (
              <span key={line} className="rk-rise rk-title-line d-block">
                {index === LANDING_HERO.titleLines.length - 1 ? <em className="rk-accent">{line}</em> : line}
              </span>
            ))}
          </h1>
          <p className="rk-tiny-hide rk-rise rk-rise-late fs-[max(var(--font-size-sm),min(var(--font-size-md),2.6dvh))] max-w-[var(--measure-text)] text-[var(--color-text-muted)]">
            {LANDING_HERO.lead}
          </p>
          <div className="rk-short-hide d-flex flex-wrap col-gap-[var(--space-sm)] row-gap-[var(--space-xs)]">
            <a href="#rk-ch-prompt" className="btn btn-primary rk-lamp fs-[var(--font-size-sm)] rounded-[var(--radius-pill)]">
              <MessageSquareText size={16} strokeWidth={2.25} />
              Follow a prompt
            </a>
            <a href="#rk-modules" className="rk-btn-ghost fs-[var(--font-size-sm)] fw-[var(--font-weight-bold)] rounded-[var(--radius-pill)]">
              <LayoutGrid size={16} strokeWidth={2.25} />
              Browse the modules
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
