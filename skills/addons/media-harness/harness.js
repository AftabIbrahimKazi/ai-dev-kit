#!/usr/bin/env node
'use strict';
// media-harness: local side. init | interview | plan | status | stitch. Zero dependencies.
// submit and fetch for generation reuse bench/run.js's Kaggle flow and are NOT built here yet (see README).
const fs = require('fs'), path = require('path'), readline = require('readline'), cp = require('child_process');
const { estimate } = require('./estimate');
const tree = require('./interview.json');
const SB = 'storyboard.json';
const file = (dir) => path.join(dir, SB);
const load = (dir) => { try { return JSON.parse(fs.readFileSync(file(dir), 'utf8')); } catch { return null; } };
const save = (dir, o) => fs.writeFileSync(file(dir), JSON.stringify(o, null, 2));

function applyAnswers(sb, answers) {
  for (const st of tree.steps) {
    if (answers[st.id] === undefined) continue;
    let v = String(answers[st.id]);
    const i = 'abcd'.indexOf(v.toLowerCase());
    if (v.length === 1 && i >= 0 && st.options[i]) v = st.options[i];
    sb[st.id] = v;
  }
  return sb;
}
function plan(sb) {
  const e = estimate(sb);
  const shots = [];
  for (let i = 0; i < e.images; i++) shots.push({ n: i + 1, prompt: [sb.subject, sb.theme].filter(Boolean).join(', '), clips: e.clips ? Math.ceil(e.clips / e.images) : 0, motion: sb.motion || '' });
  return { ...sb, estimate: e, shots };
}
async function interview(dir, answersFile) {
  const sb = load(dir) || {};
  if (answersFile) { applyAnswers(sb, JSON.parse(fs.readFileSync(answersFile, 'utf8'))); save(dir, sb); return sb; }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((r) => rl.question(q, r));
  for (const st of tree.steps) {
    if (st.id === 'shot_seconds' && !/clip|video/i.test(sb.kind || '')) continue;
    const opts = st.options.map((o, i) => `  ${'ABCD'[i]}: ${o}`).concat(st.freeform ? [] : [`  ${tree.custom}`]);
    const a = (await ask(`${st.ask}\n${opts.join('\n')}\n> `)).trim();
    const v = /^e$/i.test(a) ? (await ask('Custom: ')).trim() : a;
    applyAnswers(sb, { [st.id]: v });
  }
  rl.close(); save(dir, sb); return sb;
}
function jobFile(dir, sb) {
  const detail = /RealVis/i.test(sb.quality || '');
  const video = /clip|video/i.test(sb.kind || '');
  const per = sb.shots.map((x) => x.clips);
  const job = { prompts: sb.shots.map((x) => x.prompt), image_model: detail ? 'realvisxl-v5' : 'dreamshaper-xl-turbo', motions: sb.shots.map((x) => x.motion || ''), clips_per_shot: video ? per : per.map(() => 0) };
  const f = path.join(dir, 'job.json');
  fs.writeFileSync(f, JSON.stringify(job, null, 2));
  return f;
}
function runBench(args) {
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'bench', 'run.js'), ...args], { stdio: 'inherit' });
  return r.status === null ? 1 : r.status;
}
function stitch(dir, out) {
  const clips = fs.readdirSync(dir).filter((f) => /^clip_\d+\.mp4$/.test(f)).sort();
  if (!clips.length) throw new Error('no clip_NNN.mp4 files in ' + dir);
  const list = path.join(dir, 'clips.txt');
  fs.writeFileSync(list, clips.map((c) => "file '" + c + "'").join('\n'));
  // -g 1 = every frame a keyframe, so a scroll-scrub page can seek to any frame.
  const r = cp.spawnSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'libx264', '-g', '1', '-pix_fmt', 'yuv420p', out], { cwd: dir, encoding: 'utf8' });
  if (r.error || r.status !== 0) throw new Error('ffmpeg failed: ' + (r.error ? r.error.message : (r.stderr || '').slice(-300)));
  return out;
}
async function main() {
  const [sub, ...a] = process.argv.slice(2);
  const val = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined; };
  const dir = path.resolve(a.find((x, i) => !x.startsWith('--') && !(a[i - 1] || '').startsWith('--')) || '.');
  if (sub === 'init') { if (!load(dir)) save(dir, {}); console.log('initialised ' + file(dir)); }
  else if (sub === 'interview') { const sb = await interview(dir, val('--answers')); console.log(JSON.stringify(sb, null, 2)); }
  else if (sub === 'plan') { const sb = load(dir); if (!sb) { console.error('run init and interview first'); process.exitCode = 2; return; } const p = plan(sb); save(dir, p); console.log(`${p.estimate.images} image(s), ${p.estimate.clips} clip(s), about ${p.estimate.gpuMinutes} GPU min (${p.estimate.fitsOneSession ? 'fits one session' : 'needs several sessions'}). ${p.estimate.note}`); }
  else if (sub === 'status') { const sb = load(dir); console.log(sb ? JSON.stringify(sb.estimate || sb, null, 2) : 'no storyboard'); }
  else if (sub === 'stitch') { console.log('wrote ' + stitch(dir, path.join(dir, val('--out') || 'out.mp4'))); }
  else if (sub === 'submit') { const sb = load(dir); if (!sb || !sb.shots) { console.error('run plan first'); process.exitCode = 2; return; } process.exitCode = runBench(['--no-wait', '--job', jobFile(dir, sb), ...(a.includes('--dry-run') ? ['--dry-run'] : [])]); }
  else if (sub === 'fetch') { process.exitCode = runBench(['--fetch', '--out', dir]); }
  else { console.error('usage: harness.js init|interview [--answers f.json]|plan|submit [--dry-run]|fetch|status|stitch [--out x.mp4] [dir]'); process.exitCode = 2; }
}
if (require.main === module) main().catch((e) => { console.error(e.message); process.exitCode = 1; });
module.exports = { applyAnswers, plan, tree };
