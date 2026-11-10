#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fmt = void 0;
exports.findDist = findDist;
exports.checkHtml = checkHtml;
exports.weigh = weigh;
exports.render = render;
// Static payload weigh-in for the perf-audit skill (Step 1 and the static half of Step 2). One ranked table instead of
// a dozen ls, du and grep calls the model would otherwise read line by line. Reads files only; never edits, no network.
//
//   node weigh.js [--cwd D] [--dist DIR] [--src DIR] [--top N] [--json]
//
// Finds the production build folder (dist, build, out, .output/public, .next/static, public) or takes --dist.
// Reports: JS and CSS totals, every chunk over 150 KB gzip, images over 200 KB, PNG and JPEG with no WebP/AVIF sibling,
// font files (count, missing font-display), and in the HTML: blocking scripts in <head>, third-party scripts,
// images without loading="lazy", a missing fetchpriority="high", unhashed asset names. Thresholds are the skill's.
// Exit codes: 0 done, 1 error, 2 bad usage. Output goes to stdout; notices to stderr.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const KB = 1024;
const CHUNK_GZIP_LIMIT = 150 * KB;
const IMAGE_LIMIT = 200 * KB;
const FONT_FILE_LIMIT = 4;
const DIST_CANDIDATES = ['dist', 'build', 'out', '.output/public', '.next/static', '_site', 'public'];
const SRC_CANDIDATES = ['src', 'app', 'pages', 'public', 'assets', 'static', '.'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', 'coverage', 'test-results', 'playwright-report']);
const IMG = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const RASTER_LEGACY = /\.(png|jpe?g)$/i;
const FONT = /\.(woff2?|ttf|otf|eot)$/i;
const VIDEO = /\.(mp4|webm|mov|m4v)$/i;
const JS = /\.(m?js|cjs)$/i;
const CSS = /\.css$/i;
const HTML = /\.html?$/i;
const HASHED = /[.-][a-f0-9]{6,}\.(m?js|css|woff2?|png|jpe?g|webp|avif|svg)$/i;
const norm = (p) => p.split(path.sep).join('/');
const fmt = (n) => (n >= KB * KB ? (n / KB / KB).toFixed(1) + ' MB' : Math.round(n / KB) + ' KB');
exports.fmt = fmt;
function walk(dir, out = []) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    }
    catch {
        return out;
    }
    for (const e of entries) {
        if (SKIP_DIRS.has(e.name))
            continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory())
            walk(p, out);
        else if (e.isFile())
            out.push(p);
    }
    return out;
}
function findDist(cwd) {
    for (const c of DIST_CANDIDATES) {
        const p = path.join(cwd, c);
        if (!fs.existsSync(p) || !fs.statSync(p).isDirectory())
            continue;
        const files = walk(p);
        if (files.some((f) => JS.test(f) || HTML.test(f)))
            return p;
    }
    return null;
}
function gzipSize(file) {
    try {
        return zlib.gzipSync(fs.readFileSync(file), { level: 6 }).length;
    }
    catch {
        return 0;
    }
}
function fontDisplay(cssFiles) {
    if (!cssFiles.length)
        return 'no-css';
    let faces = 0, swap = 0, other = 0;
    for (const f of cssFiles) {
        const text = fs.readFileSync(f, 'utf8');
        for (const m of text.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
            faces++;
            const d = /font-display\s*:\s*([a-z-]+)/i.exec(m[1]);
            if (!d)
                continue;
            if (d[1].toLowerCase() === 'swap' || d[1].toLowerCase() === 'optional')
                swap++;
            else
                other++;
        }
    }
    if (!faces)
        return 'no-css';
    if (swap === faces)
        return 'swap';
    return swap + other === faces ? 'other' : 'missing';
}
const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, '');
function checkHtml(file, html, rel) {
    const out = [];
    const h = stripComments(html);
    const head = /<head[\s\S]*?<\/head>/i.exec(h)?.[0] ?? '';
    for (const m of head.matchAll(/<script\b([^>]*)>/gi)) {
        const attrs = m[1];
        if (/\btype\s*=\s*["']?(module|application\/ld\+json|application\/json)/i.test(attrs))
            continue;
        if (!/\bsrc\s*=/i.test(attrs))
            continue;
        if (/\b(async|defer)\b/i.test(attrs))
            continue;
        const src = /\bsrc\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1] ?? '?';
        out.push({ file: rel, kind: 'blocking-script', detail: src });
    }
    for (const m of h.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']?(https?:)?\/\/([^/"'\s>]+)[^>]*>/gi)) {
        if (/\b(async|defer)\b/i.test(m[0]))
            continue;
        out.push({ file: rel, kind: 'third-party-sync', detail: m[2] });
    }
    for (const m of head.matchAll(/<link\b[^>]*\brel\s*=\s*["']?stylesheet["']?[^>]*>/gi)) {
        if (/\bmedia\s*=\s*["']?print/i.test(m[0]))
            continue;
        if (/\bhref\s*=\s*["']?(https?:)?\/\//i.test(m[0]))
            out.push({ file: rel, kind: 'third-party-css', detail: /\bhref\s*=\s*["']?([^"'\s>]+)/i.exec(m[0])?.[1] ?? '?' });
    }
    const imgs = [...h.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
    if (imgs.length) {
        const lazy = imgs.filter((i) => /\bloading\s*=\s*["']?lazy/i.test(i)).length;
        const eager = imgs.length - lazy;
        if (imgs.length >= 3 && eager > 1)
            out.push({ file: rel, kind: 'eager-images', detail: `${eager} of ${imgs.length} <img> without loading="lazy"` });
        const priority = imgs.some((i) => /\bfetchpriority\s*=\s*["']?high/i.test(i)) || /<link\b[^>]*\brel\s*=\s*["']?preload["']?[^>]*\bas\s*=\s*["']?image/i.test(head);
        if (!priority)
            out.push({ file: rel, kind: 'no-lcp-priority', detail: 'no fetchpriority="high" image and no image preload' });
        const noDims = imgs.filter((i) => !/\bwidth\s*=/i.test(i) || !/\bheight\s*=/i.test(i)).length;
        if (noDims)
            out.push({ file: rel, kind: 'img-no-dimensions', detail: `${noDims} <img> without width and height (layout shift)` });
    }
    if (/<link\b[^>]*fonts\.googleapis\.com/i.test(head) && !/<link\b[^>]*\brel\s*=\s*["']?preconnect["']?[^>]*fonts\.gstatic\.com/i.test(head)) {
        out.push({ file: rel, kind: 'font-no-preconnect', detail: 'Google Fonts without preconnect to fonts.gstatic.com' });
    }
    void file;
    return out;
}
function weigh(cwd, opt = {}) {
    const notes = [];
    const dist = opt.dist ? path.resolve(cwd, opt.dist) : findDist(cwd);
    if (opt.dist && !fs.existsSync(dist))
        throw new Error('no such folder: ' + dist);
    let scanRoot = dist;
    if (!dist) {
        const src = opt.src ? path.resolve(cwd, opt.src) : SRC_CANDIDATES.map((c) => path.join(cwd, c)).find((p) => fs.existsSync(p)) ?? cwd;
        scanRoot = src;
        notes.push('no production build folder found; weighed source under ' + norm(path.relative(cwd, src) || '.') + ' (build first for real chunk sizes)');
    }
    const files = walk(scanRoot);
    const rel = (f) => norm(path.relative(cwd, f));
    const info = (f) => ({ file: rel(f), size: fs.statSync(f).size });
    const jsFiles = files.filter((f) => JS.test(f) && !/\.map$/.test(f));
    const cssFiles = files.filter((f) => CSS.test(f));
    const imgFiles = files.filter((f) => IMG.test(f)).map(info);
    const fontFiles = files.filter((f) => FONT.test(f)).map(info);
    const videoFiles = files.filter((f) => VIDEO.test(f)).map(info).sort((a, b) => b.size - a.size);
    const chunks = jsFiles.map((f) => ({ ...info(f), gzip: gzipSize(f) }));
    const cssChunks = cssFiles.map((f) => ({ ...info(f), gzip: gzipSize(f) }));
    const sum = (xs) => xs.reduce((a, x) => a + x.size, 0);
    const sumGz = (xs) => xs.reduce((a, x) => a + x.gzip, 0);
    const heavyChunks = [...chunks, ...cssChunks].filter((c) => c.gzip > CHUNK_GZIP_LIMIT).sort((a, b) => b.gzip - a.gzip);
    const heavyImages = imgFiles.filter((i) => i.size > IMAGE_LIMIT).sort((a, b) => b.size - a.size);
    const stems = new Set(imgFiles.map((i) => i.file.replace(/\.[^.]+$/, '')));
    const modern = new Set([...stems].filter((s) => imgFiles.some((i) => i.file === s + '.webp' || i.file === s + '.avif')));
    const legacyRasters = imgFiles.filter((i) => RASTER_LEGACY.test(i.file) && i.size > 20 * KB && !modern.has(i.file.replace(/\.[^.]+$/, ''))).sort((a, b) => b.size - a.size);
    const html = [];
    for (const f of files.filter((x) => HTML.test(x)))
        html.push(...checkHtml(f, fs.readFileSync(f, 'utf8'), rel(f)));
    const assetFiles = dist ? files.filter((f) => (JS.test(f) || CSS.test(f)) && !/\.map$/.test(f)) : [];
    const unhashed = assetFiles.filter((f) => !HASHED.test(path.basename(f))).length;
    const top = opt.top ?? 10;
    return {
        dist: dist ? rel(dist) : null,
        totals: { js: sum(chunks), jsGzip: sumGz(chunks), css: sum(cssChunks), cssGzip: sumGz(cssChunks), images: sum(imgFiles), fonts: sum(fontFiles), video: sum(videoFiles), files: files.length },
        heavyChunks: heavyChunks.slice(0, top),
        heavyImages: heavyImages.slice(0, top),
        legacyRasters: legacyRasters.slice(0, top),
        video: videoFiles.slice(0, top),
        fonts: { files: fontFiles, display: fontDisplay(cssFiles) },
        html: html.slice(0, top * 2),
        unhashed,
        notes,
    };
}
function render(r) {
    const L = [];
    L.push(r.dist ? `Build folder: ${r.dist} (${r.totals.files} files)` : `Source weigh-in (${r.totals.files} files)`);
    for (const n of r.notes)
        L.push('note: ' + n);
    L.push('');
    L.push('Totals         raw        gzip');
    L.push(`  JS       ${(0, exports.fmt)(r.totals.js).padStart(9)}  ${(0, exports.fmt)(r.totals.jsGzip).padStart(9)}`);
    L.push(`  CSS      ${(0, exports.fmt)(r.totals.css).padStart(9)}  ${(0, exports.fmt)(r.totals.cssGzip).padStart(9)}`);
    L.push(`  images   ${(0, exports.fmt)(r.totals.images).padStart(9)}`);
    L.push(`  fonts    ${(0, exports.fmt)(r.totals.fonts).padStart(9)}  (${r.fonts.files.length} files, font-display: ${r.fonts.display})`);
    if (r.totals.video)
        L.push(`  video    ${(0, exports.fmt)(r.totals.video).padStart(9)}`);
    const section = (title, rows) => { if (rows.length) {
        L.push('');
        L.push(title);
        for (const x of rows)
            L.push('  ' + x);
    } };
    section(`Chunks over ${(0, exports.fmt)(CHUNK_GZIP_LIMIT)} gzip:`, r.heavyChunks.map((c) => `${(0, exports.fmt)(c.gzip).padStart(8)} gz  ${(0, exports.fmt)(c.size).padStart(8)} raw  ${c.file}`));
    section(`Images over ${(0, exports.fmt)(IMAGE_LIMIT)}:`, r.heavyImages.map((i) => `${(0, exports.fmt)(i.size).padStart(8)}  ${i.file}`));
    section('PNG/JPEG with no WebP or AVIF sibling:', r.legacyRasters.map((i) => `${(0, exports.fmt)(i.size).padStart(8)}  ${i.file}`));
    section('Video:', r.video.map((i) => `${(0, exports.fmt)(i.size).padStart(8)}  ${i.file}`));
    if (r.fonts.files.length > FONT_FILE_LIMIT)
        section(`Fonts (${r.fonts.files.length} files, limit ${FONT_FILE_LIMIT}):`, r.fonts.files.map((f) => `${(0, exports.fmt)(f.size).padStart(8)}  ${f.file}`));
    else if (r.fonts.display === 'missing' || r.fonts.display === 'other')
        L.push(`  font-display: ${r.fonts.display === 'missing' ? 'missing on some @font-face' : 'set but not swap/optional'}`);
    section('HTML loading:', r.html.map((h) => `${h.kind.padEnd(18)} ${h.file}: ${h.detail}`));
    if (r.unhashed) {
        L.push('');
        L.push(`Unhashed JS/CSS file names in the build: ${r.unhashed} (long-lived caching needs content hashes)`);
    }
    const flags = r.heavyChunks.length + r.heavyImages.length + r.legacyRasters.length + r.html.length + (r.fonts.files.length > FONT_FILE_LIMIT ? 1 : 0) + (r.unhashed ? 1 : 0);
    L.push('');
    L.push(flags ? `${flags} static findings. Rank by bytes, then check the runtime half (Step 3) in a browser.` : 'No static findings over the thresholds. Go to the runtime half (Step 3).');
    return L.join('\n');
}
function parse(argv) {
    const a = { cwd: process.cwd(), top: 10, json: false };
    for (let i = 0; i < argv.length; i++) {
        const f = argv[i];
        if (f === '--cwd')
            a.cwd = path.resolve(argv[++i] ?? '');
        else if (f === '--dist')
            a.dist = argv[++i];
        else if (f === '--src')
            a.src = argv[++i];
        else if (f === '--top')
            a.top = Number(argv[++i]);
        else if (f === '--json')
            a.json = true;
        else
            return null;
    }
    if (!(a.top > 0) || (a.dist !== undefined && !a.dist) || (a.src !== undefined && !a.src))
        return null;
    return a;
}
function main() {
    const a = parse(process.argv.slice(2));
    if (!a) {
        console.error('usage: weigh.js [--cwd D] [--dist DIR] [--src DIR] [--top N] [--json]');
        process.exitCode = 2;
        return;
    }
    try {
        const r = weigh(a.cwd, a);
        console.log(a.json ? JSON.stringify(r) : render(r));
    }
    catch (e) {
        console.error('error: ' + e.message);
        process.exitCode = 1;
    }
}
if (require.main === module)
    main();
