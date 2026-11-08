import { Box3, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import type { KitGraph, StageNode } from "@/types/kit-stage";
import { NeuralBackdropScene } from "./neural-backdrop-scene";
import { NodeFieldScene } from "./node-field-scene";
import { PaletteLoader } from "./palette-loader";
import { clamp, getDampFactor } from "./math-utils";
import {
  CAMERA_FAR,
  CAMERA_NEAR,
  MAX_DELTA_SECONDS,
  MAX_PIXEL_RATIO,
  NODE_BASE_RADIUS,
  NODE_DEGREE_RADIUS,
  REDUCED_MOTION_QUERY,
  STAGE_READY,
  THEME_ATTRIBUTE,
} from "./stage-config";

export interface MapNodeInfo {
  index: number;
  label: string;
  path: string;
  group: string;
  links: number;
  linked: { index: number; label: string }[];
}

export interface MapEvents {
  onHover: (info: MapNodeInfo | null, x: number, y: number) => void;
  onSelect: (info: MapNodeInfo | null) => void;
}

const FOV = 46 as const;
const HOME_THETA = 0.6 as const;
const HOME_PHI = 1.25 as const;
const HOME_PAD = 0.78 as const;
const MIN_ZOOM = 0.35 as const;
const MAX_ZOOM = 1.6 as const;
const ZOOM_STEP = 1.18 as const;
const SELECT_ZOOM = 0.5 as const;
const ROTATE_SPEED = 0.006 as const;
const KEY_ROTATE = 0.12 as const;
const PHI_MIN = 0.25 as const;
const PHI_MAX = 2.9 as const;
const DAMP_RATE = 7 as const;
const IDLE_SPIN = 0.07 as const;
const IDLE_WAIT_S = 3.5 as const;
const HIT_PX = 16 as const;
const CLICK_PX = 5 as const;
const LIT_BASE = 0.55 as const;
const LIT_DIM = 0.14 as const;
const LIT_FOCUS = 1 as const;
const REACH_BASE = 0.4 as const;
const REACH_FOCUS = 0.85 as const;
const LINKED_LIMIT = 4 as const;
const ARRIVE_MS = 2200 as const;
const REVEAL_FLOOR = 0.2 as const;
const ARRIVE_ZOOM = 1.5 as const;
const ARRIVE_TURN = 0.7 as const;
const MS_PER_SECOND = 1000 as const;

export class KitMapEngine {
  private readonly _graph: KitGraph;
  private readonly _canvas: HTMLCanvasElement;
  private readonly _events: MapEvents;
  private readonly _nodes: StageNode[] = [];
  private readonly _adjacency: number[][] = [];
  private readonly _scene: Scene = new Scene();
  private readonly _camera: PerspectiveCamera = new PerspectiveCamera(FOV, 1, CAMERA_NEAR, CAMERA_FAR);
  private readonly _center: Vector3 = new Vector3();
  private readonly _target: Vector3 = new Vector3();
  private readonly _goal: Vector3 = new Vector3();
  private readonly _probe: Vector3 = new Vector3();
  private _renderer: WebGLRenderer | null = null;
  private _field: NodeFieldScene | null = null;
  private _backdrop: NeuralBackdropScene | null = null;
  private _loader: PaletteLoader | null = null;
  private _observer: MutationObserver | null = null;
  private _homeRadius: number = 100;
  private _zoom: number = 1;
  private _zoomGoal: number = 1;
  private _theta: number = HOME_THETA;
  private _phi: number = HOME_PHI;
  private _thetaGoal: number = HOME_THETA;
  private _phiGoal: number = HOME_PHI;
  private _hover: number = -1;
  private _selected: number = -1;
  private _groups: ReadonlySet<string> | null = null;
  private _clientX: number = 0;
  private _clientY: number = 0;
  private _pointerX: number = 0;
  private _pointerY: number = 0;
  private _emitX: number = 0;
  private _emitY: number = 0;
  private _isOver: boolean = false;
  private _isDragging: boolean = false;
  private _dragX: number = 0;
  private _dragY: number = 0;
  private _downX: number = 0;
  private _downY: number = 0;
  private _idleAt: number = 0;
  private _startedAt: number = 0;
  private _previous: number = 0;
  private _frameId: number = 0;
  private _isMotionReduced: boolean = false;
  private _isRunning: boolean = false;
  private _isDestroyed: boolean = false;
  private _isReady: boolean = false;
  private _isPaletteReady: boolean = false;

  constructor(graph: KitGraph, canvas: HTMLCanvasElement, events: MapEvents) {
    this._graph = graph;
    this._canvas = canvas;
    this._events = events;
  }

  public init(): boolean {
    try {
      this._renderer = new WebGLRenderer({ canvas: this._canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      return false;
    }
    this._isMotionReduced = window.matchMedia(REDUCED_MOTION_QUERY).matches;
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this._buildNodes();
    this._loader = new PaletteLoader(document.documentElement);
    this._field = new NodeFieldScene(this._nodes, this._graph.edges);
    this._field.init();
    this._backdrop = new NeuralBackdropScene();
    this._backdrop.init();
    this._scene.add(this._backdrop.group, this._field.group);
    this._frameHome();
    this._applyPalette();
    this._bind();
    this._onResize();
    this._previous = performance.now();
    this._idleAt = this._previous;
    this._startedAt = this._previous;
    if (!this._isMotionReduced) {
      this._zoom = ARRIVE_ZOOM;
      this._theta = HOME_THETA - ARRIVE_TURN;
    }
    this._isRunning = true;
    this._frameId = requestAnimationFrame(this._onFrame);
    document.fonts.ready
      .then(() => {
        if (this._isDestroyed) return;
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
    this._unbind();
    this._observer?.disconnect();
    this._backdrop?.destroy();
    this._field?.destroy();
    this._renderer?.dispose();
    this._renderer?.forceContextLoss();
  }

  public setFocusGroups(groups: readonly string[] | null): void {
    this._groups = groups && groups.length > 0 ? new Set(groups) : null;
    this._select(-1);
  }

  public zoomBy(direction: 1 | -1): void {
    this._zoomGoal = clamp(this._zoomGoal * (direction > 0 ? 1 / ZOOM_STEP : ZOOM_STEP), MIN_ZOOM, MAX_ZOOM);
    this._touch();
  }

  public reset(): void {
    this._groups = null;
    this._select(-1);
    this._thetaGoal = HOME_THETA;
    this._phiGoal = HOME_PHI;
    this._zoomGoal = 1;
    this._touch();
  }

  public focusNode(index: number): void {
    this._select(index);
  }

  public rotateBy(dTheta: number, dPhi: number): void {
    this._thetaGoal += dTheta;
    this._phiGoal = clamp(this._phiGoal + dPhi, PHI_MIN, PHI_MAX);
    this._touch();
  }

  private _buildNodes(): void {
    const degree = new Array<number>(this._graph.nodes.length).fill(0);
    this._graph.nodes.forEach(() => this._adjacency.push([]));
    this._graph.edges.forEach(([a, b]) => {
      degree[a] += 1;
      degree[b] += 1;
      this._adjacency[a].push(b);
      this._adjacency[b].push(a);
    });
    this._graph.nodes.forEach(([id, label, group, actor, x, y, z], index) => {
      this._nodes.push({ index, id, label, group, actor, position: new Vector3(x, y, z), radius: NODE_BASE_RADIUS + Math.sqrt(degree[index]) * NODE_DEGREE_RADIUS });
    });
  }

  private _frameHome(): void {
    const box = new Box3().setFromPoints(this._nodes.map((node) => node.position));
    box.getCenter(this._center);
    const sphere = this._nodes.reduce((largest, node) => Math.max(largest, node.position.distanceTo(this._center)), 0);
    this._homeRadius = (sphere * HOME_PAD) / Math.sin((FOV * Math.PI) / 360);
    this._target.copy(this._center);
    this._goal.copy(this._center);
  }

  private _infoOf(index: number): MapNodeInfo {
    const node = this._nodes[index];
    const linked = [...this._adjacency[index]]
      .sort((a, b) => this._adjacency[b].length - this._adjacency[a].length)
      .slice(0, LINKED_LIMIT)
      .map((neighbour) => ({ index: neighbour, label: this._nodes[neighbour].label }));
    return { index, label: node.label, path: node.id, group: node.group, links: this._adjacency[index].length, linked };
  }

  private _select(index: number): void {
    this._selected = index;
    if (index >= 0) {
      this._goal.copy(this._nodes[index].position);
      this._zoomGoal = SELECT_ZOOM;
      this._events.onSelect(this._infoOf(index));
    } else {
      this._goal.copy(this._center);
      this._zoomGoal = 1;
      this._events.onSelect(null);
    }
    this._touch();
  }

  private _touch(): void {
    this._idleAt = performance.now();
  }

  private _pick(): number {
    const rect = this._canvas.getBoundingClientRect();
    let best = -1;
    let bestDistance: number = HIT_PX;
    let bestDepth = Number.POSITIVE_INFINITY;
    this._nodes.forEach((node) => {
      this._probe.copy(node.position).project(this._camera);
      if (this._probe.z > 1) return;
      const sx = ((this._probe.x + 1) / 2) * rect.width;
      const sy = ((1 - this._probe.y) / 2) * rect.height;
      const distance = Math.hypot(sx - this._pointerX, sy - this._pointerY);
      if (distance < bestDistance || (distance < HIT_PX && Math.abs(distance - bestDistance) < 2 && this._probe.z < bestDepth)) {
        best = node.index;
        bestDistance = distance;
        bestDepth = this._probe.z;
      }
    });
    return best;
  }

  private _applyLevels(deltaSeconds: number): boolean {
    const field = this._field;
    if (!field) return false;
    const focus = this._selected >= 0 ? this._selected : this._hover;
    const neighbours = focus >= 0 ? new Set([focus, ...this._adjacency[focus]]) : null;
    this._nodes.forEach((node) => {
      let level: number = LIT_BASE;
      if (neighbours) level = neighbours.has(node.index) ? LIT_FOCUS : LIT_DIM;
      else if (this._groups) level = this._groups.has(node.group) ? LIT_FOCUS : LIT_DIM;
      field.targets[node.index] = level;
    });
    field.setReach(neighbours || this._groups ? REACH_FOCUS : REACH_BASE);
    if (this._isMotionReduced) field.snapToTargets();
    return field.update(deltaSeconds);
  }

  private _updateCamera(deltaSeconds: number, now: number): void {
    const follow = this._isMotionReduced ? 1 : getDampFactor(DAMP_RATE, deltaSeconds);
    const isIdle = !this._isDragging && !this._isOver && this._selected < 0 && now - this._idleAt > IDLE_WAIT_S * MS_PER_SECOND;
    if (isIdle && !this._isMotionReduced) this._thetaGoal += IDLE_SPIN * deltaSeconds;
    this._theta += (this._thetaGoal - this._theta) * follow;
    this._phi += (this._phiGoal - this._phi) * follow;
    this._zoom += (this._zoomGoal - this._zoom) * follow;
    this._target.lerp(this._goal, follow);
    const radius = this._homeRadius * this._zoom;
    const spread = Math.sin(this._phi);
    this._camera.position.set(this._target.x + radius * spread * Math.sin(this._theta), this._target.y + radius * Math.cos(this._phi), this._target.z + radius * spread * Math.cos(this._theta));
    this._camera.lookAt(this._target);
  }

  private readonly _applyPalette = (): void => {
    if (!this._loader) return;
    const palette = this._loader.load();
    this._backdrop?.setPalette(palette);
    this._field?.setPalette(palette);
  };

  private readonly _onResize = (): void => {
    if (!this._renderer) return;
    const width = this._canvas.clientWidth;
    const height = this._canvas.clientHeight;
    this._renderer.setSize(width, height, false);
    this._camera.aspect = width / Math.max(height, 1);
    this._camera.updateProjectionMatrix();
  };

  private readonly _onPointerMove = (event: PointerEvent): void => {
    this._clientX = event.clientX;
    this._clientY = event.clientY;
    if (this._isDragging) {
      const dx = event.clientX - this._dragX;
      const dy = event.clientY - this._dragY;
      this._dragX = event.clientX;
      this._dragY = event.clientY;
      this._thetaGoal -= dx * ROTATE_SPEED;
      if (event.pointerType !== "touch") this._phiGoal = clamp(this._phiGoal - dy * ROTATE_SPEED, PHI_MIN, PHI_MAX);
      this._touch();
    }
  };

  private readonly _onPointerDown = (event: PointerEvent): void => {
    this._isDragging = true;
    this._dragX = event.clientX;
    this._dragY = event.clientY;
    this._downX = event.clientX;
    this._downY = event.clientY;
    this._canvas.setPointerCapture(event.pointerId);
    this._touch();
  };

  private readonly _onPointerUp = (event: PointerEvent): void => {
    if (!this._isDragging) return;
    this._isDragging = false;
    if (this._canvas.hasPointerCapture(event.pointerId)) this._canvas.releasePointerCapture(event.pointerId);
    if (Math.hypot(event.clientX - this._downX, event.clientY - this._downY) > CLICK_PX) return;
    const hit = this._pick();
    if (hit >= 0 && hit !== this._selected) this._select(hit);
    else if (this._selected >= 0) this._select(-1);
  };

  private readonly _onPointerEnter = (): void => {
    this._isOver = true;
  };

  private readonly _onPointerLeave = (): void => {
    this._isOver = false;
    if (this._hover !== -1) {
      this._hover = -1;
      this._events.onHover(null, 0, 0);
    }
  };

  private readonly _onWheel = (event: WheelEvent): void => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    this.zoomBy(event.deltaY < 0 ? 1 : -1);
  };

  private readonly _onKey = (event: KeyboardEvent): void => {
    const handled = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "_", "Escape"];
    if (!handled.includes(event.key)) return;
    event.preventDefault();
    if (event.key === "ArrowLeft") this.rotateBy(-KEY_ROTATE, 0);
    else if (event.key === "ArrowRight") this.rotateBy(KEY_ROTATE, 0);
    else if (event.key === "ArrowUp") this.rotateBy(0, -KEY_ROTATE);
    else if (event.key === "ArrowDown") this.rotateBy(0, KEY_ROTATE);
    else if (event.key === "+" || event.key === "=") this.zoomBy(1);
    else if (event.key === "-" || event.key === "_") this.zoomBy(-1);
    else this.reset();
  };

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

  private _bind(): void {
    window.addEventListener("resize", this._onResize);
    document.addEventListener("visibilitychange", this._onVisibility);
    this._canvas.addEventListener("pointermove", this._onPointerMove);
    this._canvas.addEventListener("pointerdown", this._onPointerDown);
    this._canvas.addEventListener("pointerup", this._onPointerUp);
    this._canvas.addEventListener("pointercancel", this._onPointerUp);
    this._canvas.addEventListener("pointerenter", this._onPointerEnter);
    this._canvas.addEventListener("pointerleave", this._onPointerLeave);
    this._canvas.addEventListener("wheel", this._onWheel, { passive: false });
    this._canvas.addEventListener("keydown", this._onKey);
    this._observer = new MutationObserver(this._applyPalette);
    this._observer.observe(document.documentElement, { attributes: true, attributeFilter: [THEME_ATTRIBUTE] });
  }

  private _unbind(): void {
    window.removeEventListener("resize", this._onResize);
    document.removeEventListener("visibilitychange", this._onVisibility);
    this._canvas.removeEventListener("pointermove", this._onPointerMove);
    this._canvas.removeEventListener("pointerdown", this._onPointerDown);
    this._canvas.removeEventListener("pointerup", this._onPointerUp);
    this._canvas.removeEventListener("pointercancel", this._onPointerUp);
    this._canvas.removeEventListener("pointerenter", this._onPointerEnter);
    this._canvas.removeEventListener("pointerleave", this._onPointerLeave);
    this._canvas.removeEventListener("wheel", this._onWheel);
    this._canvas.removeEventListener("keydown", this._onKey);
  }

  private readonly _onFrame = (now: number): void => {
    if (!this._isRunning || !this._renderer || !this._field || !this._backdrop) return;
    this._frameId = requestAnimationFrame(this._onFrame);
    const deltaSeconds = Math.max(0, Math.min(MAX_DELTA_SECONDS, (now - this._previous) / MS_PER_SECOND));
    this._previous = now;
    if (this._isOver || this._isDragging) {
      const rect = this._canvas.getBoundingClientRect();
      this._pointerX = this._clientX - rect.left;
      this._pointerY = this._clientY - rect.top;
    }
    this._updateCamera(deltaSeconds, now);
    if (this._isOver && !this._isDragging) {
      const hit = this._pick();
      if (hit !== this._hover) {
        this._hover = hit;
        this._events.onHover(hit >= 0 ? this._infoOf(hit) : null, this._pointerX, this._pointerY);
      } else if (hit >= 0 && Math.hypot(this._pointerX - this._emitX, this._pointerY - this._emitY) > 2) {
        this._events.onHover(this._infoOf(hit), this._pointerX, this._pointerY);
      }
      this._emitX = this._pointerX;
      this._emitY = this._pointerY;
      this._canvas.style.cursor = hit >= 0 ? "pointer" : "grab";
    } else {
      this._canvas.style.cursor = this._isDragging ? "grabbing" : "grab";
    }
    this._applyLevels(deltaSeconds);
    this._field.setProjection(this._renderer.domElement.height, this._camera.fov);
    this._backdrop.setProjection(this._renderer.domElement.height, this._camera.fov);
    const arrive = this._isMotionReduced ? 1 : 1 - (1 - Math.min(1, Math.max(0, (now - this._startedAt) / ARRIVE_MS))) ** 3;
    this._backdrop.update(this._isMotionReduced ? 0 : now / MS_PER_SECOND, REVEAL_FLOOR + (1 - REVEAL_FLOOR) * arrive);
    this._renderer.render(this._scene, this._camera);
    if (!this._isReady && this._isPaletteReady) {
      this._isReady = true;
      this._canvas.dataset.state = STAGE_READY;
    }
  };
}
