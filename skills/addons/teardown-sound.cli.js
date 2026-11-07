#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.peakDb = exports.PEAK_LIMIT_DB = exports.TARGET_LUFS = exports.RATE = void 0;
exports.rng = rng;
exports.loudness = loudness;
exports.humHz = humHz;
exports.synth = synth;
exports.master = master;
exports.wavBytes = wavBytes;
exports.readWav = readWav;
// Optional add-on to teardown: writes a machine's score as a WAV file, synthesised in plain Node from the tour's
// timeline, so the sound cannot drift from the picture. A soft chord bed, a hum at the machine's own working
// frequency (gear mesh or firing rate, folded into hearing range), a tick on every beat, a rising whoosh on the cut.
// Every sample is reproducible (seeded noise). Mastered to -14 LUFS (ITU-R BS.1770 gating) with the peak held at or
// below -2 dBFS. Plain Node, no dependencies, no network. Needs the teardown add-on's timeline (run its `sheet` once).
//
//   node cli.js sound <dir> [--out FILE] [--seed N] [--json] [--dry-run]
//                                              write teardown-out/<name>/score.wav (or --out)
//   node cli.js measure <file.wav> [--json]    report a 16-bit mono WAV's integrated loudness and peak
// Exit codes: 0 done, 1 error, 2 bad usage. It writes only the WAV. It never commits, pushes or deletes.
// A recorded video (teardown-film) picks up score.wav on its own when the file sits beside the timeline.
const fs = require("node:fs");
const path = require("node:path");
exports.RATE = 48000;
exports.TARGET_LUFS = -14;
exports.PEAK_LIMIT_DB = -2;
const out = (s) => process.stdout.write(s + '\n');
const warn = (s) => process.stderr.write(s + '\n');
function fail(msg, code = 1) { warn('error: ' + msg); process.exitCode = code; }
const rel = (from, to) => path.relative(from, to).split(path.sep).join('/') || '.';
const dbToLin = (db) => Math.pow(10, db / 20);
/** A small seeded generator: the same seed gives the same noise, so the score is reproducible. */
function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// ---------- loudness (ITU-R BS.1770-4, mono) ----------
function biquad(x, b, a) {
    const y = new Float32Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
        const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
        x2 = x1;
        x1 = x[i];
        y2 = y1;
        y1 = v;
        y[i] = v;
    }
    return y;
}
/** Integrated loudness in LUFS of a mono signal at 48 kHz: K-weighting, 400 ms blocks every 100 ms, two gates. */
function loudness(x) {
    const k = biquad(biquad(x, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]), [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]);
    const block = Math.round(exports.RATE * 0.4), hop = Math.round(exports.RATE * 0.1);
    const energy = [];
    for (let s = 0; s + block <= k.length; s += hop) {
        let e = 0;
        for (let i = s; i < s + block; i++)
            e += k[i] * k[i];
        energy.push(e / block);
    }
    if (!energy.length)
        return -Infinity;
    const lufs = (e) => -0.691 + 10 * Math.log10(e);
    const abs = energy.filter((e) => lufs(e) > -70);
    if (!abs.length)
        return -Infinity;
    const rel10 = lufs(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
    const kept = abs.filter((e) => lufs(e) > rel10);
    return kept.length ? lufs(kept.reduce((a, b) => a + b, 0) / kept.length) : -Infinity;
}
const peakDb = (x) => { let m = 0; for (const v of x)
    m = Math.max(m, Math.abs(v)); return m ? 20 * Math.log10(m) : -Infinity; };
exports.peakDb = peakDb;
/** The machine's working frequency in Hz: gear mesh or firing rate, folded by octaves into 90..360 Hz. Null when unknown. */
function humHz(s) {
    const rps = s.rpm / 60;
    let f = s.kind === 'gears' && s.teeth0 ? rps * s.teeth0 : s.kind === 'crank' ? (rps * (s.cylinders || 1)) / 2 : 0;
    if (!(f > 0))
        return null;
    while (f < 90)
        f *= 2;
    while (f > 360)
        f /= 2;
    return f;
}
const PENTATONIC = [0, 3, 5, 7, 10]; // minor pentatonic steps above the root
const ROOT = 110; // A2
function synth(duration, beats, spec, seed = 1) {
    const n = Math.round(duration * exports.RATE);
    const x = new Float32Array(n);
    const rand = rng(seed);
    const TAU = Math.PI * 2;
    // chord bed: root, fifth and octave, a slow tremolo, faded in over 1.5 s and out over 2.5 s
    for (const [mult, amp] of [[1, 0.07], [1.5, 0.05], [2, 0.04]]) {
        for (let i = 0; i < n; i++) {
            const t = i / exports.RATE;
            const env = Math.min(1, t / 1.5, (duration - t) / 2.5);
            x[i] += amp * Math.max(0, env) * (0.8 + 0.2 * Math.sin(TAU * 0.11 * t + mult)) * Math.sin(TAU * ROOT * mult * t);
        }
    }
    // the machine's own hum, with a little more weight on each beat
    const f0 = humHz(spec);
    if (f0) {
        for (let i = 0; i < n; i++) {
            const t = i / exports.RATE;
            const env = Math.min(1, t / 1.0, (duration - t) / 2.0);
            let swell = 0;
            for (const b of beats)
                swell = Math.max(swell, Math.exp(-Math.abs(t - b.t - 0.3) * 2.2) * 0.4);
            const ph = TAU * f0 * t;
            x[i] += Math.max(0, env) * (0.1 + 0.05 * swell) * (Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.25 * Math.sin(3 * ph)) / 1.75;
        }
    }
    // a tick on every beat after the first, on a note walking up the pentatonic scale
    beats.forEach((b, k) => {
        if (b.t <= 0 || b.t >= duration - 0.2)
            return;
        const step = PENTATONIC[(k - 1) % PENTATONIC.length] + 12 * Math.floor((k - 1) / PENTATONIC.length % 2);
        const f = ROOT * 4 * Math.pow(2, step / 12);
        const start = Math.round(b.t * exports.RATE);
        const len = Math.round(0.35 * exports.RATE);
        for (let i = 0; i < len && start + i < n; i++) {
            const t = i / exports.RATE;
            x[start + i] += 0.3 * Math.exp(-t * 14) * Math.sin(TAU * f * t) * Math.min(1, t / 0.004);
        }
    });
    // the cut: filtered noise that rises over a second and falls away
    const cut = beats.find((b) => /cut/i.test(b.name));
    if (cut && cut.t < duration - 1.5) {
        const start = Math.round((cut.t - 0.4) * exports.RATE);
        const len = Math.round(1.6 * exports.RATE);
        let lp = 0;
        for (let i = 0; i < len; i++) {
            const u = i / len;
            const env = Math.sin(Math.PI * Math.pow(u, 0.8)) * 0.35;
            const a = 0.02 + 0.4 * u * u; // the low-pass opens as the sweep rises
            lp += a * ((rand() * 2 - 1) - lp);
            const idx = start + i;
            if (idx >= 0 && idx < n)
                x[idx] += env * lp * 2.2;
        }
    }
    return x;
}
/** Scale to the loudness target, then hold the peak at the limit with a soft knee. Returns the result and what happened. */
function master(x) {
    const l0 = loudness(x);
    if (!isFinite(l0))
        return { y: x, lufs: l0, peak: (0, exports.peakDb)(x), gainDb: 0 };
    let gainDb = exports.TARGET_LUFS - l0;
    let y = new Float32Array(x.length);
    const lim = dbToLin(exports.PEAK_LIMIT_DB);
    // a gain that lands the loudness, then the soft limit; if the limit costs loudness, add a little gain and retry
    for (let pass = 0; pass < 6; pass++) {
        const g = dbToLin(gainDb);
        for (let i = 0; i < x.length; i++) {
            const v = x[i] * g;
            const a = Math.abs(v);
            const knee = lim * 0.8;
            y[i] = a <= knee ? v : Math.sign(v) * (knee + (lim - knee) * Math.tanh((a - knee) / (lim - knee)));
        }
        const l = loudness(y);
        if (Math.abs(l - exports.TARGET_LUFS) < 0.2)
            break;
        gainDb += exports.TARGET_LUFS - l;
    }
    return { y, lufs: loudness(y), peak: (0, exports.peakDb)(y), gainDb };
}
function wavBytes(x) {
    const b = Buffer.alloc(44 + x.length * 2);
    b.write('RIFF', 0);
    b.writeUInt32LE(36 + x.length * 2, 4);
    b.write('WAVE', 8);
    b.write('fmt ', 12);
    b.writeUInt32LE(16, 16);
    b.writeUInt16LE(1, 20);
    b.writeUInt16LE(1, 22);
    b.writeUInt32LE(exports.RATE, 24);
    b.writeUInt32LE(exports.RATE * 2, 28);
    b.writeUInt16LE(2, 32);
    b.writeUInt16LE(16, 34);
    b.write('data', 36);
    b.writeUInt32LE(x.length * 2, 40);
    for (let i = 0; i < x.length; i++)
        b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
    return b;
}
function readWav(buf) {
    if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE')
        throw new Error('not a WAV file');
    if (buf.readUInt16LE(22) !== 1 || buf.readUInt16LE(34) !== 16)
        throw new Error('only 16-bit mono WAV is supported');
    if (buf.readUInt32LE(24) !== exports.RATE)
        throw new Error(`only ${exports.RATE} Hz is supported`);
    const len = buf.readUInt32LE(40) / 2;
    const x = new Float32Array(len);
    for (let i = 0; i < len; i++)
        x[i] = buf.readInt16LE(44 + i * 2) / 32767;
    return x;
}
const BOOL = new Set(['json', 'dry-run']);
function parseArgs(argv) {
    const pos = [], f = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const k = a.slice(2);
            if (BOOL.has(k))
                f[k] = true;
            else {
                if (i + 1 >= argv.length)
                    throw new Error(`--${k} needs a value`);
                f[k] = argv[++i];
            }
        }
        else
            pos.push(a);
    }
    return { cmd: pos[0] || '', pos: pos.slice(1), f };
}
const USAGE = 'usage: teardown-sound <sound|measure> ...  (sound <dir> [--out FILE] [--seed N], measure <file.wav>)';
async function main() {
    let a;
    try {
        a = parseArgs(process.argv.slice(2));
    }
    catch (e) {
        fail(e.message + '\n' + USAGE, 2);
        return;
    }
    const { cmd, pos, f } = a;
    const json = !!f.json, dry = !!f['dry-run'];
    const root = path.resolve(typeof f.root === 'string' ? f.root : process.cwd());
    const say = (s) => { if (!json)
        out(s); };
    if (cmd === 'measure') {
        if (!pos[0]) {
            fail('measure needs a WAV file.\n' + USAGE, 2);
            return;
        }
        try {
            const x = readWav(fs.readFileSync(path.resolve(root, pos[0])));
            const r = { seconds: +(x.length / exports.RATE).toFixed(2), lufs: +loudness(x).toFixed(1), peak_dbfs: +(0, exports.peakDb)(x).toFixed(1) };
            if (json)
                out(JSON.stringify({ ok: true, ...r }));
            else
                say(`${r.seconds} s, ${r.lufs} LUFS, peak ${r.peak_dbfs} dBFS`);
        }
        catch (e) {
            fail(e.message);
        }
        return;
    }
    if (cmd !== 'sound') {
        fail(USAGE, 2);
        return;
    }
    if (!pos[0]) {
        fail('sound needs a machine folder.\n' + USAGE, 2);
        return;
    }
    const dir = path.resolve(root, pos[0]);
    const name = path.basename(dir);
    const specFile = path.join(dir, 'spec.json');
    const tlFile = path.join(root, 'teardown-out', name, 'timeline.json');
    if (!fs.existsSync(specFile)) {
        fail(`${rel(root, specFile)} not found. Is ${pos[0]} a teardown machine folder?`);
        return;
    }
    if (!fs.existsSync(tlFile)) {
        fail(`${rel(root, tlFile)} not found. Run: teardown sheet ${rel(root, dir)} once; it writes the timeline the score follows.`);
        return;
    }
    let tl, spec;
    try {
        tl = JSON.parse(fs.readFileSync(tlFile, 'utf8'));
        spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
    }
    catch (e) {
        fail('cannot read the spec or timeline: ' + e.message);
        return;
    }
    if (!(tl.duration > 0) || !Array.isArray(tl.beats)) {
        fail('timeline.json has no duration or beats');
        return;
    }
    const seed = typeof f.seed === 'string' ? Number(f.seed) || 1 : 1;
    const score = { kind: spec.kind, rpm: spec.input && spec.input.rpm || 0, teeth0: spec.parts && spec.parts[0] && spec.parts[0].teeth, cylinders: spec.cylinders };
    const file = path.resolve(root, typeof f.out === 'string' ? f.out : path.join('teardown-out', name, 'score.wav'));
    const hz = humHz(score);
    if (dry) {
        say(`would write ${rel(root, file)}: ${tl.duration} s, ${tl.beats.length} beats, ${hz ? 'hum ' + hz.toFixed(0) + ' Hz' : 'no hum (no known working frequency)'}`);
        if (json)
            out(JSON.stringify({ ok: true, dryRun: true, file: rel(root, file), seconds: tl.duration, hum_hz: hz }));
        return;
    }
    const m = master(synth(tl.duration, tl.beats, score, seed));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, wavBytes(m.y));
    const r = { ok: true, file: rel(root, file), seconds: tl.duration, hum_hz: hz, lufs: +m.lufs.toFixed(1), peak_dbfs: +m.peak.toFixed(1) };
    if (json)
        out(JSON.stringify(r));
    else
        say(`wrote ${r.file}: ${r.seconds} s, ${r.lufs} LUFS, peak ${r.peak_dbfs} dBFS${hz ? ', hum ' + hz.toFixed(0) + ' Hz' : ''}`);
}
if (require.main === module)
    main().catch((e) => fail(`teardown-sound failed: ${e.message}`));
