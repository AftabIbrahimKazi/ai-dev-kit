#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseArgs = parseArgs;
exports.detectTools = detectTools;
exports.pickEngine = pickEngine;
exports.outPath = outPath;
exports.buildSpec = buildSpec;
exports.convertFile = convertFile;
exports.readDims = readDims;
exports.scan = scan;
exports.refs = refs;
exports.compressAll = compressAll;
exports.precompress = precompress;
// Asset optimizer for the optimize-assets skill: finds heavy assets, converts them, lists what references them.
// Plain Node, no dependencies of its own: it drives whichever converters the machine already has
// (sharp, ImageMagick, ffmpeg, svgo, woff2_compress). Originals are never modified or deleted.
//
//   node convert.js tools
//   node convert.js scan [dir] [--min-kb 200] [--wide 2560] [--top 30] [--built]
//   node convert.js convert <file|dir>... --to webp|avif|jpg|png|svg|mp4|webm|mp3|opus|woff2   (comma list: --to webp,avif)
//                   [--quality 80] [--max-edge N] [--crf N] [--out DIR] [--preset vision|web]  (claude is an alias of vision)
//                   [--engine NAME] [--force] [--keep-larger] [--dry-run]
//   node convert.js compress <file|dir>...    same format, smaller file (png jpg webp avif svg mp4 webm mp3 opus);
//                   [--quality N] [--max-edge N] [--crf N] [--lossless] [--out DIR] [--force] [--dry-run]
//                   --lossless sends png through oxipng (needs it installed); otherwise the normal converters recompress
//   node convert.js precompress <file|dir>... [--gzip] [--brotli] [--force] [--dry-run]
//                   writes <file>.gz / <file>.br for css js html svg json xml txt wasm ttf otf (built-in zlib, no tools)
//   node convert.js refs <file>...            files that mention each asset, to update after a conversion
// Add --json for machine output, --cwd D to run from another folder. Any other first word is treated as `scan`.
//
// Output goes beside the source as <name>.<ext> (or <name>.opt.<ext> when the extension is unchanged), or under
// --out. A result that is not smaller than its source is deleted and the original kept, unless --keep-larger.
// Exit 1 when any file failed, 2 on a usage error.
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = childProcess;
const KINDS = {
    image: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'bmp', 'tif', 'tiff'],
    svg: ['svg'],
    video: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v'],
    audio: ['wav', 'flac', 'm4a', 'mp3', 'ogg', 'aac', 'opus'],
    font: ['ttf', 'otf', 'woff'],
};
const KIND_BY_EXT = Object.fromEntries(Object.entries(KINDS).flatMap(([k, exts]) => exts.map((e) => [e, k])));
const TARGETS = { webp: 'image', avif: 'image', jpg: 'image', png: 'image', svg: 'svg', mp4: 'video', webm: 'video', mp3: 'audio', opus: 'audio', woff2: 'font' };
const PRESETS = { vision: { to: 'jpg', quality: 80, maxEdge: 1568 }, claude: { to: 'jpg', quality: 80, maxEdge: 1568 }, web: { to: 'webp,avif', quality: 80, maxEdge: 2560 } };
const SKIP_DIRS = new Set(['node_modules', 'vendor', '.git']);
const BUILT_DIRS = new Set(['dist', 'build', 'out', '.next', '.astro', 'coverage']);
const TEXT_EXT = /\.(html?|css|scss|sass|less|js|jsx|ts|tsx|mjs|cjs|vue|svelte|astro|php|twig|njk|liquid|json|md|mdx|ya?ml|xml)$/i;
const HINT = {
    image: 'install sharp (npm i -D sharp; webp and avif) or ImageMagick (avif needs its libheif build), or ffmpeg for webp/jpg/png only',
    svg: 'install svgo (npm i -D svgo)',
    video: 'install ffmpeg',
    audio: 'install ffmpeg',
    font: 'install woff2 (the woff2_compress tool)',
};
const ext = (f) => path.extname(f).slice(1).toLowerCase();
const kb = (n) => Math.round(n / 1024);
const norm = (p) => p.split(path.sep).join('/');
function parseArgs(argv) {
    const cmds = ['tools', 'scan', 'convert', 'compress', 'precompress', 'refs'];
    const o = {
        cmd: 'scan', firstFrame: false, lossless: false, gzip: false, brotli: false, paths: [], to: null, quality: null,
        maxEdge: null, crf: null, out: null, engine: null, preset: null, minKb: 200, wide: 2560, top: 30, force: false,
        dry: false, keepLarger: false, built: false, json: false, cwd: process.cwd(), targets: [],
    };
    const rest = cmds.includes(argv[0]) ? (o.cmd = argv[0], argv.slice(1)) : argv;
    const val = { '--to': 'to', '--quality': 'quality', '--max-edge': 'maxEdge', '--crf': 'crf', '--out': 'out', '--engine': 'engine', '--preset': 'preset', '--min-kb': 'minKb', '--wide': 'wide', '--top': 'top', '--cwd': 'cwd' };
    const flag = { '--first-frame': 'firstFrame', '--lossless': 'lossless', '--gzip': 'gzip', '--brotli': 'brotli', '--force': 'force', '--dry-run': 'dry', '--keep-larger': 'keepLarger', '--built': 'built', '--json': 'json' };
    const dyn = o;
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (val[a]) {
            dyn[val[a]] = rest[++i];
            if (dyn[val[a]] === undefined)
                throw new Error(`${a} needs a value`);
        }
        else if (flag[a])
            dyn[flag[a]] = true;
        else if (a.startsWith('--'))
            throw new Error(`unknown option ${a}`);
        else
            o.paths.push(a);
    }
    o.cwd = path.resolve(o.cwd);
    for (const k of ['quality', 'maxEdge', 'crf', 'minKb', 'wide', 'top'])
        if (dyn[k] !== null) {
            dyn[k] = Number(dyn[k]);
            if (!Number.isFinite(dyn[k]) || dyn[k] <= 0)
                throw new Error(`--${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())} must be a positive number`);
        }
    if (o.preset) {
        const p = PRESETS[o.preset];
        if (!p)
            throw new Error(`--preset must be one of ${Object.keys(PRESETS).join(', ')}`);
        for (const k of Object.keys(p))
            if (dyn[k] === null)
                dyn[k] = p[k];
    }
    o.targets = o.to ? String(o.to).split(',').map((s) => s.trim()).filter(Boolean).map((s) => (s === 'jpeg' ? 'jpg' : s)) : [];
    o.to = o.targets[0] || null;
    if (o.cmd === 'convert') {
        if (!o.targets.length)
            throw new Error('convert needs --to (or --preset)');
        for (const t of o.targets)
            if (!TARGETS[t])
                throw new Error(`--to must be one of ${Object.keys(TARGETS).join(', ')}`);
        if (!o.paths.length)
            throw new Error('convert needs at least one file or folder');
    }
    if ((o.cmd === 'compress' || o.cmd === 'precompress') && !o.paths.length)
        throw new Error(`${o.cmd} needs at least one file or folder`);
    if (o.cmd === 'precompress' && !o.gzip && !o.brotli)
        o.gzip = o.brotli = true;
    return o;
}
// ---- tools ----
function which(bin) {
    const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { encoding: 'utf8' });
    return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
}
function detectTools(cwd) {
    let sharp = null;
    try {
        sharp = require.resolve('sharp', { paths: [cwd] });
    }
    catch { /* not installed */ }
    let svgo = null;
    const local = path.join(cwd, 'node_modules', 'svgo', 'bin', 'svgo.js');
    if (fs.existsSync(local))
        svgo = { bin: process.execPath, pre: [local] };
    else {
        const g = which('svgo');
        if (g)
            svgo = { bin: g, pre: [] };
    }
    return { sharp, magick: !!which('magick'), ffmpeg: !!which('ffmpeg'), svgo, woff2: !!which('woff2_compress'), oxipng: !!which('oxipng') };
}
function pickEngine(kind, to, tools, prefer, lossless) {
    const byKind = {
        image: [tools.sharp && 'sharp', tools.magick && 'magick', tools.ffmpeg && to !== 'avif' && 'ffmpeg'],
        svg: [tools.svgo && 'svgo'],
        video: [tools.ffmpeg && 'ffmpeg'],
        audio: [tools.ffmpeg && 'ffmpeg'],
        font: [tools.woff2 && 'woff2'],
    };
    const order = byKind[kind].filter(Boolean);
    if (lossless && tools.oxipng)
        order.unshift('oxipng');
    if (prefer)
        return order.includes(prefer) ? prefer : null;
    return order[0] || null;
}
// ---- conversion ----
function outPath(src, to, o) {
    const dest = '.' + to;
    const base = path.basename(src, path.extname(src));
    if (o.out)
        return path.join(path.resolve(o.cwd, o.out), path.relative(o.cwd, path.dirname(src)), base + dest);
    const same = path.extname(src).toLowerCase() === dest || (to === 'jpg' && ext(src) === 'jpeg');
    return path.join(path.dirname(src), base + (same ? '.opt' : '') + dest);
}
function buildSpec(engine, kind, src, out, to, o, tools) {
    const q = String(o.quality || 80);
    const e = o.maxEdge;
    if (engine === 'oxipng')
        return { bin: 'oxipng', args: ['-o', '4', '--strip', 'safe', '--out', out, src] };
    if (engine === 'sharp')
        return { type: 'sharp', module: tools.sharp, src, out, to: to === 'jpg' ? 'jpeg' : to, quality: o.quality || 80, maxEdge: e };
    if (engine === 'magick')
        return { bin: 'magick', args: [ext(src) === 'gif' ? src + '[0]' : src, ...(e ? ['-resize', `${e}x${e}>`] : []), '-quality', q, out] };
    if (engine === 'svgo')
        return { bin: tools.svgo.bin, args: [...tools.svgo.pre, src, '-o', out] };
    if (engine === 'woff2')
        return { bin: 'woff2_compress', args: [src], sibling: src.slice(0, -path.extname(src).length) + '.woff2' };
    const box = e ? `scale='min(${e},iw)':'min(${e},ih)':force_original_aspect_ratio=decrease` : null;
    const fit = e ? `scale='if(gt(iw,ih),min(${e},iw),-2)':'if(gt(iw,ih),-2,min(${e},ih))'` : 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
    if (kind === 'image') {
        const quality = to === 'webp' ? ['-quality', q] : to === 'jpg' ? ['-q:v', String(Math.max(2, Math.round(31 - ((o.quality || 80) / 100) * 29)))] : [];
        return { bin: 'ffmpeg', args: ['-y', '-i', src, ...(box ? ['-vf', box] : []), ...quality, '-frames:v', '1', out] };
    }
    if (kind === 'video') {
        return to === 'mp4'
            ? { bin: 'ffmpeg', args: ['-y', '-i', src, '-vf', fit, '-c:v', 'libx264', '-crf', String(o.crf || 28), '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out] }
            : { bin: 'ffmpeg', args: ['-y', '-i', src, '-vf', fit, '-c:v', 'libvpx-vp9', '-crf', String(o.crf || 32), '-b:v', '0', '-c:a', 'libopus', out] };
    }
    return { bin: 'ffmpeg', args: ['-y', '-i', src, '-vn', ...(to === 'mp3' ? ['-c:a', 'libmp3lame', '-q:a', '4'] : ['-c:a', 'libopus', '-b:a', '96k']), out] };
}
async function defaultExec(spec) {
    if (spec.type === 'sharp') {
        try {
            let img = require(spec.module)(spec.src);
            if (spec.maxEdge)
                img = img.resize({ width: spec.maxEdge, height: spec.maxEdge, fit: 'inside', withoutEnlargement: true });
            await img.toFormat(spec.to, spec.to === 'png' ? { compressionLevel: 9 } : { quality: spec.quality }).toFile(spec.out);
            return { ok: true };
        }
        catch (e) {
            return { ok: false, error: e.message };
        }
    }
    const r = spawnSync(spec.bin, spec.args, { encoding: 'utf8', maxBuffer: 1 << 28, shell: /\.(cmd|bat)$/i.test(spec.bin) });
    if (r.error)
        return { ok: false, error: r.error.message };
    if (r.status !== 0)
        return { ok: false, error: (r.stderr || '').trim().split('\n').slice(-2).join(' ') || `exit ${r.status}` };
    return { ok: true };
}
function kindFor(src, to) {
    const want = TARGETS[to];
    const have = KIND_BY_EXT[ext(src)];
    if (have === want || (ext(src) === 'gif' && want === 'video'))
        return want;
    return null;
}
async function convertFile(src, o, ctx) {
    const rel = norm(path.relative(o.cwd, src));
    const row = { file: rel, status: 'error' };
    const kind = kindFor(src, o.to);
    if (!kind)
        return { ...row, error: `cannot convert .${ext(src) || '?'} to ${o.to}` };
    if (ext(src) === 'gif' && kind === 'image' && !o.firstFrame)
        return { ...row, error: 'a gif may be animated and an image target keeps one frame: use --to mp4 or webm, or add --first-frame' };
    const engine = pickEngine(kind, o.to, ctx.tools, o.engine, o.lossless && o.to === 'png' && ext(src) === 'png');
    if (!engine)
        return { ...row, error: o.engine ? `engine "${o.engine}" is not available for ${kind} to ${o.to}` : `no converter for ${kind} to ${o.to}: ${HINT[kind]}` };
    const out = outPath(src, o.to, o);
    const spec = buildSpec(engine, kind, src, out, o.to, o, ctx.tools);
    const sibling = spec.sibling && spec.sibling !== out ? spec.sibling : null;
    Object.assign(row, { engine, out: norm(path.relative(o.cwd, out)) });
    if ((fs.existsSync(out) || (sibling && fs.existsSync(sibling))) && !o.force)
        return { ...row, status: 'skipped-exists' };
    if (o.dry)
        return { ...row, status: 'planned', command: spec.type === 'sharp' ? `sharp ${spec.to} q${spec.quality}${spec.maxEdge ? ' edge' + spec.maxEdge : ''}` : [spec.bin, ...spec.args].join(' ') };
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const res = await ctx.exec(spec);
    if (res.ok && sibling)
        fs.renameSync(sibling, out);
    if (!res.ok || !fs.existsSync(out) || fs.statSync(out).size === 0) {
        try {
            fs.rmSync(out, { force: true });
        }
        catch { /* nothing to clean */ }
        return { ...row, error: res.error || 'the converter produced no output' };
    }
    const from = fs.statSync(src).size;
    const to = fs.statSync(out).size;
    if (to >= from && !o.keepLarger) {
        fs.rmSync(out, { force: true });
        return { ...row, status: 'kept-original', from, to };
    }
    return { ...row, status: 'converted', from, to };
}
// ---- scan ----
function walk(dir, o, out, accept) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (SKIP_DIRS.has(e.name) || (BUILT_DIRS.has(e.name) && !o.built))
                continue;
            walk(p, o, out, accept);
        }
        else if (accept(p))
            out.push(p);
        if (out.length > 20000)
            return;
    }
}
function readDims(file) {
    try {
        const fd = fs.openSync(file, 'r');
        const b = Buffer.alloc(65536);
        const n = fs.readSync(fd, b, 0, b.length, 0);
        fs.closeSync(fd);
        const t = ext(file);
        if (t === 'png' && n >= 24 && b.readUInt32BE(0) === 0x89504e47)
            return [b.readUInt32BE(16), b.readUInt32BE(20)];
        if (t === 'gif' && n >= 10 && b.toString('latin1', 0, 3) === 'GIF')
            return [b.readUInt16LE(6), b.readUInt16LE(8)];
        if ((t === 'jpg' || t === 'jpeg') && b[0] === 0xff) {
            for (let i = 2; i + 9 < n;) {
                if (b[i] !== 0xff) {
                    i++;
                    continue;
                }
                const m = b[i + 1];
                if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m))
                    return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
                i += 2 + b.readUInt16BE(i + 2);
            }
        }
        if (t === 'webp' && b.toString('latin1', 8, 12) === 'WEBP') {
            const c = b.toString('latin1', 12, 16);
            if (c === 'VP8X')
                return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
            if (c === 'VP8 ')
                return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
            if (c === 'VP8L') {
                const v = b.readUInt32LE(21);
                return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)];
            }
        }
    }
    catch { /* unreadable: no dimensions */ }
    return null;
}
const SUGGEST = { image: 'webp or avif', svg: 'svg (svgo)', video: 'mp4', audio: 'opus', font: 'woff2' };
function scan(o) {
    const root = path.resolve(o.cwd, o.paths[0] || '.');
    const files = [];
    walk(root, o, files, (p) => KIND_BY_EXT[ext(p)] !== undefined);
    const rows = [];
    let total = 0;
    for (const f of files) {
        const e = ext(f);
        const kind = KIND_BY_EXT[e];
        const bytes = fs.statSync(f).size;
        total += bytes;
        const dims = kind === 'image' ? readDims(f) : null;
        const flags = [];
        if (kb(bytes) >= o.minKb)
            flags.push('big');
        if (dims && Math.max(...dims) > o.wide)
            flags.push('wide');
        if (['bmp', 'tif', 'tiff'].includes(e) || (e === 'gif' && kb(bytes) >= 50))
            flags.push('legacy');
        if (kind === 'font' && e !== 'woff2')
            flags.push('font-legacy');
        if (['wav', 'flac'].includes(e))
            flags.push('lossless');
        if (!flags.length)
            continue;
        const suggest = e === 'gif' ? 'mp4' : (e === 'webp' || e === 'avif') && kind === 'image' ? `resize ${e}` : e === 'svg' ? SUGGEST.svg : (SUGGEST[kind] === e ? `re-encode ${e}` : SUGGEST[kind]);
        rows.push({ file: norm(path.relative(o.cwd, f)), kind, kb: kb(bytes), width: dims ? dims[0] : undefined, height: dims ? dims[1] : undefined, flags, suggest });
    }
    rows.sort((a, b) => b.kb - a.kb);
    return { root: norm(path.relative(o.cwd, root)) || '.', assets: files.length, totalKb: kb(total), flagged: rows.length, flaggedKb: rows.reduce((s, r) => s + r.kb, 0), rows: rows.slice(0, o.top) };
}
// ---- refs ----
function refs(o) {
    const texts = [];
    walk(o.cwd, { ...o, built: false }, texts, (p) => TEXT_EXT.test(p));
    const out = {};
    for (const a of o.paths) {
        const name = path.basename(a);
        out[a] = [];
        for (const f of texts) {
            let s;
            try {
                s = fs.readFileSync(f, 'utf8');
            }
            catch {
                continue;
            }
            if (!s.includes(name))
                continue;
            s.split('\n').forEach((line, i) => { if (line.includes(name) && out[a].length < 50)
                out[a].push(`${norm(path.relative(o.cwd, f))}:${i + 1}`); });
        }
    }
    return out;
}
// Named files are always taken; folders are walked and filtered by accept.
function gather(o, accept) {
    return o.paths.flatMap((p) => {
        const abs = path.resolve(o.cwd, p);
        if (!fs.existsSync(abs))
            throw new Error(`${p} does not exist`);
        if (!fs.statSync(abs).isDirectory())
            return [abs];
        const found = [];
        walk(abs, o, found, accept);
        return found;
    });
}
const notOpt = (p) => !/\.opt\.[a-z0-9]+$/i.test(p);
function expand(o) {
    const want = TARGETS[o.to];
    return gather(o, (p) => notOpt(p) && (want === 'svg' ? ext(p) === 'svg' : kindFor(p, o.to) !== null && ext(p) !== o.to && !(o.to === 'jpg' && ext(p) === 'jpeg')));
}
// ---- compress: same format, smaller file ----
const CANON = { png: 'png', jpg: 'jpg', jpeg: 'jpg', webp: 'webp', avif: 'avif', svg: 'svg', mp4: 'mp4', webm: 'webm', mp3: 'mp3', opus: 'opus' };
async function compressAll(o, ctx) {
    const rows = [];
    for (const f of gather(o, (p) => notOpt(p) && CANON[ext(p)] !== undefined)) {
        const to = CANON[ext(f)];
        if (!to)
            rows.push({ file: norm(path.relative(o.cwd, f)), status: 'skipped', error: `.${ext(f)} has no same-format compression; use convert` });
        else
            rows.push(await convertFile(f, { ...o, to }, ctx));
    }
    return rows;
}
// ---- precompress: .gz and .br copies for a static host, Node's own zlib ----
const PRE_EXT = new Set(['css', 'js', 'mjs', 'html', 'htm', 'svg', 'json', 'xml', 'txt', 'map', 'wasm', 'ttf', 'otf', 'eot']);
function precompress(o) {
    const zlib = require('node:zlib');
    const rows = [];
    for (const f of gather(o, (p) => PRE_EXT.has(ext(p)))) {
        const src = fs.readFileSync(f);
        const algos = [o.gzip && ['gz', () => zlib.gzipSync(src, { level: 9 })], o.brotli && ['br', () => zlib.brotliCompressSync(src, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: src.length } })]].filter(Boolean);
        for (const [name, runAlgo] of algos) {
            const out = f + '.' + name;
            const row = { file: norm(path.relative(o.cwd, f)), out: norm(path.relative(o.cwd, out)), from: src.length, status: 'pending' };
            if (fs.existsSync(out) && !o.force) {
                rows.push({ ...row, status: 'skipped-exists' });
                continue;
            }
            const data = runAlgo();
            if (data.length >= src.length) {
                rows.push({ ...row, status: 'kept-original', to: data.length });
                continue;
            }
            if (!o.dry)
                fs.writeFileSync(out, data);
            rows.push({ ...row, status: o.dry ? 'planned' : 'converted', to: data.length });
        }
    }
    return rows;
}
function report(rows, o, note) {
    if (o.json) {
        console.log(JSON.stringify(rows, null, 1));
        return;
    }
    for (const r of rows) {
        const size = r.from ? `  ${kb(r.from)} -> ${kb(r.to)} KB (${Math.round((1 - r.to / r.from) * 100)}% smaller)` : '';
        console.log(`${r.status.toUpperCase().padEnd(13)} ${r.file}${r.out && r.status === 'converted' ? ' -> ' + r.out : ''}${size}${r.error ? '  ' + r.error : ''}${r.command ? '\n  ' + r.command : ''}`);
    }
    const done = rows.filter((r) => r.status === 'converted');
    const saved = o.targets.length > 1 || o.cmd === 'precompress' ? '' : `, ${kb(done.reduce((s, r) => s + r.from - r.to, 0))} KB saved`;
    if (done.length)
        console.log(`${done.length} written${saved}. ${note}`);
}
async function main() {
    const o = parseArgs(process.argv.slice(2));
    if (o.cmd === 'tools') {
        const t = detectTools(o.cwd);
        if (o.json) {
            console.log(JSON.stringify(t, null, 1));
            return;
        }
        const rows = [['sharp', t.sharp, 'images: png jpg webp avif'], ['magick', t.magick, 'images: png jpg webp'], ['ffmpeg', t.ffmpeg, 'video, audio, gif to mp4; images: png jpg webp'], ['svgo', t.svgo, 'svg'], ['woff2', t.woff2, 'fonts to woff2'], ['oxipng', t.oxipng, 'lossless png recompression (compress --lossless)']];
        for (const [n, have, what] of rows)
            console.log(`${n.padEnd(7)} ${have ? 'found    ' : 'missing  '} ${what}`);
        return;
    }
    if (o.cmd === 'scan') {
        const s = scan(o);
        if (o.json) {
            console.log(JSON.stringify(s, null, 1));
            return;
        }
        console.log(`${s.root}: ${s.assets} assets, ${s.totalKb} KB; ${s.flagged} flagged, ${s.flaggedKb} KB`);
        for (const r of s.rows)
            console.log(`${String(r.kb).padStart(7)} KB  ${r.file}  ${r.width ? r.width + 'x' + r.height + '  ' : ''}${r.flags.join(',')}  -> ${r.suggest}`);
        return;
    }
    if (o.cmd === 'refs') {
        const r = refs(o);
        if (o.json) {
            console.log(JSON.stringify(r, null, 1));
            return;
        }
        for (const [a, hits] of Object.entries(r))
            console.log(`${a}: ${hits.length ? hits.join(', ') : 'no references found'}`);
        return;
    }
    let rows = [];
    let note = 'Originals untouched; run "refs" before switching references.';
    if (o.cmd === 'precompress') {
        rows = precompress(o);
        note = 'Serve them with Content-Encoding via the host config; the originals are untouched.';
    }
    else {
        const ctx = { tools: detectTools(o.cwd), exec: defaultExec };
        if (o.cmd === 'compress')
            rows = await compressAll(o, ctx);
        else
            for (const to of o.targets) {
                const per = { ...o, to };
                for (const f of expand(per))
                    rows.push(await convertFile(f, per, ctx));
            }
    }
    if (!rows.length)
        throw new Error('no matching files found');
    report(rows, o, note);
    if (rows.some((r) => r.status === 'error'))
        process.exitCode = 1;
}
if (require.main === module)
    main().catch((e) => { console.error('error: ' + e.message); process.exitCode = 2; });
