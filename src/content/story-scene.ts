import type { SceneSection } from "@/types/kit-stage";
import type { ModuleGuide, ModuleMotion } from "@/types/module-guide";

const NO_GROUPS: readonly string[] = [];
const SIDE_ASIDE = -1.35 as const;
const HERO_SIDE = -1.2 as const;
const EMPTY_LABEL = "" as const;
const START_THETA = 0.9 as const;
const HERO_FRAME = { lit: 0.35, outside: 0.35, theta: 0.2, phi: 1.05, fov: 60, scale: 0.55 } as const;
const INTRO_FRAME = { lit: 0.7, outside: 0.08, fov: 52, scale: 0.75 } as const;
const ITEM_FRAME = { lit: 1, outside: 0.1, fov: 46, scale: 0.85 } as const;
const FINDER_FRAME = { lit: 0.6, outside: 0.1, fov: 56, scale: 0.7 } as const;
const NEXT_FRAME ={ lit: 0.45, outside: 0.45, phi: 1.2, fov: 62, scale: 0.55 } as const;

function frame(id: string, groups: readonly string[], lit: number, outside: number, theta: number, phi: number, fov: number, scale: number, side: number = SIDE_ASIDE): SceneSection {
  return { id, groups, lit, outside, theta, phi, fov, side, scale, label: EMPTY_LABEL };
}

export function buildStoryScene(guide: ModuleGuide, groups: readonly string[], motion: ModuleMotion): readonly SceneSection[] {
  let step = 0;
  const nextAngle = (): { theta: number; phi: number } => {
    const angle = { theta: START_THETA + step * motion.thetaStep, phi: motion.phiCycle[step % motion.phiCycle.length] };
    step += 1;
    return angle;
  };
  const sections: SceneSection[] = [frame("module-hero", NO_GROUPS, HERO_FRAME.lit, HERO_FRAME.outside, HERO_FRAME.theta, HERO_FRAME.phi, HERO_FRAME.fov, HERO_FRAME.scale, HERO_SIDE)];
  guide.intro.forEach((chapter) => {
    const angle = nextAngle();
    sections.push(frame(chapter.id, groups, INTRO_FRAME.lit, INTRO_FRAME.outside, angle.theta, angle.phi, INTRO_FRAME.fov, INTRO_FRAME.scale));
  });
  guide.items.forEach((item) => {
    const angle = nextAngle();
    sections.push(frame(`item-${item.id}`, item.groups ?? groups, ITEM_FRAME.lit, ITEM_FRAME.outside, angle.theta, angle.phi, ITEM_FRAME.fov + motion.fovBias, ITEM_FRAME.scale));
  });
  const finder = nextAngle();
  sections.push(frame("finder", groups, FINDER_FRAME.lit, FINDER_FRAME.outside, finder.theta, finder.phi, FINDER_FRAME.fov, FINDER_FRAME.scale));
  const last = nextAngle();
  sections.push(frame("next", NO_GROUPS, NEXT_FRAME.lit, NEXT_FRAME.outside, last.theta, NEXT_FRAME.phi, NEXT_FRAME.fov, NEXT_FRAME.scale));
  return sections;
}
