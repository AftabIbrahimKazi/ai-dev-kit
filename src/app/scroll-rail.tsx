"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";

interface ScrollRailProps {
  targetRef?: RefObject<HTMLElement | null>;
}

const MIN_THUMB_SIZE = 32 as const;
const STATE_ATTRIBUTE = "rkState" as const;
const STATE_HIDDEN = "hidden" as const;
const STATE_IDLE = "idle" as const;
const STATE_DRAGGING = "dragging" as const;
const THUMB_SIZE_VAR = "--rk-thumb-size" as const;
const THUMB_OFFSET_VAR = "--rk-thumb-offset" as const;
const NO_SCROLL = 0 as const;

export default function ScrollRail({ targetRef }: ScrollRailProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rail = railRef.current;
    const thumb = thumbRef.current;
    if (!rail || !thumb) return;
    const target = targetRef?.current ?? null;
    const isPage = targetRef === undefined;
    if (!isPage && !target) return;
    const element: Element = target ?? document.scrollingElement ?? document.documentElement;
    const scrollSource: HTMLElement | Window = target ?? window;
    const scroller = (): Element => element;

    const measure = () => {
      const view = isPage ? window.innerHeight : element.clientHeight;
      const total = element.scrollHeight;
      const track = rail.clientHeight;
      const range = total - view;
      if (range <= NO_SCROLL || track <= NO_SCROLL) return { range: NO_SCROLL, thumbSize: NO_SCROLL, travel: NO_SCROLL, view };
      const thumbSize = Math.max(MIN_THUMB_SIZE, track * (view / total));
      return { range, thumbSize, travel: track - thumbSize, view };
    };

    const sync = () => {
      const { range, thumbSize, travel } = measure();
      if (range <= NO_SCROLL) {
        if (rail.dataset[STATE_ATTRIBUTE] !== STATE_HIDDEN) rail.dataset[STATE_ATTRIBUTE] = STATE_HIDDEN;
        return;
      }
      if (rail.dataset[STATE_ATTRIBUTE] === STATE_HIDDEN) rail.dataset[STATE_ATTRIBUTE] = STATE_IDLE;
      const progress = Math.min(1, Math.max(0, scroller().scrollTop / range));
      thumb.style.setProperty(THUMB_SIZE_VAR, `${thumbSize}px`);
      thumb.style.setProperty(THUMB_OFFSET_VAR, `${progress * travel}px`);
    };

    let dragStartY = 0;
    let dragStartScroll = 0;

    const onThumbDown = (event: PointerEvent) => {
      event.preventDefault();
      window.addEventListener("pointermove", onThumbMove);
      window.addEventListener("pointerup", onThumbUp);
      window.addEventListener("pointercancel", onThumbUp);
      dragStartY = event.clientY;
      dragStartScroll = scroller().scrollTop;
      rail.dataset[STATE_ATTRIBUTE] = STATE_DRAGGING;
    };
    const onThumbMove = (event: PointerEvent) => {
      if (rail.dataset[STATE_ATTRIBUTE] !== STATE_DRAGGING) return;
      const { range, travel } = measure();
      if (travel <= NO_SCROLL) return;
      scroller().scrollTo({ top: dragStartScroll + ((event.clientY - dragStartY) * range) / travel, behavior: "instant" });
    };
    const onThumbUp = () => {
      window.removeEventListener("pointermove", onThumbMove);
      window.removeEventListener("pointerup", onThumbUp);
      window.removeEventListener("pointercancel", onThumbUp);
      if (rail.dataset[STATE_ATTRIBUTE] === STATE_DRAGGING) rail.dataset[STATE_ATTRIBUTE] = STATE_IDLE;
    };
    const onTrackDown = (event: PointerEvent) => {
      if (event.target !== rail) return;
      const { view } = measure();
      const direction = event.clientY < thumb.getBoundingClientRect().top ? -1 : 1;
      scroller().scrollBy({ top: direction * view, behavior: "smooth" });
    };

    sync();
    scrollSource.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    thumb.addEventListener("pointerdown", onThumbDown);
    rail.addEventListener("pointerdown", onTrackDown);
    const observer = new ResizeObserver(sync);
    observer.observe(target ?? document.body);
    if (target?.firstElementChild) observer.observe(target.firstElementChild);

    return () => {
      scrollSource.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      thumb.removeEventListener("pointerdown", onThumbDown);
      onThumbUp();
      rail.removeEventListener("pointerdown", onTrackDown);
      observer.disconnect();
    };
  }, [targetRef]);

  return (
    <div ref={railRef} className="rk-scrollrail-ts" data-rk-scope={targetRef ? "element" : "page"} data-rk-state="hidden" aria-hidden="true">
      <div ref={thumbRef} className="rk-scrollthumb-ts" />
    </div>
  );
}
