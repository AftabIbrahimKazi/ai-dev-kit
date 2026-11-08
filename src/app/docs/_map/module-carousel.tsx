"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { KIT_MODULES } from "@/content/modules";
import { ICONS, MODULE_ICONS } from "@/stage/icon-registry";

const CARD_MIN_PX = 300 as const;
const GAP_PX = 16 as const;
const MAX_PER_PAGE = 3 as const;
const SWIPE_PX = 50 as const;

export default function ModuleCarousel(): React.JSX.Element {
  const viewportRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<number | null>(null);
  const [perPage, setPerPage] = useState(1);
  const [page, setPage] = useState(0);
  const total = KIT_MODULES.length;
  const pages = Math.ceil(total / perPage);
  const current = Math.min(page, pages - 1);
  const start = Math.min(current * perPage, total - perPage);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const fit = Math.floor((entry.contentRect.width + GAP_PX) / (CARD_MIN_PX + GAP_PX));
      setPerPage(Math.min(MAX_PER_PAGE, Math.max(1, fit)));
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    viewport?.style.setProperty("--per-page", String(perPage));
    viewport?.style.setProperty("--start", String(start));
  }, [perPage, start]);

  const go = (next: number): void => setPage(Math.min(pages - 1, Math.max(0, next)));

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    swipeRef.current = event.clientX;
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    const from = swipeRef.current;
    swipeRef.current = null;
    if (from === null) return;
    const delta = event.clientX - from;
    if (Math.abs(delta) > SWIPE_PX) go(current + (delta < 0 ? 1 : -1));
  };

  return (
    <section aria-labelledby="rk-modules-title" aria-roledescription="carousel" className="mt-[var(--space-lg)]">
      <div className="align-items-center d-flex justify-content-between mb-[var(--space-sm)]">
        <h2 id="rk-modules-title" className="fs-[var(--font-size-lg)] fw-[var(--font-weight-bold)]">
          Modules
        </h2>
        <div className="rk-carousel-nav">
          <button type="button" className="rk-map-control rk-glass" aria-label="Previous modules" disabled={current === 0} onClick={() => go(current - 1)}>
            <ChevronLeft size={20} strokeWidth={2.25} aria-hidden="true" />
          </button>
          <button type="button" className="rk-map-control rk-glass" aria-label="Next modules" disabled={current >= pages - 1} onClick={() => go(current + 1)}>
            <ChevronRight size={20} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div
        ref={viewportRef}
        className="rk-carousel"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") go(current + 1);
          else if (event.key === "ArrowLeft") go(current - 1);
        }}
      >
        <ul className="rk-carousel-track list-unstyled" aria-live="polite">
          {KIT_MODULES.map((kitModule, index) => {
            const ModuleIcon = ICONS[MODULE_ICONS[kitModule.slug] ?? "sparkles"];
            const isVisible = index >= start && index < start + perPage;
            return (
              <li key={kitModule.slug} className="rk-carousel-card" inert={!isVisible} aria-roledescription="slide" aria-label={`${index + 1} of ${total}`}>
                <Link href={`/docs/${kitModule.slug}`} className="rk-glass rk-module-ts rk-link rk-carousel-link rounded-[var(--radius-outer)]">
                  <span className="rk-tile-title-row">
                    <span className="rk-icon-badge">
                      <ModuleIcon size={24} strokeWidth={2.25} aria-hidden="true" />
                    </span>
                    <span className="rk-tile-name">{kitModule.name}</span>
                  </span>
                  <span className="rk-tile-meta-row fs-[var(--font-size-sm)]">{kitModule.summary}</span>
                  <span className="rk-tile-foot fs-[var(--font-size-xs)]">
                    {kitModule.parts.length} {kitModule.parts.length === 1 ? "part" : "parts"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="d-flex gap-[var(--space-xs)] justify-content-center pt-[var(--space-xs)]" role="group" aria-label="Choose a page">
        {Array.from({ length: pages }, (_, index) => (
          <button key={index} type="button" className="rk-carousel-dot" aria-label={`Page ${index + 1} of ${pages}`} aria-current={index === current ? "true" : undefined} onClick={() => go(index)} />
        ))}
      </div>
    </section>
  );
}
