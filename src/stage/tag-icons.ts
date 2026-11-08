import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { ICONS, ICON_NAMES, type IconName } from "./icon-registry";

export type IconTone = "dark" | "light";

const ICON_RENDER_PX = 64 as const;
const ICON_STROKE = 2.4 as const;
const TONE_COLORS: Readonly<Record<IconTone, string>> = { dark: "#04202a", light: "#eafffb" };
const SVG_TAG = "<svg " as const;
const SVG_NAMESPACE = 'xmlns="http://www.w3.org/2000/svg" ' as const;
const TONES: readonly IconTone[] = ["dark", "light"];

export function iconKey(name: IconName, tone: IconTone): string {
  return `${name}:${tone}`;
}

function renderSvg(name: IconName, color: string): string {
  const host = document.createElement("div");
  const root = createRoot(host);
  flushSync(() => {
    root.render(createElement(ICONS[name], { size: ICON_RENDER_PX, color, strokeWidth: ICON_STROKE }));
  });
  const markup = host.innerHTML.replace(SVG_TAG, `${SVG_TAG}${SVG_NAMESPACE}`);
  root.unmount();
  return markup;
}

function loadImage(markup: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image(ICON_RENDER_PX, ICON_RENDER_PX);
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("icon failed to load"));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  });
}

export async function preloadTagIcons(): Promise<Map<string, HTMLImageElement>> {
  const icons = new Map<string, HTMLImageElement>();
  const jobs = ICON_NAMES.flatMap((name) =>
    TONES.map(async (tone) => {
      try {
        icons.set(iconKey(name, tone), await loadImage(renderSvg(name, TONE_COLORS[tone])));
      } catch {
        return;
      }
    }),
  );
  await Promise.all(jobs);
  return icons;
}
