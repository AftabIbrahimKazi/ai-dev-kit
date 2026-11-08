"use client";

import { useState, type KeyboardEvent } from "react";
import type { InstallTab } from "@/content/install";
import CopyButton from "./copy-button";

interface InstallTabsProps {
  tabs: readonly InstallTab[];
  aftercare: string;
}

export default function InstallTabs({ tabs, aftercare }: InstallTabsProps) {
  const [activeId, setActiveId] = useState<string>(tabs[0].id);

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length];
    setActiveId(next.id);
    document.getElementById(`install-tab-${next.id}`)?.focus();
  }

  return (
    <div className="rk-tabs">
      <div role="tablist" aria-label="Install method" className="nav nav-tabs d-flex flex-wrap">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            id={`install-tab-${tab.id}`}
            type="button"
            role="tab"
            className="nav-link fs-[max(var(--font-size-xs),min(var(--font-size-md),2.8dvh))]"
            aria-selected={activeId === tab.id}
            aria-controls={`install-panel-${tab.id}`}
            tabIndex={activeId === tab.id ? 0 : -1}
            data-state={activeId === tab.id ? "open" : "closed"}
            onClick={() => setActiveId(tab.id)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="rk-panels d-grid">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            id={`install-panel-${tab.id}`}
            role="tabpanel"
            aria-labelledby={`install-tab-${tab.id}`}
            data-state={activeId === tab.id ? "open" : "closed"}
            className="mt-[min(var(--space-md),2dvh)]"
          >
            <div className="rk-glass align-items-center col-gap-[var(--space-md)] d-flex flex-wrap justify-content-between max-w-[var(--measure-text)] p-[min(var(--space-md),2dvh)_var(--space-md)] rounded-[var(--radius-outer)] row-gap-[var(--space-xs)]">
              <code className="fs-[max(var(--font-size-xs),min(var(--font-size-sm),2.6dvh))] min-w-0 text-[var(--color-text-body)]">
                {tab.lines.map((line) => (
                  <span key={line} className="d-block overflow-auto text-nowrap">
                    {line}
                  </span>
                ))}
              </code>
              <CopyButton text={tab.lines.join("\n")} />
            </div>
            <p className="fs-[var(--font-size-sm)] max-w-[var(--measure-text)] mt-[min(var(--space-sm),1.5dvh)] text-[var(--color-text-muted)]">
              {tab.note}
            </p>
          </div>
        ))}
      </div>
      <p className="rk-short-hide fs-[var(--font-size-sm)] max-w-[var(--measure-text)] mt-[min(var(--space-sm),1.5dvh)] text-[var(--color-text-muted)]">
        {aftercare}
      </p>
    </div>
  );
}
