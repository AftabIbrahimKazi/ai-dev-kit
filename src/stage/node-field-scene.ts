import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LineSegments,
  Matrix4,
  NormalBlending,
  Points,
  ShaderMaterial,
  SphereGeometry,
} from "three";
import type { KitGraphEdgeRow, StageNode, StagePalette } from "@/types/kit-stage";
import { getDampFactor } from "./math-utils";
import { NODE_SHADING_GLSL } from "./node-shading";
import {
  AXIS_COUNT,
  EDGE_CURVE,
  EDGE_FLOOR,
  EDGE_GAIN_DARK,
  EDGE_GAIN_LIGHT,
  HALO_ALPHA_GAIN,
  HALO_ALPHA_MIN,
  HALO_POINT_LIMIT,
  HALO_SIZE_GAIN,
  HALO_SIZE_MIN,
  HALO_STRENGTH_DARK,
  HALO_STRENGTH_LIGHT,
  LIT_DAMP_RATE,
  LIT_SETTLE_EPSILON,
  MAX_NODES,
  NODE_GRADIENT_AXIS,
  NODE_GRADIENT_HUE,
  NODE_GRADIENT_LIFT,
  NODE_GRADIENT_LIGHT,
  NODE_GRADIENT_SATURATION,
  NODE_LIGHTNESS_MAX,
  NODE_ALPHA_GAIN,
  NODE_ALPHA_MIN,
  NODE_SCALE_GAIN,
  NODE_SCALE_MIN,
  SPHERE_HEIGHT_SEGMENTS,
  SPHERE_WIDTH_SEGMENTS,
} from "./stage-config";

const NODE_VERTEX = `
attribute float aNode;
attribute vec3 aColor;
uniform float uLit[${MAX_NODES}];
varying vec3 vColor;
varying float vLit;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float lit = min(uLit[int(aNode)], 1.0);
  vLit = lit;
  vColor = aColor;
  vec3 local = position * (${NODE_SCALE_MIN.toFixed(2)} + ${NODE_SCALE_GAIN.toFixed(2)} * lit);
  vec4 viewPosition = modelViewMatrix * instanceMatrix * vec4(local, 1.0);
  vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vView = -viewPosition.xyz;
  gl_Position = projectionMatrix * viewPosition;
}`;

const NODE_FRAGMENT = `
uniform float uLight;
varying vec3 vColor;
varying float vLit;
varying vec3 vNormal;
varying vec3 vView;
${NODE_SHADING_GLSL}
void main() {
  vec3 shaded = shadeNode(vColor, normalize(vNormal), normalize(vView), uLight);
  gl_FragColor = linearToOutputTexel(vec4(shaded, ${NODE_ALPHA_MIN.toFixed(2)} + ${NODE_ALPHA_GAIN.toFixed(2)} * vLit));
}`;

const HALO_VERTEX = `
attribute float aNode;
attribute float aSize;
attribute vec3 aColor;
uniform float uLit[${MAX_NODES}];
uniform float uScale;
uniform float uStrength;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float lit = min(uLit[int(aNode)], 1.0);
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = min(aSize * (${HALO_SIZE_MIN.toFixed(1)} + ${HALO_SIZE_GAIN.toFixed(1)} * lit) * uScale / -view.z, ${HALO_POINT_LIMIT.toFixed(1)});
  vAlpha = (${HALO_ALPHA_MIN.toFixed(2)} + ${HALO_ALPHA_GAIN.toFixed(2)} * lit) * uStrength;
  vColor = aColor;
}`;

const HALO_FRAGMENT = `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float falloff = smoothstep(1.0, 0.0, r);
  gl_FragColor = linearToOutputTexel(vec4(vColor, falloff * falloff * vAlpha));
}`;

const EDGE_VERTEX = `
attribute float aFrom;
attribute float aTo;
attribute vec3 aColor;
uniform float uLit[${MAX_NODES}];
uniform float uReach;
varying vec3 vColor;
varying float vLit;
void main() {
  float low = min(uLit[int(aFrom)], uLit[int(aTo)]);
  float high = max(uLit[int(aFrom)], uLit[int(aTo)]);
  vLit = min(low + (high - low) * uReach, 1.0);
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const EDGE_FRAGMENT = `
uniform vec3 uBackground;
uniform float uGain;
varying vec3 vColor;
varying float vLit;
void main() {
  vec3 mixed = uBackground + (vColor - uBackground) * (pow(vLit, ${EDGE_CURVE.toFixed(2)}) * uGain + ${EDGE_FLOOR.toFixed(3)});
  gl_FragColor = linearToOutputTexel(vec4(mixed, 1.0));
}`;

export class NodeFieldScene {
  public readonly group: Group = new Group();
  public readonly targets: Float32Array = new Float32Array(MAX_NODES);

  private readonly _nodes: StageNode[];
  private readonly _edges: KitGraphEdgeRow[];
  private readonly _lit: { value: Float32Array } = { value: new Float32Array(MAX_NODES) };
  private readonly _haloUniforms = { uLit: this._lit, uScale: { value: 1 }, uStrength: { value: HALO_STRENGTH_DARK as number } };
  private readonly _edgeUniforms = { uLit: this._lit, uBackground: { value: [0, 0, 0] }, uGain: { value: EDGE_GAIN_DARK as number }, uReach: { value: 0 } };
  private readonly _bodyUniforms = { uLit: this._lit, uLight: { value: 0 as number } };
  private _palette: StagePalette | null = null;
  private _bodies: InstancedMesh | null = null;
  private _halos: Points | null = null;
  private _lines: LineSegments | null = null;
  private _bodyColors: InstancedBufferAttribute | null = null;
  private _haloColors: BufferAttribute | null = null;
  private _edgeColors: BufferAttribute | null = null;
  private readonly _ramp: Float32Array = new Float32Array(MAX_NODES);
  private readonly _hsl: { h: number; s: number; l: number } = { h: 0, s: 0, l: 0 };
  private readonly _tint: Color = new Color();
  private _materials: ShaderMaterial[] = [];
  private _geometries: BufferGeometry[] = [];

  constructor(nodes: StageNode[], edges: KitGraphEdgeRow[]) {
    this._nodes = nodes;
    this._edges = edges;
  }

  public init(): void {
    this._buildRamp();
    this._buildBodies();
    this._buildHalos();
    this._buildLines();
  }

  public setPalette(palette: StagePalette): void {
    this._palette = palette;
    const blending = palette.isDark ? AdditiveBlending : NormalBlending;
    this._materials.forEach((material) => {
      material.blending = blending;
      material.needsUpdate = true;
    });
    this._haloUniforms.uStrength.value = palette.isDark ? HALO_STRENGTH_DARK : HALO_STRENGTH_LIGHT;
    this._bodyUniforms.uLight.value = palette.isDark ? 0 : 1;
    this._edgeUniforms.uGain.value = palette.isDark ? EDGE_GAIN_DARK : EDGE_GAIN_LIGHT;
    this._edgeUniforms.uBackground.value = [palette.background.r, palette.background.g, palette.background.b];
    this._paintColors(palette);
  }

  public setProjection(heightPx: number, fovDegrees: number): void {
    const halfFov = (fovDegrees * Math.PI) / 360;
    this._haloUniforms.uScale.value = heightPx / (2 * Math.tan(halfFov));
  }

  public setReach(reach: number): void {
    this._edgeUniforms.uReach.value = reach;
  }

  public update(deltaSeconds: number): boolean {
    const factor = getDampFactor(LIT_DAMP_RATE, deltaSeconds);
    let isMoving = false;
    const lit = this._lit.value;
    for (let i = 0; i < this._nodes.length; i += 1) {
      const gap = this.targets[i] - lit[i];
      if (Math.abs(gap) > LIT_SETTLE_EPSILON) isMoving = true;
      lit[i] = Math.max(0, lit[i] + gap * factor);
    }
    return isMoving;
  }

  public snapToTargets(): void {
    this._lit.value.set(this.targets);
  }

  public getNodeColor(index: number): Color {
    const palette = this._palette;
    if (!palette) return new Color();
    return this._tintFor(palette.actors[this._nodes[index].actor], this._ramp[index]).clone();
  }

  public getLit(index: number): number {
    return Math.min(1, this._lit.value[index]);
  }

  public destroy(): void {
    this._geometries.forEach((geometry) => geometry.dispose());
    this._materials.forEach((material) => material.dispose());
    this.group.clear();
  }

  private _buildBodies(): void {
    const geometry = new SphereGeometry(1, SPHERE_WIDTH_SEGMENTS, SPHERE_HEIGHT_SEGMENTS);
    this._geometries.push(geometry);
    const indexes = new Float32Array(this._nodes.length);
    this._bodyColors = new InstancedBufferAttribute(new Float32Array(this._nodes.length * AXIS_COUNT), AXIS_COUNT);
    const material = this._makeMaterial(NODE_VERTEX, NODE_FRAGMENT, this._bodyUniforms);
    this._bodies = new InstancedMesh(geometry, material, this._nodes.length);
    this._bodies.frustumCulled = false;
    const matrix = new Matrix4();
    this._nodes.forEach((node, i) => {
      matrix.makeScale(node.radius, node.radius, node.radius).setPosition(node.position);
      this._bodies?.setMatrixAt(i, matrix);
      indexes[i] = i;
    });
    geometry.setAttribute("aNode", new InstancedBufferAttribute(indexes, 1));
    geometry.setAttribute("aColor", this._bodyColors);
    this.group.add(this._bodies);
  }

  private _buildHalos(): void {
    const count = this._nodes.length;
    const positions = new Float32Array(count * AXIS_COUNT);
    const sizes = new Float32Array(count);
    const indexes = new Float32Array(count);
    this._nodes.forEach((node, i) => {
      node.position.toArray(positions, i * AXIS_COUNT);
      sizes[i] = node.radius;
      indexes[i] = i;
    });
    this._haloColors = new BufferAttribute(new Float32Array(count * AXIS_COUNT), AXIS_COUNT);
    const geometry = new BufferGeometry();
    this._geometries.push(geometry);
    geometry.setAttribute("position", new BufferAttribute(positions, AXIS_COUNT));
    geometry.setAttribute("aSize", new BufferAttribute(sizes, 1));
    geometry.setAttribute("aNode", new BufferAttribute(indexes, 1));
    geometry.setAttribute("aColor", this._haloColors);
    const material = this._makeMaterial(HALO_VERTEX, HALO_FRAGMENT, this._haloUniforms);
    this._halos = new Points(geometry, material);
    this._halos.frustumCulled = false;
    this.group.add(this._halos);
  }

  private _buildLines(): void {
    const vertexCount = this._edges.length * 2;
    const positions = new Float32Array(vertexCount * AXIS_COUNT);
    const from = new Float32Array(vertexCount);
    const to = new Float32Array(vertexCount);
    this._edges.forEach(([a, b], i) => {
      this._nodes[a].position.toArray(positions, i * 2 * AXIS_COUNT);
      this._nodes[b].position.toArray(positions, (i * 2 + 1) * AXIS_COUNT);
      from.fill(a, i * 2, i * 2 + 2);
      to.fill(b, i * 2, i * 2 + 2);
    });
    this._edgeColors = new BufferAttribute(new Float32Array(vertexCount * AXIS_COUNT), AXIS_COUNT);
    const geometry = new BufferGeometry();
    this._geometries.push(geometry);
    geometry.setAttribute("position", new BufferAttribute(positions, AXIS_COUNT));
    geometry.setAttribute("aFrom", new BufferAttribute(from, 1));
    geometry.setAttribute("aTo", new BufferAttribute(to, 1));
    geometry.setAttribute("aColor", this._edgeColors);
    const material = this._makeMaterial(EDGE_VERTEX, EDGE_FRAGMENT, this._edgeUniforms);
    this._lines = new LineSegments(geometry, material);
    this._lines.frustumCulled = false;
    this.group.add(this._lines);
  }

  private _makeMaterial(vertexShader: string, fragmentShader: string, uniforms: ShaderMaterial["uniforms"]): ShaderMaterial {
    const material = new ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true, depthWrite: false });
    this._materials.push(material);
    return material;
  }

  private _buildRamp(): void {
    const [axisX, axisY] = NODE_GRADIENT_AXIS;
    const projected = this._nodes.map((node) => node.position.x * axisX + node.position.y * axisY);
    const low = Math.min(...projected);
    const span = Math.max(Math.max(...projected) - low, 1);
    projected.forEach((value, i) => {
      this._ramp[i] = (value - low) / span;
    });
  }

  private _tintFor(base: Color, ramp: number): Color {
    base.getHSL(this._hsl);
    const swing = ramp - 0.5;
    const hue = (this._hsl.h + swing * NODE_GRADIENT_HUE * 2 + 1) % 1;
    const lightness = Math.min(NODE_LIGHTNESS_MAX, Math.max(0.14, this._hsl.l + NODE_GRADIENT_LIFT + swing * NODE_GRADIENT_LIGHT * 2));
    return this._tint.setHSL(hue, Math.min(1, this._hsl.s + NODE_GRADIENT_SATURATION), lightness);
  }

  private _paintColors(palette: StagePalette): void {
    this._nodes.forEach((node, i) => {
      const color = this._tintFor(palette.actors[node.actor], this._ramp[i]);
      this._bodyColors?.setXYZ(i, color.r, color.g, color.b);
      this._haloColors?.setXYZ(i, color.r, color.g, color.b);
    });
    this._edges.forEach(([a, b], i) => {
      const from = this._tintFor(palette.actors[this._nodes[a].actor], this._ramp[a]);
      this._edgeColors?.setXYZ(i * 2, from.r, from.g, from.b);
      const to = this._tintFor(palette.actors[this._nodes[b].actor], this._ramp[b]);
      this._edgeColors?.setXYZ(i * 2 + 1, to.r, to.g, to.b);
    });
    [this._bodyColors, this._haloColors, this._edgeColors].forEach((attribute) => {
      if (attribute) attribute.needsUpdate = true;
    });
  }
}
