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
