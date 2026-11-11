import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  NormalBlending,
  Points,
  PointsMaterial,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from "three";
import type { HoverFanSpec, SignalFanSpec, StagePalette } from "@/types/kit-stage";
import { smoothstep } from "./math-utils";
import { CORE_FRAGMENT, CORE_VERTEX } from "./node-shading";
import {
  ACTOR_CLAUDE,
  ACTOR_YOU,
  AXIS_COUNT,
  CHAPTER_COMMANDS,
  CHAPTER_HERO,
  CHAPTER_MODS,
  CHAPTER_MODULES,
  CHAPTER_PROMPT,
  CHAPTER_SKILLS,
  CHAPTER_STANDARDS,
  CHAPTER_MAP,
  CLAUDE_POSITION,
  CORE_HALO_SIZE,
  CORE_LIT_FLOOR,
  CORE_PULSE_DEPTH,
  CORE_PULSE_SPEED,
  CORE_SIZE,
  FAN_ACTIVE_MIN,
  FAN_LINE_OPACITY,
  FAN_MAX_TARGETS,
  FAN_PULSE_SIZE,
  FAN_PULSE_SPEED,
  FAN_PULSE_STAGGER,
  HALO_STRENGTH_DARK,
  HALO_STRENGTH_LIGHT,
  PACKET_END,
  PACKET_FADE_IN_AT,
  PACKET_FADE_IN_RATE,
  PACKET_FADE_OUT_FROM,
  PACKET_FADE_OUT_TO,
  PACKET_SIZE,
  PACKET_START,
  PACKET_VISIBLE_UNTIL,
  PACKET_WOBBLE,
  PACKET_WOBBLE_SPEED,
  RIPPLE_BASE_SIZE,
  RIPPLE_COUNT,
  RIPPLE_GROUP_SIZE,
  RIPPLE_GROWTH,
  RIPPLE_OPACITY,
  RIPPLE_SPEED,
  SPHERE_HEIGHT_SEGMENTS,
  SPHERE_WIDTH_SEGMENTS,
  TRAIL_OPACITY,
  YOU_POSITION,
} from "./stage-config";

const SPRITE_TEXTURE_PX = 64 as const;
const RING_TEXTURE_PX = 128 as const;
const RING_WIDTH_PX = 5 as const;
const RING_INSET_PX = 6 as const;
const HALO_STOP_MID = 0.25 as const;
const HALO_ALPHA_MID = 0.35 as const;
const HALO_ALPHA_CORE = 0.95 as const;
const CORE_HALO_ALPHA_MIN = 0.35 as const;
const CORE_HALO_ALPHA_GAIN = 0.6 as const;
const CORE_HALO_SCALE_MIN = 0.7 as const;
const CORE_HALO_SCALE_GAIN = 0.5 as const;
const CORE_SCALE_MIN = 0.9 as const;
const CORE_SCALE_GAIN = 0.2 as const;
const YOU_LIT_LATE = 0.7 as const;
const CLAUDE_LIT_BASE = 0.35 as const;
const CLAUDE_COMMAND_SHARE = 0.5 as const;
const CLAUDE_MAP_SHARE = 0.8 as const;
const CLAUDE_MODULE_SHARE = 0.6 as const;
const RIPPLE_YOU_SHARE = 0.5 as const;
const RIPPLE_CLAUDE_FROM = 1.55 as const;
const RIPPLE_CLAUDE_TO = 1.8 as const;
const RIPPLE_CLAUDE_UNTIL = 2.2 as const;
const INTRO_PULSE_FADE = 0.15 as const;

export class SignalScene {
  public readonly group: Group = new Group();
  public readonly youLit: { value: number } = { value: 1 };
  public readonly claudeLit: { value: number } = { value: 1 };

  private readonly _fans: SignalFanSpec[];
  private readonly _you: Vector3 = new Vector3(...YOU_POSITION);
  private readonly _claude: Vector3 = new Vector3(...CLAUDE_POSITION);
  private readonly _packetPosition: Vector3 = new Vector3();
  private readonly _fanLines: Map<number, LineSegments<BufferGeometry, LineBasicMaterial>> = new Map();
  private readonly _fanPulses: Map<number, Points<BufferGeometry, PointsMaterial>> = new Map();
  private readonly _fanPositions: Map<number, Float32Array> = new Map();
  private readonly _trailPositions: Float32Array = new Float32Array(2 * AXIS_COUNT);
  private readonly _hoverSource: Vector3 = new Vector3();
  private readonly _hoverLinePositions: Float32Array = new Float32Array(FAN_MAX_TARGETS * 2 * AXIS_COUNT);
  private readonly _hoverPulsePositions: Float32Array = new Float32Array(FAN_MAX_TARGETS * AXIS_COUNT);
  private _hoverTargets: Vector3[] = [];
  private _hoverActor: number = 0;
  private _hoverLines: LineSegments<BufferGeometry, LineBasicMaterial> | null = null;
  private _hoverPulses: Points<BufferGeometry, PointsMaterial> | null = null;
  private _introPulse: number | null = null;
  private _introBoost: number = 0;
  private _palette: StagePalette | null = null;
  private _haloTexture: CanvasTexture | null = null;
  private _ringTexture: CanvasTexture | null = null;
  private _packet: Sprite | null = null;
  private _trail: LineSegments<BufferGeometry, LineBasicMaterial> | null = null;
  private _trailGeometry: BufferGeometry | null = null;
  private _ripples: Sprite[] = [];
  private _cores: Mesh[] = [];
  private _geometries: BufferGeometry[] = [];
  private _coreMaterials: ShaderMaterial[] = [];
  private _coreHalos: Sprite[] = [];
  private _haloStrength: number = HALO_STRENGTH_DARK;
  private _blending: typeof AdditiveBlending | typeof NormalBlending = AdditiveBlending;
  private _blendables: Array<LineBasicMaterial | PointsMaterial | SpriteMaterial> = [];

  constructor(fans: SignalFanSpec[]) {
    this._fans = fans;
  }

  public init(): void {
    this._haloTexture = this._buildHaloTexture();
    this._ringTexture = this._buildRingTexture();
    this._buildFans();
    this._buildHoverFan();
    this._buildPacket();
    this._buildRipples();
    this._buildCores();
  }

  public setPalette(palette: StagePalette): void {
    this._palette = palette;
    this._paintHoverFan();
    this._blending = palette.isDark ? AdditiveBlending : NormalBlending;
    this._haloStrength = palette.isDark ? HALO_STRENGTH_DARK : HALO_STRENGTH_LIGHT;
    this._fans.forEach((fan) => {
      const color = palette.fan[fan.paletteIndex];
      this._fanLines.get(fan.chapter)?.material.color.copy(color);
      this._fanPulses.get(fan.chapter)?.material.color.copy(color);
    });
    const you = palette.actors[ACTOR_YOU];
    const claude = palette.actors[ACTOR_CLAUDE];
    this._packet?.material.color.copy(you);
    this._trail?.material.color.copy(you);
    this._ripples.forEach((ripple) => ripple.material.color.copy(you));
    this._coreMaterials[0]?.uniforms.uColor.value.copy(you);
    this._coreMaterials[1]?.uniforms.uColor.value.copy(claude);
    this._coreMaterials.forEach((material) => {
      material.uniforms.uLight.value = palette.isDark ? 0 : 1;
    });
    this._coreHalos[0]?.material.color.copy(you);
    this._coreHalos[1]?.material.color.copy(claude);
    this._blendables.forEach((material) => {
      material.blending = this._blending;
      material.needsUpdate = true;
    });
  }

  public setIntro(pulse: number | null, boost: number): void {
    this._introPulse = pulse;
    this._introBoost = boost;
  }

  public setHoverFan(spec: HoverFanSpec | null): void {
    if (!spec || !this._hoverLines || !this._hoverPulses) return;
    this._hoverSource.copy(spec.source);
    this._hoverTargets = spec.targets.slice(0, FAN_MAX_TARGETS);
    this._hoverActor = spec.actor;
    this._hoverTargets.forEach((target, i) => {
      this._hoverSource.toArray(this._hoverLinePositions, i * 2 * AXIS_COUNT);
      target.toArray(this._hoverLinePositions, (i * 2 + 1) * AXIS_COUNT);
    });
    this._hoverLines.geometry.setDrawRange(0, this._hoverTargets.length * 2);
    this._hoverLines.geometry.attributes.position.needsUpdate = true;
    this._hoverPulses.geometry.setDrawRange(0, this._hoverTargets.length);
    this._paintHoverFan();
  }

  public updateHoverFan(seconds: number, level: number): void {
    if (!this._hoverLines || !this._hoverPulses) return;
    this._hoverLines.material.opacity = level * FAN_LINE_OPACITY;
    this._hoverPulses.material.opacity = level;
    if (level < FAN_ACTIVE_MIN) return;
    this._hoverTargets.forEach((target, i) => {
      const phase = (seconds * FAN_PULSE_SPEED + i * FAN_PULSE_STAGGER) % 1;
      this._hoverPulsePositions[i * AXIS_COUNT] = this._hoverSource.x + (target.x - this._hoverSource.x) * phase;
      this._hoverPulsePositions[i * AXIS_COUNT + 1] = this._hoverSource.y + (target.y - this._hoverSource.y) * phase;
      this._hoverPulsePositions[i * AXIS_COUNT + 2] = this._hoverSource.z + (target.z - this._hoverSource.z) * phase;
    });
    this._hoverPulses.geometry.attributes.position.needsUpdate = true;
  }

  public update(seconds: number, weights: readonly number[], chapter: number): void {
    this._updateFans(seconds, weights);
    this._updatePacket(seconds, chapter);
    this._updateCores(seconds, weights);
    this._updateRipples(seconds, weights, chapter);
  }

  public destroy(): void {
    this._geometries.forEach((geometry) => geometry.dispose());
    this._blendables.forEach((material) => material.dispose());
    this._haloTexture?.dispose();
    this._ringTexture?.dispose();
    this.group.clear();
  }

  private _buildHaloTexture(): CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = SPRITE_TEXTURE_PX;
    canvas.height = SPRITE_TEXTURE_PX;
    const context = canvas.getContext("2d");
    const half = SPRITE_TEXTURE_PX / 2;
    if (context) {
      const gradient = context.createRadialGradient(half, half, 0, half, half, half);
      gradient.addColorStop(0, `rgba(255,255,255,${HALO_ALPHA_CORE})`);
      gradient.addColorStop(HALO_STOP_MID, `rgba(255,255,255,${HALO_ALPHA_MID})`);
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, SPRITE_TEXTURE_PX, SPRITE_TEXTURE_PX);
    }
    return new CanvasTexture(canvas);
  }

  private _buildRingTexture(): CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = RING_TEXTURE_PX;
    canvas.height = RING_TEXTURE_PX;
    const context = canvas.getContext("2d");
    const half = RING_TEXTURE_PX / 2;
    if (context) {
      context.strokeStyle = "#fff";
      context.lineWidth = RING_WIDTH_PX;
      context.beginPath();
      context.arc(half, half, half - RING_INSET_PX, 0, Math.PI * 2);
      context.stroke();
    }
    return new CanvasTexture(canvas);
  }

  private _makeSprite(texture: CanvasTexture | null): Sprite {
    const material = new SpriteMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: AdditiveBlending });
    this._blendables.push(material);
    const sprite = new Sprite(material);
    this.group.add(sprite);
    return sprite;
  }

  private _buildFans(): void {
    this._fans.forEach((fan) => {
      const positions = new Float32Array(fan.targets.length * 2 * AXIS_COUNT);
      fan.targets.forEach((target, i) => {
        fan.source.toArray(positions, i * 2 * AXIS_COUNT);
        target.toArray(positions, (i * 2 + 1) * AXIS_COUNT);
      });
      const lineGeometry = new BufferGeometry();
      this._geometries.push(lineGeometry);
      lineGeometry.setAttribute("position", new BufferAttribute(positions, AXIS_COUNT));
      const lineMaterial = new LineBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending });
      this._blendables.push(lineMaterial);
      const lines = new LineSegments(lineGeometry, lineMaterial);
      lines.frustumCulled = false;
      this.group.add(lines);
      this._fanLines.set(fan.chapter, lines);
      const pulsePositions = new Float32Array(fan.targets.length * AXIS_COUNT);
      const pulseGeometry = new BufferGeometry();
      this._geometries.push(pulseGeometry);
      pulseGeometry.setAttribute("position", new BufferAttribute(pulsePositions, AXIS_COUNT));
      const pulseMaterial = new PointsMaterial({ size: FAN_PULSE_SIZE, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending });
      this._blendables.push(pulseMaterial);
      const pulses = new Points(pulseGeometry, pulseMaterial);
      pulses.frustumCulled = false;
      this.group.add(pulses);
      this._fanPulses.set(fan.chapter, pulses);
      this._fanPositions.set(fan.chapter, pulsePositions);
    });
  }

  private _buildHoverFan(): void {
    const lineGeometry = new BufferGeometry();
    this._geometries.push(lineGeometry);
    lineGeometry.setAttribute("position", new BufferAttribute(this._hoverLinePositions, AXIS_COUNT));
    lineGeometry.setDrawRange(0, 0);
    const lineMaterial = new LineBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending });
    this._blendables.push(lineMaterial);
    this._hoverLines = new LineSegments(lineGeometry, lineMaterial);
    this._hoverLines.frustumCulled = false;
    this.group.add(this._hoverLines);
    const pulseGeometry = new BufferGeometry();
    this._geometries.push(pulseGeometry);
    pulseGeometry.setAttribute("position", new BufferAttribute(this._hoverPulsePositions, AXIS_COUNT));
    pulseGeometry.setDrawRange(0, 0);
    const pulseMaterial = new PointsMaterial({ size: FAN_PULSE_SIZE, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending });
    this._blendables.push(pulseMaterial);
    this._hoverPulses = new Points(pulseGeometry, pulseMaterial);
    this._hoverPulses.frustumCulled = false;
    this.group.add(this._hoverPulses);
  }

  private _paintHoverFan(): void {
    const color = this._palette?.actors[this._hoverActor];
    if (!color || !this._hoverLines || !this._hoverPulses) return;
    this._hoverLines.material.color.copy(color);
    this._hoverPulses.material.color.copy(color);
  }

  private _buildPacket(): void {
    this._packet = this._makeSprite(this._haloTexture);
    this._trailGeometry = new BufferGeometry();
    this._geometries.push(this._trailGeometry);
    this._trailGeometry.setAttribute("position", new BufferAttribute(this._trailPositions, AXIS_COUNT));
    const material = new LineBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: AdditiveBlending });
    this._blendables.push(material);
    this._trail = new LineSegments(this._trailGeometry, material);
    this._trail.frustumCulled = false;
    this.group.add(this._trail);
  }

  private _buildRipples(): void {
    for (let i = 0; i < RIPPLE_COUNT; i += 1) this._ripples.push(this._makeSprite(this._ringTexture));
  }

  private _buildCores(): void {
    const geometry = new SphereGeometry(1, SPHERE_WIDTH_SEGMENTS, SPHERE_HEIGHT_SEGMENTS);
    this._geometries.push(geometry);
    [this._you, this._claude].forEach((position) => {
      const material = new ShaderMaterial({ vertexShader: CORE_VERTEX, fragmentShader: CORE_FRAGMENT, uniforms: { uColor: { value: new Color() }, uLight: { value: 0 } }, transparent: true });
      this._coreMaterials.push(material);
      const core = new Mesh(geometry, material);
      core.position.copy(position);
      core.scale.setScalar(CORE_SIZE);
      this.group.add(core);
      this._cores.push(core);
      const halo = this._makeSprite(this._haloTexture);
      halo.position.copy(position);
      this._coreHalos.push(halo);
    });
  }

  private _updateFans(seconds: number, weights: readonly number[]): void {
    this._fans.forEach((fan) => {
      const weight = weights[fan.chapter];
      const line = this._fanLines.get(fan.chapter);
      const pulses = this._fanPulses.get(fan.chapter);
      const positions = this._fanPositions.get(fan.chapter);
      if (!line || !pulses || !positions) return;
      line.material.opacity = weight * FAN_LINE_OPACITY;
      pulses.material.opacity = weight;
      if (weight < FAN_ACTIVE_MIN) return;
      fan.targets.forEach((target, i) => {
        const phase = (seconds * FAN_PULSE_SPEED + i * FAN_PULSE_STAGGER) % 1;
        positions[i * AXIS_COUNT] = fan.source.x + (target.x - fan.source.x) * phase;
        positions[i * AXIS_COUNT + 1] = fan.source.y + (target.y - fan.source.y) * phase;
        positions[i * AXIS_COUNT + 2] = fan.source.z + (target.z - fan.source.z) * phase;
      });
      pulses.geometry.attributes.position.needsUpdate = true;
    });
  }

  private _updatePacket(seconds: number, chapter: number): void {
    if (!this._packet || !this._trailGeometry || !this._trail) return;
    const intro = this._introPulse;
    const progress = intro === null ? smoothstep(PACKET_START, PACKET_END, chapter - CHAPTER_PROMPT) : smoothstep(0, 1, intro);
    this._packetPosition.lerpVectors(this._you, this._claude, progress);
    const isOn = chapter >= PACKET_FADE_IN_AT && chapter < PACKET_VISIBLE_UNTIL;
    const chapterVisibility = isOn ? Math.min(1, (chapter - PACKET_FADE_IN_AT) * PACKET_FADE_IN_RATE) * (1 - smoothstep(PACKET_FADE_OUT_FROM, PACKET_FADE_OUT_TO, chapter)) : 0;
    const visibility = intro === null ? chapterVisibility : smoothstep(0, INTRO_PULSE_FADE, intro) * (1 - smoothstep(1 - INTRO_PULSE_FADE, 1, intro));
    this._packet.position.copy(this._packetPosition);
    this._packet.material.opacity = visibility;
    this._packet.scale.setScalar(PACKET_SIZE + Math.sin(seconds * PACKET_WOBBLE_SPEED) * PACKET_WOBBLE);
    this._you.toArray(this._trailPositions, 0);
    this._packetPosition.toArray(this._trailPositions, AXIS_COUNT);
    this._trailGeometry.attributes.position.needsUpdate = true;
    this._trail.material.opacity = visibility * TRAIL_OPACITY;
  }

  private _updateCores(seconds: number, weights: readonly number[]): void {
    const youLit = Math.min(1, weights[CHAPTER_HERO] + weights[CHAPTER_PROMPT] + weights[CHAPTER_COMMANDS] + weights[CHAPTER_MAP] + weights[CHAPTER_MODULES] * YOU_LIT_LATE + CORE_LIT_FLOOR);
    const claudeLit = Math.min(
      1,
      CLAUDE_LIT_BASE + weights[CHAPTER_PROMPT] + weights[CHAPTER_SKILLS] + weights[CHAPTER_STANDARDS] + weights[CHAPTER_MODS] + weights[CHAPTER_COMMANDS] * CLAUDE_COMMAND_SHARE + weights[CHAPTER_MAP] * CLAUDE_MAP_SHARE + weights[CHAPTER_MODULES] * CLAUDE_MODULE_SHARE,
    );
    const youShown = Math.max(youLit, this._introBoost);
    const claudeShown = Math.max(claudeLit, this._introBoost);
    this.youLit.value = youShown;
    this.claudeLit.value = claudeShown;
    const pulse = 1 + Math.sin(seconds * CORE_PULSE_SPEED) * CORE_PULSE_DEPTH;
    [youShown, claudeShown].forEach((lit, i) => {
      this._coreHalos[i].material.opacity = (CORE_HALO_ALPHA_MIN + CORE_HALO_ALPHA_GAIN * lit) * this._haloStrength;
      this._coreHalos[i].scale.setScalar(CORE_HALO_SIZE * pulse * (CORE_HALO_SCALE_MIN + CORE_HALO_SCALE_GAIN * lit));
      this._cores[i].scale.setScalar(CORE_SIZE * (CORE_SCALE_MIN + CORE_SCALE_GAIN * lit));
    });
  }

  private _updateRipples(seconds: number, weights: readonly number[], chapter: number): void {
    const youShare = weights[CHAPTER_HERO] + weights[CHAPTER_PROMPT] * RIPPLE_YOU_SHARE;
    const settle = chapter < RIPPLE_CLAUDE_UNTIL ? 1 : 0;
    const claudeShare = Math.max(this._introBoost, weights[CHAPTER_SKILLS] + weights[CHAPTER_STANDARDS] + weights[CHAPTER_MODS] + smoothstep(RIPPLE_CLAUDE_FROM, RIPPLE_CLAUDE_TO, chapter) * (1 - weights[CHAPTER_COMMANDS]) * settle);
    this._ripples.forEach((ripple, i) => {
      const isYou = i < RIPPLE_GROUP_SIZE;
      const phase = (seconds * RIPPLE_SPEED + (i % RIPPLE_GROUP_SIZE) / RIPPLE_GROUP_SIZE) % 1;
      ripple.position.copy(isYou ? this._you : this._claude);
      ripple.scale.setScalar(RIPPLE_BASE_SIZE + phase * RIPPLE_GROWTH);
      ripple.material.opacity = Math.max(0, (1 - phase) * RIPPLE_OPACITY * Math.min(1, isYou ? youShare : claudeShare));
    });
  }
}
