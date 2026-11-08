export type SkillMode = "auto" | "manual" | "opt-in";

export interface GuideSkill {
  name: string;
  does: string;
  when: string;
  mode: SkillMode;
  you: string;
  ai: string;
}

export interface GuideType {
  id: string;
  name: string;
  purpose: string;
  source: string;
  skills: readonly GuideSkill[];
  members?: readonly string[];
}

export type GuideVisual = "flow" | "shelf" | "anatomy";

export interface GuideChapter {
  id: string;
  kicker: string;
  title: string;
  line: string;
  visual: GuideVisual;
  moreLabel: string;
  more: readonly string[];
}

export interface GuideMode {
  mode: SkillMode;
  label: string;
  text: string;
}

export interface GuideFinderRow {
  situation: string;
  skill: string;
}
