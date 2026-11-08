import { BookOpen, Code } from "lucide-react";
import { KIT_MODULES, MODULES_INTRO } from "@/content/modules";
import { REPO_URL } from "./site-nav";
import ModuleLinks from "./module-links";

const INSTALL_URL = `${REPO_URL}#install-into-a-project` as const;

export default function LandingModules(): React.JSX.Element {
  return (
    <section id="rk-modules" aria-labelledby="rk-modules-title" className="rk-chapter rk-chapter-last rk-chapter-ts">
      <div className="rk-pin max-w-[var(--size-container)] ms-auto me-auto p-[min(var(--space-md),1.5dvh)_var(--size-gutter)]">
        <div
          data-state="active"
          className="rk-glass rk-pane rk-pane-ts rk-stack ms-auto me-auto max-w-[56rem] overflow-auto p-[min(var(--space-lg),3dvh)_var(--space-md)] rounded-[var(--radius-outer)] w-100"
        >
          <p className="rk-eyebrow align-items-center col-gap-[var(--space-xs)] d-flex fs-[var(--font-size-xs)]">
            <span className="rk-dot rk-dot-you" aria-hidden="true" />
            Go deeper
          </p>
          <h2
            id="rk-modules-title"
            className="fs-[min(var(--font-size-xxxl),7dvh,10vw)] fw-[var(--font-weight-black)]"
          >
            Browse the <em className="rk-accent">modules</em>
          </h2>
          <div className="rk-modules-ts">
            <ModuleLinks modules={KIT_MODULES} intro={MODULES_INTRO.text} />
          </div>
          <div className="rk-short-hide d-flex flex-wrap col-gap-[var(--space-sm)] row-gap-[var(--space-xs)]">
            <a href={INSTALL_URL} className="btn btn-primary rk-lamp fs-[var(--font-size-sm)] rounded-[var(--radius-pill)]">
              <BookOpen size={16} strokeWidth={2.25} />
              Read the install guide
            </a>
            <a href={REPO_URL} className="rk-btn-ghost fs-[var(--font-size-sm)] fw-[var(--font-weight-bold)] rounded-[var(--radius-pill)]">
              <Code size={16} strokeWidth={2.25} />
              View the source
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
