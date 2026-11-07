// The starter for any other machine or object. It has no math of its own: replace this file with the machine's real
// dimensions, one input and a readout per number (see the gears and crank starters for the shape), or leave it for a
// plain model that only needs to be taken apart. No three.js in here.
export const thetaAt = (t) => t * 24; // degrees; a slow turn for the placeholder parts

/** [{label, value}] rows for the panel. The machine adds its own rows through machine.info. */
export function readouts() {
  return [];
}
