"use client";

import { useEffect } from "react";

const REVEAL_SELECTOR = "[data-reveal]" as const;
const STATE_HIDDEN = "out" as const;
const STATE_SHOWN = "in" as const;
const REVEAL_MARGIN = "0px 0px -10% 0px" as const;

export default function ChapterReveal() {
  useEffect(() => {
    const targets = Array.from(document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          (entry.target as HTMLElement).dataset.reveal = STATE_SHOWN; // observer targets come only from the HTMLElement query above
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: REVEAL_MARGIN },
    );
    targets.forEach((target) => {
      const { top } = target.getBoundingClientRect();
      if (top < window.innerHeight) {
        target.dataset.reveal = STATE_SHOWN;
        return;
      }
      target.dataset.reveal = STATE_HIDDEN;
      observer.observe(target);
    });
    return () => observer.disconnect();
  }, []);

  return null;
}
