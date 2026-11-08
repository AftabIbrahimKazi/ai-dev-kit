"use client";

import { useEffect, useRef } from "react";
import type { RailStop } from "@/types/module-guide";

const STATE_ACTIVE = "active" as const;
const STATE_IDLE = "idle" as const;
const PROBE_MARGIN = "-45% 0px -45% 0px" as const;

interface ChapterRailProps {
  stops: readonly RailStop[];
}

export default function ChapterRail({ stops }: ChapterRailProps): React.JSX.Element {
  const dotsRef = useRef<(HTMLAnchorElement | null)[]>([]);

  useEffect(() => {
    const owner = new Map<string, number>();
    stops.forEach((stop, index) => stop.ids.forEach((id) => owner.set(id, index)));
    const setActive = (active: number): void => {
      dotsRef.current.forEach((dot, index) => {
        if (dot) dot.dataset.state = index === active ? STATE_ACTIVE : STATE_IDLE;
      });
    };
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = owner.get(entry.target.id);
          if (entry.isIntersecting && index !== undefined) setActive(index);
        });
      },
      { rootMargin: PROBE_MARGIN },
    );
    owner.forEach((_index, id) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, [stops]);

  return (
    <nav aria-label="Chapters" className="rk-rail d-none d-lg-flex flex-column">
      {stops.map((stop, index) => (
        <a
          key={stop.ids[0]}
          ref={(element) => {
            dotsRef.current[index] = element;
          }}
          href={`#${stop.ids[0]}`}
          data-state={index === 0 ? STATE_ACTIVE : STATE_IDLE}
          aria-label={`Go to ${stop.label}`}
          className="rk-rail-dot rk-rail-ts"
        >
          <span className="rk-rail-label fs-[var(--font-size-xs)]">{stop.label}</span>
        </a>
      ))}
    </nav>
  );
}
