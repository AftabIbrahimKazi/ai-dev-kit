import type { Metadata } from "next";
import { BookOpen, ChevronLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import {
  GUIDE_CHAPTERS,
  GUIDE_FINDER,
  GUIDE_HEADER,
  GUIDE_MODES,
  GUIDE_MODE_NOTE,
  GUIDE_TYPES,
} from "@/content/skills-guide";
import { SKILLS_SCENE, hlGroup, hlName } from "@/content/skills-scene";
import type { RailStop } from "@/types/module-guide";
import Chapter from "../_story/chapter";
import RkPager from "../_story/rk-pager";
import ChapterRail from "../_story/chapter-rail";
import ChapterReveal from "../_story/chapter-reveal";
import ModuleStage from "../_story/module-stage";
import HashCardOpener from "./hash-card-opener";
import SkillEntry from "./skill-entry";
import SkillGrid from "../_story/skill-grid";
import StoryVisual from "./story-visuals";
import { findModule } from "@/content/modules";
import { SITE_NAME } from "@/content/site-meta";

const SKILLS_DESCRIPTION = findModule("skills")?.metaDescription ?? "";

export const metadata: Metadata = {
  title: "Skills — AI Dev Kit docs",
  description: SKILLS_DESCRIPTION,
  alternates: { canonical: "/docs/skills" },
  openGraph: { title: "Skills — AI Dev Kit docs", description: SKILLS_DESCRIPTION, type: "website", siteName: SITE_NAME },
};

const CARD = "rk-glass p-[var(--space-default)_var(--space-md)] rounded-[var(--radius-outer)]";
const GRID = "rk-guide-grid d-grid list-unstyled";
const TYPE_COUNT = GUIDE_TYPES.length;
const RAIL_STOPS: readonly RailStop[] = [
  { label: "Start", ids: ["skills-hero"] },
  ...GUIDE_CHAPTERS.map((chapter) => ({ label: chapter.kicker, ids: [chapter.id] })),
  { label: "Modes", ids: ["modes"] },
  { label: "Shelves", ids: ["types", ...GUIDE_TYPES.map((type) => `type-${type.id}`)] },
  { label: "Finder", ids: ["finder"] },
  { label: "Next", ids: ["next"] },
];

export default function SkillsPage() {
  return (
    <article className="max-w-[var(--size-container)] ms-auto me-auto p-[0_var(--size-gutter)]">
      <ModuleStage scene={SKILLS_SCENE} />
      <ChapterReveal />
      <HashCardOpener />
      <ChapterRail stops={RAIL_STOPS} />
      <header id="skills-hero" className="rk-column min-h-[calc(100dvh_-_var(--size-chrome))] d-flex flex-column justify-content-center">
        <nav aria-label="Breadcrumb" className="fs-[var(--font-size-sm)] mb-[var(--space-sm)] text-[var(--color-text-muted)]">
          <Link href="/docs" className="rk-link align-items-center col-gap-[var(--space-xxs)] d-inline-flex">
            <ChevronLeft size={16} strokeWidth={2.25} aria-hidden="true" />
            Docs
          </Link>
        </nav>
        <Sparkles className="rk-rise text-[var(--color-accent)] d-block mb-[var(--space-sm)]" size={56} strokeWidth={1.75} aria-hidden="true" />
        <h1 className="rk-rise fs-[var(--font-size-display)] fw-[var(--font-weight-black)]">{GUIDE_HEADER.title}</h1>
        <p className="rk-rise rk-rise-late fs-[var(--font-size-lg)] max-w-[30ch] mt-[var(--space-sm)] text-[var(--color-text-muted)]">
          {GUIDE_HEADER.line}
        </p>
      </header>

      {GUIDE_CHAPTERS.map((chapter) => (
        <Chapter key={chapter.id} id={chapter.id} icon={BookOpen} kicker={chapter.kicker} title={chapter.title} line={chapter.line} moreLabel={chapter.moreLabel} more={chapter.more}>
          <StoryVisual kind={chapter.visual} />
        </Chapter>
      ))}

      <Chapter id="modes" kicker="Chapter 4" title="Three ways a card starts" line="Some start themselves. Some wait for you. Some you switch on once.">
        <ul className={GRID}>
          {GUIDE_MODES.map((mode) => (
            <li key={mode.mode} data-hl="all:skills" data-act={mode.mode} className={`${CARD} rk-hl-ts`}>
              <p className="fs-[var(--font-size-lg)] fw-[var(--font-weight-bold)]">{mode.label}</p>
              <p className="fs-[var(--font-size-sm)] mt-[var(--space-xs)] text-[var(--color-text-muted)]">{mode.text}</p>
            </li>
          ))}
        </ul>
        <p className="fs-[var(--font-size-sm)] mt-[var(--space-sm)] text-[var(--color-text-muted)]">{GUIDE_MODE_NOTE}</p>
      </Chapter>

      <Chapter id="types" kicker="Chapter 5" title="Nine shelves" line="Every skill in the kit lives on one of them.">
        <ul className={GRID}>
          {GUIDE_TYPES.map((type) => (
            <li key={type.id}>
              <a href={`#type-${type.id}`} data-hl={hlGroup(type.id)} data-act="does" className={`${CARD} rk-hl-ts rk-link d-block h-100`}>
                <span className="d-block fs-[var(--font-size-md)] fw-[var(--font-weight-bold)]">{type.name}</span>
                <span className="d-block fs-[var(--font-size-sm)] text-[var(--color-text-muted)]">
                  {type.members ? `${type.skills.length} routing skills, ${type.members.length} model protocols` : `${type.skills.length} skills`}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Chapter>

      {GUIDE_TYPES.map((type, index) => (
        <Chapter key={type.id} id={`type-${type.id}`} kicker={`Shelf ${index + 1} of ${TYPE_COUNT}`} title={type.name} line={type.purpose} fullHeight={false}>
          {type.members ? (
            <details className="rk-more rk-glass max-w-[var(--measure-text)] mb-[var(--space-sm)] rounded-[var(--radius-outer)]">
              <summary className="rk-more-summary fw-[var(--font-weight-bold)] p-[var(--space-default)_var(--space-md)]">The {type.members.length} model protocols</summary>
              <ul className="d-flex flex-wrap list-unstyled p-[0_var(--space-md)_var(--space-sm)] col-gap-[var(--space-xs)] row-gap-[var(--space-xs)]">
                {type.members.map((member) => (
                  <li key={member} className="fs-[var(--font-size-sm)]">
                    <code>{member}</code>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <SkillGrid className={`${GRID} rk-skill-grid align-items-start`}>
            {type.skills.map((skill) => (
              <SkillEntry key={skill.name} skill={skill} />
            ))}
          </SkillGrid>
        </Chapter>
      ))}

      <Chapter id="finder" kicker="Finale" title="Not sure which card?" line="Start from the situation.">
        <ul className={GRID}>
          {GUIDE_FINDER.map((row) => (
            <li key={row.skill} data-hl={hlName(row.skill)} data-act="when" className={`${CARD} rk-hl-ts`}>
              <p className="fs-[var(--font-size-sm)] text-[var(--color-text-muted)]">{row.situation}</p>
              <p className="fw-[var(--font-weight-bold)] mt-[var(--space-xs)]">
                <code>{row.skill}</code>
              </p>
            </li>
          ))}
        </ul>
      </Chapter>

      <Chapter id="next" kicker="Keep reading" title="On to the next page" line="The docs are a short run of pages. Use the buttons, or jump to any page." fullHeight={false}>
        <RkPager slug="skills" />
      </Chapter>
    </article>
  );
}
