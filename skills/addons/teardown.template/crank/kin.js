// The math of a slider-crank engine: one cylinder, an inline row, or a V. Real units (mm, deg, rpm), one input (the
// crankshaft angle) and every pose and readout as an exact function of it. No three.js in here, so a number on screen
// can never disagree with the motion. A cylinder's own crank angle is theta + its throw phase - its bank angle.
import { SPEC } from './params.js';

export const D2R = Math.PI / 180;
export const R = SPEC.crank_radius_mm; // crank radius: half the stroke
export const L = SPEC.rod_length_mm; // connecting-rod length, centre to centre
export const BORE = SPEC.bore_mm;
export const N = SPEC.cylinders || 1;
export const BANK = SPEC.bank_angle_deg || 0; // 0 = one inline row; above 0 = a V of this included angle
export const SPACING = SPEC.cylinder_spacing_mm || BORE * 1.3;
const OMEGA = (SPEC.input.rpm * 2 * Math.PI) / 60; // rad/s
const V = BANK > 0 && N > 1;
/** Crank throws along the shaft: a V shares one throw between a left and a right cylinder. */
export const THROWS = V ? Math.ceil(N / 2) : N;
const CROSS_V8 = [0, 90, 270, 180];

/** Throw angle in degrees on the shaft for each throw. spec.crank_phases_deg (one number per throw) overrides it. */
export const phases = (() => {
  if (Array.isArray(SPEC.crank_phases_deg) && SPEC.crank_phases_deg.length === THROWS) return SPEC.crank_phases_deg;
  if (V && N === 8) return CROSS_V8;
  return Array.from({ length: THROWS }, (_, k) => (((k * 720 * (V ? 2 : 1)) / N) % 360));
})();
/** Cylinder c's throw index, its bank rotation in degrees and its own crank angle at input angle theta. */
export const throwOf = (c) => (V ? c >> 1 : c);
export const bankOf = (c) => (V ? (c % 2 === 0 ? 1 : -1) * (BANK / 2) : 0);
export const localAngle = (theta, c) => theta + phases[throwOf(c)] - bankOf(c);

/** Piston-pin distance from the crank axis along the cylinder axis, in mm, for a cylinder-local crank angle (deg). */
export const pistonX = (alpha) => {
  const a = alpha * D2R;
  return R * Math.cos(a) + Math.sqrt(L * L - R * R * Math.sin(a) ** 2);
};
/** Rod tilt from the cylinder axis, in radians. */
export const rodAngle = (alpha) => Math.asin((R * Math.sin(alpha * D2R)) / L);
/** Piston speed in mm/s along the axis (negative while it moves toward the crank). */
export const pistonSpeed = (alpha) => {
  const a = alpha * D2R;
  const s = Math.sin(a);
  return -R * OMEGA * (s + ((R / L) * s * Math.cos(a)) / Math.sqrt(1 - (R / L) ** 2 * s * s));
};
/** Input angle in degrees at time t seconds, in closed form (no state carried between frames). */
export const thetaAt = (t) => ((SPEC.input.rpm * 360) / 60) * t;

/** Small charts under the readouts: cylinder 1 against the input angle, with a marker at the current angle. */
export const charts = [
  { label: 'Piston travel from TDC', unit: 'mm', period: 360, f: (th) => R + L - pistonX(localAngle(th, 0)) },
  { label: 'Piston speed', unit: 'm/s', period: 360, f: (th) => pistonSpeed(localAngle(th, 0)) / 1000 },
  { label: 'Rod angle', unit: '°', period: 360, f: (th) => rodAngle(localAngle(th, 0)) / D2R },
];

export function readouts(theta) {
  const f = (v, d = 1) => Number(v).toFixed(d);
  const a0 = localAngle(theta, 0);
  const stroke = 2 * R;
  const layout = N === 1 ? 'single cylinder' : V ? `V${N}, ${f(BANK, 0)}°` : `inline ${N}`;
  return [
    { label: 'Layout', value: layout },
    { label: 'Input', value: `${f(SPEC.input.rpm, 0)} rpm` },
    { label: 'Crank angle', value: `${f((((theta % 360) + 360) % 360), 0)}°` },
    { label: 'Piston 1 below TDC', value: `${f(R + L - pistonX(a0))} mm` },
    { label: 'Piston 1 speed', value: `${f(Math.abs(pistonSpeed(a0)) / 1000, 2)} m/s` },
    { label: 'Mean piston speed', value: `${f((2 * stroke * SPEC.input.rpm) / 60 / 1000, 2)} m/s` },
    { label: 'Rod angle', value: `${f(rodAngle(a0) / D2R)}°` },
    { label: 'Stroke · bore', value: `${f(stroke, 0)} · ${f(BORE, 0)} mm` },
    { label: 'Displacement', value: `${f(((Math.PI / 4) * BORE * BORE * stroke * N) / 1000)} cm³` },
    ...(N > 1 ? [{ label: 'Firing interval', value: `${f(720 / N, 0)}°` }] : []),
  ];
}
