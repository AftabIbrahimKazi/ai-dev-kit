import { easeOutCubic } from "@triforge/keyframe";
import { Box3, Color, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import { MODULE_GROUPS, STAGE_TAGS } from "@/content/landing";
import { KIT_MODULES } from "@/content/modules";
import type { ActorIndex, CameraFocus, HoverFanSpec, IntroPhaseDetail, KitGraph, SignalFanSpec, StageElements, StageNode, StagePalette } from "@/types/kit-stage";
import { buildCameraKeyframes, type ChapterBounds } from "./camera-keyframes";
import { CameraController } from "./camera-controller";
import { clamp, getChapterWeights, getDampFactor, smoothstep } from "./math-utils";
import { NeuralBackdropScene } from "./neural-backdrop-scene";
import { NodeFieldScene } from "./node-field-scene";
import { ACTOR_ICONS, MODULE_ICONS, iconForNode, type IconName } from "./icon-registry";
import { PaletteLoader } from "./palette-loader";
import { PromptTypeController } from "./prompt-type-controller";
import { ScrollObserver } from "./scroll-observer";
import { SignalScene } from "./signal-scene";
import { preloadTagIcons } from "./tag-icons";
import { TagScene, type TagSpec } from "./tag-scene";
import {
  ACTOR_AUTOMATIC,
  ACTOR_TOKENS,
  CAMERA_FAR,
  CAMERA_FOCUS_DAMP_RATE,
  CAMERA_FOCUS_MAX_RADIUS,
  CAMERA_FOCUS_MIN_RADIUS,
  CAMERA_FOCUS_RADIUS_GAIN,
  CAMERA_FOCUS_RADIUS_PAD,
  CAMERA_FOV,
  CAMERA_NEAR,
  CAMERA_POINTER_DAMP_RATE,
  CORE_LABEL_RADIUS,
  EDGE_REACH_FOCUS,
  CHAPTER_COMMANDS,
  CHAPTER_COUNT,
  CHAPTER_GROUPS,
  CHAPTER_HERO,
  CHAPTER_MAP,
  CHAPTER_MODS,
  CHAPTER_MODULES,
  CHAPTER_PROMPT,
  CHAPTER_SKILLS,
  CHAPTER_STANDARDS,
  CLAUDE_POSITION,
  FAN_CHAPTERS,
  FAN_MAX_TARGETS,
  FAN_TOKENS,
  INTRO_ATTRIBUTE,
  INTRO_CORE_WAKE,
  INTRO_DRAW_SHARE,
  INTRO_LIFT,
  INTRO_LIT_FLOOR,
  INTRO_MS,
  INTRO_PHASE_ARRIVE,
  INTRO_PHASE_DRAW,
  INTRO_PHASE_EVENT,
  INTRO_PHASE_PULSE,
  INTRO_PHASE_WAIT,
  INTRO_PLAY,
  INTRO_PULSE_SHARE,
  INTRO_WAIT_MAX_MS,
  INTRO_WAVE_WIDTH,
  STAGE_READY,
  STAGE_READY_ATTRIBUTE,
  STAGE_READY_EVENT,
  LIT_HERO,
  LIT_MAP,
  LIT_MODULES,
  LIT_OUTSIDE_FOCUS,
  LIT_OUTSIDE_SET,
  LIT_PROMPT,
  LOW_PIXEL_RATIO,
  MAX_DELTA_SECONDS,
  MAX_PIXEL_RATIO,
  MODULE_ID_PREFIX,
  MODULE_ID_SUFFIX,
  MODULE_SELECTOR,
  NEURAL_REVEAL_FLOOR,
  NODE_BASE_RADIUS,
  NODE_DEGREE_RADIUS,
  REDUCED_MOTION_QUERY,
  SAMPLE_FRAMES,
  SLOW_FRAME_MS,
  THEME_ATTRIBUTE,
  YOU_POSITION,
} from "./stage-config";

const MS_PER_SECOND = 1000 as const;
const HIGHLIGHT_SELECTOR = ".rk-hl-ts" as const;
const HIGHLIGHT_SEPARATOR = ":" as const;
const HIGHLIGHT_GROUP = "group" as const;
const HIGHLIGHT_ACTOR = "actor" as const;
const HIGHLIGHT_NAME = "name" as const;
const HIGHLIGHT_PATH = "path" as const;
const HIGHLIGHT_PATH_SEPARATOR = "|" as const;
const HIGHLIGHT_EXCLUDED_GROUP = "tests" as const;
const HIGHLIGHT_LABEL_SELECTOR = ".rk-legend-name" as const;
const MODULE_KEY_PREFIX = "module:" as const;
const GROUP_TAG_PREFIX = "hl-" as const;
const NODE_TAG_PREFIX = "node-" as const;
const HOVER_RELEASE_MS = 260 as const;
const HOVER_SNAP_BLEND = 0.02 as const;
const HOVER_SWAP_BLEND = 0.05 as const;
const HOVER_RETURN_DAMP_RATE = 5.5 as const;
const HOVER_TARGET_EPSILON = 0.05 as const;
const LABEL_MAX_NODES = 8 as const;
const TAG_LEVEL_DAMP_RATE = 9 as const;
const TAG_ACTIVE_BLEND = 0.15 as const;
const NODE_LABEL_CLEARANCE = 1.4 as const;
const NODE_COLOR_OFFSET = ACTOR_TOKENS.length + FAN_TOKENS.length;
const CHAPTER_ICONS: Readonly<Record<number, IconName>> = {
  [CHAPTER_SKILLS]: "sparkles",
  [CHAPTER_STANDARDS]: "shield",
  [CHAPTER_MODS]: "webhook",
  [CHAPTER_COMMANDS]: "terminal",
};
const ACTOR_FAN_SOURCE: Readonly<Record<number, readonly [number, number, number]>> = {
  0: YOU_POSITION,
  1: CLAUDE_POSITION,
  2: CLAUDE_POSITION,
};
const FOCUS_ENTER_AT = 6.4 as const;
const FOCUS_EPSILON = 0.002 as const;
const WEIGHT_EPSILON = 0.00001 as const;
const POINTER_SCALE = 2 as const;
const FAN_PALETTE: Readonly<Record<number, number>> = {
  [CHAPTER_SKILLS]: 0,
  [CHAPTER_STANDARDS]: 1,
  [CHAPTER_MODS]: 2,
  [CHAPTER_COMMANDS]: 3,
};
const ACTOR_COLOR_COUNT = ACTOR_TOKENS.length;
const TAG_COLOR: Readonly<Record<number, number>> = {
  [CHAPTER_SKILLS]: ACTOR_COLOR_COUNT + FAN_PALETTE[CHAPTER_SKILLS],
  [CHAPTER_STANDARDS]: ACTOR_COLOR_COUNT + FAN_PALETTE[CHAPTER_STANDARDS],
  [CHAPTER_MODS]: ACTOR_COLOR_COUNT + FAN_PALETTE[CHAPTER_MODS],
  [CHAPTER_COMMANDS]: ACTOR_COLOR_COUNT + FAN_PALETTE[CHAPTER_COMMANDS],
};

interface HoverSubject {
  key: string;
  indexes: Set<number>;
  center: Vector3;
  radius: number;
  isModule: boolean;
  labelKeys: string[];
  fan: HoverFanSpec | null;
}

interface ModuleFocusData {
  indexes: Set<number>;
  centroid: Vector3;
  radius: number;
}

export class StageEngine {
  private readonly _graph: KitGraph;
  private readonly _elements: StageElements;
  private readonly _nodes: StageNode[] = [];
  private readonly _chapterSets: Map<number, Set<number>> = new Map();
  private readonly _moduleData: Map<string, ModuleFocusData> = new Map();
  private readonly _weights: number[] = new Array<number>(CHAPTER_COUNT).fill(0);
  private readonly _focus: CameraFocus = { target: new Vector3(), radius: CAMERA_FOCUS_MIN_RADIUS, blend: 0 };
  private readonly _scene: Scene = new Scene();
  private readonly _camera: PerspectiveCamera = new PerspectiveCamera(CAMERA_FOV, 1, CAMERA_NEAR, CAMERA_FAR);
  private _renderer: WebGLRenderer | null = null;
  private _field: NodeFieldScene | null = null;
  private _backdrop: NeuralBackdropScene | null = null;
  private _signals: SignalScene | null = null;
  private _tags: TagScene | null = null;
  private _rig: CameraController | null = null;
  private _scroll: ScrollObserver | null = null;
  private _typer: PromptTypeController | null = null;
  private _loader: PaletteLoader | null = null;
  private _themeObserver: MutationObserver | null = null;
  private _frameId: number = 0;
  private _start: number = 0;
  private _introAt: number = 0;
  private _introTimer: number = 0;
  private _introPhase: string = INTRO_PHASE_WAIT;
  private _introPhaseAt: number = 0;
  private _introPhaseMs: number = 1;
  private _introProgress: number = 0;
  private _introRank: number[] = [];
  private _isIntroActive: boolean = false;
  private _isReadySignalled: boolean = false;
  private _previous: number = 0;
  private readonly _subjects: Map<string, HoverSubject> = new Map();
  private readonly _tagLevels: Map<string, number> = new Map();
  private readonly _hoverTagKeys: string[] = [];
  private _tagIcons: Map<string, HTMLImageElement> = new Map();
  private _subject: HoverSubject | null = null;
  private _pendingSubject: HoverSubject | null = null;
  private _hoverKey: string | null = null;
  private _hoverReleaseAt: number = 0;
  private _isFocusActive: boolean = false;
  private _litKey: string | null = null;
  private _fanKey: string | null = null;
  private _pointerX: number = 0;
  private _pointerY: number = 0;
  private _smoothX: number = 0;
  private _smoothY: number = 0;
  private _lastChapter: number = -1;
  private _lastBlend: number = -1;
  private _sampleFrames: number = 0;
  private _sampleMs: number = 0;
  private _pixelRatio: number = 1;
  private _isSampled: boolean = false;
  private _isMotionReduced: boolean = false;
  private _isDestroyed: boolean = false;
  private _isRunning: boolean = false;

  constructor(graph: KitGraph, elements: StageElements) {
    this._graph = graph;
    this._elements = elements;
  }

  public init(promptText: string): boolean {
    try {
      this._renderer = new WebGLRenderer({ canvas: this._elements.canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      return false;
    }
    this._isMotionReduced = window.matchMedia(REDUCED_MOTION_QUERY).matches;
    this._pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    this._renderer.setPixelRatio(this._pixelRatio);
    this._buildNodes();
    this._buildChapterSets();
    this._buildModuleData();
    this._loader = new PaletteLoader(document.documentElement);
    this._field = new NodeFieldScene(this._nodes, this._graph.edges);
    this._field.init();
    this._backdrop = new NeuralBackdropScene();
    this._backdrop.init();
    this._signals = new SignalScene(this._buildFans());
    this._signals.init();
    this._tags = new TagScene(this._buildTagSpecs());
    this._rig = new CameraController(this._camera);
    this._rig.init(buildCameraKeyframes(this._buildBounds()));
    this._scroll = new ScrollObserver(this._elements.chapters, this._elements.rail);
    this._scroll.init();
    if (this._elements.typed) this._typer = new PromptTypeController(this._elements.typed, promptText);
    this._scene.add(this._backdrop.group, this._field.group, this._signals.group, this._tags.group);
    this._applyPalette();
    this._bindEvents();
    this._onWindowResize();
    this._start = performance.now();
    this._previous = this._start;
    this._bindIntro();
    this._isRunning = true;
    this._frameId = requestAnimationFrame(this._onFrame);
    Promise.all([document.fonts.ready, preloadTagIcons()])
      .then(([, icons]) => {
        this._tagIcons = icons;
        this._buildTags();
      })
      .catch(() => undefined);
    return true;
  }

  public destroy(): void {
    this._isDestroyed = true;
    this._isRunning = false;
    cancelAnimationFrame(this._frameId);
    window.removeEventListener("resize", this._onWindowResize);
    window.removeEventListener("pointermove", this._onPointerMove);
    document.removeEventListener("visibilitychange", this._onVisibilityChange);
    document.removeEventListener("pointerover", this._onHoverOver);
    document.removeEventListener("focusin", this._onHoverOver);
    document.removeEventListener("focusout", this._onHoverLeave);
    document.documentElement.removeEventListener("pointerleave", this._onHoverLeave);
    window.removeEventListener(INTRO_PHASE_EVENT, this._onIntroPhase);
    window.clearTimeout(this._introTimer);
    this._themeObserver?.disconnect();
    this._scroll?.destroy();
    this._typer?.reset();
    this._backdrop?.destroy();
    this._field?.destroy();
    this._signals?.destroy();
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

  private _buildChapterSets(): void {
    FAN_CHAPTERS.forEach((chapter) => {
      const groups = CHAPTER_GROUPS[chapter] ?? [];
      const isModChapter = chapter === CHAPTER_MODS;
      const set = new Set<number>();
      this._nodes.forEach((node) => {
        if (groups.includes(node.group) || (isModChapter && node.actor === ACTOR_AUTOMATIC)) set.add(node.index);
      });
      this._chapterSets.set(chapter, set);
    });
  }

  private _buildModuleData(): void {
    Object.entries(MODULE_GROUPS).forEach(([slug, groups]) => {
      const members = this._nodes.filter((node) => groups.includes(node.group));
      const indexes = new Set(members.map((node) => node.index));
      const centroid = this._centroidOf(members);
      const radius = clamp(this._spreadOf(members, centroid) * CAMERA_FOCUS_RADIUS_GAIN + CAMERA_FOCUS_RADIUS_PAD, CAMERA_FOCUS_MIN_RADIUS, CAMERA_FOCUS_MAX_RADIUS);
      this._moduleData.set(slug, { indexes, centroid, radius });
    });
  }

  private _buildFans(): SignalFanSpec[] {
    return FAN_CHAPTERS.map((chapter) => {
      const set = this._chapterSets.get(chapter) ?? new Set<number>();
      const ranked = this._nodes.filter((node) => set.has(node.index)).sort((a, b) => b.radius - a.radius).slice(0, FAN_MAX_TARGETS);
      const source = chapter === CHAPTER_COMMANDS ? new Vector3(...YOU_POSITION) : new Vector3(...CLAUDE_POSITION);
      return { chapter, source, targets: ranked.map((node) => node.position), paletteIndex: FAN_PALETTE[chapter] };
    });
  }

  private _buildBounds(): ChapterBounds[] {
    const bounds: ChapterBounds[] = FAN_CHAPTERS.map((chapter) => {
      const members = this._nodes.filter((node) => this._chapterSets.get(chapter)?.has(node.index));
      const source = new Vector3(...(chapter === CHAPTER_COMMANDS ? YOU_POSITION : CLAUDE_POSITION));
      const centroid = this._centroidOf(members);
      const sphere = this._boundsOf([source, ...members.map((node) => node.position)]);
      return { chapter, x: sphere.center.x, y: sphere.center.y, z: sphere.center.z, fit: sphere.radius, axisX: centroid.x - source.x, axisZ: centroid.z - source.z };
    });
    const whole = this._boundsOf(this._nodes.map((node) => node.position));
    bounds.push({ chapter: CHAPTER_MAP, x: whole.center.x, y: whole.center.y, z: whole.center.z, fit: whole.radius, axisX: 0, axisZ: 0 });
    return bounds;
  }

  private _boundsOf(points: Vector3[]): { center: Vector3; radius: number } {
    const center = new Box3().setFromPoints(points).getCenter(new Vector3());
    return { center, radius: points.reduce((largest, point) => Math.max(largest, point.distanceTo(center)), 0) };
  }

  private _buildTagSpecs(): TagSpec[] {
    const specs: TagSpec[] = [
      { key: "you", text: STAGE_TAGS.you, position: new Vector3(...YOU_POSITION), colorIndex: 0, icon: "user", placement: "below", radius: CORE_LABEL_RADIUS },
      { key: "claude", text: STAGE_TAGS.claude, position: new Vector3(...CLAUDE_POSITION), colorIndex: 1, icon: "bot", placement: "below", radius: CORE_LABEL_RADIUS },
    ];
    FAN_CHAPTERS.forEach((chapter) => {
      const members = this._nodes.filter((node) => this._chapterSets.get(chapter)?.has(node.index));
      specs.push({ key: `chapter-${chapter}`, text: STAGE_TAGS.chapters[chapter], position: this._centroidOf(members), colorIndex: TAG_COLOR[chapter], icon: CHAPTER_ICONS[chapter] });
    });
    KIT_MODULES.forEach((kitModule) => {
      const data = this._moduleData.get(kitModule.slug);
      if (!data) return;
      const key = `module-${kitModule.slug}`;
      specs.push({ key, text: kitModule.name, position: data.centroid, colorIndex: 1, icon: MODULE_ICONS[kitModule.slug] });
      this._hoverTagKeys.push(key);
    });
    this._collectHighlightLabels().forEach((label, key) => {
      const subject = this._subjectFor(key);
      if (!subject) return;
      if (subject.labelKeys.length === 1 && subject.labelKeys[0].startsWith(GROUP_TAG_PREFIX)) {
        specs.push({ key: subject.labelKeys[0], text: label, position: subject.center, colorIndex: 1, icon: this._iconForKey(key), style: "spotlight" });
        this._hoverTagKeys.push(subject.labelKeys[0]);
        return;
      }
      subject.indexes.forEach((index) => {
        const tagKey = `${NODE_TAG_PREFIX}${index}`;
        if (this._hoverTagKeys.includes(tagKey)) return;
        const node = this._nodes[index];
        specs.push({ key: tagKey, text: node.label, position: node.position, colorIndex: NODE_COLOR_OFFSET + node.index, icon: iconForNode(node.label), style: "spotlight", placement: "below", radius: node.radius * NODE_LABEL_CLEARANCE });
        this._hoverTagKeys.push(tagKey);
      });
    });
    return specs;
  }

  private _centroidOf(members: StageNode[]): Vector3 {
    const centroid = new Vector3();
    members.forEach((node) => centroid.add(node.position));
    return members.length > 0 ? centroid.divideScalar(members.length) : centroid;
  }

  private _spreadOf(members: StageNode[], centroid: Vector3): number {
    return members.reduce((spread, node) => Math.max(spread, node.position.distanceTo(centroid)), 0);
  }

  private _bindIntro(): void {
    this._introAt = this._start;
    if (this._isMotionReduced || document.documentElement.getAttribute(INTRO_ATTRIBUTE) !== INTRO_PLAY) return;
    this._introAt = Number.POSITIVE_INFINITY;
    this._isIntroActive = true;
    this._introPhase = INTRO_PHASE_WAIT;
    window.addEventListener(INTRO_PHASE_EVENT, this._onIntroPhase);
    this._introTimer = window.setTimeout(this._endIntro, INTRO_WAIT_MAX_MS);
  }

  private readonly _onIntroPhase = (event: Event): void => {
    const detail = (event as CustomEvent<IntroPhaseDetail>).detail; // INTRO_PHASE_EVENT is only dispatched by landing-intro with an IntroPhaseDetail
    if (detail.phase === INTRO_LIFT) {
      this._endIntro();
      return;
    }
    this._introPhase = detail.phase;
    this._introPhaseAt = performance.now();
    this._introPhaseMs = detail.ms;
    if (this._introAt === Number.POSITIVE_INFINITY) this._introAt = this._introPhaseAt;
  };

  private readonly _endIntro = (): void => {
    window.removeEventListener(INTRO_PHASE_EVENT, this._onIntroPhase);
    window.clearTimeout(this._introTimer);
    this._isIntroActive = false;
    this._signals?.setIntro(null, 0);
    this._lastChapter = -1;
    if (this._introAt === Number.POSITIVE_INFINITY) this._introAt = performance.now();
  };

  private _updateIntro(now: number): boolean {
    const field = this._field;
    const signals = this._signals;
    if (!field || !signals) return false;
    const phaseT = clamp((now - this._introPhaseAt) / Math.max(this._introPhaseMs, 1), 0, 1);
    let progress = 0;
    let pulse: number | null = null;
    let boost = 0;
    if (this._introPhase === INTRO_PHASE_DRAW) {
      progress = phaseT * INTRO_DRAW_SHARE;
      boost = phaseT * INTRO_CORE_WAKE;
    } else if (this._introPhase === INTRO_PHASE_PULSE) {
      progress = INTRO_DRAW_SHARE + phaseT * (INTRO_PULSE_SHARE - INTRO_DRAW_SHARE);
      pulse = phaseT;
      boost = INTRO_CORE_WAKE;
    } else if (this._introPhase === INTRO_PHASE_ARRIVE) {
      progress = INTRO_PULSE_SHARE + phaseT * (1 - INTRO_PULSE_SHARE);
      boost = 1 - phaseT * (1 - INTRO_CORE_WAKE);
    }
    this._introProgress = progress;
    const front = progress * (1 + INTRO_WAVE_WIDTH);
    this._nodes.forEach((node) => {
      field.targets[node.index] = INTRO_LIT_FLOOR + (1 - INTRO_LIT_FLOOR) * smoothstep(0, INTRO_WAVE_WIDTH, front - this._introRank[node.index]);
    });
    signals.setIntro(pulse, boost);
    return true;
  }

  private _bindEvents(): void {
    window.addEventListener("resize", this._onWindowResize);
    window.addEventListener("pointermove", this._onPointerMove, { passive: true });
    document.addEventListener("visibilitychange", this._onVisibilityChange);
    document.addEventListener("pointerover", this._onHoverOver, { passive: true });
    document.addEventListener("focusin", this._onHoverOver);
    document.addEventListener("focusout", this._onHoverLeave);
    document.documentElement.addEventListener("pointerleave", this._onHoverLeave, { passive: true });
    this._themeObserver = new MutationObserver(this._onThemeChange);
    this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: [THEME_ATTRIBUTE] });
  }

  private _applyPalette(): void {
    if (!this._loader) return;
    const palette: StagePalette = this._loader.load();
    this._backdrop?.setPalette(palette);
    this._field?.setPalette(palette);
    this._signals?.setPalette(palette);
    this._tags?.build(this._loader.loadFont(), this._tagColors(palette), this._tagIcons);
  }

  private _buildTags(): void {
    if (this._isDestroyed || !this._loader || !this._tags) return;
    this._tags.build(this._loader.loadFont(), this._tagColors(this._loader.load()), this._tagIcons);
  }

  private _tagColors(palette: StagePalette): Color[] {
    const field = this._field;
    return [...palette.actors, ...palette.fan, ...this._nodes.map((node) => (field ? field.getNodeColor(node.index) : palette.actors[node.actor]))];
  }

  private readonly _onWindowResize = (): void => {
    if (!this._renderer) return;
    const width = this._elements.canvas.clientWidth;
    const height = this._elements.canvas.clientHeight;
    this._renderer.setSize(width, height, false);
    this._camera.aspect = width / Math.max(height, 1);
    this._camera.updateProjectionMatrix();
    this._scroll?.measure();
  };

  private readonly _onPointerMove = (event: PointerEvent): void => {
    this._pointerX = (event.clientX / Math.max(window.innerWidth, 1)) * POINTER_SCALE - 1;
    this._pointerY = (event.clientY / Math.max(window.innerHeight, 1)) * POINTER_SCALE - 1;
  };

  private readonly _onVisibilityChange = (): void => {
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

  private readonly _onHoverOver = (event: Event): void => {
    const key = this._hoverKeyOf(event.target);
    const subject = key ? this._subjectFor(key) : null;
    if (!key || !subject) {
      this._scheduleRelease();
      return;
    }
    this._hoverKey = key;
    this._hoverReleaseAt = 0;
    const current = this._subject;
    if (!current || current.key === subject.key || this._focus.blend < HOVER_SWAP_BLEND) {
      this._subject = subject;
      this._pendingSubject = null;
      return;
    }
    this._pendingSubject = subject;
  };

  private readonly _onHoverLeave = (): void => {
    this._scheduleRelease();
  };

  private _scheduleRelease(): void {
    if (this._hoverKey !== null && this._hoverReleaseAt === 0) this._hoverReleaseAt = performance.now() + HOVER_RELEASE_MS;
  }

  private _hoverKeyOf(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    const chip = target.closest<HTMLElement>(HIGHLIGHT_SELECTOR);
    if (chip?.dataset.hl) return chip.dataset.hl;
    const id = target.closest(MODULE_SELECTOR)?.id ?? "";
    return id.startsWith(MODULE_ID_PREFIX) ? `${MODULE_KEY_PREFIX}${id.slice(MODULE_ID_PREFIX.length, id.length - MODULE_ID_SUFFIX.length)}` : null;
  }

  private _collectHighlightLabels(): Map<string, string> {
    const labels = new Map<string, string>();
    this._elements.root.querySelectorAll<HTMLElement>(HIGHLIGHT_SELECTOR).forEach((element) => {
      const key = element.dataset.hl;
      if (!key || labels.has(key)) return;
      labels.set(key, (element.querySelector(HIGHLIGHT_LABEL_SELECTOR)?.textContent ?? element.textContent ?? "").trim());
    });
    return labels;
  }

  private _iconForKey(key: string): IconName {
    if (key.startsWith(`${HIGHLIGHT_ACTOR}${HIGHLIGHT_SEPARATOR}`)) return ACTOR_ICONS[Number(key.slice(HIGHLIGHT_ACTOR.length + 1))] ?? "sparkles";
    return key.startsWith(`${HIGHLIGHT_PATH}${HIGHLIGHT_SEPARATOR}`) ? "shield" : "sparkles";
  }

  private _subjectFor(key: string): HoverSubject | null {
    const cached = this._subjects.get(key);
    if (cached) return cached;
    let subject: HoverSubject | null = null;
    if (key.startsWith(MODULE_KEY_PREFIX)) {
      const slug = key.slice(MODULE_KEY_PREFIX.length);
      const data = this._moduleData.get(slug);
      if (data) subject = { key, indexes: data.indexes, center: data.centroid, radius: data.radius, isModule: true, labelKeys: [`module-${slug}`], fan: null };
    } else {
      const indexes = this._resolveHighlight(key);
      if (indexes.size > 0) {
        const sphere = this._boundsOf(Array.from(indexes, (index) => this._nodes[index].position));
        const radius = clamp(sphere.radius * CAMERA_FOCUS_RADIUS_GAIN + CAMERA_FOCUS_RADIUS_PAD, CAMERA_FOCUS_MIN_RADIUS, CAMERA_FOCUS_MAX_RADIUS);
        const labelKeys = indexes.size <= LABEL_MAX_NODES ? Array.from(indexes, (index) => `${NODE_TAG_PREFIX}${index}`) : [`${GROUP_TAG_PREFIX}${key}`];
        subject = { key, indexes, center: sphere.center, radius, isModule: false, labelKeys, fan: this._buildHoverFan(key, indexes) };
      }
    }
    if (subject) this._subjects.set(key, subject);
    return subject;
  }

  private _buildHoverFan(key: string, indexes: Set<number>): HoverFanSpec | null {
    const prefix = `${HIGHLIGHT_ACTOR}${HIGHLIGHT_SEPARATOR}`;
    if (!key.startsWith(prefix)) return null;
    const actor = Number(key.slice(prefix.length)) as ActorIndex; // the key comes from ACTOR_LEGEND, whose actor values are ActorIndex
    const origin = ACTOR_FAN_SOURCE[actor];
    if (!origin) return null;
    const ranked = Array.from(indexes, (index) => this._nodes[index]).sort((a, b) => b.radius - a.radius).slice(0, FAN_MAX_TARGETS);
    return { source: new Vector3(...origin), targets: ranked.map((node) => node.position), actor };
  }

  private _resolveHighlight(key: string): Set<number> {
    const split = key.indexOf(HIGHLIGHT_SEPARATOR);
    const kind = key.slice(0, split);
    const value = key.slice(split + 1);
    const set = new Set<number>();
    this._nodes.forEach((node) => {
      if (kind === HIGHLIGHT_GROUP && node.group === value) set.add(node.index);
      else if (kind === HIGHLIGHT_ACTOR && node.actor === Number(value)) set.add(node.index);
      else if (kind === HIGHLIGHT_PATH && node.group !== HIGHLIGHT_EXCLUDED_GROUP) {
        if (value.split(HIGHLIGHT_PATH_SEPARATOR).some((prefix) => node.id.startsWith(prefix))) set.add(node.index);
      } else if (kind === HIGHLIGHT_NAME && node.group !== HIGHLIGHT_EXCLUDED_GROUP) {
        const base = node.id.slice(node.id.lastIndexOf("/") + 1);
        if (base === value || base.startsWith(`${value}.`)) set.add(node.index);
      }
    });
    return set;
  }

  private readonly _onThemeChange = (): void => {
    this._applyPalette();
  };

  private readonly _onFrame = (now: number): void => {
    if (!this._isRunning || !this._renderer || !this._field || !this._backdrop || !this._signals || !this._tags || !this._rig || !this._scroll) return;
    this._frameId = requestAnimationFrame(this._onFrame);
    const deltaSeconds = Math.min(MAX_DELTA_SECONDS, (now - this._previous) / MS_PER_SECOND);
    this._sampleCost(now - this._previous);
    this._previous = now;
    const seconds = this._isMotionReduced ? 0 : (now - this._start) / MS_PER_SECOND;
    const isScrolling = this._scroll.update(deltaSeconds, this._isMotionReduced);
    const chapter = this._scroll.getSmooth();
    this._typer?.update(this._scroll.getRaw());
    getChapterWeights(chapter, this._weights);
    const isFocusMoving = this._updateFocus(deltaSeconds, chapter, now);
    this._field.setReach(this._focus.blend * EDGE_REACH_FOCUS);
    const isLightChanging = this._isIntroActive ? this._updateIntro(now) : this._updateTargets(chapter);
    if (this._isMotionReduced && isLightChanging) this._field.snapToTargets();
    const isLitMoving = this._field.update(deltaSeconds);
    if (this._isMotionReduced && !isScrolling && !isFocusMoving && !isLitMoving && !isLightChanging && this._lastChapter >= 0) return;
    this._smoothX += (this._pointerX - this._smoothX) * getDampFactor(CAMERA_POINTER_DAMP_RATE, deltaSeconds);
    this._smoothY += (this._pointerY - this._smoothY) * getDampFactor(CAMERA_POINTER_DAMP_RATE, deltaSeconds);
    const introEase = this._isMotionReduced ? 1 : easeOutCubic(Math.min(1, Math.max(0, (now - this._introAt) / INTRO_MS)));
    this._rig.update({ chapter, pointerX: this._smoothX, pointerY: this._smoothY, seconds, introEase, isMotionReduced: this._isMotionReduced, focus: this._focus });
    this._field.setProjection(this._renderer.domElement.height, this._camera.fov);
    this._backdrop.setProjection(this._renderer.domElement.height, this._camera.fov);
    this._backdrop.update(seconds, NEURAL_REVEAL_FLOOR + (1 - NEURAL_REVEAL_FLOOR) * Math.max(introEase, this._isIntroActive ? this._introProgress : 0));
    this._signals.update(seconds, this._weights, chapter);
    this._updateHoverFan(seconds);
    this._updateTags(deltaSeconds);
    this._renderer.render(this._scene, this._camera);
    this._signalReady();
  };

  private _updateFocus(deltaSeconds: number, chapter: number, now: number): boolean {
    if (this._hoverKey !== null && this._hoverReleaseAt > 0 && now >= this._hoverReleaseAt) {
      this._hoverKey = null;
      this._hoverReleaseAt = 0;
    }
    if (this._pendingSubject && this._focus.blend < HOVER_SWAP_BLEND) {
      this._subject = this._pendingSubject;
      this._pendingSubject = null;
    }
    const subject = this._subject;
    const isReturning = this._pendingSubject !== null;
    this._isFocusActive = !isReturning && this._hoverKey !== null && subject !== null && (!subject.isModule || chapter > FOCUS_ENTER_AT);
    let isTracking = false;
    if (subject) {
      if (this._focus.blend < HOVER_SNAP_BLEND) {
        this._focus.target.copy(subject.center);
        this._focus.radius = subject.radius;
      } else {
        const follow = getDampFactor(CAMERA_FOCUS_DAMP_RATE, deltaSeconds);
        this._focus.target.lerp(subject.center, follow);
        this._focus.radius += (subject.radius - this._focus.radius) * follow;
        isTracking = this._focus.target.distanceTo(subject.center) > HOVER_TARGET_EPSILON;
      }
    }
    const goal = this._isFocusActive ? 1 : 0;
    this._focus.blend += (goal - this._focus.blend) * getDampFactor(isReturning ? HOVER_RETURN_DAMP_RATE : CAMERA_FOCUS_DAMP_RATE, deltaSeconds);
    return isTracking || Math.abs(goal - this._focus.blend) > FOCUS_EPSILON;
  }

  private _updateTargets(chapter: number): boolean {
    const field = this._field;
    if (!field) return false;
    const blend = this._focus.blend;
    const litKey = blend > FOCUS_EPSILON && this._subject ? this._subject.key : null;
    const isStill = Math.abs(chapter - this._lastChapter) < WEIGHT_EPSILON && Math.abs(blend - this._lastBlend) < WEIGHT_EPSILON && litKey === this._litKey;
    if (isStill) return false;
    this._lastChapter = chapter;
    this._lastBlend = blend;
    this._litKey = litKey;
    const weights = this._weights;
    const focusSet = this._subject?.indexes;
    const base = weights[CHAPTER_HERO] * LIT_HERO + weights[CHAPTER_PROMPT] * LIT_PROMPT + weights[CHAPTER_MAP] * LIT_MAP + weights[CHAPTER_MODULES] * LIT_MODULES;
    this._nodes.forEach((node) => {
      let value = base;
      FAN_CHAPTERS.forEach((fanChapter) => {
        value += weights[fanChapter] * (this._chapterSets.get(fanChapter)?.has(node.index) ? 1 : LIT_OUTSIDE_SET);
      });
      if (focusSet && blend > FOCUS_EPSILON) value = value * (1 - blend) + blend * (focusSet.has(node.index) ? 1 : LIT_OUTSIDE_FOCUS);
      field.targets[node.index] = value;
    });
    return true;
  }

  private _signalReady(): void {
    if (this._isReadySignalled) return;
    this._isReadySignalled = true;
    this._elements.canvas.dataset.state = STAGE_READY;
    document.documentElement.setAttribute(STAGE_READY_ATTRIBUTE, STAGE_READY);
    window.dispatchEvent(new Event(STAGE_READY_EVENT));
  }

  private _updateHoverFan(seconds: number): void {
    const signals = this._signals;
    if (!signals) return;
    const fan = this._subject?.fan ?? null;
    const key = fan ? (this._subject?.key ?? null) : null;
    if (key !== this._fanKey) {
      this._fanKey = key;
      signals.setHoverFan(fan);
    }
    signals.updateHoverFan(seconds, fan && this._isFocusActive ? this._focus.blend : 0);
  }

  private _updateTags(deltaSeconds: number): void {
    const tags = this._tags;
    const signals = this._signals;
    if (!tags || !signals) return;
    tags.setOpacity("you", signals.youLit.value);
    tags.setOpacity("claude", signals.claudeLit.value);
    FAN_CHAPTERS.forEach((chapter) => tags.setOpacity(`chapter-${chapter}`, this._weights[chapter]));
    const subject = this._subject;
    const follow = getDampFactor(TAG_LEVEL_DAMP_RATE, deltaSeconds);
    const isShowing = this._isFocusActive && this._focus.blend > TAG_ACTIVE_BLEND;
    this._hoverTagKeys.forEach((key) => {
      const goal = isShowing && subject !== null && subject.labelKeys.includes(key) ? 1 : 0;
      const current = this._tagLevels.get(key) ?? 0;
      const level = current + (goal - current) * follow;
      this._tagLevels.set(key, level);
      tags.setOpacity(key, level);
    });
    tags.place(this._camera);
  }

  private _sampleCost(frameMs: number): void {
    if (this._isSampled || !this._renderer) return;
    this._sampleFrames += 1;
    this._sampleMs += frameMs;
    if (this._sampleFrames < SAMPLE_FRAMES) return;
    this._isSampled = true;
    if (this._sampleMs / this._sampleFrames > SLOW_FRAME_MS && this._pixelRatio > LOW_PIXEL_RATIO) {
      this._pixelRatio = LOW_PIXEL_RATIO;
      this._renderer.setPixelRatio(this._pixelRatio);
      this._onWindowResize();
    }
  }
}
