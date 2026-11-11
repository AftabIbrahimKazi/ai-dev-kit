import {
  NODE_LIGHT_DIRECTION,
  NODE_RIM_DARKEN,
  NODE_RIM_GLOW,
  NODE_RIM_POWER,
  NODE_SHADE_CEIL,
  NODE_SHADE_CEIL_DARK,
  NODE_SHADE_CURVE,
  NODE_SHADE_FLOOR,
  NODE_SHADE_FLOOR_DARK,
  NODE_SPEC_GAIN,
  NODE_SPEC_POWER,
} from "./stage-config";

export const NODE_SHADING_GLSL = `
vec3 shadeNode(vec3 color, vec3 n, vec3 v, float light) {
  vec3 l = normalize(vec3(${NODE_LIGHT_DIRECTION[0].toFixed(2)}, ${NODE_LIGHT_DIRECTION[1].toFixed(2)}, ${NODE_LIGHT_DIRECTION[2].toFixed(2)}));
  float diffuse = pow(clamp(dot(n, l) * 0.5 + 0.5, 0.0, 1.0), ${NODE_SHADE_CURVE.toFixed(2)});
  float floorShade = mix(${NODE_SHADE_FLOOR_DARK.toFixed(2)}, ${NODE_SHADE_FLOOR.toFixed(2)}, light);
  float ceilShade = mix(${NODE_SHADE_CEIL_DARK.toFixed(2)}, ${NODE_SHADE_CEIL.toFixed(2)}, light);
  vec3 body = color * mix(floorShade, ceilShade, diffuse);
  float spec = pow(max(dot(n, normalize(l + v)), 0.0), ${NODE_SPEC_POWER.toFixed(1)}) * ${NODE_SPEC_GAIN.toFixed(2)};
  float rim = pow(1.0 - max(dot(n, v), 0.0), ${NODE_RIM_POWER.toFixed(1)});
  vec3 shaded = body + vec3(spec) + color * rim * ${NODE_RIM_GLOW.toFixed(2)} * (1.0 - light);
  return mix(shaded, shaded * ${NODE_RIM_DARKEN.toFixed(2)}, rim * light);
}`;

export const CORE_VERTEX = `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = -viewPosition.xyz;
  gl_Position = projectionMatrix * viewPosition;
}`;

export const CORE_FRAGMENT = `
uniform vec3 uColor;
uniform float uLight;
varying vec3 vNormal;
varying vec3 vView;
${NODE_SHADING_GLSL}
void main() {
  gl_FragColor = linearToOutputTexel(vec4(shadeNode(uColor, normalize(vNormal), normalize(vView), uLight), 1.0));
}`;
