import { Box3, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import type { CameraFocus, CameraKeyframe, KitGraph, SceneSection, StageNode } from "@/types/kit-stage";
import { HL_GROUP, HL_NAME, HL_SEPARATOR } from "@/content/skills-scene";
import { CameraController } from "./camera-controller";
import { NeuralBackdropScene } from "./neural-backdrop-scene";
import { NodeFieldScene } from "./node-field-scene";
import { PaletteLoader } from "./palette-loader";
import { ScrollObserver } from "./scroll-observer";
import { StoryPulseScene, type StoryAct } from "./story-pulse-scene";
import { TagScene, type TagSpec } from "./tag-scene";
import { preloadTagIcons } from "./tag-icons";
import { clamp, getDampFactor } from "./math-utils";
import {
  CAMERA_FAN_MIN_RADIUS,
  CAMERA_FAR,
  CAMERA_FOCUS_DAMP_RATE,
  CAMERA_FOCUS_MAX_RADIUS,
  CAMERA_FOCUS_MIN_RADIUS,
  CAMERA_FOCUS_RADIUS_GAIN,
  CAMERA_FOCUS_RADIUS_PAD,
  CAMERA_FOV,
  CAMERA_NEAR,
  CAMERA_POINTER_DAMP_RATE,
  CLAUDE_POSITION,
  EDGE_REACH_FOCUS,
  LIT_OUTSIDE_FOCUS,
  MAX_DELTA_SECONDS,
  MAX_PIXEL_RATIO,
  NODE_BASE_RADIUS,
  NODE_DEGREE_RADIUS,
  REDUCED_MOTION_QUERY,
  INTRO_MS,
  STAGE_READY,
  STAGE_READY_ATTRIBUTE,
  STAGE_READY_EVENT,
  THEME_ATTRIBUTE,
  YOU_POSITION,
} from "./stage-config";

const MS_PER_SECOND = 1000 as const;
const POINTER_SCALE = 2 as const;
const HOLD_SPAN = 0.2 as const;
const NO_ORBIT = Number.POSITIVE_INFINITY;
const EDGE_REACH = 0.35 as const;
const FULL_REVEAL = 1 as const;
const REVEAL_FLOOR = 0.2 as const;
const HIGHLIGHT_SELECTOR = ".rk-hl-ts" as const;
const HOVER_RELEASE_MS = 260 as const;
const FOCUS_EPSILON = 0.002 as const;
const TAG_LEVEL_DAMP_RATE = 9 as const;
const TAG_ACTIVE_BLEND = 0.15 as const;
const TAG_COLOR_INDEX = 1 as const;
const TAG_ICON = "sparkles" as const;
const TAG_SECTION_SPAN = 2.2 as const;
const TESTS_GROUP = "tests" as const;
const SECTION_TAG_PREFIX = "section-" as const;
const HOVER_TAG_PREFIX = "hover-" as const;
const STORY_MAX_TARGETS = 6 as const;
const HUB_DAMP_RATE = 7 as const;
const ACT_ATTRIBUTE_SELECTOR = "[data-act]" as const;
const DEFAULT_ACT: StoryAct = "auto";
const ALL_KIND = "all" as const;
const SKILL_GROUP_PREFIX = "skills-" as const;
const STORY_ACTS: readonly string[] = ["auto", "manual", "opt-in", "you", "ai", "when", "does", "say"];
const HUB_YOU_TAG = "story-you" as const;
const HUB_CLAUDE_TAG = "story-claude" as const;
const HUB_TAG_CLEARANCE = 6 as const;
const AMBIENT_KEY = "ambient" as const;
const AMBIENT_HUB_LEVEL = 0.55 as const;
const HUB_ACTS: Readonly<Record<StoryAct, readonly [number, number]>> = {
  auto: [0, 1],
  manual: [1, 1],
  "opt-in": [0, 1],
  you: [1, 0],
  ai: [0, 1],
  when: [0, 1],
  does: [0, 0],
  say: [1, 1],
};

interface HoverSubject {
  key: string;
  act: StoryAct;
  indexes: Set<number>;
  center: Vector3;
  radius: number;
  targets: Vector3[];
}

interface NodeSet {
  indexes: Set<number>;
  anchor: Vector3;
  spread: number;
}

export class ModuleStageEngine {
  private readonly _graph: KitGraph;
  private readonly _canvas: HTMLCanvasElement;
  private readonly _sections: readonly SceneSection[];
  private readonly _ambientAct: StoryAct | null;
  private readonly _ambientPool: Set<number> = new Set();
  private readonly _ambientSets: Map<number, Vector3[]> = new Map();
  private readonly _elements: HTMLElement[];
  private readonly _nodes: StageNode[] = [];
  private readonly _levels: Float32Array[] = [];
  private readonly _centers: Vector3[] = [];
  private readonly _subjects: Map<string, HoverSubject> = new Map();
  private readonly _tagLevels: Map<string, number> = new Map();
  private readonly _focus: CameraFocus = { target: new Vector3(), radius: CAMERA_FOCUS_MIN_RADIUS, blend: 0 };
  private readonly _scene: Scene = new Scene();
  private readonly _camera: PerspectiveCamera = new PerspectiveCamera(CAMERA_FOV, 1, CAMERA_NEAR, CAMERA_FAR);
  private _renderer: WebGLRenderer | null = null;
  private _field: NodeFieldScene | null = null;
  private _backdrop: NeuralBackdropScene | null = null;
  private _pulses: StoryPulseScene | null = null;
  private readonly _nodeSets: Map<string, NodeSet | null> = new Map();
  private _hubYou: number = 0;
  private _hubClaude: number = 0;
  private _tags: TagScene | null = null;
  private _tagIcons: Map<string, HTMLImageElement> = new Map();
  private _rig: CameraController | null = null;
  private _scroll: ScrollObserver | null = null;
  private _loader: PaletteLoader | null = null;
  private _themeObserver: MutationObserver | null = null;
  private _subject: HoverSubject | null = null;
  private _hoverKey: string | null = null;
  private _releaseAt: number = 0;
  private _storyKey: string | null = null;
  private _frameId: number = 0;
  private _start: number = 0;
  private _previous: number = 0;
  private _pointerX: number = 0;
  private _pointerY: number = 0;
  private _smoothX: number = 0;
  private _smoothY: number = 0;
  private _isReadySignalled: boolean = false;
  private _isPaletteReady: boolean = false;
  private _isMotionReduced: boolean = false;
  private _isDestroyed: boolean = false;
  private _isRunning: boolean = false;

  constructor(graph: KitGraph, canvas: HTMLCanvasElement, sections: readonly SceneSection[], ambientAct: StoryAct | null) {
    this._ambientAct = ambientAct;
    this._graph = graph;
    this._canvas = canvas;
    this._sections = sections;
    this._elements = sections.map((section) => document.getElementById(section.id)).filter((element): element is HTMLElement => element !== null);
  }

  public init(): boolean {
    if (this._elements.length !== this._sections.length) return false;
    try {
      this._renderer = new WebGLRenderer({ canvas: this._canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      return false;
    }
    this._isMotionReduced = window.matchMedia(REDUCED_MOTION_QUERY).matches;
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this._buildNodes();
    this._buildLevels();
    this._sections.forEach((section) => this._membersOf(section).forEach((node) => section.groups.length > 0 && this._ambientPool.add(node.index)));
    this._loader = new PaletteLoader(document.documentElement);
    this._field = new NodeFieldScene(this._nodes, this._graph.edges);
    this._field.init();
    this._backdrop = new NeuralBackdropScene();
    this._backdrop.init();
    this._pulses = new StoryPulseScene();
    this._pulses.init();
    const keyframes = this._buildKeyframes();
    this._tags = new TagScene(this._buildTagSpecs());
    this._rig = new CameraController(this._camera);
    this._rig.init(keyframes);
    this._scroll = new ScrollObserver(this._elements, []);
    this._scroll.init();
    this._scene.add(this._backdrop.group, this._field.group, this._pulses.group, this._tags.group);
    this._field.setReach(EDGE_REACH);
    this._applyPalette();
    window.addEventListener("resize", this._onResize);
    window.addEventListener("pointermove", this._onPointerMove, { passive: true });
    document.addEventListener("visibilitychange", this._onVisibility);
    document.addEventListener("pointerover", this._onHoverOver, { passive: true });
    document.addEventListener("focusin", this._onHoverOver);
    document.addEventListener("focusout", this._onHoverLeave);
    document.documentElement.addEventListener("pointerleave", this._onHoverLeave, { passive: true });
    this._themeObserver = new MutationObserver(this._applyPalette);
    this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: [THEME_ATTRIBUTE] });
    this._onResize();
    this._start = performance.now();
    this._previous = this._start;
    this._isRunning = true;
    this._frameId = requestAnimationFrame(this._onFrame);
    Promise.all([document.fonts.ready, preloadTagIcons()])
      .then(([, icons]) => {
        if (this._isDestroyed) return;
        this._tagIcons = icons;
        this._applyPalette();
        this._isPaletteReady = true;
      })
      .catch(() => {
        this._isPaletteReady = true;
      });
    return true;
  }

  public destroy(): void {
    this._isDestroyed = true;
    this._isRunning = false;
    cancelAnimationFrame(this._frameId);
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("pointermove", this._onPointerMove);
    document.removeEventListener("visibilitychange", this._onVisibility);
    document.removeEventListener("pointerover", this._onHoverOver);
    document.removeEventListener("focusin", this._onHoverOver);
    document.removeEventListener("focusout", this._onHoverLeave);
    document.documentElement.removeEventListener("pointerleave", this._onHoverLeave);
    this._themeObserver?.disconnect();
    this._scroll?.destroy();
    this._backdrop?.destroy();
    this._field?.destroy();
    this._pulses?.destroy();
    this._tags?.destroy();
    this._renderer?.dispose();
    this._renderer?.forceContextLoss();
  }

  private _buildNodes(): void {
    const degree = new Array<number>(this._graph.nodes.length).fill(0);
    this._graph.edges.forEach(([a, b]) => {
      degree[a] += 1;
      degree[b] += 1;
    });
    this._graph.nodes.forEach(([id, label, group, actor, x, y, z], index) => {
      this._nodes.push({ index, id, label, group, actor, position: new Vector3(x, y, z), radius: NODE_BASE_RADIUS + Math.sqrt(degree[index]) * NODE_DEGREE_RADIUS });
    });
  }

  private _membersOf(section: SceneSection): StageNode[] {
    if (section.groups.length === 0) return this._nodes;
    return this._nodes.filter((node) => section.groups.includes(node.group));
  }

  private _buildLevels(): void {
    this._sections.forEach((section) => {
      const levels = new Float32Array(this._nodes.length);
      levels.fill(section.outside);
      this._membersOf(section).forEach((node) => {
        levels[node.index] = section.lit;
      });
      this._levels.push(levels);
    });
  }

  private _buildKeyframes(): CameraKeyframe[] {
    return this._sections.map((section) => {
      const points = this._membersOf(section).map((node) => node.position);
      const center = new Box3().setFromPoints(points).getCenter(new Vector3());
      this._centers.push(center);
      const fit = points.reduce((largest, point) => Math.max(largest, point.distanceTo(center)), 0);
      return { target: [center.x, center.y, center.z], radius: CAMERA_FAN_MIN_RADIUS, fit: fit * section.scale, theta: section.theta, phi: section.phi, side: section.side, fov: section.fov };
    });
  }

  private _labelOf(key: string): string {
    const split = key.indexOf(HL_SEPARATOR);
    const kind = key.slice(0, split);
    const value = key.slice(split + 1);
    if (kind === HL_GROUP) return this._sections.find((section) => section.label !== "" && section.groups.length === 1 && section.groups[0] === value)?.label ?? value;
    return value.startsWith("mcp-manager.") ? value.slice("mcp-manager.".length) : value;
  }

  private _buildTagSpecs(): TagSpec[] {
    const specs: TagSpec[] = [];
    this._sections.forEach((section, index) => {
      if (!section.label) return;
      specs.push({ key: `${SECTION_TAG_PREFIX}${index}`, text: section.label, position: this._centers[index].clone(), colorIndex: TAG_COLOR_INDEX, icon: TAG_ICON });
    });
    document.querySelectorAll<HTMLElement>(HIGHLIGHT_SELECTOR).forEach((element) => {
      const key = element.dataset.hl;
      if (!key || this._tagLevels.has(`${HOVER_TAG_PREFIX}${key}`)) return;
      const set = this._nodeSetFor(key);
      if (!set) return;
      const tagKey = `${HOVER_TAG_PREFIX}${key}`;
      specs.push({ key: tagKey, text: this._labelOf(key), position: set.anchor.clone(), colorIndex: TAG_COLOR_INDEX, icon: TAG_ICON, style: "spotlight" });
      this._tagLevels.set(tagKey, 0);
    });
    specs.push({ key: HUB_YOU_TAG, text: "You", position: new Vector3(...YOU_POSITION), colorIndex: 0, icon: "user", placement: "below", radius: HUB_TAG_CLEARANCE });
    specs.push({ key: HUB_CLAUDE_TAG, text: "Claude", position: new Vector3(...CLAUDE_POSITION), colorIndex: TAG_COLOR_INDEX, icon: "bot", placement: "below", radius: HUB_TAG_CLEARANCE });
    return specs;
  }

  private _nodeSetFor(key: string): NodeSet | null {
    const cached = this._nodeSets.get(key);
    if (cached !== undefined) return cached;
    const split = key.indexOf(HL_SEPARATOR);
    const kind = key.slice(0, split);
    const value = key.slice(split + 1);
    const indexes = new Set<number>();
    this._nodes.forEach((node) => {
      if (kind === HL_GROUP && node.group === value) indexes.add(node.index);
      else if (kind === ALL_KIND && node.group.startsWith(SKILL_GROUP_PREFIX)) indexes.add(node.index);
      else if (kind === HL_NAME && node.group !== TESTS_GROUP) {
        const base = node.id.slice(node.id.lastIndexOf("/") + 1);
        if (base === value || base.startsWith(`${value}.`)) indexes.add(node.index);
      }
    });
    let set: NodeSet | null = null;
    if (indexes.size > 0) {
      const points = Array.from(indexes, (index) => this._nodes[index].position);
      const anchor = new Box3().setFromPoints(points).getCenter(new Vector3());
      set = { indexes, anchor, spread: points.reduce((largest, point) => Math.max(largest, point.distanceTo(anchor)), 0) };
    }
    this._nodeSets.set(key, set);
    return set;
  }

  private _subjectFor(key: string, act: StoryAct): HoverSubject | null {
    const cacheKey = `${key}|${act}`;
    const cached = this._subjects.get(cacheKey);
    if (cached) return cached;
    const set = this._nodeSetFor(key);
    if (!set) return null;
    const ranked = Array.from(set.indexes, (index) => this._nodes[index]).sort((a, b) => b.radius - a.radius).slice(0, STORY_MAX_TARGETS);
    const targets = ranked.map((node) => node.position);
    const hubs = HUB_ACTS[act];
    const framed = [...targets];
    if (hubs[0]) framed.push(new Vector3(...YOU_POSITION));
    if (hubs[1]) framed.push(new Vector3(...CLAUDE_POSITION));
    const useWhole = act === "does" ? Array.from(set.indexes, (index) => this._nodes[index].position) : framed;
    const center = new Box3().setFromPoints(useWhole).getCenter(new Vector3());
    const spread = useWhole.reduce((largest, point) => Math.max(largest, point.distanceTo(center)), 0);
    const radius = clamp(spread * CAMERA_FOCUS_RADIUS_GAIN + CAMERA_FOCUS_RADIUS_PAD, CAMERA_FOCUS_MIN_RADIUS, CAMERA_FOCUS_MAX_RADIUS);
    const subject: HoverSubject = { key, act, indexes: set.indexes, center, radius, targets };
    this._subjects.set(cacheKey, subject);
    return subject;
  }

  private _applyLevels(chapter: number): boolean {
    const field = this._field;
    if (!field) return false;
    const last = this._sections.length - 1;
    const index = Math.min(last, Math.floor(chapter));
    const next = Math.min(last, index + 1);
    const t = Math.min(1, Math.max(0, (chapter - index - HOLD_SPAN) / (1 - HOLD_SPAN)));
    const eased = t * t * (3 - 2 * t);
    const from = this._levels[index];
    const to = this._levels[next];
    const blend = this._focus.blend;
    const focusSet = this._subject?.indexes;
    this._nodes.forEach((node) => {
      let value = from[node.index] + (to[node.index] - from[node.index]) * eased;
      if (focusSet && blend > FOCUS_EPSILON) value = value * (1 - blend) + blend * (focusSet.has(node.index) ? 1 : LIT_OUTSIDE_FOCUS);
      field.targets[node.index] = value;
    });
    return true;
  }

  private _updateFocus(deltaSeconds: number, now: number): void {
    if (this._hoverKey !== null && this._releaseAt > 0 && now >= this._releaseAt) {
      this._hoverKey = null;
      this._releaseAt = 0;
    }
    const subject = this._subject;
    if (subject) {
      if (this._focus.blend < FOCUS_EPSILON) {
        this._focus.target.copy(subject.center);
        this._focus.radius = subject.radius;
      } else {
        const follow = getDampFactor(CAMERA_FOCUS_DAMP_RATE, deltaSeconds);
        this._focus.target.lerp(subject.center, follow);
        this._focus.radius += (subject.radius - this._focus.radius) * follow;
      }
    }
    const goal = this._hoverKey !== null && subject ? 1 : 0;
    this._focus.blend = this._isMotionReduced ? goal : this._focus.blend + (goal - this._focus.blend) * getDampFactor(CAMERA_FOCUS_DAMP_RATE, deltaSeconds);
    if (goal === 0 && this._focus.blend < FOCUS_EPSILON) this._subject = null;
  }

  private _ambientTargets(chapter: number): { index: number; targets: Vector3[] } {
    const index = clamp(Math.round(chapter), 0, this._sections.length - 1);
    let targets = this._ambientSets.get(index);
    if (!targets) {
      const section = this._sections[index];
      const pool = section.groups.length > 0 ? this._membersOf(section) : Array.from(this._ambientPool, (nodeIndex) => this._nodes[nodeIndex]);
      targets = pool
        .filter((node) => node.group !== TESTS_GROUP)
        .sort((a, b) => b.radius - a.radius)
        .slice(0, STORY_MAX_TARGETS)
        .map((node) => node.position);
      this._ambientSets.set(index, targets);
    }
    return { index, targets };
  }

  private _updateStory(seconds: number, deltaSeconds: number, chapter: number): void {
    const pulses = this._pulses;
    if (!pulses) return;
    const subject = this._subject;
    const ambient = subject || !this._ambientAct ? null : this._ambientTargets(chapter);
    const storyKey = subject ? `${subject.key}|${subject.act}` : ambient ? `${AMBIENT_KEY}|${ambient.index}` : null;
    if (storyKey !== this._storyKey) {
      this._storyKey = storyKey;
      const act = subject ? subject.act : this._ambientAct;
      if (!act) {
        pulses.setStory(null, seconds);
        return;
      }
      const targets = subject ? subject.targets : (ambient?.targets ?? []);
      pulses.setStory(targets.length > 0 ? { act, you: new Vector3(...YOU_POSITION), claude: new Vector3(...CLAUDE_POSITION), targets } : null, seconds);
    }
    const [youGoal, claudeGoal] = pulses.getHubTargets();
    const active = subject ? (this._focus.blend > TAG_ACTIVE_BLEND ? 1 : 0) : ambient ? AMBIENT_HUB_LEVEL : 0;
    const follow = getDampFactor(HUB_DAMP_RATE, deltaSeconds);
    this._hubYou += (youGoal * active - this._hubYou) * follow;
    this._hubClaude += (claudeGoal * active - this._hubClaude) * follow;
    pulses.update(seconds, this._hubYou, this._hubClaude);
  }

  private _updateTags(deltaSeconds: number, chapter: number): void {
    const tags = this._tags;
    if (!tags) return;
    this._sections.forEach((section, index) => {
      if (!section.label) return;
      tags.setOpacity(`${SECTION_TAG_PREFIX}${index}`, clamp(1 - Math.abs(chapter - (index + 0.5)) * TAG_SECTION_SPAN, 0, 1));
    });
    const follow = getDampFactor(TAG_LEVEL_DAMP_RATE, deltaSeconds);
    const activeKey = this._subject && this._focus.blend > TAG_ACTIVE_BLEND ? `${HOVER_TAG_PREFIX}${this._subject.key}` : null;
    this._tagLevels.forEach((level, tagKey) => {
      const goal = tagKey === activeKey ? 1 : 0;
      const next = level + (goal - level) * follow;
      this._tagLevels.set(tagKey, next);
      tags.setOpacity(tagKey, next);
    });
    tags.setOpacity(HUB_YOU_TAG, this._hubYou);
    tags.setOpacity(HUB_CLAUDE_TAG, this._hubClaude);
    tags.place(this._camera);
  }

  private readonly _applyPalette = (): void => {
    if (!this._loader) return;
    const palette = this._loader.load();
    this._backdrop?.setPalette(palette);
    this._field?.setPalette(palette);
    this._pulses?.setPalette(palette);
    this._tags?.build(this._loader.loadFont(), [...palette.actors, ...palette.fan], this._tagIcons);
  };

  private readonly _onResize = (): void => {
    if (!this._renderer) return;
    const width = this._canvas.clientWidth;
    const height = this._canvas.clientHeight;
    this._renderer.setSize(width, height, false);
    this._camera.aspect = width / Math.max(height, 1);
    this._camera.updateProjectionMatrix();
    this._scroll?.measure();
  };

  private readonly _onPointerMove = (event: PointerEvent): void => {
    this._pointerX = (event.clientX / Math.max(window.innerWidth, 1)) * POINTER_SCALE - 1;
    this._pointerY = (event.clientY / Math.max(window.innerHeight, 1)) * POINTER_SCALE - 1;
  };

  private readonly _onHoverOver = (event: Event): void => {
    const target = event.target;
    const holder = target instanceof Element ? target.closest<HTMLElement>(HIGHLIGHT_SELECTOR) : null;
    const key = holder?.dataset.hl ?? null;
    const rawAct = target instanceof Element ? (target.closest<HTMLElement>(ACT_ATTRIBUTE_SELECTOR)?.dataset.act ?? "") : "";
    const act: StoryAct = STORY_ACTS.includes(rawAct) ? (rawAct as StoryAct) : DEFAULT_ACT; // rawAct is checked against STORY_ACTS on the line above
    const subject = key ? this._subjectFor(key, act) : null;
    if (!key || !subject) {
      this._scheduleRelease();
      return;
    }
    this._hoverKey = key;
    this._releaseAt = 0;
    this._subject = subject;
  };

  private readonly _onHoverLeave = (): void => {
    this._scheduleRelease();
  };

  private _scheduleRelease(): void {
    if (this._hoverKey !== null && this._releaseAt === 0) this._releaseAt = performance.now() + HOVER_RELEASE_MS;
  }

  private readonly _onVisibility = (): void => {
    if (document.visibilityState === "hidden") {
      cancelAnimationFrame(this._frameId);
      this._isRunning = false;
      return;
    }
    if (this._isRunning || this._isDestroyed) return;
    this._isRunning = true;
    this._previous = performance.now();
    this._frameId = requestAnimationFrame(this._onFrame);
  };

  private readonly _onFrame = (now: number): void => {
    if (!this._isRunning || !this._renderer || !this._field || !this._backdrop || !this._rig || !this._scroll) return;
    this._frameId = requestAnimationFrame(this._onFrame);
    const deltaSeconds = Math.max(0, Math.min(MAX_DELTA_SECONDS, (now - this._previous) / MS_PER_SECOND));
    this._previous = now;
    const seconds = this._isMotionReduced ? 0 : (now - this._start) / MS_PER_SECOND;
    this._scroll.update(deltaSeconds, this._isMotionReduced);
    const chapter = this._scroll.getSmooth();
    this._updateFocus(deltaSeconds, now);
    this._field.setReach(EDGE_REACH + this._focus.blend * EDGE_REACH_FOCUS);
    this._applyLevels(chapter);
    if (this._isMotionReduced) this._field.snapToTargets();
    this._field.update(deltaSeconds);
    const follow = getDampFactor(CAMERA_POINTER_DAMP_RATE, deltaSeconds);
    this._smoothX += (this._pointerX - this._smoothX) * follow;
    this._smoothY += (this._pointerY - this._smoothY) * follow;
    this._rig.update({ chapter, pointerX: this._smoothX, pointerY: this._smoothY, seconds, introEase: this._isMotionReduced ? 1 : 1 - (1 - Math.min(1, Math.max(0, (now - this._start) / INTRO_MS))) ** 3, isMotionReduced: this._isMotionReduced, focus: this._focus, orbitFrom: NO_ORBIT });
    this._field.setProjection(this._renderer.domElement.height, this._camera.fov);
    this._backdrop.setProjection(this._renderer.domElement.height, this._camera.fov);
    this._backdrop.update(seconds, this._isMotionReduced ? FULL_REVEAL : REVEAL_FLOOR + (FULL_REVEAL - REVEAL_FLOOR) * (1 - (1 - Math.min(1, Math.max(0, (now - this._start) / INTRO_MS))) ** 3));
    this._updateStory(seconds, deltaSeconds, chapter);
    this._updateTags(deltaSeconds, chapter);
    this._renderer.render(this._scene, this._camera);
    this._signalReady();
  };

  private _signalReady(): void {
    if (this._isReadySignalled || !this._isPaletteReady) return;
    this._isReadySignalled = true;
    this._canvas.dataset.state = STAGE_READY;
    document.documentElement.setAttribute(STAGE_READY_ATTRIBUTE, STAGE_READY);
    window.dispatchEvent(new Event(STAGE_READY_EVENT));
  }
}
