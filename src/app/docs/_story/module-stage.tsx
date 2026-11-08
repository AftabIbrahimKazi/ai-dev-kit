"use client";

import { useEffect, useRef } from "react";
import type { KitGraph, SceneSection } from "@/types/kit-stage";
import type { StoryAct } from "@/stage/story-pulse-scene";

const CANVAS_CLASS = "rk-stage-canvas" as const;

interface ModuleStageProps {
  scene: readonly SceneSection[];
  act?: StoryAct;
}

export default function ModuleStage({ scene, act }: ModuleStageProps): React.JSX.Element {
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

    Promise.all([import("@/stage/module-stage-engine"), import("@/content/kit-graph.json")])
      .then(([engineModule, graphModule]) => {
        if (isCancelled) return;
        const graph = graphModule.default as unknown as KitGraph; // the generated JSON is written in the KitGraph row shape by scripts/build-kit-graph.ts
        const engine = new engineModule.ModuleStageEngine(graph, canvas, scene, act ?? null);
        if (!engine.init()) return;
        destroyEngine = () => engine.destroy();
      })
      .catch(() => undefined);

    return () => {
      isCancelled = true;
      destroyEngine?.();
      canvas.remove();
    };
  }, [scene, act]);

  return <div ref={hostRef} className="rk-stage" aria-hidden="true" />;
}
