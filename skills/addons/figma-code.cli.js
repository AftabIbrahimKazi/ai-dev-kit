#!/usr/bin/env node
"use strict";
// figma-code: turn an exported Figma SVG into HTML and CSS that matches it pixel for pixel, with no model in the
// critical path. Three passes, each gated by a pixel diff against the SVG rendered in a headless browser:
//   build      SVG -> index.html + styles.css (real text, flex rows and columns where the geometry is exact,
//              inline SVG for anything CSS cannot draw exactly), then render both and diff
//   standards  rename classes and tidy values by the rules in figma-code.standards.json; a risky rule that moves
//              the diff is reverted on its own
//   adapt      emit a component for the project's framework (Next, Astro, Laravel Blade) and diff it again
// Plain Node, no dependencies; the browser is the only external tool (Chrome or Edge).
//
//   node cli.js detect [--root D]
//   node cli.js build <file.svg> [--name N] [--out DIR] [--max-diff P] [--tol N] [--no-fail] [--json]
//   node cli.js diff <a> <b> [--width W --height H] [--tol N] [--max-diff P] [--no-fail] [--json]     (png, html or svg)
//   node cli.js standards <dir> [--rules FILE] [--max-diff P] [--dry-run] [--no-fail] [--json]
//   node cli.js adapt <dir> [--root D] [--framework next|astro|laravel|plain] [--max-diff P] [--dry-run] [--no-fail] [--json]
//
// Pixel match is guaranteed only at the exported width and with the same fonts installed; the diff cannot tell a
// layout bug from a missing font, so missing fonts are reported first. Nothing outside --out and the framework
// folders named in the report is written, and an existing component is never overwritten without --force.
// Exit codes: 0 done, 1 the diff is over --max-diff, 2 bad usage, 3 no browser.
Object.defineProperty(exports, "__esModule", { value: true });
exports.findChrome = findChrome;
exports.screenshot = screenshot;
exports.decodePng = decodePng;
exports.encodePng = encodePng;
exports.diffImages = diffImages;
exports.installedFonts = installedFonts;
exports.missingFonts = missingFonts;
exports.parseXml = parseXml;
exports.parseSvg = parseSvg;
exports.buildTree = buildTree;
exports.emit = emit;
exports.build = build;
exports.loadRules = loadRules;
exports.applyRule = applyRule;
exports.standards = standards;
exports.detectFramework = detectFramework;
exports.toJsx = toJsx;
exports.fromJsx = fromJsx;
exports.adapt = adapt;
exports.renderBuild = renderBuild;
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cp = require("node:child_process");
const zlib = require("node:zlib");
// ============================================================ shared helpers
const r2 = (n) => Math.round(n * 100) / 100;
const px = (n) => (r2(n) === 0 ? '0' : r2(n) + 'px');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escT = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const norm = (p) => p.split(path.sep).join('/');
class Usage extends Error {
}
class Blocked extends Error {
}
// ============================================================ 4a: browser, PNG, diff
function findChrome() {
    const env = process.env.CHROME || process.env.CHROME_PATH;
    if (env && fs.existsSync(env))
        return env;
    const pf = [process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'], process.env['LOCALAPPDATA']].filter(Boolean);
    const cands = [
        ...pf.flatMap((b) => [path.join(b, 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(b, 'Microsoft', 'Edge', 'Application', 'msedge.exe')]),
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium',
    ];
    return cands.find((c) => fs.existsSync(c)) || null;
}
const fileUrl = (p) => 'file:///' + norm(path.resolve(p)).replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:');
// Renders a page (html or svg file) at an exact viewport size to a PNG. The window size can include browser chrome in some
// headless builds, so the result is checked and the call fails with the real size when it is not what was asked.
function screenshot(file, w, h, out) {
    const chrome = findChrome();
    if (!chrome)
        throw new Blocked('no Chrome or Edge found. Install Chrome, or set CHROME to the browser file.');
    const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-code-chrome-'));
    try {
        fs.rmSync(out, { force: true });
        cp.spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--force-device-scale-factor=1', '--default-background-color=ffffffff',
            `--user-data-dir=${prof}`, `--window-size=${w},${h}`, '--virtual-time-budget=3000', `--screenshot=${out}`, fileUrl(file)], { stdio: 'ignore', timeout: 60000 });
    }
    finally {
        fs.rmSync(prof, { recursive: true, force: true });
    }
    if (!fs.existsSync(out))
        throw new Error(`the browser wrote no screenshot for ${file}`);
    const img = decodePng(fs.readFileSync(out));
    if (img.w !== w || img.h !== h) {
        // Some builds add a strip below the page; crop a taller shot back to the asked size, refuse a smaller one.
        if (img.w === w && img.h > h)
            fs.writeFileSync(out, encodePng(cropImg(img, w, h)));
        else
            throw new Error(`the screenshot of ${path.basename(file)} is ${img.w}x${img.h}, expected ${w}x${h}`);
    }
}
function decodePng(buf) {
    if (buf.length < 33 || buf.toString('latin1', 1, 4) !== 'PNG')
        throw new Error('not a PNG file');
    let off = 8, w = 0, h = 0, depth = 0, ctype = 0, inter = 0;
    let pal = null, trns = null;
    const idat = [];
    while (off + 8 <= buf.length) {
        const len = buf.readUInt32BE(off), type = buf.toString('latin1', off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
        if (type === 'IHDR') {
            w = data.readUInt32BE(0);
            h = data.readUInt32BE(4);
            depth = data[8];
            ctype = data[9];
            inter = data[12];
        }
        else if (type === 'PLTE')
            pal = data;
        else if (type === 'tRNS')
            trns = data;
        else if (type === 'IDAT')
            idat.push(data);
        else if (type === 'IEND')
            break;
        off += 12 + len;
    }
    if (depth !== 8 || inter !== 0)
        throw new Error(`unsupported PNG (bit depth ${depth}, interlace ${inter}); only 8-bit non-interlaced is read`);
    const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
    if (!ch)
        throw new Error('unsupported PNG color type ' + ctype);
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = w * ch, cur = Buffer.alloc(stride), prev = Buffer.alloc(stride);
    const out = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
        const ft = raw[y * (stride + 1)];
        const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        for (let i = 0; i < stride; i++) {
            const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
            let v = src[i];
            if (ft === 1)
                v += a;
            else if (ft === 2)
                v += b;
            else if (ft === 3)
                v += (a + b) >> 1;
            else if (ft === 4) {
                const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            }
            cur[i] = v & 255;
        }
        for (let x = 0; x < w; x++) {
            const o = (y * w + x) * 4;
            if (ctype === 6) {
                out[o] = cur[x * 4];
                out[o + 1] = cur[x * 4 + 1];
                out[o + 2] = cur[x * 4 + 2];
                out[o + 3] = cur[x * 4 + 3];
            }
            else if (ctype === 2) {
                out[o] = cur[x * 3];
                out[o + 1] = cur[x * 3 + 1];
                out[o + 2] = cur[x * 3 + 2];
                out[o + 3] = 255;
            }
            else if (ctype === 0) {
                out[o] = out[o + 1] = out[o + 2] = cur[x];
                out[o + 3] = 255;
            }
            else if (ctype === 4) {
                out[o] = out[o + 1] = out[o + 2] = cur[x * 2];
                out[o + 3] = cur[x * 2 + 1];
            }
            else {
                const k = cur[x];
                out[o] = pal[k * 3];
                out[o + 1] = pal[k * 3 + 1];
                out[o + 2] = pal[k * 3 + 2];
                out[o + 3] = trns && k < trns.length ? trns[k] : 255;
            }
        }
        cur.copy(prev);
    }
    return { w, h, px: out };
}
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++)
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
} return t; })();
const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++)
    c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function encodePng(img) {
    const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length); return b; };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(img.w, 0);
    ihdr.writeUInt32BE(img.h, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const raw = Buffer.alloc(img.h * (img.w * 4 + 1));
    for (let y = 0; y < img.h; y++)
        Buffer.from(img.px.buffer, img.px.byteOffset + y * img.w * 4, img.w * 4).copy(raw, y * (img.w * 4 + 1) + 1);
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function cropImg(img, w, h) {
    const out = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++)
        out.set(img.px.subarray(y * img.w * 4, y * img.w * 4 + w * 4), y * w * 4);
    return { w, h, px: out };
}
// A pixel differs when any channel is off by more than `tol` (of 255): anti-aliasing never matches bit for bit.
// Failing pixels are grouped into 16 px cells, joined when they touch, and reported as boxes, worst first.
function diffImages(a, b, tol = 16) {
    const w = Math.min(a.w, b.w), h = Math.min(a.h, b.h);
    const sizeMismatch = a.w !== b.w || a.h !== b.h ? `sizes differ: ${a.w}x${a.h} vs ${b.w}x${b.h}` : null;
    const total = Math.max(a.w * a.h, b.w * b.h);
    const CELL = 16, cw = Math.ceil(w / CELL), ch = Math.ceil(h / CELL);
    const cells = new Int32Array(cw * ch);
    let differing = Math.abs(a.w * a.h - b.w * b.h);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = (y * a.w + x) * 4, j = (y * b.w + x) * 4;
            if (Math.abs(a.px[i] - b.px[j]) > tol || Math.abs(a.px[i + 1] - b.px[j + 1]) > tol || Math.abs(a.px[i + 2] - b.px[j + 2]) > tol || Math.abs(a.px[i + 3] - b.px[j + 3]) > tol) {
                differing++;
                cells[Math.floor(y / CELL) * cw + Math.floor(x / CELL)]++;
            }
        }
    const seen = new Uint8Array(cw * ch), boxes = [];
    for (let s = 0; s < cells.length; s++) {
        if (!cells[s] || seen[s])
            continue;
        const q = [s];
        seen[s] = 1;
        let x0 = cw, y0 = ch, x1 = 0, y1 = 0, count = 0;
        while (q.length) {
            const c = q.pop(), cx = c % cw, cy = Math.floor(c / cw);
            count += cells[c];
            x0 = Math.min(x0, cx);
            y0 = Math.min(y0, cy);
            x1 = Math.max(x1, cx);
            y1 = Math.max(y1, cy);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = cx + dx, ny = cy + dy;
                if (nx < 0 || ny < 0 || nx >= cw || ny >= ch)
                    continue;
                const n = ny * cw + nx;
                if (cells[n] && !seen[n]) {
                    seen[n] = 1;
                    q.push(n);
                }
            }
        }
        boxes.push({ x: x0 * CELL, y: y0 * CELL, w: Math.min(w, (x1 + 1) * CELL) - x0 * CELL, h: Math.min(h, (y1 + 1) * CELL) - y0 * CELL, count });
    }
    boxes.sort((p, q) => q.count - p.count);
    return { w, h, total, differing, percent: total ? Math.round((differing / total) * 10000) / 100 : 0, boxes: boxes.slice(0, 8), sizeMismatch };
}
// Families named in the design that this machine does not have. Best effort: Windows registry, fc-list, or font folders.
const GENERIC = new Set(['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'inherit', 'initial']);
function installedFonts() {
    try {
        if (process.platform === 'win32') {
            const out = ['HKLM', 'HKCU'].map((h) => cp.spawnSync('reg', ['query', `${h}\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts`], { encoding: 'utf8' }).stdout || '').join('\n');
            const names = [...out.matchAll(/^\s{4}(.+?)\s+REG_SZ/gm)].map((m) => m[1].replace(/\s*\((TrueType|OpenType|All res)\)\s*$/i, ''));
            const user = cp.spawnSync('reg', ['query', 'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'], { encoding: 'utf8' }).stdout || '';
            return names.concat([...user.matchAll(/^\s{4}(.+?)\s+REG_SZ/gm)].map((m) => m[1])).map((s) => s.toLowerCase());
        }
        const r = cp.spawnSync('fc-list', [':', 'family'], { encoding: 'utf8' });
        if (r.status === 0)
            return r.stdout.split('\n').flatMap((l) => l.split(',')).map((s) => s.trim().toLowerCase()).filter(Boolean);
        const dirs = ['/Library/Fonts', '/System/Library/Fonts', path.join(os.homedir(), 'Library', 'Fonts')];
        return dirs.flatMap((d) => { try {
            return fs.readdirSync(d);
        }
        catch {
            return [];
        } }).map((f) => f.replace(/\.[a-z0-9]+$/i, '').toLowerCase());
    }
    catch {
        return null;
    }
}
function missingFonts(families, installed = installedFonts()) {
    if (!installed)
        return { missing: [], checked: false };
    const miss = families.filter((f) => !GENERIC.has(f.toLowerCase()) && !installed.some((i) => i === f.toLowerCase() || i.startsWith(f.toLowerCase() + ' ') || i.replace(/[\s_-]/g, '').startsWith(f.toLowerCase().replace(/[\s_-]/g, ''))));
    return { missing: [...new Set(miss)], checked: true };
}
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const dec = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? m));
function parseXml(src) {
    const root = { tag: '#root', attrs: {}, kids: [] };
    const stack = [root];
    const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<![A-Za-z][^>]*>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>|([^<]+)/g;
    for (let m; (m = re.exec(src));) {
        const top = stack[stack.length - 1];
        if (m[1] !== undefined)
            top.kids.push(m[1]);
        else if (m[2]) {
            if (stack.length > 1)
                stack.pop();
        }
        else if (m[3]) {
            const attrs = {};
            for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
                attrs[a[1]] = dec(a[2] ?? a[3]);
            const n = { tag: m[3], attrs, kids: [] };
            top.kids.push(n);
            if (!m[5])
                stack.push(n);
        }
        else if (m[6] !== undefined && stack.length > 1)
            top.kids.push(dec(m[6]));
    }
    return root;
}
const ser = (n) => (typeof n === 'string' ? escT(n) : `<${n.tag}${Object.entries(n.attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join('')}${n.kids.length ? '>' + n.kids.map(ser).join('') + `</${n.tag}>` : '/>'}`);
const kidsOf = (n) => n.kids.filter((k) => typeof k !== 'string');
const textOf = (n) => n.kids.map((k) => (typeof k === 'string' ? k : textOf(k))).join('');
const INHERITED = ['fill', 'fill-opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'text-anchor'];
function styleOf(n, parent, classes) {
    const s = {};
    for (const k of INHERITED)
        if (parent[k] !== undefined)
            s[k] = parent[k];
    for (const c of (n.attrs.class || '').split(/\s+/).filter(Boolean))
        Object.assign(s, classes[c] || {});
    for (const [k, v] of Object.entries(n.attrs))
        if (k !== 'style' && k !== 'class')
            s[k] = v;
    for (const d of (n.attrs.style || '').split(';')) {
        const i = d.indexOf(':');
        if (i > 0)
            s[d.slice(0, i).trim()] = d.slice(i + 1).trim();
    }
    return s;
}
// Ascent and descent as a fraction of the font size (hhea, from the font files). The browser rounds each to whole pixels,
// so a line box of exactly round(a*size)+round(d*size) puts the baseline round(a*size) below the top. Unknown fonts use
// the Arial values and are listed in the report as assumed.
const METRICS = {
    arial: [0.905, 0.212], helvetica: [0.905, 0.212], 'helvetica neue': [0.952, 0.213], inter: [0.96875, 0.2412], roboto: [0.927, 0.244],
    'segoe ui': [1.079, 0.251], poppins: [1.05, 0.35], 'open sans': [1.069, 0.293], 'times new roman': [0.891, 0.216], georgia: [0.917, 0.219],
    verdana: [1.005, 0.21], 'courier new': [0.833, 0.3], 'sans-serif': [0.905, 0.212], serif: [0.891, 0.216], monospace: [0.833, 0.3],
};
const firstFamily = (f) => (f || 'sans-serif').split(',')[0].trim().replace(/^['"]|['"]$/g, '');
const NAMED = new Set(['white', 'black', 'red', 'green', 'blue', 'gray', 'grey', 'yellow', 'orange', 'purple', 'pink', 'transparent', 'silver', 'navy', 'teal', 'maroon', 'lime', 'aqua', 'fuchsia', 'olive']);
const toRgb = (c) => {
    c = c.trim().toLowerCase();
    let m = /^#([0-9a-f]{3})$/.exec(c);
    if (m)
        return [...m[1]].map((x) => parseInt(x + x, 16));
    m = /^#([0-9a-f]{6})$/.exec(c);
    if (m)
        return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    m = /^rgb\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*\)$/.exec(c);
    if (m)
        return [+m[1], +m[2], +m[3]];
    return null;
};
// CSS color for a fill with an optional alpha, or null when the paint is not a flat color (gradient, pattern, currentColor).
function cssColor(fill, alpha) {
    if (fill === undefined)
        fill = 'black';
    const f = fill.trim().toLowerCase();
    if (f === 'none' || f === 'transparent')
        return 'transparent';
    const rgb = toRgb(f);
    if (rgb)
        return alpha >= 1 ? f : `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${r2(alpha)})`;
    if (NAMED.has(f))
        return alpha >= 1 ? f : null;
    return null;
}
const alphaOf = (s) => Math.max(0, Math.min(1, parseFloat(s.opacity ?? '1') * parseFloat(s['fill-opacity'] ?? '1')));
const REFS = /url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)|(?:xlink:)?href\s*=\s*"#([^"]+)"/g;
function parseSvg(svgText, srcDir = '.') {
    const doc = parseXml(svgText);
    const svg = kidsOf(doc).find((k) => k.tag === 'svg');
    if (!svg)
        throw new Usage('not an SVG file: no <svg> element');
    const vb = (svg.attrs.viewBox || '').split(/[\s,]+/).map(Number);
    const num = (v) => (v && /^[\d.]+(px)?$/.test(v.trim()) ? parseFloat(v) : null);
    const width = num(svg.attrs.width) ?? (vb.length === 4 ? vb[2] : 0), height = num(svg.attrs.height) ?? (vb.length === 4 ? vb[3] : 0);
    if (!width || !height)
        throw new Usage('the SVG has no width and height (or viewBox)');
    const hasVb = vb.length === 4 && vb.every((n) => !Number.isNaN(n));
    const s0 = hasVb && vb[2] ? width / vb[2] : 1;
    const notes = [];
    const classes = {};
    const byId = new Map();
    (function index(n) { if (n.attrs.id)
        byId.set(n.attrs.id, n); kidsOf(n).forEach(index); })(svg);
    (function css(n) {
        if (n.tag === 'style')
            for (const m of textOf(n).matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)) {
                const st = {};
                for (const d of m[2].split(';')) {
                    const i = d.indexOf(':');
                    if (i > 0)
                        st[d.slice(0, i).trim()] = d.slice(i + 1).trim();
                }
                classes[m[1]] = { ...(classes[m[1]] || {}), ...st };
            }
        kidsOf(n).forEach(css);
    })(svg);
    const leaves = [];
    const families = new Set(), assumed = new Set(), assets = new Set();
    let texts = 0, raws = 0;
    // Everything an element refers to by id (gradients, clips, filters, patterns and what they use), so a raw layer is self-contained.
    const refsOf = (xml, out = new Set()) => {
        for (const m of xml.matchAll(REFS)) {
            const id = m[1] || m[2];
            if (id && !out.has(id) && byId.has(id)) {
                out.add(id);
                refsOf(ser(byId.get(id)), out);
            }
        }
        return out;
    };
    const raw = (el, ctx, why) => {
        let body = ser(el);
        for (const m of body.matchAll(/(?:xlink:)?href="(?!data:|#|https?:)([^"]+)"/g))
            assets.add(m[1]);
        const defs = [...refsOf(body)].map((id) => ser(byId.get(id))).join('');
        for (const a of ctx.ancestors.slice().reverse())
            body = `<${a.tag}${Object.entries(a.attrs).filter(([k]) => k !== 'id').map(([k, v]) => ` ${k}="${esc(v)}"`).join('')}>${body}</${a.tag}>`;
        const attrs = Object.entries(svg.attrs).filter(([k]) => !/^(xmlns|id|class|style)/.test(k) || k === 'xmlns').map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
        const rawSvg = `<svg${attrs.includes('xmlns=') ? '' : ' xmlns="http://www.w3.org/2000/svg"'}${attrs.includes('xmlns:xlink') ? '' : ' xmlns:xlink="http://www.w3.org/1999/xlink"'}${attrs}>${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;
        leaves.push({ kind: 'raw', x: 0, y: 0, w: width, h: height, css: {}, role: 'raw', raw: rawSvg });
        raws++;
        notes.push({ kind: 'inline-svg', detail: `<${el.tag}${el.attrs.id ? ' id="' + el.attrs.id + '"' : ''}> kept as inline SVG: ${why}` });
    };
    const walk = (el, ctx) => {
        const st = styleOf(el, ctx.style, classes);
        const tag = el.tag;
        if (['defs', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'pattern', 'filter', 'style', 'title', 'desc', 'metadata', 'symbol', 'marker'].includes(tag))
            return;
        const num0 = (v, d = 0) => { const n = parseFloat(v ?? ''); return Number.isFinite(n) ? n : d; };
        const unsupported = () => {
            if (st.display === 'none' || st.visibility === 'hidden')
                return 'hidden';
            if (el.attrs.filter || st.filter)
                return 'filter';
            if (el.attrs.mask)
                return 'mask';
            if (el.attrs['clip-path'] && tag !== 'g')
                return 'clip-path';
            if (el.attrs.transform && tag !== 'g')
                return 'transform on a shape';
            if (parseFloat(el.attrs.opacity ?? '1') < 1 && tag === 'g')
                return 'group opacity';
            if (/%/.test(el.attrs.width ?? '') || /%/.test(el.attrs.x ?? ''))
                return 'percent units';
            return null;
        };
        const A = (x, y) => [ctx.s * (x + ctx.tx), ctx.s * (y + ctx.ty)];
        if (tag === 'g' || tag === 'svg' && el !== svg) {
            if (tag === 'svg')
                return raw(el, ctx, 'nested <svg>');
            const why = unsupported();
            let tx = ctx.tx, ty = ctx.ty;
            const t = el.attrs.transform;
            if (t) {
                const m = /^\s*translate\(\s*(-?[\d.]+)[\s,]*(-?[\d.]*)\s*\)\s*$/.exec(t) || /^\s*matrix\(\s*1[\s,]+0[\s,]+0[\s,]+1[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)\s*$/.exec(t);
                if (!m)
                    return raw(el, ctx, 'transform ' + t.slice(0, 30));
                tx += parseFloat(m[1]);
                ty += m[2] ? parseFloat(m[2]) : 0;
            }
            if (why && why !== 'hidden')
                return raw(el, ctx, why);
            if (why === 'hidden')
                return;
            let next = { ...ctx, tx, ty, style: st, ancestors: [...ctx.ancestors, el] };
            const cp = /url\(#([^)]+)\)/.exec(el.attrs['clip-path'] || '');
            if (cp) {
                const clip = byId.get(cp[1]);
                const rects = clip ? kidsOf(clip) : [];
                const full = rects.length === 1 && rects[0].tag === 'rect' && !rects[0].attrs.transform && (() => {
                    const [cx, cy] = A(num0(rects[0].attrs.x) + (tx - ctx.tx), num0(rects[0].attrs.y) + (ty - ctx.ty));
                    return cx <= 0.01 && cy <= 0.01 && cx + ctx.s * num0(rects[0].attrs.width) >= width - 0.01 && cy + ctx.s * num0(rects[0].attrs.height) >= height - 0.01;
                })();
                if (!full)
                    return raw(el, ctx, 'clip-path that is not the whole canvas');
                next = { ...next, ancestors: [...ctx.ancestors] }; // the whole-canvas clip changes nothing
            }
            kidsOf(el).forEach((k) => walk(k, next));
            return;
        }
        const why = unsupported();
        if (why === 'hidden')
            return;
        if (why)
            return raw(el, ctx, why);
        if (tag === 'rect' || tag === 'circle' || tag === 'ellipse') {
            const stroke = st.stroke && st.stroke !== 'none' && parseFloat(st['stroke-width'] ?? '1') > 0;
            if (stroke)
                return raw(el, ctx, 'stroke (SVG centers a stroke on the edge, CSS borders do not)');
            let x = 0, y = 0, w = 0, h = 0, radius = '0';
            if (tag === 'rect') {
                x = num0(el.attrs.x);
                y = num0(el.attrs.y);
                w = num0(el.attrs.width);
                h = num0(el.attrs.height);
                const rx = num0(el.attrs.rx, NaN), ry = num0(el.attrs.ry, NaN);
                const rxv = Number.isNaN(rx) ? (Number.isNaN(ry) ? 0 : ry) : rx, ryv = Number.isNaN(ry) ? rxv : ry;
                if (rxv !== ryv)
                    return raw(el, ctx, 'rect with different rx and ry');
                radius = px(Math.min(ctx.s * rxv, ctx.s * w / 2, ctx.s * h / 2));
            }
            else if (tag === 'circle') {
                const r = num0(el.attrs.r);
                x = num0(el.attrs.cx) - r;
                y = num0(el.attrs.cy) - r;
                w = h = 2 * r;
                radius = '50%';
            }
            else {
                const rx = num0(el.attrs.rx), ry = num0(el.attrs.ry);
                x = num0(el.attrs.cx) - rx;
                y = num0(el.attrs.cy) - ry;
                w = 2 * rx;
                h = 2 * ry;
                radius = '50%';
            }
            const color = cssColor(st.fill, alphaOf(st));
            if (color === null)
                return raw(el, ctx, 'fill is a gradient, pattern or keyword CSS cannot match');
            if (color === 'transparent')
                return;
            const [ax, ay] = A(x, y);
            leaves.push({ kind: 'box', x: ax, y: ay, w: ctx.s * w, h: ctx.s * h, css: { background: color, ...(radius !== '0' ? { 'border-radius': radius } : {}) }, role: tag === 'rect' ? 'box' : 'shape' });
            return;
        }
        if (tag === 'text') {
            if (Object.keys(el.attrs).some((k) => /^(dx|dy|rotate|textLength|lengthAdjust|writing-mode)$/.test(k)) || kidsOf(el).some((k) => Object.keys(k.attrs).some((a) => /^(dx|dy|rotate|textLength)$/.test(a))))
                return raw(el, ctx, 'text with dx, dy or rotate');
            const lines = [];
            const tsp = kidsOf(el).filter((k) => k.tag === 'tspan');
            if (!tsp.length)
                lines.push({ x: num0(el.attrs.x), y: num0(el.attrs.y), text: textOf(el), st });
            else {
                if (el.kids.some((k) => typeof k === 'string' && k.trim()))
                    return raw(el, ctx, 'text mixed with spans');
                for (const t of tsp) {
                    if (t.attrs.x === undefined || t.attrs.y === undefined) {
                        if (tsp.length > 1 || t.attrs.x === undefined && el.attrs.x === undefined)
                            return raw(el, ctx, 'inline text run without its own position');
                    }
                    lines.push({ x: num0(t.attrs.x ?? el.attrs.x), y: num0(t.attrs.y ?? el.attrs.y), text: textOf(t), st: styleOf(t, st, classes) });
                }
            }
            for (const ln of lines) {
                const text = ln.text.replace(/\s+/g, ' ').trim();
                if (!text)
                    continue;
                const color = cssColor(ln.st.fill, alphaOf(ln.st));
                if (color === null)
                    return raw(el, ctx, 'text fill is a gradient or keyword');
                const size = parseFloat(ln.st['font-size'] ?? '16') * ctx.s;
                const fam = firstFamily(ln.st['font-family']);
                const known = METRICS[fam.toLowerCase()];
                if (!GENERIC.has(fam.toLowerCase()))
                    families.add(fam);
                if (!known)
                    assumed.add(fam);
                const [a, d] = known || METRICS.arial;
                const asc = Math.round(a * size), desc = Math.round(d * size);
                const [ax, ay] = A(ln.x, ln.y);
                const anchor = ln.st['text-anchor'] || 'start';
                const css = { color, 'font-family': (ln.st['font-family'] || 'sans-serif').replace(/'/g, '"'), 'font-size': px(size), 'line-height': px(asc + desc) };
                if (ln.st['font-weight'] && ln.st['font-weight'] !== 'normal' && ln.st['font-weight'] !== '400')
                    css['font-weight'] = ln.st['font-weight'];
                if (ln.st['font-style'] && ln.st['font-style'] !== 'normal')
                    css['font-style'] = ln.st['font-style'];
                if (ln.st['letter-spacing'] && parseFloat(ln.st['letter-spacing']))
                    css['letter-spacing'] = px(parseFloat(ln.st['letter-spacing']) * ctx.s);
                if (anchor === 'middle')
                    css.transform = 'translateX(-50%)';
                else if (anchor === 'end')
                    css.transform = 'translateX(-100%)';
                css['white-space'] = 'pre';
                texts++;
                leaves.push({ kind: 'text', x: ax, y: ay - asc, w: 0, h: asc + desc, css, role: 'text', text });
            }
            return;
        }
        if (tag === 'image')
            return raw(el, ctx, 'image');
        if (tag === 'path' || tag === 'line' || tag === 'polyline' || tag === 'polygon')
            return raw(el, ctx, 'vector path');
        if (tag === 'use' || tag === 'foreignObject')
            return raw(el, ctx, '<' + tag + '>');
        notes.push({ kind: 'skipped', detail: `<${tag}> is not drawn by this converter` });
    };
    const root = { tx: hasVb ? -vb[0] : 0, ty: hasVb ? -vb[1] : 0, s: s0, style: styleOf(svg, {}, classes), ancestors: [] };
    kidsOf(svg).forEach((k) => walk(k, root));
    if (!texts && /<path\b/i.test(svgText))
        notes.push({ kind: 'no-text', detail: 'no text nodes found: if the design has text, export the SVG again with "Outline text" unchecked (Export settings, SVG) so it can become real HTML text' });
    return { width: Math.round(width), height: Math.round(height), leaves, notes, families: [...families], assumed: [...assumed], assets: [...assets], texts, raws };
}
const TOL = 0.01;
const inside = (inner, outer) => inner.x >= outer.x - TOL && inner.y >= outer.y - TOL && inner.x + inner.w <= outer.x + outer.w + TOL && inner.y + inner.h <= outer.y + outer.h + TOL;
const rectOf = (l) => (l.kind === 'text' ? { x: l.x, y: l.y, w: Math.max(l.w, l.text.length * parseFloat(l.css['font-size']) * 0.6), h: l.h } : l);
const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
function buildTree(leaves, width, height) {
    const rootLeaf = { kind: 'box', x: 0, y: 0, w: width, h: height, css: {}, role: 'root' };
    const nodes = leaves.map((leaf) => ({ leaf, kids: [] }));
    const parentOf = new Array(leaves.length).fill(-1);
    const underOf = (i, a) => { for (let p = parentOf[i]; p >= 0; p = parentOf[p])
        if (p === a)
            return true; return false; };
    for (let b = 0; b < leaves.length; b++) {
        const lb = leaves[b];
        if (lb.kind === 'raw')
            continue;
        // the latest earlier box that contains this one and does not let a later-painted neighbour change its stacking
        for (let a = b - 1; a >= 0; a--) {
            const la = leaves[a];
            if (la.kind !== 'box' || !inside(rectOf(lb), la))
                continue;
            let ok = true;
            for (let m = a + 1; m < b && ok; m++)
                if (!underOf(m, a) && hit(rectOf(leaves[m]), rectOf(lb)))
                    ok = false;
            if (ok) {
                parentOf[b] = a;
                break;
            }
        }
    }
    const root = { leaf: rootLeaf, kids: [] };
    nodes.forEach((n, i) => (parentOf[i] >= 0 ? nodes[parentOf[i]] : root).kids.push(n));
    const flexify = (n) => {
        n.kids.forEach(flexify);
        const boxes = n.kids.filter((k) => k.leaf.kind === 'box');
        if (boxes.length < 2)
            return;
        // The longest run of neighbouring boxes that share a top (row) or a left edge (column), do not overlap and are
        // separated by one equal gap. The DOM order is the paint order, so the run must also be in document order. Siblings
        // outside the run stay absolutely positioned, which takes them out of the flow and leaves the run's geometry exact.
        let best = null;
        for (const dir of ['row', 'column']) {
            const main = dir === 'row' ? 'x' : 'y', cross = dir === 'row' ? 'y' : 'x', size = dir === 'row' ? 'w' : 'h';
            for (let s = 0; s < boxes.length - 1; s++) {
                const run = [boxes[s]];
                let gap = NaN;
                for (let i = s + 1; i < boxes.length; i++) {
                    const p = run[run.length - 1].leaf, c = boxes[i].leaf;
                    const g = c[main] - (p[main] + p[size]);
                    if (Math.abs(c[cross] - run[0].leaf[cross]) > TOL || g < -TOL || (!Number.isNaN(gap) && Math.abs(g - gap) > TOL))
                        break;
                    gap = g;
                    run.push(boxes[i]);
                }
                if (run.length >= 2 && (!best || run.length > best.members.length))
                    best = { dir, members: run, gap };
            }
        }
        if (best) {
            const main = best.dir === 'row' ? 'x' : 'y', cross = best.dir === 'row' ? 'y' : 'x';
            n.flex = { dir: best.dir, gap: best.gap, padStart: best.members[0].leaf[main] - n.leaf[main], padCross: best.members[0].leaf[cross] - n.leaf[cross], margins: best.members.map(() => 0), members: best.members };
        }
    };
    flexify(root);
    return root;
}
function emit(tree, parsed, title) {
    const rules = [];
    const classes = {};
    let n = 0;
    const declare = (role, css) => { const name = 'fc-' + ++n; classes[name] = role; rules.push(`.${name} {\n${Object.entries(css).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`); return name; };
    const html = [];
    const out = (depth, s) => { html.push('  '.repeat(depth) + s); };
    const visit = (t, parent, depth, inFlow, flowIndex) => {
        const l = t.leaf;
        if (l.kind === 'raw') {
            const cls = declare('raw', { position: 'absolute', left: '0', top: '0', 'pointer-events': 'none' });
            out(depth, `<div class="${cls}">${l.raw}</div>`);
            return;
        }
        const left = l.x - parent.leaf.x, top = l.y - parent.leaf.y;
        if (l.kind === 'text') {
            const css = { position: 'absolute', left: px(left), top: px(top), ...l.css };
            out(depth, `<span class="${declare('text', css)}">${escT(l.text)}</span>`);
            return;
        }
        const css = inFlow ? { position: 'relative', 'flex-shrink': '0' } : { position: 'absolute', left: px(left), top: px(top) };
        css.width = px(l.w);
        css.height = px(l.h);
        if (inFlow && parent.flex) {
            const m = parent.flex.margins[flowIndex];
            if (m)
                css[parent.flex.dir === 'row' ? 'margin-top' : 'margin-left'] = px(m);
        }
        Object.assign(css, l.css);
        if (t.flex) {
            css.display = 'flex';
            css['flex-direction'] = t.flex.dir;
            css['align-items'] = 'flex-start';
            css.gap = px(t.flex.gap);
            if (t.flex.dir === 'row') {
                css['padding-left'] = px(t.flex.padStart);
                css['padding-top'] = px(t.flex.padCross);
            }
            else {
                css['padding-top'] = px(t.flex.padStart);
                css['padding-left'] = px(t.flex.padCross);
            }
        }
        const cls = declare(l.role, css);
        if (!t.kids.length) {
            out(depth, `<div class="${cls}"></div>`);
            return;
        }
        out(depth, `<div class="${cls}">`);
        let fi = 0;
        for (const k of t.kids) {
            const flowing = !!t.flex && t.flex.members.includes(k);
            visit(k, t, depth + 1, flowing, flowing ? fi++ : 0);
        }
        out(depth, '</div>');
    };
    const root = tree;
    const rootCls = declare('root', { position: 'relative', width: px(parsed.width), height: px(parsed.height), overflow: 'hidden', ...(root.flex ? { display: 'flex', 'flex-direction': root.flex.dir, 'align-items': 'flex-start', gap: px(root.flex.gap), ...(root.flex.dir === 'row' ? { 'padding-left': px(root.flex.padStart), 'padding-top': px(root.flex.padCross) } : { 'padding-top': px(root.flex.padStart), 'padding-left': px(root.flex.padCross) }) } : {}) });
    out(1, `<div class="${rootCls}">`);
    let fi = 0;
    for (const k of root.kids) {
        const flowing = !!root.flex && root.flex.members.includes(k);
        visit(k, root, 2, flowing, flowing ? fi++ : 0);
    }
    out(1, '</div>');
    const css = ['/* generated by figma-code */', '*, *::before, *::after { box-sizing: border-box; }', 'body { margin: 0; background: #fff; }', ...rules].join('\n') + '\n';
    const doc = `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${escT(title)}</title>\n  <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n${html.join('\n')}\n</body>\n</html>\n`;
    return { html: doc, css, classes, width: parsed.width, height: parsed.height };
}
function render(htmlOrSvg, w, h, out) { screenshot(htmlOrSvg, w, h, out); return decodePng(fs.readFileSync(out)); }
function build(svgFile, o) {
    const svgText = fs.readFileSync(svgFile, 'utf8');
    const name = o.name || path.basename(svgFile, path.extname(svgFile)).replace(/[^A-Za-z0-9_-]+/g, '-').toLowerCase();
    const out = path.resolve(o.out || path.join('figma-code-out', name));
    const parsed = parseSvg(svgText, path.dirname(svgFile));
    const tree = buildTree(parsed.leaves, parsed.width, parsed.height);
    const built = emit(tree, parsed, name);
    fs.mkdirSync(out, { recursive: true });
    let html = built.html;
    if (parsed.assets.length) {
        fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
        for (const a of new Set(parsed.assets)) {
            const src = path.resolve(path.dirname(svgFile), a);
            if (fs.existsSync(src)) {
                fs.copyFileSync(src, path.join(out, 'assets', path.basename(a)));
                html = html.split(`"${esc(a)}"`).join(`"assets/${esc(path.basename(a))}"`);
            }
            else
                parsed.notes.push({ kind: 'missing-asset', detail: `${a} is referenced by the SVG and was not found next to it` });
        }
    }
    fs.writeFileSync(path.join(out, 'index.html'), html);
    fs.writeFileSync(path.join(out, 'styles.css'), built.css);
    const copy = path.join(out, 'source.svg');
    fs.copyFileSync(svgFile, copy);
    fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify({ name, width: parsed.width, height: parsed.height, classes: built.classes, source: 'source.svg' }, null, 2) + '\n');
    const ref = render(copy, parsed.width, parsed.height, path.join(out, 'reference.png'));
    const got = render(path.join(out, 'index.html'), parsed.width, parsed.height, path.join(out, 'render.png'));
    const diff = diffImages(ref, got, o.tol);
    const fonts = missingFonts(parsed.families);
    const count = (t, f) => (f(t) ? 1 : 0) + t.kids.reduce((s, k) => s + count(k, f), 0);
    return {
        name, out, width: parsed.width, height: parsed.height,
        leaves: { boxes: parsed.leaves.filter((l) => l.kind === 'box').length, texts: parsed.texts, raws: parsed.raws, flexRows: count(tree, (x) => x.flex?.dir === 'row'), flexColumns: count(tree, (x) => x.flex?.dir === 'column') },
        notes: parsed.notes, fonts: { used: parsed.families, missing: fonts.missing, assumedMetrics: parsed.assumed, checked: fonts.checked },
        gate: { diff, ok: diff.percent <= o.maxDiff && !diff.sizeMismatch, maxDiff: o.maxDiff },
    };
}
const RULES_FILE = 'figma-code.standards.json';
function loadRules(file) {
    const here = path.dirname(__filename);
    const cands = [file, path.join(here, 'standards.json'), path.join(here, RULES_FILE)].filter(Boolean);
    const f = cands.find((c) => fs.existsSync(c));
    if (!f)
        throw new Usage('no standards file found; pass --rules <file>');
    const r = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!Array.isArray(r.rules))
        throw new Usage(`${f}: "rules" must be a list`);
    for (const x of r.rules)
        if (x.kind !== 'safe' && x.kind !== 'risky')
            throw new Usage(`${f}: rule "${x.id}" needs "kind": "safe" or "risky"`);
    return r;
}
const hexShort = (s) => s.replace(/#([0-9a-fA-F])\1([0-9a-fA-F])\2([0-9a-fA-F])\3\b/g, (_m, a, b, c) => '#' + (a + b + c).toLowerCase()).replace(/#([0-9a-fA-F]{3,6})\b/g, (m) => m.toLowerCase());
function applyRule(rule, f, block, name) {
    if (rule.type === 'rename-classes') {
        const scheme = String(rule.scheme || 'bem'), prefix = String(rule.prefix || '');
        const b = prefix + (block || name).replace(/[^A-Za-z0-9-]+/g, '-').toLowerCase();
        const per = {};
        const map = {};
        for (const [old, role] of Object.entries(f.classes)) {
            per[role] = (per[role] || 0) + 1;
            map[old] = role === 'root' ? b : scheme === 'bem' ? `${b}__${role}-${per[role]}` : scheme === 'kebab' ? `${b}-${role}-${per[role]}` : `${prefix}${role}-${per[role]}`;
        }
        const sub = (s) => s.replace(/\bfc-\d+\b/g, (m) => map[m] ?? m);
        const classes = {};
        for (const [old, role] of Object.entries(f.classes))
            classes[map[old]] = role;
        return { html: sub(f.html), css: sub(f.css), classes };
    }
    if (rule.type === 'hex-short')
        return { ...f, css: hexShort(f.css), html: hexShort(f.html) };
    if (rule.type === 'px-to-rem') {
        const base = Number(rule.base) || 16, props = rule.props || ['font-size', 'gap', 'padding', 'margin'];
        const css = f.css.replace(/^(\s*)([a-z-]+):\s*([^;]+);/gm, (m, ind, prop, val) => (props.some((p) => prop === p || prop.startsWith(p + '-')) ? `${ind}${prop}: ${val.replace(/(-?\d*\.?\d+)px\b/g, (_x, v) => (parseFloat(v) === 0 ? '0' : Math.round((parseFloat(v) / base) * 10000) / 10000 + 'rem'))};` : m));
        return { ...f, css };
    }
    if (rule.type === 'round-px') {
        const maxDelta = Number(rule.maxDelta ?? 0.5);
        return { ...f, css: f.css.replace(/(-?\d*\.\d+)px\b/g, (m, v) => (Math.abs(Math.round(parseFloat(v)) - parseFloat(v)) <= maxDelta ? Math.round(parseFloat(v)) + 'px' : m)) };
    }
    if (rule.type === 'colors-to-tokens') {
        const tf = String(rule.tokens || '');
        if (!tf || !fs.existsSync(tf))
            return f;
        const toks = [...fs.readFileSync(tf, 'utf8').matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*;/g)].map((m) => [m[1], hexShort(m[2])]);
        return { ...f, css: f.css.replace(/#[0-9a-fA-F]{3,6}\b/g, (m) => { const t = toks.find(([, v]) => v === hexShort(m)); return t ? `var(${t[0]})` : m; }) };
    }
    throw new Usage(`unknown rule type "${rule.type}" in rule "${rule.id}"`);
}
const rd = (dir) => ({ html: fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), css: fs.readFileSync(path.join(dir, 'styles.css'), 'utf8'), classes: JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')).classes });
function wr(dir, f) {
    fs.writeFileSync(path.join(dir, 'index.html'), f.html);
    fs.writeFileSync(path.join(dir, 'styles.css'), f.css);
    const mp = path.join(dir, 'meta.json'), m = JSON.parse(fs.readFileSync(mp, 'utf8'));
    m.classes = f.classes;
    fs.writeFileSync(mp, JSON.stringify(m, null, 2) + '\n');
}
const EPS = 0.05; // percentage points a risky rule may add before it is reverted
function standards(dir, rulesFile, o) {
    const d = path.resolve(dir);
    const meta = JSON.parse(fs.readFileSync(path.join(d, 'meta.json'), 'utf8'));
    const rules = loadRules(rulesFile);
    const ref = decodePng(fs.readFileSync(path.join(d, 'reference.png')));
    const score = () => { const p = path.join(d, 'render.png'); screenshot(path.join(d, 'index.html'), meta.width, meta.height, p); return diffImages(ref, decodePng(fs.readFileSync(p)), o.tol).percent; };
    const original = rd(d);
    let cur = original;
    const baseline = score();
    let curScore = baseline;
    const results = [];
    const on = rules.rules.filter((r) => r.enabled !== false);
    for (const r of rules.rules.filter((x) => x.enabled === false))
        results.push({ id: r.id, kind: r.kind, outcome: 'skipped' });
    const safe = on.filter((r) => r.kind === 'safe');
    let next = cur;
    for (const r of safe)
        next = applyRule(r, next, rules.block || '', meta.name);
    if (safe.length) {
        // all safe rules as one batch; if the batch moves the diff it is a bug in a rule, so none of them is kept
        wr(d, next);
        const s = score();
        if (s <= curScore + EPS) {
            cur = next;
            curScore = s;
            for (const r of safe)
                results.push({ id: r.id, kind: 'safe', outcome: next.html === original.html && next.css === original.css ? 'no-change' : 'applied', before: baseline, after: s });
        }
        else {
            wr(d, cur);
            for (const r of safe)
                results.push({ id: r.id, kind: 'safe', outcome: 'reverted', before: baseline, after: s });
        }
    }
    for (const r of on.filter((x) => x.kind === 'risky')) {
        const t = applyRule(r, cur, rules.block || '', meta.name);
        if (t.html === cur.html && t.css === cur.css) {
            results.push({ id: r.id, kind: 'risky', outcome: 'no-change', before: curScore, after: curScore });
            continue;
        }
        wr(d, t);
        const s = score();
        if (s <= curScore + EPS) {
            cur = t;
            results.push({ id: r.id, kind: 'risky', outcome: 'applied', before: curScore, after: s });
            curScore = s;
        }
        else {
            wr(d, cur);
            results.push({ id: r.id, kind: 'risky', outcome: 'reverted', before: curScore, after: s });
        }
    }
    if (o.dryRun)
        wr(d, original);
    // The last render may be a reverted trial, so render the state that was kept.
    const finalPng = path.join(d, 'render.png');
    screenshot(path.join(d, 'index.html'), meta.width, meta.height, finalPng);
    const finalDiff = diffImages(ref, decodePng(fs.readFileSync(finalPng)), o.tol);
    return { dir: d, baseline, final: finalDiff.percent, results, gate: { diff: finalDiff, ok: finalDiff.percent <= o.maxDiff, maxDiff: o.maxDiff } };
}
function detectFramework(root) {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        if (deps.next)
            return { framework: 'next', evidence: 'package.json has next' };
        if (deps.astro)
            return { framework: 'astro', evidence: 'package.json has astro' };
    }
    catch { /* no package.json */ }
    try {
        const c = JSON.parse(fs.readFileSync(path.join(root, 'composer.json'), 'utf8'));
        if (c.require && c.require['laravel/framework'])
            return { framework: 'laravel', evidence: 'composer.json requires laravel/framework' };
    }
    catch { /* no composer.json */ }
    return { framework: 'plain', evidence: 'no Next, Astro or Laravel found' };
}
const pascal = (s) => s.replace(/(^|[^A-Za-z0-9]+)([A-Za-z0-9])/g, (_m, _a, c) => c.toUpperCase()).replace(/^[0-9]+/, '') || 'FigmaFrame';
const JSX_ATTR = { class: 'className', 'xlink:href': 'xlinkHref', 'xmlns:xlink': 'xmlnsXlink', 'stroke-width': 'strokeWidth', 'stroke-linecap': 'strokeLinecap', 'stroke-linejoin': 'strokeLinejoin', 'stroke-miterlimit': 'strokeMiterlimit', 'stroke-dasharray': 'strokeDasharray', 'stroke-dashoffset': 'strokeDashoffset', 'stroke-opacity': 'strokeOpacity', 'fill-rule': 'fillRule', 'fill-opacity': 'fillOpacity', 'clip-rule': 'clipRule', 'clip-path': 'clipPath', 'stop-color': 'stopColor', 'stop-opacity': 'stopOpacity', 'font-family': 'fontFamily', 'font-size': 'fontSize', 'font-weight': 'fontWeight', 'text-anchor': 'textAnchor', 'letter-spacing': 'letterSpacing', 'color-interpolation-filters': 'colorInterpolationFilters', 'flood-opacity': 'floodOpacity', 'flood-color': 'floodColor', 'gradientunits': 'gradientUnits', 'gradientUnits': 'gradientUnits', 'gradientTransform': 'gradientTransform', 'patternUnits': 'patternUnits', 'preserveAspectRatio': 'preserveAspectRatio', 'viewBox': 'viewBox', 'stdDeviation': 'stdDeviation', 'xml:space': 'xmlSpace' };
const JSX_BACK = Object.fromEntries(Object.entries(JSX_ATTR).map(([k, v]) => [v, k]));
const VOID = new Set(['img', 'br', 'hr', 'input', 'link', 'meta']);
function bodyOf(html) { const m = /<body>\n?([\s\S]*?)\n?<\/body>/.exec(html); if (!m)
    throw new Usage('index.html has no <body>'); return m[1]; }
function toJsx(markup, cssModule) {
    const tree = parseXml(markup);
    const attr = (k, v) => {
        if (k === 'class')
            return cssModule ? v.split(/\s+/).map((c) => `styles['${c}']`).join(' + " " + ').replace(/^(.*)$/, (m) => `className={${m}}`) : `className="${esc(v)}"`;
        if (k === 'style')
            return `style={{${v.split(';').filter((x) => x.trim()).map((d) => { const i = d.indexOf(':'); return `${JSON.stringify(d.slice(0, i).trim().replace(/-([a-z])/g, (_m, c) => c.toUpperCase()))}: ${JSON.stringify(d.slice(i + 1).trim())}`; }).join(', ')}}}`;
        return `${JSX_ATTR[k] ?? k}="${esc(v).replace(/\{/g, '&#123;')}"`;
    };
    const one = (n, depth) => {
        const pad = '  '.repeat(depth);
        if (typeof n === 'string')
            return n.trim() ? pad + n.trim().replace(/[{}<>]/g, (c) => ({ '{': '{"{"}', '}': '{"}"}', '<': '&lt;', '>': '&gt;' }[c])) : '';
        const attrs = Object.entries(n.attrs).map(([k, v]) => ' ' + attr(k, v)).join('');
        const kids = n.kids.map((k) => one(k, depth + 1)).filter(Boolean);
        if (!kids.length)
            return `${pad}<${n.tag}${attrs} />`;
        if (kids.length === 1 && typeof n.kids[0] === 'string')
            return `${pad}<${n.tag}${attrs}>${kids[0].trim()}</${n.tag}>`;
        return `${pad}<${n.tag}${attrs}>\n${kids.join('\n')}\n${pad}</${n.tag}>`;
    };
    return kidsOf(tree).map((k) => one(k, 2)).join('\n');
}
// The reverse of the three adapters, used to render what was written and diff it against the baseline.
function fromJsx(jsx, css) {
    let body = jsx.replace(/styles\['([^']+)'\](?:\s*\+\s*" "\s*\+\s*)?/g, '$1 ').replace(/className=\{([^}]*)\}/g, (_m, v) => `class="${v.replace(/\s+/g, ' ').trim()}"`);
    body = body.replace(/className="/g, 'class="');
    body = body.replace(/ ([a-zA-Z]+)=/g, (m, k) => ` ${JSX_BACK[k] ?? k}=`).replace(/&#123;/g, '{');
    body = body.replace(/\{"([{}])"\}/g, '$1');
    body = body.replace(/<([a-zA-Z][\w:-]*)([^<>]*?)\s*\/>/g, (m, tag, attrs) => (VOID.has(tag) ? m : `<${tag}${attrs}></${tag}>`));
    return { html: body, css };
}
function adapt(dir, o) {
    const d = path.resolve(dir), root = path.resolve(o.root);
    const meta = JSON.parse(fs.readFileSync(path.join(d, 'meta.json'), 'utf8'));
    const det = o.framework ? { framework: o.framework, evidence: 'chosen with --framework' } : detectFramework(root);
    const f = rd(d);
    const comp = pascal(meta.name);
    const notes = [];
    const written = [];
    if (det.framework === 'plain')
        return { framework: 'plain', evidence: det.evidence, component: null, files: [], gate: null, notes: ['no framework found: index.html and styles.css in ' + d + ' are already standalone'] };
    const src = fs.existsSync(path.join(root, 'src')) && det.framework !== 'laravel' ? path.join(root, 'src') : root;
    const assets = fs.existsSync(path.join(d, 'assets')) ? fs.readdirSync(path.join(d, 'assets')) : [];
    const files = [];
    const markup = bodyOf(f.html);
    const pubDir = `figma-code/${meta.name}`;
    const fixAssets = (s, prefix) => assets.reduce((t, a) => t.split(`"assets/${a}"`).join(`"${prefix}/${a}"`), s);
    let verify;
    const need = (rel) => { const p = path.join(root, rel); if (fs.existsSync(p) && !o.force)
        throw new Usage(`${norm(path.relative(process.cwd(), p))} already exists; pass --force to overwrite it`); return p; };
    if (det.framework === 'astro') {
        const rel = norm(path.relative(root, path.join(src, 'components', comp + '.astro')));
        const body = fixAssets(markup, '/' + pubDir);
        files.push({ rel, text: `---\n// generated by figma-code from ${meta.source}; edit the markup and styles freely\n---\n${body}\n<style is:global>\n${f.css}</style>\n` });
        for (const a of assets)
            files.push({ rel: `public/${pubDir}/${a}`, copyFrom: path.join(d, 'assets', a) });
        verify = { html: markup, css: f.css };
    }
    else if (det.framework === 'next') {
        const rel = norm(path.relative(root, path.join(src, 'components', comp + '.jsx')));
        const jsx = fixAssets(toJsx(markup, true), '/' + pubDir);
        const css = f.css.replace(/^\*, \*::before, \*::after \{ box-sizing: border-box; \}\nbody \{[^}]*\}\n/m, '').replace(/^(\.fc-root|\.[\w-]+)( \{)/m, '$1$2');
        const rootClass = Object.entries(f.classes).find(([, r]) => r === 'root')[0];
        files.push({ rel, text: `// generated by figma-code from ${meta.source}; edit the markup and styles freely\nimport styles from './${comp}.module.css';\n\nexport default function ${comp}() {\n  return (\n${jsx}\n  );\n}\n` });
        files.push({ rel: norm(path.relative(root, path.join(src, 'components', comp + '.module.css'))), text: `.${rootClass}, .${rootClass} * { box-sizing: border-box; }\n${css}` });
        for (const a of assets)
            files.push({ rel: `public/${pubDir}/${a}`, copyFrom: path.join(d, 'assets', a) });
        notes.push('CSS Modules rename the classes at build time; no "use client" is needed because the component has no state or events');
        verify = fromJsx(toJsx(markup, true), f.css);
    }
    else {
        const dash = meta.name.replace(/[^A-Za-z0-9-]+/g, '-').toLowerCase();
        const bl = (s) => s.replace(/@/g, '@@').replace(/\{\{/g, '@{{').replace(/\{!!/g, '@{!!');
        files.push({ rel: `resources/views/components/${dash}.blade.php`, text: `{{-- generated by figma-code from ${meta.source}; edit the markup and styles freely --}}\n<link rel="stylesheet" href="{{ asset('css/figma-code/${dash}.css') }}">\n${bl(fixAssets(markup, "/" + pubDir))}\n` });
        files.push({ rel: `public/css/figma-code/${dash}.css`, text: f.css });
        for (const a of assets)
            files.push({ rel: `public/${pubDir}/${a}`, copyFrom: path.join(d, 'assets', a) });
        verify = { html: markup, css: f.css };
    }
    const gate = (() => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-code-adapt-'));
        try {
            fs.writeFileSync(path.join(tmp, 'index.html'), `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" href="styles.css"></head><body>\n${verify.html}\n</body></html>\n`);
            fs.writeFileSync(path.join(tmp, 'styles.css'), verify.css);
            if (assets.length) {
                fs.mkdirSync(path.join(tmp, 'assets'));
                for (const a of assets)
                    fs.copyFileSync(path.join(d, 'assets', a), path.join(tmp, 'assets', a));
            }
            const ref = decodePng(fs.readFileSync(path.join(d, 'reference.png')));
            const img = render(path.join(tmp, 'index.html'), meta.width, meta.height, path.join(tmp, 'render.png'));
            const diff = diffImages(ref, img, o.tol);
            return { diff, ok: diff.percent <= o.maxDiff && !diff.sizeMismatch, maxDiff: o.maxDiff };
        }
        finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    })();
    if (!o.dryRun && gate.ok) {
        for (const fl of files) {
            const p = fl.copyFrom ? path.join(root, fl.rel) : need(fl.rel);
            fs.mkdirSync(path.dirname(p), { recursive: true });
            if (fl.copyFrom)
                fs.copyFileSync(fl.copyFrom, p);
            else
                fs.writeFileSync(p, fl.text);
            written.push(fl.rel);
        }
        meta.framework = det.framework;
        meta.component = files[0].rel;
        fs.writeFileSync(path.join(d, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
    }
    else if (!gate.ok)
        notes.push('nothing was written into the project: the rendered component is over the diff limit');
    return { framework: det.framework, evidence: det.evidence, component: files[0].rel, files: o.dryRun ? files.map((x) => x.rel) : written, gate, notes };
}
// ============================================================ output and CLI
const boxLine = (b) => `  ${b.w}x${b.h} at (${b.x}, ${b.y}), ${b.count} px`;
const gateLines = (g, label) => [
    `${label}: ${g.diff.percent}% of pixels differ (${g.diff.differing} of ${g.diff.total}), limit ${g.maxDiff}% -> ${g.ok ? 'PASS' : 'FAIL'}`,
    ...(g.diff.sizeMismatch ? ['  ' + g.diff.sizeMismatch] : []),
    ...(g.diff.boxes.length ? ['worst regions:', ...g.diff.boxes.slice(0, 5).map(boxLine)] : []),
];
function renderBuild(r) {
    const L = [`figma-code build: ${r.name} (${r.width}x${r.height}) -> ${norm(path.relative(process.cwd(), r.out)) || '.'}`];
    if (r.fonts.missing.length)
        L.push(`FONTS NOT INSTALLED: ${r.fonts.missing.join(', ')}. The diff below may be a font difference, not a layout bug; install them or expect a gap.`);
    else if (!r.fonts.checked && r.fonts.used.length)
        L.push(`fonts used (could not check they are installed): ${r.fonts.used.join(', ')}`);
    if (r.fonts.assumedMetrics.length)
        L.push(`font metrics assumed (Arial values) for: ${r.fonts.assumedMetrics.join(', ')}; text may sit a pixel or two off`);
    L.push(`${r.leaves.boxes} boxes, ${r.leaves.texts} text lines, ${r.leaves.flexRows} flex rows, ${r.leaves.flexColumns} flex columns, ${r.leaves.raws} inline SVG layers`);
    for (const n of r.notes.slice(0, 12))
        L.push(`note: ${n.detail}`);
    if (r.notes.length > 12)
        L.push(`(+${r.notes.length - 12} more notes; --json lists them)`);
    L.push(...gateLines(r.gate, 'pixel diff vs the SVG'));
    return L.join('\n');
}
function parseArgs(argv) {
    const [cmd, ...rest] = argv;
    const pos = [], flags = {};
    const withValue = new Set(['name', 'out', 'max-diff', 'tol', 'rules', 'root', 'framework', 'width', 'height']);
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (a.startsWith('--')) {
            const k = a.slice(2);
            if (withValue.has(k)) {
                if (rest[i + 1] === undefined)
                    throw new Usage(`--${k} needs a value`);
                flags[k] = rest[++i];
            }
            else
                flags[k] = true;
        }
        else
            pos.push(a);
    }
    return { cmd, pos, flags };
}
const USAGE = 'usage: figma-code.cli.js detect | build <file.svg> | diff <a> <b> | standards <dir> | adapt <dir>  (see the header of this file)';
function detect(root) {
    const svgs = [];
    const walk = (d, depth) => {
        if (depth > 3 || svgs.length >= 20)
            return;
        let es;
        try {
            es = fs.readdirSync(d, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const e of es) {
            if (/^(node_modules|\.git|vendor|dist|build|figma-code-out)$/.test(e.name))
                continue;
            const p = path.join(d, e.name);
            if (e.isDirectory())
                walk(p, depth + 1);
            else if (/\.svg$/i.test(e.name))
                svgs.push(norm(path.relative(root, p)));
        }
    };
    walk(root, 0);
    const f = detectFramework(root);
    return { chrome: findChrome(), node: process.version, framework: f.framework, evidence: f.evidence, svgs, fonts: installedFonts() !== null };
}
function main() {
    let json = false;
    try {
        const { cmd, pos, flags } = parseArgs(process.argv.slice(2));
        json = !!flags.json;
        const maxDiff = flags['max-diff'] !== undefined ? Number(flags['max-diff']) : 1;
        const tol = flags.tol !== undefined ? Number(flags.tol) : 16;
        if (!(maxDiff >= 0) || !(tol >= 0))
            throw new Usage('--max-diff and --tol must be numbers');
        const noFail = !!flags['no-fail'];
        const done = (ok) => { process.exitCode = ok || noFail ? 0 : 1; };
        if (cmd === 'detect') {
            const d = detect(path.resolve(String(flags.root || process.cwd())));
            console.log(json ? JSON.stringify(d) : [`browser: ${d.chrome ?? 'NOT FOUND (install Chrome or Edge, or set CHROME)'}`, `node: ${d.node}`, `framework: ${d.framework} (${d.evidence})`, `font check: ${d.fonts ? 'available' : 'not available on this machine'}`, `svg files: ${d.svgs.length ? d.svgs.join(', ') : 'none found'}`].join('\n'));
            process.exitCode = d.chrome ? 0 : 3;
        }
        else if (cmd === 'build') {
            if (!pos[0])
                throw new Usage('build needs an SVG file');
            if (!fs.existsSync(pos[0]))
                throw new Usage('not found: ' + pos[0]);
            const r = build(pos[0], { name: flags.name, out: flags.out, maxDiff, tol });
            console.log(json ? JSON.stringify(r) : renderBuild(r));
            done(r.gate.ok);
        }
        else if (cmd === 'diff') {
            if (pos.length < 2)
                throw new Usage('diff needs two files (png, html or svg)');
            const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-code-diff-'));
            try {
                const load = (f, i) => {
                    if (!fs.existsSync(f))
                        throw new Usage('not found: ' + f);
                    if (/\.png$/i.test(f))
                        return decodePng(fs.readFileSync(f));
                    const w = Number(flags.width), h = Number(flags.height);
                    if (!(w > 0 && h > 0))
                        throw new Usage('rendering ' + f + ' needs --width and --height');
                    return render(f, w, h, path.join(tmp, `r${i}.png`));
                };
                const diff = diffImages(load(pos[0], 0), load(pos[1], 1), tol);
                const g = { diff, ok: diff.percent <= maxDiff && !diff.sizeMismatch, maxDiff };
                console.log(json ? JSON.stringify(g) : gateLines(g, 'pixel diff').join('\n'));
                done(g.ok);
            }
            finally {
                fs.rmSync(tmp, { recursive: true, force: true });
            }
        }
        else if (cmd === 'standards') {
            if (!pos[0])
                throw new Usage('standards needs the build folder');
            const r = standards(pos[0], flags.rules, { maxDiff, tol, dryRun: !!flags['dry-run'] });
            console.log(json ? JSON.stringify(r) : [`figma-code standards: ${norm(path.relative(process.cwd(), r.dir))}${flags['dry-run'] ? ' (dry run, nothing kept)' : ''}`, `baseline ${r.baseline}% -> ${r.final}%`, ...r.results.map((x) => `  ${x.outcome.padEnd(9)} ${x.kind.padEnd(5)} ${x.id}${x.after !== undefined ? `  (${x.before}% -> ${x.after}%)` : ''}`), ...gateLines(r.gate, 'pixel diff vs the SVG')].join('\n'));
            done(r.gate.ok);
        }
        else if (cmd === 'adapt') {
            if (!pos[0])
                throw new Usage('adapt needs the build folder');
            const fw = flags.framework;
            if (fw && !['next', 'astro', 'laravel', 'plain'].includes(fw))
                throw new Usage('--framework is next, astro, laravel or plain');
            const r = adapt(pos[0], { root: String(flags.root || process.cwd()), framework: fw, maxDiff, tol, dryRun: !!flags['dry-run'], force: !!flags.force });
            console.log(json ? JSON.stringify(r) : [`figma-code adapt: ${r.framework} (${r.evidence})`, ...(r.component ? [`component: ${r.component}`] : []), ...(r.files.length ? [(flags['dry-run'] ? 'would write: ' : 'wrote: ') + r.files.join(', ')] : []), ...r.notes.map((n) => 'note: ' + n), ...(r.gate ? gateLines(r.gate, 'pixel diff of the adapted component') : [])].join('\n'));
            done(r.gate ? r.gate.ok : true);
        }
        else
            throw new Usage(cmd ? `unknown command "${cmd}"` : 'missing command');
    }
    catch (e) {
        const err = e;
        if (err instanceof Usage) {
            console.error(err.message + '\n' + USAGE);
            process.exitCode = 2;
        }
        else if (err instanceof Blocked) {
            console.error('blocked: ' + err.message);
            process.exitCode = 3;
        }
        else {
            console.error('error: ' + err.message);
            process.exitCode = 1;
        }
        void json;
    }
}
if (require.main === module)
    main();
