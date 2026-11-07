// The math. Real units (mm, deg, rpm, N·m), one input (the input-shaft angle) and every pose and readout as a
// function of it. No three.js in here, so a number on screen can never disagree with the motion.
import { SPEC } from './params.js';

const D2R = Math.PI / 180;
const TAU = Math.PI * 2;
const M = SPEC.module_mm;
const Z = SPEC.parts.map((p) => p.teeth);

/** Pitch diameter of gear i in mm: module times teeth. */
export const pitchDia = (i) => M * Z[i];
/** Centre distance between gear i and i+1 in mm. */
export const centre = (i) => (pitchDia(i) + pitchDia(i + 1)) / 2;
/** X position of each gear along the row, in mm. */
export const X = Z.map((_, i) => Z.slice(0, i).reduce((x, _z, k) => x + centre(k), 0));
/** Speed ratio from the first gear to the last (idlers cancel out). */
export const ratio = Z[Z.length - 1] / Z[0];
/**
 * Gear i's angle in radians for input angle theta (degrees). Neighbours counter-rotate and the teeth of gear i+1
 * sit in the gaps of gear i at the contact point (world angle 0 on gear i, world angle PI on gear i+1).
 */
export function angles(thetaDeg) {
  const a = [thetaDeg * D2R];
  for (let i = 0; i + 1 < Z.length; i++) a.push(Math.PI * (1 - 1 / Z[i + 1]) - (a[i] * Z[i]) / Z[i + 1]);
  return a;
}

/** Input angle in degrees at time t seconds, in closed form (no state carried between frames). */
export const thetaAt = (t) => ((SPEC.input.rpm * 360) / 60) * t;

/** Every number the console shows, from one place: [{label, value}]. */
export function readouts(thetaDeg) {
  const ang = angles(thetaDeg).map((r) => ((((r / D2R) % 360) + 360) % 360));
  const f = (v, d = 1) => Number(v).toFixed(d);
  return [
    { label: 'Ratio', value: `${f(ratio, 2)} : 1` },
    { label: 'Input', value: `${f(SPEC.input.rpm, 0)} rpm · ${f(SPEC.input.torque_nm)} N·m` },
    { label: 'Output', value: `${f(SPEC.input.rpm / ratio, 0)} rpm · ${f(SPEC.input.torque_nm * ratio)} N·m` },
    ...Z.map((z, i) => ({ label: SPEC.parts[i].label, value: `${z}T · Ø${f(pitchDia(i))} mm · ${f(ang[i], 0)}°` })),
  ];
}

export { D2R, TAU, M, Z };
