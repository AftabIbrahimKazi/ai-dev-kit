"use client";

import { useEffect, useRef } from "react";
import { LANDING_PROMPT } from "@/content/landing";
import type { KitGraph } from "@/types/kit-stage";

const CANVAS_CLASS = "rk-stage-canvas" as const;

export default function LandingStage(): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const canvas = document.createElement("canvas");
    canvas.className = CANVAS_CLASS;
    canvas.dataset.state = "loading";
    host.appendChild(canvas);
    let isCancelled = false;
    let destroyEngine: (() => void) | null = null;

    Promise.all([import("@/stage/stage-engine"), import("@/stage/stage-element-loader"), import("@/content/kit-graph.json")])
      .then(([engineModule, loaderModule, graphModule]) => {
        if (isCancelled) return;
        const graph = graphModule.default as unknown as KitGraph; // the generated JSON is written in the KitGraph row shape by scripts/build-kit-graph.ts
        const elements = new loaderModule.StageElementLoader().load(canvas);
        const engine = new engineModule.StageEngine(graph, elements);
        if (!engine.init(LANDING_PROMPT.text)) return;
        destroyEngine = () => engine.destroy();
      })
      .catch(() => undefined);

    return () => {
      isCancelled = true;
      destroyEngine?.();
      canvas.remove();
    };
  }, []);

  return <div ref={hostRef} className="rk-stage" aria-hidden="true" />;
}
