"use client";

import { FileText, Folder, Link2, Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import ScrollRail from "@/app/scroll-rail";
import { useEffect, useRef, useState } from "react";
import { MAP_MODULES, docsHrefForNode, moduleOfGroup } from "@/content/map-modules";
import { ICONS, MODULE_ICONS } from "@/stage/icon-registry";
import type { KitMapEngine, MapNodeInfo } from "@/stage/kit-map-engine";
import GithubIcon from "@/app/github-icon";
import { REPO_URL } from "@/app/site-nav";
import type { KitGraph } from "@/types/kit-stage";

const CANVAS_CLASS = "rk-stage-canvas" as const;
const TOOLTIP_OFFSET = 14 as const;

interface HoverState {
  info: MapNodeInfo;
  x: number;
  y: number;
}

export default function KitMap(): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<KitMapEngine | null>(null);
  const cardScrollRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [selected, setSelected] = useState<MapNodeInfo | null>(null);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const canvas = document.createElement("canvas");
    canvas.className = CANVAS_CLASS;
    canvas.dataset.state = "loading";
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "application");
    canvas.setAttribute("aria-label", "Interactive map of the kit. Drag to rotate, plus and minus to zoom, click a node for details, Escape to reset.");
    host.appendChild(canvas);
    let isCancelled = false;

    Promise.all([import("@/stage/kit-map-engine"), import("@/content/kit-graph.json")])
      .then(([engineModule, graphModule]) => {
        if (isCancelled) return;
        const graph = graphModule.default as unknown as KitGraph; // the generated JSON is written in the KitGraph row shape by scripts/build-kit-graph.ts
        const engine = new engineModule.KitMapEngine(graph, canvas, {
          onHover: (info, x, y) => setHover(info ? { info, x, y } : null),
          onSelect: (info) => setSelected(info),
        });
        if (!engine.init()) return;
        engineRef.current = engine;
      })
      .catch(() => undefined);

    return () => {
      isCancelled = true;
      engineRef.current?.destroy();
      engineRef.current = null;
      canvas.remove();
    };
  }, []);

  const toggleModule = (slug: string): void => {
    const next = activeSlug === slug ? null : slug;
    setActiveSlug(next);
    engineRef.current?.setFocusGroups(next ? (MAP_MODULES.find((entry) => entry.slug === next)?.groups ?? null) : null);
  };

  const reset = (): void => {
    setActiveSlug(null);
    engineRef.current?.reset();
  };

  const selectedModule = selected ? moduleOfGroup(selected.group) : null;
  const SelectedIcon = ICONS[MODULE_ICONS[selectedModule?.slug ?? ""] ?? "folder"];

  return (
    <section aria-labelledby="m-[0] w-[fit-content]" className="h-[max(32rem,82dvh)] overflow-hidden position-relative rk-glass rounded-[var(--radius-outer)]">
      <div ref={hostRef} className="rk-map-stage" />
      <div className="rk-map-top">
        <h2 id="m-[0] w-[fit-content]" className="m-[0] w-[fit-content] fs-[var(--font-size-lg)] fw-[var(--font-weight-black)]">
          The whole kit, mapped
        </h2>
        <ul className="rk-map-chips list-unstyled">
          {MAP_MODULES.map((entry) => {
            const Icon = ICONS[MODULE_ICONS[entry.slug] ?? "folder"];
            return (
              <li key={entry.slug}>
                <button type="button" className="rk-chip rk-map-chip fs-[var(--font-size-sm)]" aria-pressed={activeSlug === entry.slug} onClick={() => toggleModule(entry.slug)}>
                  <Icon size={16} strokeWidth={2.25} aria-hidden="true" />
                  {entry.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="rk-map-controls">
        <button type="button" className="rk-map-control rk-glass" aria-label="Zoom in" onClick={() => engineRef.current?.zoomBy(1)}>
          <Plus size={20} strokeWidth={2.25} aria-hidden="true" />
        </button>
        <button type="button" className="rk-map-control rk-glass" aria-label="Zoom out" onClick={() => engineRef.current?.zoomBy(-1)}>
          <Minus size={20} strokeWidth={2.25} aria-hidden="true" />
        </button>
        <button type="button" className="rk-map-control rk-glass" aria-label="Reset view" onClick={reset}>
          <RotateCcw size={20} strokeWidth={2.25} aria-hidden="true" />
        </button>
      </div>
      <p className="rk-map-hint fs-[var(--font-size-xs)]">
        <Maximize2 size={14} strokeWidth={2.25} aria-hidden="true" />
        Drag to rotate. Hover a node to see its links. Click to open its card. Ctrl + scroll or +/- to zoom.
      </p>
      {hover && !selected ? (
        <div className="rounded-[var(--radius-inner)] d-grid py-[var(--space-xxs)] px-[var(--space-sm)] pe-none position-absolute z-[2] rk-glass" style={{ left: hover.x + TOOLTIP_OFFSET, top: hover.y + TOOLTIP_OFFSET }} role="status">
          <span className="fw-[var(--font-weight-bold)]">{hover.info.label}</span>
          <span className="fs-[var(--font-size-xs)] text-[var(--color-text-muted)]">{hover.info.group}</span>
        </div>
      ) : null}
      {selected ? (
        <aside className="rk-map-card rk-glass rounded-[var(--radius-outer)]" aria-label="Selected file">
          <div ref={cardScrollRef} className="rk-map-card-scroll">
          <header className="align-items-center col-gap-[var(--space-sm)] d-flex">
            <span className="rk-icon-badge">
              <SelectedIcon size={26} strokeWidth={2.25} aria-hidden="true" />
            </span>
            <div className="rk-map-card-titles">
              <p className="rk-eyebrow fs-[var(--font-size-xs)]">{selectedModule ? selectedModule.label : selected.group}</p>
              <code className="rk-map-card-name">{selected.label}</code>
            </div>
            <button type="button" className="rk-map-control rk-glass" aria-label="Close card" onClick={() => engineRef.current?.focusNode(-1)}>
              <X size={18} strokeWidth={2.25} aria-hidden="true" />
            </button>
          </header>
          <p className="rk-map-card-path fs-[var(--font-size-sm)]">{selected.path}</p>
          <dl className="rk-map-card-stats">
            <div className="rk-map-card-stat">
              <dt className="fs-[var(--font-size-xs)]">
                <Link2 size={14} strokeWidth={2.25} aria-hidden="true" />
                Links
              </dt>
              <dd>{selected.links}</dd>
            </div>
            <div className="rk-map-card-stat">
              <dt className="fs-[var(--font-size-xs)]">
                <Folder size={14} strokeWidth={2.25} aria-hidden="true" />
                Group
              </dt>
              <dd>{selected.group}</dd>
            </div>
          </dl>
          {selected.linked.length > 0 ? (
            <div className="rk-map-card-linked">
              <p className="rk-eyebrow fs-[var(--font-size-xs)]">Most connected neighbours</p>
              <ul className="rk-map-card-meta list-unstyled">
                {selected.linked.map((neighbour) => (
                  <li key={neighbour.index}>
                    <button type="button" className="rk-chip rk-map-chip fs-[var(--font-size-sm)]" onClick={() => engineRef.current?.focusNode(neighbour.index)}>
                      <FileText size={14} strokeWidth={2.25} aria-hidden="true" />
                      {neighbour.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="d-grid gap-[var(--space-xs)]">
            {selectedModule ? (
              <Link href={docsHrefForNode(selected.path, selected.group) ?? `/docs/${selectedModule.slug}`} className="btn btn-primary rk-lamp rk-map-card-open fs-[var(--font-size-sm)] rounded-[var(--radius-pill)]">
                <SelectedIcon size={16} strokeWidth={2.25} aria-hidden="true" />
                Open {selectedModule.label}
              </Link>
            ) : null}
            <a href={`${REPO_URL}/blob/main/${selected.path}`} target="_blank" rel="noopener noreferrer" className="rk-btn-ghost rk-map-card-open fs-[var(--font-size-sm)] rounded-[var(--radius-pill)]">
              <GithubIcon />
              View file on GitHub
            </a>
          </div>
          </div>
          <ScrollRail targetRef={cardScrollRef} />
        </aside>
      ) : null}
    </section>
  );
}
