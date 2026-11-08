"use client";

import { useEffect } from "react";

const HASH_PREFIX = "#" as const;
const SCROLL_OPTIONS: ScrollIntoViewOptions = { block: "center", behavior: "smooth" };

function openHashCard(): void {
  const id = decodeURIComponent(window.location.hash.slice(HASH_PREFIX.length));
  if (!id) return;
  const target = document.getElementById(id);
  if (!(target instanceof HTMLDetailsElement)) return;
  target.open = true;
  window.requestAnimationFrame(() => target.scrollIntoView(SCROLL_OPTIONS));
}

export default function HashCardOpener() {
  useEffect(() => {
    openHashCard();
    window.addEventListener("hashchange", openHashCard);
    return () => window.removeEventListener("hashchange", openHashCard);
  }, []);

  return null;
}
