import { AdditiveBlending, BufferAttribute, BufferGeometry, Group, LineSegments, NormalBlending, Points, ShaderMaterial } from "three";
import type { StagePalette } from "@/types/kit-stage";
import {
  ACTOR_CLAUDE,
  ACTOR_YOU,
  AXIS_COUNT,
  NEURAL_AXES,
  NEURAL_DRIFT_SPEED,
  NEURAL_EDGE_ALPHA_DARK,
  NEURAL_EDGE_ALPHA_LIGHT,
  NEURAL_FIRING_SHARE,
  NEURAL_FISSURE,
  NEURAL_LINKS_PER_POINT,
  NEURAL_LINK_MAX,
  NEURAL_POINT_ALPHA_DARK,
  NEURAL_POINT_ALPHA_LIGHT,
  NEURAL_POINT_COUNT,
  NEURAL_POINT_LIMIT,
  NEURAL_POINT_SIZE_GAIN,
  NEURAL_POINT_SIZE_MIN,
  NEURAL_PULSE_GAIN,
  NEURAL_PULSE_SPEED,
  NEURAL_PULSE_WIDTH,
  NEURAL_REGION_COUNT,
  NEURAL_REGION_SPREAD,
  NEURAL_SEED,
  NEURAL_SHELL_THICKNESS,
  NEURAL_TWINKLE_BASE,
  NEURAL_TWINKLE_GAIN,
  NEURAL_TWINKLE_SPEED,
} from "./stage-config";

const TAU = Math.PI * 2;
const RENDER_ORDER = -10 as const;
const SEED_MIX_A = 0x6d2b79f5 as const;
const SEED_SHIFT_A = 15 as const;
const SEED_SHIFT_B = 7 as const;
const SEED_SHIFT_C = 14 as const;
const SEED_SCALE = 4294967296 as const;
const RANDOM_FLOOR = 1e-9 as const;
const PAIR_STRIDE = 100000 as const;
const NEIGHBOUR_POOL = 6 as const;

const POINT_VERTEX = `
attribute float aSize;
attribute float aPhase;
attribute float aMix;
uniform float uTime;
uniform float uScale;
uniform float uReveal;
uniform float uAlpha;
uniform vec3 uColorA;
uniform vec3 uColorB;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = min(aSize * uScale / -view.z, ${NEURAL_POINT_LIMIT.toFixed(1)});
  float twinkle = ${NEURAL_TWINKLE_BASE.toFixed(2)} + ${NEURAL_TWINKLE_GAIN.toFixed(2)} * sin(uTime * ${NEURAL_TWINKLE_SPEED.toFixed(2)} + aPhase * ${TAU.toFixed(4)});
  vColor = mix(uColorA, uColorB, aMix);
  vAlpha = uAlpha * twinkle * uReveal;
}`;

const POINT_FRAGMENT = `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float falloff = smoothstep(1.0, 0.0, r);
  gl_FragColor = linearToOutputTexel(vec4(vColor, falloff * falloff * vAlpha));
}`;

const EDGE_VERTEX = `
attribute float aT;
attribute float aPhase;
attribute float aFiring;
varying float vT;
varying float vPhase;
varying float vFiring;
void main() {
  vT = aT;
  vPhase = aPhase;
  vFiring = aFiring;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const EDGE_FRAGMENT = `
uniform float uTime;
uniform float uReveal;
uniform float uAlpha;
uniform vec3 uColorA;
varying float vT;
varying float vPhase;
varying float vFiring;
void main() {
  float head = fract(uTime * ${NEURAL_PULSE_SPEED.toFixed(2)} + vPhase);
  float band = smoothstep(${NEURAL_PULSE_WIDTH.toFixed(2)}, 0.0, abs(vT - head)) * vFiring;
  gl_FragColor = linearToOutputTexel(vec4(uColorA, uAlpha * (1.0 + ${NEURAL_PULSE_GAIN.toFixed(1)} * band) * uReveal));
}`;

interface NeuralPoint {
  x: number;
  y: number;
  z: number;
}

export class NeuralBackdropScene {
  public readonly group: Group = new Group();

  private readonly _uniforms = {
    uTime: { value: 0 },
    uScale: { value: 1 },
    uReveal: { value: 0 },
    uPointAlpha: { value: NEURAL_POINT_ALPHA_DARK as number },
    uEdgeAlpha: { value: NEURAL_EDGE_ALPHA_DARK as number },
    uColorA: { value: [0, 0, 0] },
    uColorB: { value: [0, 0, 0] },
  };
  private readonly _pointUniforms = { uTime: this._uniforms.uTime, uScale: this._uniforms.uScale, uReveal: this._uniforms.uReveal, uAlpha: this._uniforms.uPointAlpha, uColorA: this._uniforms.uColorA, uColorB: this._uniforms.uColorB };
  private readonly _edgeUniforms = { uTime: this._uniforms.uTime, uReveal: this._uniforms.uReveal, uAlpha: this._uniforms.uEdgeAlpha, uColorA: this._uniforms.uColorA };
  private _materials: ShaderMaterial[] = [];
  private _geometries: BufferGeometry[] = [];
  private _seed: number = NEURAL_SEED;

  public init(): void {
    const points = this._buildPoints();
    this._buildDots(points);
    this._buildLinks(points);
  }

  public setPalette(palette: StagePalette): void {
    const blending = palette.isDark ? AdditiveBlending : NormalBlending;
    this._materials.forEach((material) => {
      material.blending = blending;
      material.needsUpdate = true;
    });
    this._uniforms.uPointAlpha.value = palette.isDark ? NEURAL_POINT_ALPHA_DARK : NEURAL_POINT_ALPHA_LIGHT;
    this._uniforms.uEdgeAlpha.value = palette.isDark ? NEURAL_EDGE_ALPHA_DARK : NEURAL_EDGE_ALPHA_LIGHT;
    const first = palette.actors[ACTOR_CLAUDE];
    const second = palette.actors[ACTOR_YOU];
    this._uniforms.uColorA.value = [first.r, first.g, first.b];
    this._uniforms.uColorB.value = [second.r, second.g, second.b];
  }

  public setProjection(heightPx: number, fovDegrees: number): void {
    this._uniforms.uScale.value = heightPx / (2 * Math.tan((fovDegrees * Math.PI) / 360));
  }

  public update(seconds: number, reveal: number): void {
    this._uniforms.uTime.value = seconds;
    this._uniforms.uReveal.value = reveal;
    this.group.rotation.y = seconds * NEURAL_DRIFT_SPEED;
  }

  public destroy(): void {
    this._geometries.forEach((geometry) => geometry.dispose());
    this._materials.forEach((material) => material.dispose());
    this.group.clear();
  }

  private _random(): number {
    this._seed = (this._seed + SEED_MIX_A) | 0;
    let mixed = Math.imul(this._seed ^ (this._seed >>> SEED_SHIFT_A), 1 | this._seed);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> SEED_SHIFT_B), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> SEED_SHIFT_C)) >>> 0) / SEED_SCALE;
  }

  private _gaussian(): number {
    return Math.sqrt(-2 * Math.log(Math.max(this._random(), RANDOM_FLOOR))) * Math.cos(TAU * this._random());
  }

  private _onShell(x: number, y: number, z: number, thickness: number, fissure: number): NeuralPoint {
    const [axisX, axisY, axisZ] = NEURAL_AXES;
    const length = Math.hypot(x / axisX, y / axisY, z / axisZ) || 1;
    const factor = 1 + (this._random() - 0.5) * thickness;
    const side = x >= 0 ? 1 : -1;
    return { x: (x / length) * factor + side * fissure, y: (y / length) * factor, z: (z / length) * factor };
  }

  private _buildPoints(): NeuralPoint[] {
    const regions: NeuralPoint[] = [];
    for (let i = 0; i < NEURAL_REGION_COUNT; i += 1) regions.push(this._onShell(this._gaussian(), this._gaussian(), this._gaussian(), 0, 0));
    const points: NeuralPoint[] = [];
    for (let i = 0; i < NEURAL_POINT_COUNT; i += 1) {
      const region = regions[Math.floor(this._random() * NEURAL_REGION_COUNT)];
      points.push(this._onShell(region.x + this._gaussian() * NEURAL_REGION_SPREAD, region.y + this._gaussian() * NEURAL_REGION_SPREAD, region.z + this._gaussian() * NEURAL_REGION_SPREAD, NEURAL_SHELL_THICKNESS, NEURAL_FISSURE));
    }
    return points;
  }

  private _buildDots(points: NeuralPoint[]): void {
    const positions = new Float32Array(points.length * AXIS_COUNT);
    const sizes = new Float32Array(points.length);
    const phases = new Float32Array(points.length);
    const mixes = new Float32Array(points.length);
    points.forEach((point, i) => {
      positions.set([point.x, point.y, point.z], i * AXIS_COUNT);
      sizes[i] = NEURAL_POINT_SIZE_MIN + this._random() * NEURAL_POINT_SIZE_GAIN;
      phases[i] = this._random();
      mixes[i] = this._random();
    });
    const geometry = new BufferGeometry();
    this._geometries.push(geometry);
    geometry.setAttribute("position", new BufferAttribute(positions, AXIS_COUNT));
    geometry.setAttribute("aSize", new BufferAttribute(sizes, 1));
    geometry.setAttribute("aPhase", new BufferAttribute(phases, 1));
    geometry.setAttribute("aMix", new BufferAttribute(mixes, 1));
    const dots = new Points(geometry, this._makeMaterial(POINT_VERTEX, POINT_FRAGMENT, this._pointUniforms));
    dots.frustumCulled = false;
    dots.renderOrder = RENDER_ORDER;
    this.group.add(dots);
  }

  private _buildLinks(points: NeuralPoint[]): void {
    const pairs = new Set<number>();
    const links: Array<[number, number]> = [];
    points.forEach((point, i) => {
      const nearest: Array<{ index: number; distance: number }> = [];
      points.forEach((other, j) => {
        if (i === j) return;
        const distance = Math.hypot(point.x - other.x, point.y - other.y, point.z - other.z);
        if (distance <= NEURAL_LINK_MAX) nearest.push({ index: j, distance });
      });
      nearest.sort((a, b) => a.distance - b.distance);
      nearest.slice(0, Math.min(NEURAL_LINKS_PER_POINT, NEIGHBOUR_POOL)).forEach((neighbour) => {
        const key = Math.min(i, neighbour.index) * PAIR_STRIDE + Math.max(i, neighbour.index);
        if (pairs.has(key)) return;
        pairs.add(key);
        links.push([i, neighbour.index]);
      });
    });
    const positions = new Float32Array(links.length * 2 * AXIS_COUNT);
    const along = new Float32Array(links.length * 2);
    const phases = new Float32Array(links.length * 2);
    const firing = new Float32Array(links.length * 2);
    links.forEach(([a, b], i) => {
      positions.set([points[a].x, points[a].y, points[a].z, points[b].x, points[b].y, points[b].z], i * 2 * AXIS_COUNT);
      along[i * 2 + 1] = 1;
      const phase = this._random();
      const isFiring = this._random() < NEURAL_FIRING_SHARE ? 1 : 0;
      phases.fill(phase, i * 2, i * 2 + 2);
      firing.fill(isFiring, i * 2, i * 2 + 2);
    });
    const geometry = new BufferGeometry();
    this._geometries.push(geometry);
    geometry.setAttribute("position", new BufferAttribute(positions, AXIS_COUNT));
    geometry.setAttribute("aT", new BufferAttribute(along, 1));
    geometry.setAttribute("aPhase", new BufferAttribute(phases, 1));
    geometry.setAttribute("aFiring", new BufferAttribute(firing, 1));
    const lines = new LineSegments(geometry, this._makeMaterial(EDGE_VERTEX, EDGE_FRAGMENT, this._edgeUniforms));
    lines.frustumCulled = false;
    lines.renderOrder = RENDER_ORDER;
    this.group.add(lines);
  }

  private _makeMaterial(vertexShader: string, fragmentShader: string, uniforms: ShaderMaterial["uniforms"]): ShaderMaterial {
    const material = new ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true, depthWrite: false, depthTest: false });
    this._materials.push(material);
    return material;
  }
}
