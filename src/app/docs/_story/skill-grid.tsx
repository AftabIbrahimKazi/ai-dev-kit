"use client";

import { useEffect, useRef, type ReactNode } from "react";

const SUMMARY_SELECTOR = "summary" as const;
const MOVE_DURATION_MS = 480 as const;
const MOVE_EASING = "cubic-bezier(0.16, 1, 0.3, 1)" as const;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)" as const;

interface SkillGridProps {
  className: string;
  children: ReactNode;
}

export default function SkillGrid({ className, children }: SkillGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const reduced = window.matchMedia(REDUCED_MOTION_QUERY);
    let before: Map<Element, DOMRect> | null = null;

    const onClick = (event: Event): void => {
      if (!(event.target instanceof Element) || !event.target.closest(SUMMARY_SELECTOR)) return;
      before = new Map(Array.from(grid.children, (child) => [child, child.getBoundingClientRect()]));
    };

    const onToggle = (event: Event): void => {
      if (event.target instanceof HTMLDetailsElement && event.target.open) {
        Array.from(grid.children).forEach((child) => {
          if (child !== event.target && child instanceof HTMLDetailsElement) child.open = false;
        });
      }
      const previous = before;
      before = null;
      if (!previous || reduced.matches) return;
      Array.from(grid.children).forEach((child) => {
        const from = previous.get(child);
        if (!from) return;
        const to = child.getBoundingClientRect();
        const dx = from.left - to.left;
        const dy = from.top - to.top;
        if (dx === 0 && dy === 0) return;
        child.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
          duration: MOVE_DURATION_MS,
          easing: MOVE_EASING,
        });
      });
    };

    grid.addEventListener("click", onClick, true);
    grid.addEventListener("toggle", onToggle, true);
    return () => {
      grid.removeEventListener("click", onClick, true);
      grid.removeEventListener("toggle", onToggle, true);
    };
  }, []);

  return (
    <div ref={gridRef} className={className}>
      {children}
    </div>
  );
}
