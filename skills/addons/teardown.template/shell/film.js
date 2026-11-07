// The tour, built from the machine's parts, whatever the machine is. Every beat is a keyframe on one plain
// parameters object (Triforge keyframe), so sample(t) is a pure function of time and the live page, the review sheets
// and any recording share one timeline. Nothing here knows what the machine is.
import { AnimationClip, KeyframeTrack, easeInOutCubic } from '@triforge/keyframe';

const E = easeInOutCubic;
const STEP = (x) => (x < 1 ? 0 : 1);
const LEAD_IN = 8; // seconds before the first part: the whole machine, then the cut
const HOLD = 3; // seconds per part
const TAIL = 4;
export const MAX_TOUR_PARTS = 12;

/** The tour's beats from the part names. Pure: the same parts always give the same beats. */
export function schedule(names) {
  const used = names.slice(0, MAX_TOUR_PARTS);
  const beats = [[0, 'assembled'], [4, 'cut open'], ...used.map((n, i) => [LEAD_IN + HOLD * i, n])];
  const end = LEAD_IN + HOLD * used.length;
  beats.push([end, 'close']);
  return { beats, duration: end + TAIL };
}

/**
 * whole: {center: [x, y, z], radius}; parts: [{label, center, radius, index}] (index = the part's place in the machine's own list; the tour uses the largest MAX_TOUR_PARTS).
 * Returns P (the numbers the tour animates; the live page reads the same object), beats, duration and sample(t).
 */
export function createTour(whole, parts) {
  const used = parts.slice(0, MAX_TOUR_PARTS);
  const { beats, duration } = schedule(used.map((p) => p.label));
  const end = beats[beats.length - 1][0];
  const P = { azimuth: 28, elevation: 18, radius: whole.radius, cut: 0, focus: -1, lookX: whole.center[0], lookY: whole.center[1], lookZ: whole.center[2] };
  const at = (i) => LEAD_IN + HOLD * i;
  const rows = (fn) => [[0, fn(whole, -1)], [4, fn(whole, -1)], ...used.map((p, i) => [at(i), fn(p, i)]), [end, fn(whole, -1)], [duration, fn(whole, -1)]];
  const track = (prop, list, easing = E) => new KeyframeTrack(P, prop, list.map(([time, value], i) => ({ time, value, easing: i + 1 < list.length ? easing : undefined })));
  const clip = new AnimationClip('tour', [
    track('azimuth', rows((_, i) => 28 + (i < 0 ? 0 : i % 2 ? -38 : 38))),
    track('elevation', [[0, 18], [4, 30], ...used.map((_, i) => [at(i), 14 + (i % 3) * 4]), [end, 18], [duration, 18]]),
    track('radius', rows((p) => p.radius)),
    track('lookX', rows((p) => p.center[0])),
    track('lookY', rows((p) => p.center[1])),
    track('lookZ', rows((p) => p.center[2])),
    track('cut', [[0, 0], [3, 0], [5, 1], [end - 1, 1], [end + 1, 0], [duration, 0]]),
    // focus is stepped, not blended: a part is either isolated or not
    track('focus', [[0, -1], ...used.map((p, i) => [at(i) - 0.5, p.index ?? i]), [end - 0.5, -1], [duration, -1]], STEP),
  ]);
  return {
    P,
    beats,
    duration,
    /** Pose P for time t (seconds, looped). Pure. */
    sample(t) {
      clip.evaluate(((t % duration) + duration) % duration);
      return P;
    },
  };
}
