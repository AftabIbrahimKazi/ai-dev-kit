const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const SCRIPT = path.join(__dirname, '../skills/addons/teardown-film.cli.js');
const F = require(SCRIPT);

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const cli = (cwd, args, env = {}) => spawnSync('node', [SCRIPT, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
const proj = ({ built = true, timeline = true, score = false } = {}) => {
	const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tf test-'));
	fs.mkdirSync(path.join(d, 'teardown', 'm', 'dist'), { recursive: true });
	if (built) fs.writeFileSync(path.join(d, 'teardown', 'm', 'dist', 'index.html'), '<title>x</title>');
	fs.mkdirSync(path.join(d, 'teardown-out', 'm'), { recursive: true });
	if (timeline) fs.writeFileSync(path.join(d, 'teardown-out', 'm', 'timeline.json'), JSON.stringify({ duration: 20, beats: [] }));
	if (score) fs.writeFileSync(path.join(d, 'teardown-out', 'm', 'score.wav'), 'x');
	return d;
};
const hasFfmpeg = !!F.ffmpegVersion();

t('planFilm: full quality by default, a preview is small and quick, from/to trim the frames, sound is found beside the timeline', () => {
	const d = proj({ score: true });
	const dir = path.join(d, 'teardown', 'm');
	const full = F.planFilm(dir, d, {}, 20);
	assert.deepStrictEqual([full.w, full.h, full.fps, full.frames, full.crf], [1920, 1080, 30, 600, 18]);
	assert.ok(full.out.endsWith(path.join('teardown-out', 'm', 'm.mp4')) && full.sound && full.sound.endsWith('score.wav'));
	const pv = F.planFilm(dir, d, { preview: true }, 20);
	assert.deepStrictEqual([pv.w, pv.h, pv.fps, pv.frames, pv.crf], [640, 360, 12, 240, 28]);
	assert.ok(pv.out.endsWith('m.preview.mp4'));
	const cut = F.planFilm(dir, d, { from: '4', to: '10', fps: '10', size: '800x450' }, 20);
	assert.deepStrictEqual([cut.from, cut.to, cut.frames, cut.w, cut.h], [4, 10, 60, 800, 450]);
	assert.strictEqual(F.planFilm(dir, d, { to: '999' }, 20).to, 20);
	assert.strictEqual(F.planFilm(dir, d, { sound: 'none' }, 20).sound, null);
});

t('ffmpegArgs pipe stills in, encode H.264, and only add audio when there is a score', () => {
	const base = { w: 640, h: 360, fps: 12, from: 0, to: 2, frames: 24, out: 'o.mp4', sound: null, crf: 28 };
	const a = F.ffmpegArgs(base);
	assert.ok(a.includes('image2pipe') && a.includes('libx264') && a.includes('yuv420p') && a[a.length - 1] === 'o.mp4' && !a.includes('aac'));
	const b = F.ffmpegArgs({ ...base, from: 4, sound: 's.wav' });
	assert.ok(b.includes('aac') && b.includes('-shortest') && b.join(' ').includes('-ss 4 -i s.wav') && b.includes('1:a'));
});

t('status reports what is there and what is missing, as text and as JSON', () => {
	const d = proj({ score: true });
	const j = JSON.parse(cli(d, ['status', 'teardown/m', '--json']).stdout);
	assert.ok(j.built === true && j.timeline === true && j.duration === 20 && j.score === true && j.machine === 'm');
	const txt = cli(d, ['status', 'teardown/m']).stdout;
	assert.ok(/page built/.test(txt) && /score found/.test(txt));
	const bare = proj({ built: false, timeline: false });
	assert.ok(/not built/.test(cli(bare, ['status', 'teardown/m']).stdout) && /timeline missing/.test(cli(bare, ['status', 'teardown/m']).stdout));
});

t('film --dry-run prints the plan and writes nothing', () => {
	if (!hasFfmpeg) return;
	const d = proj();
	const r = cli(d, ['film', 'teardown/m', '--preview', '--dry-run']);
	assert.strictEqual(r.status, 0, r.stderr);
	assert.ok(/would record 240 frames/.test(r.stdout));
	const j = JSON.parse(cli(d, ['film', 'teardown/m', '--dry-run', '--json']).stdout);
	assert.ok(j.dryRun && j.plan.frames === 600);
	assert.ok(!fs.existsSync(path.join(d, 'teardown-out', 'm', 'm.mp4')));
});

t('film is blocked with exit 3 and an install hint when ffmpeg is missing', () => {
	const d = proj();
	const r = cli(d, ['film', 'teardown/m', '--dry-run'], { FFMPEG: path.join(d, 'no-such-ffmpeg') });
	assert.strictEqual(r.status, 3);
	assert.ok(/ffmpeg was not found/.test(r.stderr) && /winget install/.test(r.stderr));
});

t('film needs a folder and the timeline, and rejects an empty range', () => {
	if (!hasFfmpeg) return;
	const d = proj({ timeline: false });
	assert.strictEqual(cli(d, ['film']).status, 2);
	const r = cli(d, ['film', 'teardown/m']);
	assert.strictEqual(r.status, 1);
	assert.ok(/teardown sheet/.test(r.stderr));
	const ok = proj();
	const bad = cli(ok, ['film', 'teardown/m', '--from', '30', '--to', '40']);
	assert.strictEqual(bad.status, 1);
	assert.ok(/nothing to record/.test(bad.stderr));
});

t('bad usage exits 2 with a usage line', () => {
	const d = proj();
	for (const a of [[], ['bogus'], ['film', '--fps']]) { const r = cli(d, a); assert.strictEqual(r.status, 2, a.join(' ')); assert.ok(/usage:/.test(r.stderr)); }
});

// ---- round 4: plan and args golden (found by the kit-wide probe) ----
// Regenerate on purpose with UPDATE_GOLDEN=1 node tests/teardown-film.cli.test.js, then read the diff.
const CR5 = String.fromCharCode(13);
const gold5 = (name, text) => {
	const file = path.join(__dirname, 'fixtures', 'film', name);
	if (process.env.UPDATE_GOLDEN === '1') { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); return; }
	assert.ok(fs.existsSync(file), 'missing golden ' + name + ' (generate with UPDATE_GOLDEN=1)');
	assert.strictEqual(text, fs.readFileSync(file, 'utf8').split(CR5).join(''));
};
t('golden: planFilm and the ffmpeg arguments over many flag combinations', () => {
	const d = proj({ score: true }); const noScore = proj({});
	const dir = path.join(d, 'teardown', 'm'), dir2 = path.join(noScore, 'teardown', 'm');
	const norm = (v, root) => JSON.parse(JSON.stringify(v).split(String.fromCharCode(92) + String.fromCharCode(92)).join('/').split(root.split(String.fromCharCode(92)).join('/')).join('<root>'));
	const flags = {
		defaults: {}, preview: { preview: true }, size: { size: '800x600' }, 'bad size': { size: '800' }, 'bad size letters': { size: 'axb' }, 'size with preview': { size: '320x200', preview: true },
		fps: { fps: '24' }, 'fps zero': { fps: '0' }, from: { from: '5' }, 'from negative': { from: '-3' }, to: { to: '8' }, 'to beyond': { to: '99' }, 'from and to': { from: '2.5', to: '4' }, 'from after to': { from: '9', to: '3' }, 'from equals to': { from: '5', to: '5' },
		out: { out: 'movies/a.mp4' }, 'sound none': { sound: 'none' }, 'sound file': { sound: 'audio/x.wav' }, 'preview out default': { preview: true, from: '1', to: '2' },
	};
	const out = { plans: {}, noScorePlans: {}, args: {} };
	for (const [k, f] of Object.entries(flags)) { const p = F.planFilm(dir, d, f, 20); out.plans[k] = norm(p, d); out.args[k] = norm(F.ffmpegArgs(p), d); out.noScorePlans[k] = norm(F.planFilm(dir2, noScore, f, 20), noScore); }
	out.crf = { full: F.planFilm(dir, d, {}, 20).crf, preview: F.planFilm(dir, d, { preview: true }, 20).crf };
	out.bin = [F.ffmpegBin(), (() => { const prev = process.env.FFMPEG; process.env.FFMPEG = 'x-ffmpeg'; const b = F.ffmpegBin(); if (prev === undefined) delete process.env.FFMPEG; else process.env.FFMPEG = prev; return b; })()];
	out.versionOfMissing = F.ffmpegVersion(path.join(d, 'no-such-bin'));
	gold5('plan.json', JSON.stringify(out, null, 1) + String.fromCharCode(10));
});

t('the film CLI: usage errors, a missing folder or timeline, and the dry-run plan as JSON and text', () => {
	if (!hasFfmpeg || !require('../skills/addons/teardown.cli.js').findChrome()) { console.log('     (skipped: needs ffmpeg and Chrome on this machine)'); return; }
	const d = proj();
	const out = {};
	const clean = (s) => s.split(CR5).join('').split(d).join('<d>').split(d.split(String.fromCharCode(92)).join('/')).join('<d>');
	const rec = (label, r) => { out[label] = { status: r.status, stdout: clean(r.stdout), stderr: clean(r.stderr) }; };
	rec('no command', cli(d, []));
	rec('unknown command', cli(d, ['play']));
	rec('flag without a value', cli(d, ['film', 'teardown/m', '--fps']));
	rec('film without a folder', cli(d, ['film']));
	rec('folder that does not exist', cli(d, ['film', 'teardown/nope', '--dry-run']));
	const noTl = proj({ timeline: false });
	rec('no timeline', cli(noTl, ['film', 'teardown/m', '--dry-run']));
	rec('fps zero', cli(d, ['film', 'teardown/m', '--dry-run', '--fps', '0']));
	rec('empty range', cli(d, ['film', 'teardown/m', '--dry-run', '--from', '5', '--to', '5']));
	rec('dry run json', cli(d, ['film', 'teardown/m', '--dry-run', '--json']));
	rec('dry run text preview', cli(d, ['film', 'teardown/m', '--dry-run', '--preview']));
	rec('status', cli(d, ['status', 'teardown/m', '--json']));
	rec('status text', cli(d, ['status', 'teardown/m']));
	rec('no ffmpeg', cli(d, ['film', 'teardown/m', '--dry-run'], { FFMPEG: path.join(d, 'no-such-ffmpeg') }));
	// Machine-specific parts (ffmpeg and Chrome versions) are removed so the golden is the same everywhere.
	for (const v of Object.values(out)) { v.stdout = v.stdout.replace(/ffmpeg version [^"\n,]*/g, 'ffmpeg <version>').replace(/"chrome":("[^"]*"|null)/g, '"chrome":"<chrome>"').replace(/"ffmpeg":("[^"]*"|null)/g, '"ffmpeg":"<ff>"').replace(/^Browser: .*$/gm, 'Browser: <chrome>').replace(/^ffmpeg: .*$/gm, 'ffmpeg: <ff>'); }
	for (const v of Object.values(out)) if (v.status === 3 && /ffmpeg|Chrome|Edge/.test(v.stderr)) v.stderr = v.stderr.replace(/^error: .*$/m, 'error: <preflight>');
	let js5 = JSON.stringify(out, null, 1); const BS5 = String.fromCharCode(92); for (const form of [d, d.split(BS5).join(BS5 + BS5), d.split(BS5).join('/'), d.split(BS5).join(BS5 + BS5 + BS5 + BS5)]) js5 = js5.split(form).join('<d>');
	gold5('cli.json', js5 + String.fromCharCode(10));
});
