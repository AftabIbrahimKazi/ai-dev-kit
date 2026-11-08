"use client";

import { useEffect } from "react";

const HEADER_SELECTOR = ".rk-header" as const;
const STATE_SHOWN = "shown" as const;
const STATE_HIDDEN = "hidden" as const;
const REVEAL_ZONE_PX = 88 as const;
const HIDE_AFTER_PX = 96 as const;
const HIDE_DELAY_MS = 500 as const;
const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)" as const;

export default function HeaderAutoHide(): null {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(HEADER_SELECTOR);
    if (!header) return undefined;
    const isFinePointer = window.matchMedia(FINE_POINTER_QUERY).matches;
    let lastY = window.scrollY;
    let isEngaged = false;
    let hideTimer = 0;

    const setState = (state: typeof STATE_SHOWN | typeof STATE_HIDDEN): void => {
      header.dataset.visibility = state;
    };
    const clearTimer = (): void => {
      window.clearTimeout(hideTimer);
    };
    const show = (): void => {
      clearTimer();
      setState(STATE_SHOWN);
    };
    const hideSoon = (): void => {
      clearTimer();
      if (window.scrollY < HIDE_AFTER_PX) return;
      hideTimer = window.setTimeout(() => {
        if (!isEngaged && window.scrollY >= HIDE_AFTER_PX) setState(STATE_HIDDEN);
      }, HIDE_DELAY_MS);
    };

    const onScroll = (): void => {
      const y = window.scrollY;
      if (y < HIDE_AFTER_PX) show();
      else if (isFinePointer) {
        if (!isEngaged) setState(STATE_HIDDEN);
      } else if (y < lastY) show();
      else setState(STATE_HIDDEN);
      lastY = y;
    };
    const onPointerMove = (event: PointerEvent): void => {
      if (event.pointerType === "touch") return;
      isEngaged = event.clientY < REVEAL_ZONE_PX || header.contains(event.target as Node); // event targets from the document are DOM nodes
      if (isEngaged) show();
      else hideSoon();
    };
    const onFocusIn = (): void => {
      isEngaged = true;
      show();
    };
    const onFocusOut = (): void => {
      isEngaged = false;
      hideSoon();
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    if (isFinePointer) document.addEventListener("pointermove", onPointerMove, { passive: true });
    header.addEventListener("focusin", onFocusIn);
    header.addEventListener("focusout", onFocusOut);
    return () => {
      clearTimer();
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("pointermove", onPointerMove);
      header.removeEventListener("focusin", onFocusIn);
      header.removeEventListener("focusout", onFocusOut);
      setState(STATE_SHOWN);
    };
  }, []);

  return null;
}
