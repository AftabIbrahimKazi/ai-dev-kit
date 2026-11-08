import { AdditiveBlending, CanvasTexture, Color, Group, NormalBlending, Sprite, SpriteMaterial, Vector3 } from "three";
import type { StagePalette } from "@/types/kit-stage";

export type StoryAct = "auto" | "manual" | "opt-in" | "you" | "ai" | "when" | "does" | "say";

export interface StorySpec {
  act: StoryAct;
  you: Vector3;
  claude: Vector3;
  targets: Vector3[];
}

type EventKind = "packet" | "ripple" | "bloom";
type Tone = 0 | 1 | 2;

interface StoryEvent {
  kind: EventKind;
  from: Vector3;
  to: Vector3;
  start: number;
  dur: number;
  tone: Tone;
  sprite: Sprite;
}

const TONE_YOU = 0 as const;
const TONE_CLAUDE = 1 as const;
const TONE_AUTO = 2 as const;
const PERIOD = 4 as const;
const STAGGER = 0.07 as const;
const TEXTURE_SIZE = 128 as const;
const PACKET_SIZE = 7 as const;
const RIPPLE_MIN = 4 as const;
const RIPPLE_MAX = 34 as const;
const BLOOM_MIN = 5 as const;
const BLOOM_MAX = 22 as const;
const HUB_SIZE = 11 as const;
const HUB_BASE_OPACITY = 0.9 as const;
const PACKET_OPACITY = 0.95 as const;
const RIPPLE_OPACITY = 0.9 as const;
const BLOOM_OPACITY = 0.8 as const;
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

function easeInOut(value: number): number {
  return value * value * (3 - 2 * value);
}

function easeOut(value: number): number {
  return 1 - (1 - value) * (1 - value);
}

export class StoryPulseScene {
  public readonly group: Group = new Group();

  private readonly _events: StoryEvent[] = [];
  private readonly _materials: SpriteMaterial[] = [];
  private _hubs: Sprite[] = [];
  private _hubMaterials: SpriteMaterial[] = [];
  private _haloTexture: CanvasTexture | null = null;
  private _ringTexture: CanvasTexture | null = null;
  private _colors: Color[] = [new Color(), new Color(), new Color()];
  private _isDark: boolean = true;
  private _start: number = 0;
  private _spec: StorySpec | null = null;
  private _hubLevels: [number, number] = [0, 0];

  public init(): void {
    this._haloTexture = this._paint(false);
    this._ringTexture = this._paint(true);
  }

  public setPalette(palette: StagePalette): void {
    this._colors = [palette.actors[0].clone(), palette.actors[1].clone(), palette.actors[2].clone()];
    this._isDark = palette.isDark;
    this._events.forEach((event) => this._tint(event.sprite.material, event.tone));
    this._hubMaterials.forEach((material, index) => this._tint(material, index === 0 ? TONE_YOU : TONE_CLAUDE));
  }

  public setStory(spec: StorySpec | null, seconds: number): void {
    this._clearEvents();
    this._spec = spec;
    this._start = seconds;
    if (!spec) return;
    this._build(spec);
  }

  public getHubTargets(): readonly [number, number] {
    return this._spec ? HUB_ACTS[this._spec.act] : [0, 0];
  }

  public update(seconds: number, youLevel: number, claudeLevel: number): void {
    this._ensureHubs();
    const t = this._spec ? (seconds - this._start) % PERIOD : -1;
    this._events.forEach((event) => {
      const progress = (t - event.start) / event.dur;
      const sprite = event.sprite;
      if (t < 0 || progress < 0 || progress > 1) {
        sprite.visible = false;
        return;
      }
      sprite.visible = true;
      if (event.kind === "packet") {
        sprite.position.lerpVectors(event.from, event.to, easeInOut(progress));
        sprite.scale.setScalar(PACKET_SIZE);
        sprite.material.opacity = PACKET_OPACITY * Math.sin(Math.PI * progress);
      } else if (event.kind === "ripple") {
        sprite.position.copy(event.to);
        sprite.scale.setScalar(RIPPLE_MIN + (RIPPLE_MAX - RIPPLE_MIN) * easeOut(progress));
        sprite.material.opacity = RIPPLE_OPACITY * (1 - progress);
      } else {
        sprite.position.copy(event.to);
        sprite.scale.setScalar(BLOOM_MIN + (BLOOM_MAX - BLOOM_MIN) * easeOut(progress));
        sprite.material.opacity = BLOOM_OPACITY * (1 - progress);
      }
    });
    this._hubLevels = [youLevel, claudeLevel];
    this._hubs.forEach((hub, index) => {
      const level = this._hubLevels[index];
      hub.visible = level > 0.01;
      hub.material.opacity = HUB_BASE_OPACITY * level;
    });
  }

  public destroy(): void {
    this._clearEvents();
    this._hubMaterials.forEach((material) => material.dispose());
    this._haloTexture?.dispose();
    this._ringTexture?.dispose();
    this.group.clear();
  }

  private _ensureHubs(): void {
    if (this._hubs.length > 0 || !this._spec) return;
    this._hubs = [this._spec.you, this._spec.claude].map((position, index) => {
      const material = this._makeMaterial(false, index === 0 ? TONE_YOU : TONE_CLAUDE);
      this._hubMaterials.push(material);
      const sprite = new Sprite(material);
      sprite.position.copy(position);
      sprite.scale.setScalar(HUB_SIZE);
      sprite.visible = false;
      this.group.add(sprite);
      return sprite;
    });
  }

  private _build(spec: StorySpec): void {
    const { act, you, claude, targets } = spec;
    const packets = (from: Vector3, start: number, dur: number, tone: Tone): void => {
      targets.forEach((target, i) => this._add("packet", from, target, start + i * STAGGER, dur, tone));
    };
    const blooms = (start: number, tone: Tone): void => {
      targets.forEach((target, i) => this._add("bloom", target, target, start + i * STAGGER, 1, tone));
    };
    if (act === "auto") {
      this._add("ripple", claude, claude, 0, 1, TONE_CLAUDE);
      packets(claude, 0.7, 0.9, TONE_AUTO);
      blooms(1.5, TONE_AUTO);
    } else if (act === "manual") {
      this._add("packet", you, claude, 0, 0.8, TONE_YOU);
      this._add("ripple", claude, claude, 0.7, 0.9, TONE_CLAUDE);
      packets(claude, 1, 0.9, TONE_CLAUDE);
      blooms(1.8, TONE_CLAUDE);
    } else if (act === "opt-in") {
      targets.forEach((target, i) => this._add("ripple", target, target, i * STAGGER, 1, TONE_AUTO));
      packets(claude, 1.1, 0.9, TONE_CLAUDE);
      blooms(2, TONE_CLAUDE);
    } else if (act === "you") {
      packets(you, 0, 1.1, TONE_YOU);
      blooms(1.1, TONE_YOU);
    } else if (act === "ai") {
      packets(claude, 0, 1, TONE_CLAUDE);
      blooms(1, TONE_CLAUDE);
    } else if (act === "when") {
      this._add("ripple", claude, claude, 0, 1.3, TONE_CLAUDE);
      this._add("ripple", claude, claude, 0.6, 1.3, TONE_CLAUDE);
      this._add("ripple", claude, claude, 1.2, 1.3, TONE_CLAUDE);
    } else if (act === "does") {
      targets.forEach((target, i) => this._add("ripple", target, target, i * 0.18, 1.2, TONE_AUTO));
      blooms(0.2, TONE_CLAUDE);
    } else {
      this._add("packet", you, claude, 0, 1.1, TONE_YOU);
      this._add("bloom", claude, claude, 1.1, 1, TONE_CLAUDE);
    }
  }

  private _add(kind: EventKind, from: Vector3, to: Vector3, start: number, dur: number, tone: Tone): void {
    const material = this._makeMaterial(kind === "ripple", tone);
    this._materials.push(material);
    const sprite = new Sprite(material);
    sprite.visible = false;
    sprite.renderOrder = 10;
    this.group.add(sprite);
    this._events.push({ kind, from: from.clone(), to: to.clone(), start, dur, tone, sprite });
  }

  private _makeMaterial(isRing: boolean, tone: Tone): SpriteMaterial {
    const material = new SpriteMaterial({ map: isRing ? this._ringTexture : this._haloTexture, transparent: true, depthTest: false, depthWrite: false });
    this._tint(material, tone);
    return material;
  }

  private _tint(material: SpriteMaterial, tone: Tone): void {
    material.color.copy(this._colors[tone]);
    material.blending = this._isDark ? AdditiveBlending : NormalBlending;
    material.needsUpdate = true;
  }

  private _clearEvents(): void {
    this._events.forEach((event) => this.group.remove(event.sprite));
    this._materials.forEach((material) => material.dispose());
    this._events.length = 0;
    this._materials.length = 0;
  }

  private _paint(isRing: boolean): CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = TEXTURE_SIZE;
    canvas.height = TEXTURE_SIZE;
    const context = canvas.getContext("2d");
    if (context) {
      const half = TEXTURE_SIZE / 2;
      const gradient = context.createRadialGradient(half, half, 0, half, half, half);
      if (isRing) {
        gradient.addColorStop(0, "rgba(255,255,255,0)");
        gradient.addColorStop(0.78, "rgba(255,255,255,0)");
        gradient.addColorStop(0.9, "rgba(255,255,255,1)");
        gradient.addColorStop(1, "rgba(255,255,255,0)");
      } else {
        gradient.addColorStop(0, "rgba(255,255,255,1)");
        gradient.addColorStop(0.35, "rgba(255,255,255,0.55)");
        gradient.addColorStop(1, "rgba(255,255,255,0)");
      }
      context.fillStyle = gradient;
      context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    }
    return new CanvasTexture(canvas);
  }
}
