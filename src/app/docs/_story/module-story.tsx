import { BookOpen, ChevronLeft, Compass, Layers } from "lucide-react";
import Link from "next/link";
import { ICONS, MODULE_ICONS } from "@/stage/icon-registry";
import type { SceneSection } from "@/types/kit-stage";
import type { ModuleGuide, ModuleMotion, RailStop } from "@/types/module-guide";
import Chapter from "./chapter";
import ChapterRail from "./chapter-rail";
import ChapterReveal from "./chapter-reveal";
import ModuleStage from "./module-stage";
import RkPager from "./rk-pager";
import SkillGrid from "./skill-grid";

interface ModuleStoryProps {
  guide: ModuleGuide;
  scene: readonly SceneSection[];
  motion: ModuleMotion;
}

const CARD = "rk-glass rk-module-ts p-[var(--space-default)_var(--space-md)] rounded-[var(--radius-outer)]";
const GRID = "rk-guide-grid d-grid list-unstyled";
const ACT_WHEN = "when" as const;

export default function ModuleStory({ guide, scene, motion }: ModuleStoryProps) {
  const itemCount = guide.items.length;
  const ModuleIcon = ICONS[MODULE_ICONS[guide.slug] ?? "sparkles"];
  const stops: readonly RailStop[] = [
    { label: "Start", ids: ["module-hero"] },
    ...guide.intro.map((chapter) => ({ label: chapter.kicker, ids: [chapter.id] })),
    { label: guide.itemsKicker, ids: guide.items.map((item) => `item-${item.id}`) },
    { label: "Finder", ids: ["finder"] },
    { label: "Next", ids: ["next"] },
  ];

  return (
    <article className="max-w-[var(--size-container)] ms-auto me-auto p-[0_var(--size-gutter)]">
      <ModuleStage scene={scene} act={motion.act} />
      <ChapterReveal />
      <ChapterRail stops={stops} />
      <header id="module-hero" className="rk-column min-h-[calc(100dvh_-_var(--size-chrome))] d-flex flex-column justify-content-center">
        <nav aria-label="Breadcrumb" className="fs-[var(--font-size-sm)] mb-[var(--space-sm)] text-[var(--color-text-muted)]">
          <Link href="/docs" className="rk-link align-items-center col-gap-[var(--space-xxs)] d-inline-flex">
            <ChevronLeft size={16} strokeWidth={2.25} aria-hidden="true" />
            Docs
          </Link>
        </nav>
        <ModuleIcon className="rk-rise text-[var(--color-accent)] d-block mb-[var(--space-sm)]" size={56} strokeWidth={1.75} aria-hidden="true" />
        <h1 className="rk-rise fs-[var(--font-size-display)] fw-[var(--font-weight-black)]">{guide.title}</h1>
        <p className="rk-rise rk-rise-late fs-[var(--font-size-lg)] max-w-[30ch] mt-[var(--space-sm)] text-[var(--color-text-muted)]">{guide.line}</p>
      </header>

      {guide.intro.map((chapter) => (
        <Chapter key={chapter.id} id={chapter.id} icon={BookOpen} kicker={chapter.kicker} title={chapter.title} line={chapter.line} moreLabel={chapter.moreLabel} more={chapter.more} />
      ))}

      {guide.items.map((item, index) => (
        <Chapter key={item.id} id={`item-${item.id}`} icon={Layers} kicker={`${guide.itemsKicker} ${index + 1} of ${itemCount}`} title={item.name} line={item.line} moreLabel={item.moreLabel} more={item.more}>
          <SkillGrid className={`${GRID} rk-skill-grid align-items-start`}>
            {item.rows.map((row) => (
              <details key={row.label} data-hl={row.hl ?? item.hl} data-act={row.act ?? row.label.toLowerCase()} className="rk-hl-ts rk-more rk-module-ts rk-glass rounded-[var(--radius-outer)]">
                <summary className="rk-more-summary rk-tile-summary p-[var(--space-default)_var(--space-md)]">
                  <span className="rk-tile-title">
                    <span className="rk-icon-badge">
                      <ModuleIcon size={24} strokeWidth={2.25} aria-hidden="true" />
                    </span>
                    <span>{row.label}</span>
                  </span>
                  <span className="rk-tile-meta">{item.name}</span>
                </summary>
                <p className="rk-rise fs-[var(--font-size-sm)] p-[0_var(--space-md)_var(--space-sm)] text-[var(--color-text-body)]">{row.text}</p>
              </details>
            ))}
          </SkillGrid>
        </Chapter>
      ))}

      <Chapter id="finder" icon={Compass} kicker="Finale" title="Not sure which one?" line="Start from the situation.">
        <ul className={GRID}>
          {guide.finder.map((row) => (
            <li key={row.item} data-hl={row.hl} data-act={ACT_WHEN} className={`${CARD} rk-hl-ts`}>
              <p className="align-items-center col-gap-[var(--space-sm)] d-flex fs-[var(--font-size-sm)] text-[var(--color-text-muted)]">
                <span className="rk-icon-badge">
                  <Compass size={22} strokeWidth={2} aria-hidden="true" />
                </span>
                {row.situation}
              </p>
              <p className="fw-[var(--font-weight-bold)] mt-[var(--space-xs)]">
                <code>{row.item}</code>
              </p>
            </li>
          ))}
        </ul>
      </Chapter>

      <Chapter id="next" kicker="Keep reading" title="On to the next page" line="The docs are a short run of pages. Use the buttons, or jump to any page." fullHeight={false}>
        <RkPager slug={guide.slug} />
      </Chapter>
    </article>
  );
}
