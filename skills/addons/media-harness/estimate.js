'use strict';
// Measured on Kaggle T4 (bench/FINDINGS.md, 2026-11-16/17). Not the plan's claims.
const M = {
  imageSeconds: { draft: 10.4, detail: 32.4 },
  imageLoadSeconds: 44,
  clipFrames: 33, clipFps: 16, clipSeconds: 80, // 33 frames, 74-81 s measured
  videoLoadSeconds: 290,
  sessionCapMinutes: 45
};
function clipsFor(shotSeconds) { return Math.max(1, Math.ceil(shotSeconds / (M.clipFrames / M.clipFps))); }
function estimate(sb) {
  const n = Number(sb.count) || 1;
  const video = /clip|video/i.test(sb.kind || '');
  const detail = /RealVis/i.test(sb.quality || '');
  const perImg = detail ? M.imageSeconds.detail : M.imageSeconds.draft;
  let sec = M.imageLoadSeconds + n * perImg;
  let clips = 0;
  if (video) { clips = n * clipsFor(Number(sb.shot_seconds) || 2); sec += M.videoLoadSeconds + clips * M.clipSeconds; }
  const minutes = Math.ceil(sec / 60);
  return { images: n, clips, gpuMinutes: minutes, fitsOneSession: minutes <= M.sessionCapMinutes, note: video ? 'video = 33-frame clips chained; 81-frame single pass is not used' : 'images only' };
}
module.exports = { M, clipsFor, estimate };
