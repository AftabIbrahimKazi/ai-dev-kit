#!/usr/bin/env node
// Reads bench_results.jsonl from bench.py and prints the Stage 5 numbers and the two gates.
// Usage: node parse.js <bench_results.jsonl> [--json] [--rating clearly-better|not-better]
// The image gate also needs the user's side-by-side verdict (Kaggle Flux vs Cloudflare on art prompts);
// pass it with --rating, otherwise that gate stays "waiting for rating".
'use strict';
const fs = require('fs');

const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };

function parse(text) {
  const recs = text.split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const pick = (test, model) => recs.filter((r) => r.test === test && r.model === model);
  const out = { gpus: (recs.find((r) => r.test === 'env') || {}).gpus || [], models: {}, twoWorkers: null, complete: recs.some((r) => r.test === 'done') };
  for (const model of ['flux-schnell', 'flux-dev', 'wan22-5b']) {
    const load = pick('model_load', model)[0];
    const imgs = pick('image_1024', model);
    const vid = pick('video_81f_480p', model)[0];
    const okImgs = imgs.filter((r) => r.ok).map((r) => r.seconds);
    const failures = [load, vid, ...imgs].filter((r) => r && !r.ok).map((r) => `${r.test}: ${r.error}`);
    out.models[model] = {
      loadSeconds: load ? load.seconds : null, loadSource: load ? load.source : null, loadOk: load ? load.ok : null,
      imageMedianSeconds: median(okImgs), imageRuns: okImgs.length, imageVramGB: Math.max(0, ...imgs.map((r) => r.vram_gb || 0)) || null,
      videoSeconds: vid && vid.ok ? vid.seconds : null, videoVramGB: vid ? vid.vram_gb : null, failures,
    };
  }
  const one = pick('four_images_one_gpu', 'flux-schnell')[0]; const two = pick('four_images_two_gpus', 'flux-schnell')[0];
  if (one && two && one.ok && two.ok) out.twoWorkers = { oneGpuSeconds: one.seconds, twoGpuSeconds: two.seconds, speedup: Math.round((one.seconds / two.seconds) * 100) / 100 };
  return out;
}

function gates(r, rating) {
  const dev = r.models['flux-dev'];
  const video = r.models['wan22-5b'].videoSeconds;
  return {
    image: rating === 'clearly-better' ? 'PASS: ship the Kaggle Flux backend' : rating === 'not-better' ? 'FAIL: keep Cloudflare only, skip Stage 6' : 'waiting for your side-by-side rating (--rating clearly-better|not-better)',
    video: video === null ? 'no 5 s clip measured' : video <= 20 * 60 ? `PASS: 5 s clip took ${(video / 60).toFixed(1)} min (limit 20)` : `FAIL: 5 s clip took ${(video / 60).toFixed(1)} min (limit 20)`,
    planClaim: dev.imageMedianSeconds === null ? 'Flux Dev not measured' : `plan claimed 20-30 s per image; measured median ${dev.imageMedianSeconds.toFixed(0)} s`,
  };
}

function render(r, g) {
  const f = (v, u = 's') => (v === null || v === undefined ? 'n/a' : `${typeof v === 'number' ? v.toFixed(1) : v} ${u}`);
  const lines = ['Media harness measurements', `GPUs: ${r.gpus.join(', ') || 'unknown'}${r.complete ? '' : '   (run did not finish)'}`, ''];
  for (const [name, m] of Object.entries(r.models)) {
    lines.push(`${name}: load ${f(m.loadSeconds)} from ${m.loadSource || 'n/a'}; image median ${f(m.imageMedianSeconds)} over ${m.imageRuns} runs; video ${f(m.videoSeconds)}; peak VRAM ${f(m.imageVramGB || m.videoVramGB, 'GB')}`);
    for (const x of m.failures) lines.push(`  ! ${x}`);
  }
  lines.push('', r.twoWorkers ? `Two workers: 4 images ${r.twoWorkers.oneGpuSeconds}s on one GPU, ${r.twoWorkers.twoGpuSeconds}s on two (${r.twoWorkers.speedup}x)` : 'Two workers: not measured', '', `Image gate: ${g.image}`, `Video gate: ${g.video}`, `Plan check: ${g.planClaim}`);
  return lines.join('\n');
}

module.exports = { parse, gates, render, median };

if (require.main === module) {
  const a = process.argv.slice(2);
  const file = a.find((x) => !x.startsWith('--') && x !== a[a.indexOf('--rating') + 1]);
  if (!file || !fs.existsSync(file)) { console.error('usage: node parse.js <bench_results.jsonl> [--json] [--rating clearly-better|not-better]'); process.exit(2); }
  const ri = a.indexOf('--rating');
  const rating = ri >= 0 ? a[ri + 1] : undefined;
  const r = parse(fs.readFileSync(file, 'utf8')); const g = gates(r, rating);
  console.log(a.includes('--json') ? JSON.stringify({ ...r, gates: g }, null, 2) : render(r, g));
}
