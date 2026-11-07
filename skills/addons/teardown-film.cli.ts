#!/usr/bin/env node
// Optional add-on to teardown: records a machine's tour to an MP4. It opens the built page in headless Chrome, asks
// the page for each frame by time (render(t) is a pure function of t, so every run gives the same frames), and
// pipes the stills into ffmpeg. If a score exists (teardown-sound) it is muxed in. Plain Node, no dependencies, no
// network. Needs the teardown add-on and ffmpeg on PATH.
//
//   node cli.js status [<dir>]                 ffmpeg, Chrome, the built page and the score, in one report
//   node cli.js film <dir> [--size 1920x1080] [--fps 30] [--from S] [--to S] [--out FILE] [--sound FILE|none]
//                          [--preview] [--json] [--dry-run]
//                                              record the tour; --preview is 640x360 at 12 fps, a quick look
// Exit codes: 0 done, 1 error, 2 bad usage, 3 blocked by a preflight (no ffmpeg, Chrome or built libraries).
// It writes only teardown-out/<name>/<name>.mp4 (or --out). It never commits, pushes or deletes. A software renderer
// draws about one frame a second, so on a machine without a GPU a long tour takes a long time: use --preview first.
import cp = require('node:child_process');
import fs = require('node:fs');
import path = require('node:path');

const out = (s: string) => process.stdout.write(s + '\n');
const warn = (s: string) => process.stderr.write(s + '\n');
function fail(msg: string, code = 1): void { warn('error: ' + msg); process.exitCode = code; }
const rel = (from: string, to: string) => path.relative(from, to).split(path.sep).join('/') || '.';

function loadTeardown(): any {
  for (const p of [path.join(__dirname, 'teardown.cli.js'), path.join(__dirname, '..', 'teardown', 'cli.js')]) if (fs.existsSync(p)) return require(p);
  throw Object.assign(new Error('the teardown add-on is not installed next to this one. Install it first.'), { code: 3 });
}

export function ffmpegBin(): string { return process.env.FFMPEG || 'ffmpeg'; }
export function ffmpegVersion(bin = ffmpegBin()): string | null {
  const r = cp.spawnSync(bin, ['-version'], { encoding: 'utf8' });
  return r.error || r.status !== 0 ? null : (r.stdout.split(/\r?\n/)[0] || '').replace(/ Copyright.*$/, '');
}

export interface Plan { w: number; h: number; fps: number; from: number; to: number; frames: number; out: string; sound: string | null; crf: number }

/** Work out what a recording would do, without doing it. Pure apart from reading the file system. */
export function planFilm(dir: string, root: string, f: Record<string, string | boolean>, duration: number): Plan {
  const preview = !!f.preview;
  const size = typeof f.size === 'string' && /^\d+x\d+$/.test(f.size) ? f.size.split('x').map(Number) : preview ? [640, 360] : [1920, 1080];
  const fps = Number(typeof f.fps === 'string' ? f.fps : preview ? 12 : 30);
  const from = Math.max(0, Number(typeof f.from === 'string' ? f.from : 0));
  const to = Math.min(duration, Number(typeof f.to === 'string' ? f.to : duration));
  const name = path.basename(dir);
  const score = path.join(root, 'teardown-out', name, 'score.wav');
  const sound = f.sound === 'none' ? null : typeof f.sound === 'string' ? path.resolve(root, f.sound) : fs.existsSync(score) ? score : null;
  return { w: size[0], h: size[1], fps, from, to, frames: Math.max(0, Math.ceil((to - from) * fps)), out: path.resolve(root, typeof f.out === 'string' ? f.out : path.join('teardown-out', name, name + (preview ? '.preview' : '') + '.mp4')), sound, crf: preview ? 28 : 18 };
}

export function ffmpegArgs(p: Plan): string[] {
  const a = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(p.fps), '-c:v', 'mjpeg', '-i', '-'];
  if (p.sound) a.push('-ss', String(p.from), '-i', p.sound);
  a.push('-map', '0:v', ...(p.sound ? ['-map', '1:a'] : []), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', String(p.crf), '-preset', 'medium', '-movflags', '+faststart');
  if (p.sound) a.push('-c:a', 'aac', '-b:a', '256k', '-shortest');
  a.push(p.out);
  return a;
}

const BOOL = new Set(['json', 'dry-run', 'preview']);
function parseArgs(argv: string[]): { cmd: string; pos: string[]; f: Record<string, string | boolean> } {
  const pos: string[] = [], f: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); if (BOOL.has(k)) f[k] = true; else { if (i + 1 >= argv.length) throw new Error(`--${k} needs a value`); f[k] = argv[++i]; } }
    else pos.push(a);
  }
  return { cmd: pos[0] || '', pos: pos.slice(1), f };
}
const USAGE = 'usage: teardown-film <status|film> ...  (status [<dir>], film <dir> [--preview] [--size 1920x1080] [--fps 30] [--from S] [--to S] [--out FILE] [--sound FILE|none])';

async function main(): Promise<void> {
  let a;
  try { a = parseArgs(process.argv.slice(2)); } catch (e) { fail((e as Error).message + '\n' + USAGE, 2); return; }
  const { cmd, pos, f } = a;
  const json = !!f.json, dry = !!f['dry-run'];
  const root = path.resolve(typeof f.root === 'string' ? f.root : process.cwd());
  const say = (s: string) => { if (!json) out(s); };
  if (cmd !== 'status' && cmd !== 'film') { fail(USAGE, 2); return; }
  let T: any;
  try { T = loadTeardown(); } catch (e) { fail((e as Error).message, 3); return; }
  const ff = ffmpegVersion();
  const chrome = T.findChrome();
  const dir = pos[0] ? path.resolve(root, pos[0]) : null;
  const name = dir ? path.basename(dir) : null;
  const built = dir ? fs.existsSync(path.join(dir, 'dist', 'index.html')) : null;
  const tlFile = name ? path.join(root, 'teardown-out', name, 'timeline.json') : null;
  const score = name ? path.join(root, 'teardown-out', name, 'score.wav') : null;
  const duration = tlFile && fs.existsSync(tlFile) ? Number(JSON.parse(fs.readFileSync(tlFile, 'utf8')).duration) : null;

  if (cmd === 'status') {
    const s = { ffmpeg: ff, chrome, machine: name, built, timeline: !!duration, duration, score: score ? fs.existsSync(score) : null };
    if (json) { out(JSON.stringify({ ok: !!ff && !!chrome, ...s })); return; }
    say(`ffmpeg: ${ff || 'not found (install it and put it on PATH, or set FFMPEG to the file)'}`);
    say(`Browser: ${chrome || 'not found (set CHROME to a Chrome or Edge file)'}`);
    if (name) { say(`Machine ${name}: page ${built ? 'built' : 'not built (run teardown build)'}, timeline ${duration ? duration + ' s' : 'missing (run teardown sheet once)'}, score ${s.score ? 'found' : 'none (silent video; see teardown-sound)'}`); }
    if (!ff || !chrome) process.exitCode = 3;
    return;
  }

  if (!dir) { fail('film needs a machine folder.\n' + USAGE, 2); return; }
  if (!fs.existsSync(dir)) { fail(`${dir} does not exist`); return; }
  if (!ff) { fail('ffmpeg was not found. Install it (for example: winget install Gyan.FFmpeg), then try again. FFMPEG sets another path.', 3); return; }
  if (!chrome) { fail('no Chrome or Edge found. Install Chrome, or set CHROME to the browser file.', 3); return; }
  if (!duration) { fail(`${rel(root, tlFile!)} not found. Run: teardown sheet ${rel(root, dir)} once; it writes the timeline.`); return; }
  const plan = planFilm(dir, root, f, duration);
  if (!(plan.fps > 0) || plan.frames < 1) { fail('nothing to record: check --fps, --from and --to'); return; }
  if (json && dry) { out(JSON.stringify({ ok: true, dryRun: true, plan })); return; }
  say(`${dry ? 'would record' : 'recording'} ${plan.frames} frames (${plan.from} to ${plan.to} s at ${plan.fps} fps, ${plan.w}x${plan.h}) to ${rel(root, plan.out)}${plan.sound ? ' with ' + rel(root, plan.sound) : ', silent'}`);
  if (dry) return;
  fs.mkdirSync(path.dirname(plan.out), { recursive: true });
  const enc = cp.spawn(ffmpegBin(), ffmpegArgs(plan), { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = '';
  enc.stderr.on('data', (d) => { err += String(d); });
  const done = new Promise<number>((res) => enc.on('close', (code) => res(code ?? 1)));
  enc.stdin.on('error', () => { /* ffmpeg exited early; its message is reported below */ });
  try {
    const t0 = Date.now();
    let next = 5;
    await T.withPage(dir, root, { w: plan.w, h: plan.h, query: '?capture' }, async ({ cdp, errors, ev }: any) => {
      for (let i = 0; i < plan.frames; i++) {
        await ev(`window.SIM.render(${plan.from + i / plan.fps})`);
        const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 95 });
        if (!enc.stdin.write(Buffer.from(shot.data, 'base64'))) await new Promise((r) => enc.stdin.once('drain', r));
        const pct = ((i + 1) / plan.frames) * 100;
        if (!json && pct >= next) { warn(`  ${Math.floor(pct)}%  frame ${i + 1}/${plan.frames}  ${((Date.now() - t0) / 1000).toFixed(0)} s`); next += 5; }
        if (errors.length) throw new Error('the page reported an error: ' + errors[0]);
      }
    });
    enc.stdin.end();
    const code = await done;
    if (code !== 0) throw new Error('ffmpeg failed: ' + (err.trim().split(/\r?\n/).pop() || 'exit ' + code));
    const bytes = fs.statSync(plan.out).size;
    if (json) out(JSON.stringify({ ok: true, out: rel(root, plan.out), frames: plan.frames, bytes, sound: !!plan.sound }));
    else say(`wrote ${rel(root, plan.out)} (${(bytes / 1e6).toFixed(1)} MB, ${((plan.to - plan.from)).toFixed(1)} s)`);
  } catch (e) {
    try { enc.stdin.end(); enc.kill(); } catch { /* already gone */ }
    fail((e as Error).message, (e as any).code === 3 ? 3 : 1);
  }
}

if (require.main === module) main().catch((e) => fail(`teardown-film failed: ${(e as Error).message}`));
