import { Keyboard, Map as MapIcon, ShieldCheck, Sparkles, Terminal, Webhook, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ACTOR_ICONS, ICONS, type IconName } from "@/stage/icon-registry";
import { ACTOR_LEGEND, LANDING_PROMPT, highlightKey, type LandingChapter as LandingChapterData } from "@/content/landing";

interface LandingChapterProps {
  chapter: LandingChapterData;
}

const PROMPT_CHAPTER_ID = "rk-ch-prompt" as const;
const MAP_CHAPTER_ID = "rk-ch-map" as const;
const HIGHLIGHT_ACTOR = "actor" as const;
const CHAPTER_ICONS: Readonly<Record<string, LucideIcon>> = {
  "rk-ch-prompt": Keyboard,
  "rk-ch-skills": Sparkles,
  "rk-ch-standards": ShieldCheck,
  "rk-ch-mods": Webhook,
  "rk-ch-commands": Terminal,
  "rk-ch-map": MapIcon,
};
const ACTOR_INK_CLASSES: readonly string[] = ["rk-ink-you", "rk-ink-claude", "rk-ink-auto", "rk-ink-maint"];
const CHIP_ICONS: Readonly<Record<string, IconName>> = {
  "rk-ch-prompt": "keyboard",
  "rk-ch-skills": "sparkles",
  "rk-ch-standards": "shield",
  "rk-ch-mods": "webhook",
  "rk-ch-commands": "terminal",
  "rk-ch-map": "map",
};
const DOT_CLASSES: readonly string[] = ["rk-dot rk-dot-you", "rk-dot rk-dot-claude", "rk-dot rk-dot-auto", "rk-dot rk-dot-maint"];

function renderExtra(chapterId: string): ReactNode {
  if (chapterId === PROMPT_CHAPTER_ID) {
    return (
      <p
        aria-label={LANDING_PROMPT.label}
        className="rk-prompt fs-[var(--font-size-md)] p-[var(--space-sm)_var(--space-md)] rounded-[var(--radius-inner)]"
      >
        <b className="text-[var(--color-lamp)] me-[var(--space-sm)]">you</b>
        <span className="rk-typed-ts">{LANDING_PROMPT.text}</span>
        <span className="rk-caret" aria-hidden="true" />
      </p>
    );
  }
  if (chapterId === MAP_CHAPTER_ID) {
    return (
      <ul className="rk-legend d-grid list-unstyled mb-0">
        {ACTOR_LEGEND.map((item) => {
          const ActorIcon = ICONS[ACTOR_ICONS[item.actor]];
          return (
          <li key={item.name} data-hl={`${HIGHLIGHT_ACTOR}:${item.actor}`} className="rk-legend-item rk-hl-ts">
            <ActorIcon className={ACTOR_INK_CLASSES[item.actor]} size={20} strokeWidth={2.25} />
            <span className="rk-legend-name fw-[var(--font-weight-black)]">{item.name}</span>
            <span className="rk-legend-text rk-short-hide text-[var(--color-text-muted)]">{item.text}</span>
          </li>
          );
        })}
      </ul>
    );
  }
  return null;
}

export default function LandingChapter({ chapter }: LandingChapterProps): React.JSX.Element {
  const ChapterIcon = CHAPTER_ICONS[chapter.id];
  const ChipIcon = ICONS[CHIP_ICONS[chapter.id] ?? "sparkles"];
  const titleId = `${chapter.id}-title`;
  const paneClass =
    chapter.side === "center"
      ? "rk-glass rk-pane rk-pane-ts rk-stack ms-auto me-auto max-w-[56rem] overflow-auto p-[min(var(--space-lg),3dvh)_var(--space-md)] rounded-[var(--radius-outer)] w-100"
      : chapter.side === "right"
        ? "rk-glass rk-pane rk-pane-ts rk-stack rk-pane-side ms-auto overflow-auto p-[min(var(--space-lg),3dvh)_var(--space-md)] rounded-[var(--radius-outer)]"
        : "rk-glass rk-pane rk-pane-ts rk-stack rk-pane-side me-auto overflow-auto p-[min(var(--space-lg),3dvh)_var(--space-md)] rounded-[var(--radius-outer)]";

  return (
    <section id={chapter.id} aria-labelledby={titleId} className="rk-chapter rk-chapter-ts">
      <div className="rk-pin max-w-[var(--size-container)] ms-auto me-auto p-[min(var(--space-md),1.5dvh)_var(--size-gutter)]">
        <div data-state="active" className={paneClass}>
          <p className="rk-eyebrow align-items-center col-gap-[var(--space-xs)] d-flex fs-[var(--font-size-xs)]">
            <span className={DOT_CLASSES[chapter.eyebrowActor]} aria-hidden="true" />
            {ChapterIcon ? <ChapterIcon size={16} strokeWidth={2.25} /> : null}
            {chapter.eyebrow}
          </p>
          <h2
            id={titleId}
            className="fs-[min(var(--font-size-xxxl),6dvh,10vw)] fw-[var(--font-weight-black)]"
          >
            {chapter.titleLead} <em className="rk-accent">{chapter.titleAccent}</em>
          </h2>
          {renderExtra(chapter.id)}
          <p className="fs-[min(var(--font-size-md),max(var(--font-size-sm),2.1dvh))] max-w-[var(--measure-text)]">{chapter.lead}</p>
          {chapter.chips.length > 0 ? (
            <ul className="rk-short-hide d-flex flex-wrap col-gap-[var(--space-xs)] list-unstyled mb-0 row-gap-[var(--space-xs)]">
              {chapter.chips.map((chip) => (
                <li key={chip} data-hl={highlightKey(chapter.chipKind, chip)} className="rk-chip rk-hl-ts fs-[var(--font-size-sm)]">
                  <ChipIcon size={14} strokeWidth={2.25} />
                  {chip}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}
