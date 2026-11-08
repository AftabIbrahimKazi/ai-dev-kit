"use client";

import { useEffect } from "react";
import { SoundController } from "@/sound/sound-controller";
import { soundEngine } from "@/sound/sound-engine";

export default function SoundFx(): null {
  useEffect(() => {
    const controller = new SoundController();
    let isCancelled = false;
    soundEngine.init().then(() => {
      if (!isCancelled) controller.init();
    });
    return () => {
      isCancelled = true;
      controller.destroy();
    };
  }, []);

  return null;
}
