import { LANDING_CHAPTERS, RAIL_LABELS } from "@/content/landing";

const RAIL_TARGETS: readonly string[] = ["rk-hero", ...LANDING_CHAPTERS.map((chapter) => chapter.id), "rk-modules"];

export default function LandingRail(): React.JSX.Element {
  return (
    <nav aria-label="Chapters" className="rk-rail d-none d-lg-flex flex-column">
      {RAIL_TARGETS.map((target, index) => (
        <a key={target} href={`#${target}`} data-state={index === 0 ? "active" : "idle"} aria-label={`Go to ${RAIL_LABELS[index]}`} className="rk-rail-dot rk-rail-ts">
          <span className="rk-rail-label fs-[var(--font-size-xs)]">{RAIL_LABELS[index]}</span>
        </a>
      ))}
    </nav>
  );
}
