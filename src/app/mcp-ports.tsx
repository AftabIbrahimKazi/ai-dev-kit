"use client";

import { useState, type KeyboardEvent } from "react";
import type { McpPort } from "@/content/mcp";

interface McpPortsProps {
  ports: readonly McpPort[];
  intro: string;
  caveat: string;
}

export default function McpPorts({ ports, intro, caveat }: McpPortsProps) {
  const [activeId, setActiveId] = useState<string>(ports[0].id);

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = ports[(index + step + ports.length) % ports.length];
    setActiveId(next.id);
    document.getElementById(`mcp-tab-${next.id}`)?.focus();
  }

  return (
    <>
      <p className="rk-short-hide fs-[var(--font-size-sm)] max-w-[var(--measure-text)] text-[var(--color-text-muted)]">
        {intro}
      </p>
      <div className="rk-tabs mt-[min(var(--space-md),2dvh)]">
        <div role="tablist" aria-label="MCP server" className="nav nav-tabs d-flex flex-wrap">
          {ports.map((port, index) => (
            <button
              key={port.id}
              id={`mcp-tab-${port.id}`}
              type="button"
              role="tab"
              className="nav-link fs-[max(var(--font-size-xs),min(var(--font-size-md),2.8dvh))]"
              aria-selected={activeId === port.id}
              aria-controls={`mcp-panel-${port.id}`}
              tabIndex={activeId === port.id ? 0 : -1}
              data-state={activeId === port.id ? "open" : "closed"}
              onClick={() => setActiveId(port.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              {port.name}
            </button>
          ))}
        </div>
        <div className="rk-panels d-grid">
          {ports.map((port) => (
            <div
              key={port.id}
              id={`mcp-panel-${port.id}`}
              role="tabpanel"
              aria-labelledby={`mcp-tab-${port.id}`}
              data-state={activeId === port.id ? "open" : "closed"}
              className="mt-[min(var(--space-md),2dvh)]"
            >
              <div className="rk-glass max-w-[var(--measure-text)] p-[min(var(--space-sm),1.5dvh)_var(--space-md)] rounded-[var(--radius-outer)]">
                <p className="rk-snug fs-[max(var(--font-size-xs),min(var(--font-size-md),3dvh))]">{port.does}</p>
                <p className="rk-snug fs-[max(var(--font-size-xs),min(var(--font-size-sm),2.6dvh))] text-[var(--color-text-muted)]">{port.cost}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="rk-snug fs-[max(var(--font-size-xs),min(var(--font-size-sm),2.6dvh))] max-w-[var(--measure-text)] mt-[min(var(--space-sm),1.5dvh)] text-[var(--color-text-muted)]">
        {caveat}
      </p>
    </>
  );
}
