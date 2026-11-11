#!/usr/bin/env node
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
//   node cli.js build <file.svg> [--name N] [--out DIR] [--max-diff P] [--tol N] [--photo-tol N] [--no-fail] [--json]
//   node cli.js diff <a> <b> [--width W --height H] [--tol N] [--max-diff P] [--no-fail] [--json]     (png, html or svg)
//   node cli.js standards <dir> [--rules FILE] [--max-diff P] [--dry-run] [--no-fail] [--json]
//   node cli.js adapt <dir> [--root D] [--framework next|astro|laravel|plain] [--max-diff P] [--dry-run] [--no-fail] [--json]
//
// Pixel match is guaranteed only at the exported width and with the same fonts installed; the diff cannot tell a
// layout bug from a missing font, so missing fonts are reported first. Nothing outside --out and the framework
// folders named in the report is written, and an existing component is never overwritten without --force.
// Exit codes: 0 done, 1 the diff is over --max-diff, 2 bad usage, 3 no browser.

import fs = require('node:fs');
import os = require('node:os');
import path = require('node:path');
import cp = require('node:child_process');
import zlib = require('node:zlib');

// ============================================================ shared helpers
const r2 = (n: number): number => Math.round(n * 100) / 100;
const px = (n: number): string => (r2(n) === 0 ? '0' : r2(n) + 'px');
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escT = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const norm = (p: string): string => p.split(path.sep).join('/');
class Usage extends Error {}
class Blocked extends Error {}

// ============================================================ 4a: browser, PNG, diff
export function findChrome(): string | null {
  const env = process.env.CHROME || process.env.CHROME_PATH;
  if (env && fs.existsSync(env)) return env;
  const pf = [process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'], process.env['LOCALAPPDATA']].filter(Boolean) as string[];
  const cands = [
    ...pf.flatMap((b) => [path.join(b, 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(b, 'Microsoft', 'Edge', 'Application', 'msedge.exe')]),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium',
  ];
  return cands.find((c) => fs.existsSync(c)) || null;
}

const fileUrl = (p: string): string => 'file:///' + norm(path.resolve(p)).replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:');

// Renders a page (html or svg file) at an exact viewport size to a PNG. The window size can include browser chrome in some
// headless builds, so the result is checked and the call fails with the real size when it is not what was asked.
export function screenshot(file: string, w: number, h: number, out: string): void {
  const chrome = findChrome();
  if (!chrome) throw new Blocked('no Chrome or Edge found. Install Chrome, or set CHROME to the browser file.');
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-code-chrome-'));
  try {
    fs.rmSync(out, { force: true });
    cp.spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--force-device-scale-factor=1', '--default-background-color=ffffffff',
      `--user-data-dir=${prof}`, `--window-size=${w},${h}`, '--virtual-time-budget=3000', `--screenshot=${out}`, fileUrl(file)], { stdio: 'ignore', timeout: 60000 });
  } finally { fs.rmSync(prof, { recursive: true, force: true }); }
  if (!fs.existsSync(out)) throw new Error(`the browser wrote no screenshot for ${file}`);
  const img = decodePng(fs.readFileSync(out));
  if (img.w !== w || img.h !== h) {
    // Some builds add a strip below the page; crop a taller shot back to the asked size, refuse a smaller one.
    if (img.w === w && img.h > h) fs.writeFileSync(out, encodePng(cropImg(img, w, h)));
    else throw new Error(`the screenshot of ${path.basename(file)} is ${img.w}x${img.h}, expected ${w}x${h}`);
  }
}

export interface Img { w: number; h: number; px: Uint8Array }

export function decodePng(buf: Buffer): Img {
  if (buf.length < 33 || buf.toString('latin1', 1, 4) !== 'PNG') throw new Error('not a PNG file');
  let off = 8, w = 0, h = 0, depth = 0, ctype = 0, inter = 0;
  let pal: Buffer | null = null, trns: Buffer | null = null;
  const idat: Buffer[] = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('latin1', off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; inter = data[12]; }
    else if (type === 'PLTE') pal = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || inter !== 0) throw new Error(`unsupported PNG (bit depth ${depth}, interlace ${inter}); only 8-bit non-interlaced is read`);
  const ch = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[ctype];
  if (!ch) throw new Error('unsupported PNG color type ' + ctype);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch, cur = Buffer.alloc(stride), prev = Buffer.alloc(stride);
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = src[i];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (ctype === 6) { out[o] = cur[x * 4]; out[o + 1] = cur[x * 4 + 1]; out[o + 2] = cur[x * 4 + 2]; out[o + 3] = cur[x * 4 + 3]; }
      else if (ctype === 2) { out[o] = cur[x * 3]; out[o + 1] = cur[x * 3 + 1]; out[o + 2] = cur[x * 3 + 2]; out[o + 3] = 255; }
      else if (ctype === 0) { out[o] = out[o + 1] = out[o + 2] = cur[x]; out[o + 3] = 255; }
      else if (ctype === 4) { out[o] = out[o + 1] = out[o + 2] = cur[x * 2]; out[o + 3] = cur[x * 2 + 1]; }
      else { const k = cur[x]; out[o] = pal![k * 3]; out[o + 1] = pal![k * 3 + 1]; out[o + 2] = pal![k * 3 + 2]; out[o + 3] = trns && k < trns.length ? trns[k] : 255; }
    }
    cur.copy(prev);
  }
  return { w, h, px: out };
}

const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (b: Buffer): number => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
export function encodePng(img: Img): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(img.w, 0); ihdr.writeUInt32BE(img.h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(img.h * (img.w * 4 + 1));
  for (let y = 0; y < img.h; y++) Buffer.from(img.px.buffer, img.px.byteOffset + y * img.w * 4, img.w * 4).copy(raw, y * (img.w * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function cropImg(img: Img, w: number, h: number): Img {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) out.set(img.px.subarray(y * img.w * 4, y * img.w * 4 + w * 4), y * w * 4);
  return { w, h, px: out };
}

export interface Box { x: number; y: number; w: number; h: number; count: number }
export interface DiffResult { w: number; h: number; total: number; differing: number; percent: number; boxes: Box[]; sizeMismatch: string | null }

// A pixel differs when any channel is off by more than `tol` (of 255): anti-aliasing never matches bit for bit.
// Failing pixels are grouped into 16 px cells, joined when they touch, and reported as boxes, worst first.
export interface Loose { rects: { x: number; y: number; w: number; h: number }[]; tol: number }
export function diffImages(a: Img, b: Img, tol = 16, loose?: Loose): DiffResult {
  const w = Math.min(a.w, b.w), h = Math.min(a.h, b.h);
  // Photos are resampled differently by the SVG and the CSS pipelines (a few levels of difference on every pixel, no
  // placement error), so pixels inside a photo box use the looser tolerance; everything else keeps the strict one.
  let mask: Uint8Array | null = null;
  if (loose && loose.rects.length) {
    mask = new Uint8Array(w * h);
    for (const r of loose.rects) for (let y = Math.max(0, r.y); y < Math.min(h, r.y + r.h); y++) mask.fill(1, y * w + Math.max(0, r.x), y * w + Math.min(w, r.x + r.w));
  }
  const sizeMismatch = a.w !== b.w || a.h !== b.h ? `sizes differ: ${a.w}x${a.h} vs ${b.w}x${b.h}` : null;
  const total = Math.max(a.w * a.h, b.w * b.h);
  const CELL = 16, cw = Math.ceil(w / CELL), ch = Math.ceil(h / CELL);
  const cells = new Int32Array(cw * ch);
  let differing = Math.abs(a.w * a.h - b.w * b.h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * a.w + x) * 4, j = (y * b.w + x) * 4;
    const t = mask && mask[y * w + x] ? loose!.tol : tol;
    if (Math.abs(a.px[i] - b.px[j]) > t || Math.abs(a.px[i + 1] - b.px[j + 1]) > t || Math.abs(a.px[i + 2] - b.px[j + 2]) > t || Math.abs(a.px[i + 3] - b.px[j + 3]) > t) {
      differing++; cells[Math.floor(y / CELL) * cw + Math.floor(x / CELL)]++;
    }
  }
  const seen = new Uint8Array(cw * ch), boxes: Box[] = [];
  for (let s = 0; s < cells.length; s++) {
    if (!cells[s] || seen[s]) continue;
    const q = [s]; seen[s] = 1;
    let x0 = cw, y0 = ch, x1 = 0, y1 = 0, count = 0;
    while (q.length) {
      const c = q.pop()!, cx = c % cw, cy = Math.floor(c / cw);
      count += cells[c]; x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx); y1 = Math.max(y1, cy);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
        const n = ny * cw + nx;
        if (cells[n] && !seen[n]) { seen[n] = 1; q.push(n); }
      }
    }
    boxes.push({ x: x0 * CELL, y: y0 * CELL, w: Math.min(w, (x1 + 1) * CELL) - x0 * CELL, h: Math.min(h, (y1 + 1) * CELL) - y0 * CELL, count });
  }
  boxes.sort((p, q) => q.count - p.count);
  return { w, h, total, differing, percent: total ? Math.round((differing / total) * 10000) / 100 : 0, boxes: boxes.slice(0, 8), sizeMismatch };
}

// Families named in the design that this machine does not have. Best effort: Windows registry, fc-list, or font folders.
const GENERIC = new Set(['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'inherit', 'initial']);
export function installedFonts(): string[] | null {
  try {
    if (process.platform === 'win32') {
      const out = ['HKLM', 'HKCU'].map((h) => cp.spawnSync('reg', ['query', `${h}\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts`], { encoding: 'utf8' }).stdout || '').join('\n');
      const names = [...out.matchAll(/^\s{4}(.+?)\s+REG_SZ/gm)].map((m) => m[1].replace(/\s*\((TrueType|OpenType|All res)\)\s*$/i, ''));
      const user = cp.spawnSync('reg', ['query', 'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'], { encoding: 'utf8' }).stdout || '';
      return names.concat([...user.matchAll(/^\s{4}(.+?)\s+REG_SZ/gm)].map((m) => m[1])).map((s) => s.toLowerCase());
    }
    const r = cp.spawnSync('fc-list', [':', 'family'], { encoding: 'utf8' });
    if (r.status === 0) return r.stdout.split('\n').flatMap((l) => l.split(',')).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const dirs = ['/Library/Fonts', '/System/Library/Fonts', path.join(os.homedir(), 'Library', 'Fonts')];
    return dirs.flatMap((d) => { try { return fs.readdirSync(d); } catch { return []; } }).map((f) => f.replace(/\.[a-z0-9]+$/i, '').toLowerCase());
  } catch { return null; }
}
export function missingFonts(families: string[], installed: string[] | null = installedFonts()): { missing: string[]; checked: boolean } {
  if (!installed) return { missing: [], checked: false };
  const miss = families.filter((f) => !GENERIC.has(f.toLowerCase()) && !installed.some((i) => i === f.toLowerCase() || i.startsWith(f.toLowerCase() + ' ') || i.replace(/[\s_-]/g, '').startsWith(f.toLowerCase().replace(/[\s_-]/g, ''))));
  return { missing: [...new Set(miss)], checked: true };
}

// ============================================================ fonts: files, measured metrics, availability
// An SVG names its fonts and never contains them. So the script can (a) read font files you give it (--fonts DIR), (b) fetch
// them from Google Fonts when asked (--download-fonts, the only network use), (c) write them into the page as @font-face with
// the files copied to assets/, and (d) render the reference SVG with the same files, so the diff does not depend on what is
// installed. Text metrics and "is this font here" are measured in the browser, never guessed from a table.
export interface FontFile { family: string; weight: string; style: string; file: string; format: string }
export interface FontSpec { key: string; stack: string; family: string; weight: string; style: string }
export const cssWeight = (w: string | undefined): string => { const v = (w || '400').trim().toLowerCase(); return v === 'normal' ? '400' : v === 'bold' ? '700' : /^\d+$/.test(v) ? v : '400'; };
const quoteStack = (stack: string): string => stack.split(',').map((x) => x.trim()).filter(Boolean).map((x) => (/^["']/.test(x) || GENERIC.has(x.toLowerCase()) ? x : `"${x}"`)).join(', ');

export function fontFaceCss(files: FontFile[], urlOf: (f: FontFile) => string): string {
  return files.map((f) => `@font-face {\n  font-family: "${f.family}";\n  src: url(${urlOf(f)}) format("${f.format}");\n  font-weight: ${f.weight};\n  font-style: ${f.style};\n  font-display: swap;\n}`).join('\n');
}

// Family, weight (or a range for a variable font) and style from a TrueType or OpenType file's tables.
export function readFontInfo(buf: Buffer): { family: string; weight: string; style: string } | null {
  if (buf.length < 12) return null;
  const sig = buf.readUInt32BE(0);
  if (sig !== 0x00010000 && sig !== 0x4f54544f && sig !== 0x74727565) return null;
  const T: Record<string, number> = {};
  for (let i = 0, n = buf.readUInt16BE(4); i < n; i++) { const r = 12 + 16 * i; if (r + 16 > buf.length) break; T[buf.toString('latin1', r, r + 4)] = buf.readUInt32BE(r + 8); }
  const names: Record<number, string> = {};
  if (T.name !== undefined) {
    const nm = T.name, count = buf.readUInt16BE(nm + 2), so = buf.readUInt16BE(nm + 4);
    for (let i = 0; i < count; i++) {
      const r = nm + 6 + 12 * i, plat = buf.readUInt16BE(r), id = buf.readUInt16BE(r + 6), len = buf.readUInt16BE(r + 8), off = buf.readUInt16BE(r + 10);
      const raw = buf.subarray(nm + so + off, nm + so + off + len);
      const s = plat === 3 || plat === 0 ? Buffer.from(raw).swap16().toString('utf16le') : raw.toString('latin1');
      if (names[id] === undefined || plat === 3) names[id] = s;
    }
  }
  const family = names[16] || names[1];
  if (!family) return null;
  let weight = '400', style = 'normal';
  if (T['OS/2'] !== undefined) { const o = T['OS/2']; weight = String(buf.readUInt16BE(o + 4) || 400); if (buf.readUInt16BE(o + 62) & 1) style = 'italic'; }
  if (T.fvar !== undefined) {
    const v = T.fvar, ao = buf.readUInt16BE(v + 4), ac = buf.readUInt16BE(v + 8), as = buf.readUInt16BE(v + 10);
    for (let i = 0; i < ac; i++) { const b = v + ao + i * as; if (buf.toString('latin1', b, b + 4) === 'wght') weight = `${Math.round(buf.readInt32BE(b + 4) / 65536)} ${Math.round(buf.readInt32BE(b + 12) / 65536)}`; }
  }
  return { family, weight, style };
}

// The user's own font files (--fonts DIR): .ttf and .otf are read; .woff and .woff2 are skipped and said so.
export function loadFontDir(dir: string): { files: FontFile[]; skipped: string[] } {
  const files: FontFile[] = [], skipped: string[] = [];
  for (const n of fs.readdirSync(dir).sort()) {
    if (/\.woff2?$/i.test(n)) { skipped.push(n); continue; }
    if (!/\.(ttf|otf)$/i.test(n)) continue;
    const p = path.join(dir, n);
    const info = readFontInfo(fs.readFileSync(p));
    if (info) files.push({ ...info, file: p, format: /\.otf$/i.test(n) ? 'opentype' : 'truetype' }); else skipped.push(n);
  }
  return { files, skipped };
}

// Measures ascent, descent (as a fraction of the size) and whether the family is available, in the same browser that draws
// the diff. A family that is neither installed nor supplied measures as the fallback the page would really use.
export function probeFonts(specs: FontSpec[], faces: FontFile[]): Map<string, { a: number; d: number; avail: boolean }> {
  const out = new Map<string, { a: number; d: number; avail: boolean }>();
  if (!specs.length) return out;
  const chrome = findChrome();
  if (!chrome) throw new Blocked('no Chrome or Edge found. Install Chrome, or set CHROME to the browser file.');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-code-probe-'));
  try {
    const payload = JSON.stringify(specs.map((s) => ({ key: s.key, first: quoteStack(s.family), css: quoteStack(s.stack), weight: s.weight.split(' ')[0], style: s.style }))).replace(/</g, '\\u003c');
    const script = `(async()=>{const S=${payload};const out={};const c=document.createElement('canvas').getContext('2d');
const W=(f)=>{c.font=f;return c.measureText('mmmmmmmmmmlli').width};
for(const s of S){const f=s.style+' '+s.weight+' 1000px ';
try{await document.fonts.load(f+s.first,'Hg')}catch(e){}
const avail=W(f+s.first+', monospace')!==W(f+'monospace')||W(f+s.first+', serif')!==W(f+'serif');
c.font=f+s.css;const m=c.measureText('Hg');
out[s.key]={a:m.fontBoundingBoxAscent/1000,d:m.fontBoundingBoxDescent/1000,avail};}
const pre=document.createElement('pre');pre.id='fc';pre.textContent=JSON.stringify(out);document.body.appendChild(pre);})();`;
    const html = `<!doctype html><meta charset="utf-8"><style>${fontFaceCss(faces, (f) => fileUrl(f.file))}</style><body><script>${script}</script></body>`;
    const probe = path.join(tmp, 'probe.html');
    fs.writeFileSync(probe, html);
    const prof = path.join(tmp, 'profile');
    const r = cp.spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${prof}`, '--virtual-time-budget=8000', '--dump-dom', fileUrl(probe)], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 60000 });
    const m = /<pre id="fc">([\s\S]*?)<\/pre>/.exec(r.stdout || '');
    if (!m) throw new Error('the browser did not return font metrics');
    const j = JSON.parse(dec(m[1])) as Record<string, { a: number; d: number; avail: boolean }>;
    for (const [k, v] of Object.entries(j)) out.set(k, v);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  return out;
}

export interface GoogleResult { files: FontFile[]; unresolved: string[]; notes: string[] }
// Google Fonts, TrueType files, saved flat into `dir`. Asked for by the user with --download-fonts; the caller says so first.
// A family that is not found is tried once with " Pro" added (Be Vietnam is Be Vietnam Pro there); the @font-face keeps the
// name the design uses. Weights a family lacks fall back to its regular file and are reported.
export async function downloadGoogleFonts(specs: FontSpec[], dir: string, get: typeof fetch = fetch): Promise<GoogleResult> {
  const files: FontFile[] = [], unresolved: string[] = [], notes: string[] = [];
  const byFamily = new Map<string, { w: Set<string>; italic: boolean }>();
  for (const s of specs) { if (GENERIC.has(s.family.toLowerCase())) continue; const e = byFamily.get(s.family) || { w: new Set<string>(), italic: false }; e.w.add(s.weight.split(' ')[0]); if (s.style === 'italic') e.italic = true; byFamily.set(s.family, e); }
  fs.mkdirSync(dir, { recursive: true });
  for (const [family, e] of byFamily) {
    const ws = [...e.w].map(Number).sort((a, b) => a - b);
    const variants = e.italic ? ws.flatMap((w) => [`0,${w}`, `1,${w}`]) : ws.map(String);
    const axis = e.italic ? 'ital,wght' : 'wght';
    let css: string | null = null, used = family, plain = false;
    for (const name of [family, family + ' Pro']) {
      for (const q of [`${name.replace(/ /g, '+')}:${axis}@${variants.join(';')}`, name.replace(/ /g, '+')]) {
        try { const r = await get(`https://fonts.googleapis.com/css2?family=${q}&display=swap`); if (r.ok) { css = await r.text(); used = name; plain = !q.includes('@'); break; } } catch (err) { notes.push(`${family}: ${(err as Error).message}`); }
      }
      if (css) break;
    }
    if (!css) { unresolved.push(family); continue; }
    if (used !== family) notes.push(`${family} is "${used}" on Google Fonts; the @font-face keeps the name "${family}"`);
    if (plain && ws.some((w) => w !== 400)) notes.push(`${family}: only the regular weight was found; weights ${ws.filter((w) => w !== 400).join(', ')} will be synthesized by the browser`);
    for (const b of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
      const url = /url\(([^)]+)\)/.exec(b[1]), weight = /font-weight:\s*([\d\s]+)/.exec(b[1]), style = /font-style:\s*(\w+)/.exec(b[1]);
      if (!url) continue;
      const u = url[1].replace(/["']/g, ''), w = (weight ? weight[1].trim() : '400'), st = style ? style[1] : 'normal';
      const name = `${family.replace(/\W+/g, '')}-${w.replace(/\s+/g, '_')}-${st}.ttf`;
      const dest = path.join(dir, name);
      if (!fs.existsSync(dest)) { const r = await get(u); if (!r.ok) { notes.push(`${family}: ${u} returned ${r.status}`); continue; } fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer())); }
      files.push({ family, weight: w, style: st, file: dest, format: 'truetype' });
    }
  }
  return { files, unresolved, notes };
}

// ============================================================ 4b: SVG -> HTML and CSS
interface XNode { tag: string; attrs: Record<string, string>; kids: (XNode | string)[] }
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const dec = (s: string): string => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? m));

export function parseXml(src: string): XNode {
  const root: XNode = { tag: '#root', attrs: {}, kids: [] };
  const stack: XNode[] = [root];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<![A-Za-z][^>]*>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>|([^<]+)/g;
  for (let m: RegExpExecArray | null; (m = re.exec(src)); ) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.kids.push(m[1]);
    else if (m[2]) { if (stack.length > 1) stack.pop(); }
    else if (m[3]) {
      const attrs: Record<string, string> = {};
      for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = dec(a[2] ?? a[3]);
      const n: XNode = { tag: m[3], attrs, kids: [] };
      top.kids.push(n);
      if (!m[5]) stack.push(n);
    } else if (m[6] !== undefined && stack.length > 1) top.kids.push(dec(m[6]));
  }
  return root;
}
const ser = (n: XNode | string): string => (typeof n === 'string' ? escT(n) : `<${n.tag}${Object.entries(n.attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join('')}${n.kids.length ? '>' + n.kids.map(ser).join('') + `</${n.tag}>` : '/>'}`);
const kidsOf = (n: XNode): XNode[] => n.kids.filter((k): k is XNode => typeof k !== 'string');
const textOf = (n: XNode): string => n.kids.map((k) => (typeof k === 'string' ? k : textOf(k))).join('');

type Style = Record<string, string>;
const INHERITED = ['fill', 'fill-opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'text-anchor'];
function styleOf(n: XNode, parent: Style, classes: Record<string, Style>): Style {
  const s: Style = {};
  for (const k of INHERITED) if (parent[k] !== undefined) s[k] = parent[k];
  for (const c of (n.attrs.class || '').split(/\s+/).filter(Boolean)) Object.assign(s, classes[c] || {});
  for (const [k, v] of Object.entries(n.attrs)) if (k !== 'style' && k !== 'class') s[k] = v;
  for (const d of (n.attrs.style || '').split(';')) { const i = d.indexOf(':'); if (i > 0) s[d.slice(0, i).trim()] = d.slice(i + 1).trim(); }
  return s;
}

// Ascent and descent as a fraction of the font size (hhea, from the font files). The browser rounds each to whole pixels,
// so a line box of exactly round(a*size)+round(d*size) puts the baseline round(a*size) below the top. Unknown fonts use
// the Arial values and are listed in the report as assumed.
const METRICS: Record<string, [number, number]> = {
  arial: [0.905, 0.212], helvetica: [0.905, 0.212], 'helvetica neue': [0.952, 0.213], inter: [0.96875, 0.2412], roboto: [0.927, 0.244],
  'segoe ui': [1.079, 0.251], poppins: [1.05, 0.35], 'open sans': [1.069, 0.293], 'times new roman': [0.891, 0.216], georgia: [0.917, 0.219],
  verdana: [1.005, 0.21], 'courier new': [0.833, 0.3], 'sans-serif': [0.905, 0.212], serif: [0.891, 0.216], monospace: [0.833, 0.3],
};
const firstFamily = (f: string | undefined): string => (f || 'sans-serif').split(',')[0].trim().replace(/^['"]|['"]$/g, '');

const NAMED = new Set(['white', 'black', 'red', 'green', 'blue', 'gray', 'grey', 'yellow', 'orange', 'purple', 'pink', 'transparent', 'silver', 'navy', 'teal', 'maroon', 'lime', 'aqua', 'fuchsia', 'olive']);
const toRgb = (c: string): [number, number, number] | null => {
  c = c.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(c); if (m) return [...m[1]].map((x) => parseInt(x + x, 16)) as [number, number, number];
  m = /^#([0-9a-f]{6})$/.exec(c); if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
  m = /^rgb\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*\)$/.exec(c); if (m) return [+m[1], +m[2], +m[3]];
  return null;
};
// CSS color for a fill with an optional alpha, or null when the paint is not a flat color (gradient, pattern, currentColor).
function cssColor(fill: string | undefined, alpha: number): string | null {
  if (fill === undefined) fill = 'black';
  const f = fill.trim().toLowerCase();
  if (f === 'none' || f === 'transparent') return 'transparent';
  const rgb = toRgb(f);
  if (rgb) return alpha >= 1 ? f : `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${r2(alpha)})`;
  if (NAMED.has(f)) return alpha >= 1 ? f : null;
  return null;
}
const alphaOf = (s: Style): number => Math.max(0, Math.min(1, parseFloat(s.opacity ?? '1') * parseFloat(s['fill-opacity'] ?? '1')));

export interface Leaf { kind: 'box' | 'text' | 'raw'; x: number; y: number; w: number; h: number; css: Style; role: string; text?: string; raw?: string }
export interface BuildNote { kind: string; detail: string }

interface Ctx { tx: number; ty: number; s: number; style: Style; ancestors: XNode[] }

export interface Parsed { width: number; height: number; leaves: Leaf[]; notes: BuildNote[]; families: string[]; assumed: string[]; assets: string[]; texts: number; raws: number; files: { name: string; data: Buffer }[]; fontSpecs: FontSpec[] }

const REFS = /url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)|(?:xlink:)?href\s*=\s*"#([^"]+)"/g;
export function parseSvg(svgText: string, srcDir = '.', metrics?: Map<string, { a: number; d: number }>): Parsed {
  const specs = new Map<string, FontSpec>();
  const doc = parseXml(svgText);
  const svg = kidsOf(doc).find((k) => k.tag === 'svg');
  if (!svg) throw new Usage('not an SVG file: no <svg> element');
  const vb = (svg.attrs.viewBox || '').split(/[\s,]+/).map(Number);
  const num = (v: string | undefined): number | null => (v && /^[\d.]+(px)?$/.test(v.trim()) ? parseFloat(v) : null);
  const width = num(svg.attrs.width) ?? (vb.length === 4 ? vb[2] : 0), height = num(svg.attrs.height) ?? (vb.length === 4 ? vb[3] : 0);
  if (!width || !height) throw new Usage('the SVG has no width and height (or viewBox)');
  const hasVb = vb.length === 4 && vb.every((n) => !Number.isNaN(n));
  const s0 = hasVb && vb[2] ? width / vb[2] : 1;
  const notes: BuildNote[] = [];
  const classes: Record<string, Style> = {};
  const byId = new Map<string, XNode>();
  (function index(n: XNode): void { if (n.attrs.id) byId.set(n.attrs.id, n); kidsOf(n).forEach(index); })(svg);
  (function css(n: XNode): void {
    if (n.tag === 'style') for (const m of textOf(n).matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)) { const st: Style = {}; for (const d of m[2].split(';')) { const i = d.indexOf(':'); if (i > 0) st[d.slice(0, i).trim()] = d.slice(i + 1).trim(); } classes[m[1]] = { ...(classes[m[1]] || {}), ...st }; }
    kidsOf(n).forEach(css);
  })(svg);

  const leaves: Leaf[] = [];
  const families = new Set<string>(), assumed = new Set<string>(), assets = new Set<string>();
  let texts = 0, raws = 0;
  const files = new Map<string, { name: string; data: Buffer }>();

  // A Figma image fill: a rect painted with a pattern that holds one embedded image, scaled by a plain scale or matrix in
  // bounding-box units. The image is written out as a file and the rect becomes a box with a CSS background that places it
  // exactly (size and offset from the matrix), so the page keeps real image files instead of base64 inside inline SVG.
  const imagePaint = (fill: string, w: number, h: number): Style | null => {
    const m = /^url\(\s*#([^)\s]+)\s*\)$/.exec(fill.trim());
    const pat = m ? byId.get(m[1]) : undefined;
    if (!pat || pat.tag !== 'pattern' || (pat.attrs.patternContentUnits || '') !== 'objectBoundingBox' || pat.attrs.width !== '1' || pat.attrs.height !== '1') return null;
    const kids = kidsOf(pat);
    if (kids.length !== 1 || kids[0].tag !== 'use') return null;
    const use = kids[0];
    const img = byId.get((use.attrs['xlink:href'] || use.attrs.href || '').replace(/^#/, ''));
    if (!img || img.tag !== 'image') return null;
    const iw = parseFloat(img.attrs.width), ih = parseFloat(img.attrs.height);
    const data = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([\s\S]+)$/.exec(img.attrs['xlink:href'] || img.attrs.href || '');
    if (!data || !(iw > 0) || !(ih > 0)) return null;
    const N = '(-?[\\d.]+(?:e-?\\d+)?)';
    let a = 1, d = 1, e = 0, f = 0;
    const t = (use.attrs.transform || '').trim();
    const sc = new RegExp(`^scale\\(\\s*${N}[\\s,]+${N}\\s*\\)$`).exec(t);
    const mx = new RegExp(`^matrix\\(\\s*${N}[\\s,]+0[\\s,]+0[\\s,]+${N}[\\s,]+${N}[\\s,]+${N}\\s*\\)$`).exec(t);
    if (sc) { a = +sc[1]; d = +sc[2]; } else if (mx) { a = +mx[1]; d = +mx[2]; e = +mx[3]; f = +mx[4]; } else if (t) return null;
    if (!(a > 0) || !(d > 0)) return null;
    const name = (img.attrs.id || 'image').replace(/[^\w-]+/g, '-') + '.' + (data[1] === 'jpeg' ? 'jpg' : data[1]);
    files.set(name, { name, data: Buffer.from(data[2], 'base64') });
    return { 'background-image': `url(assets/${name})`, 'background-repeat': 'no-repeat', 'background-size': `${px(a * iw * w)} ${px(d * ih * h)}`, 'background-position': `${px(e * w)} ${px(f * h)}` };
  };

  // Everything an element refers to by id (gradients, clips, filters, patterns and what they use), so a raw layer is self-contained.
  const refsOf = (xml: string, out: Set<string> = new Set()): Set<string> => {
    for (const m of xml.matchAll(REFS)) { const id = m[1] || m[2]; if (id && !out.has(id) && byId.has(id)) { out.add(id); refsOf(ser(byId.get(id)!), out); } }
    return out;
  };
  const raw = (el: XNode, ctx: Ctx, why: string): void => {
    let body = ser(el);
    for (const m of body.matchAll(/(?:xlink:)?href="(?!data:|#|https?:)([^"]+)"/g)) assets.add(m[1]);
    const defs = [...refsOf(body)].map((id) => ser(byId.get(id)!)).join('');
    for (const a of ctx.ancestors.slice().reverse()) body = `<${a.tag}${Object.entries(a.attrs).filter(([k]) => k !== 'id').map(([k, v]) => ` ${k}="${esc(v)}"`).join('')}>${body}</${a.tag}>`;
    const attrs = Object.entries(svg.attrs).filter(([k]) => !/^(xmlns|id|class|style)/.test(k) || k === 'xmlns').map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
    const rawSvg = `<svg${attrs.includes('xmlns=') ? '' : ' xmlns="http://www.w3.org/2000/svg"'}${attrs.includes('xmlns:xlink') ? '' : ' xmlns:xlink="http://www.w3.org/1999/xlink"'}${attrs}>${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;
    leaves.push({ kind: 'raw', x: 0, y: 0, w: width, h: height, css: {}, role: 'raw', raw: rawSvg });
    raws++;
    notes.push({ kind: 'inline-svg', detail: `<${el.tag}${el.attrs.id ? ' id="' + el.attrs.id + '"' : ''}> kept as inline SVG: ${why}` });
  };

  const walk = (el: XNode, ctx: Ctx): void => {
    const st = styleOf(el, ctx.style, classes);
    const tag = el.tag;
    if (['defs', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'pattern', 'filter', 'style', 'title', 'desc', 'metadata', 'symbol', 'marker'].includes(tag)) return;
    const num0 = (v: string | undefined, d = 0): number => { const n = parseFloat(v ?? ''); return Number.isFinite(n) ? n : d; };
    const unsupported = (): string | null => {
      if (st.display === 'none' || st.visibility === 'hidden') return 'hidden';
      if (el.attrs.filter || st.filter) return 'filter';
      if (el.attrs.mask) return 'mask';
      if (el.attrs['clip-path'] && tag !== 'g') return 'clip-path';
      if (el.attrs.transform && tag !== 'g') return 'transform on a shape';
      if (parseFloat(el.attrs.opacity ?? '1') < 1 && tag === 'g') return 'group opacity';
      if (/%/.test(el.attrs.width ?? '') || /%/.test(el.attrs.x ?? '')) return 'percent units';
      return null;
    };
    const A = (x: number, y: number): [number, number] => [ctx.s * (x + ctx.tx), ctx.s * (y + ctx.ty)];
    if (tag === 'g' || tag === 'svg' && el !== svg) {
      if (tag === 'svg') return raw(el, ctx, 'nested <svg>');
      const why = unsupported();
      let tx = ctx.tx, ty = ctx.ty;
      const t = el.attrs.transform;
      if (t) {
        const m = /^\s*translate\(\s*(-?[\d.]+)[\s,]*(-?[\d.]*)\s*\)\s*$/.exec(t) || /^\s*matrix\(\s*1[\s,]+0[\s,]+0[\s,]+1[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)\s*$/.exec(t);
        if (!m) return raw(el, ctx, 'transform ' + t.slice(0, 30));
        tx += parseFloat(m[1]); ty += m[2] ? parseFloat(m[2]) : 0;
      }
      if (why && why !== 'hidden') return raw(el, ctx, why);
      if (why === 'hidden') return;
      let next = { ...ctx, tx, ty, style: st, ancestors: [...ctx.ancestors, el] };
      const cp = /url\(#([^)]+)\)/.exec(el.attrs['clip-path'] || '');
      if (cp) {
        const clip = byId.get(cp[1]);
        const rects = clip ? kidsOf(clip) : [];
        const full = rects.length === 1 && rects[0].tag === 'rect' && !rects[0].attrs.transform && (() => {
          const [cx, cy] = A(num0(rects[0].attrs.x) + (tx - ctx.tx), num0(rects[0].attrs.y) + (ty - ctx.ty));
          return cx <= 0.01 && cy <= 0.01 && cx + ctx.s * num0(rects[0].attrs.width) >= width - 0.01 && cy + ctx.s * num0(rects[0].attrs.height) >= height - 0.01;
        })();
        if (!full) return raw(el, ctx, 'clip-path that is not the whole canvas');
        next = { ...next, ancestors: [...ctx.ancestors] }; // the whole-canvas clip changes nothing
      }
      kidsOf(el).forEach((k) => walk(k, next));
      return;
    }
    const why = unsupported();
    if (why === 'hidden') return;
    if (why) return raw(el, ctx, why);
    if (tag === 'rect' || tag === 'circle' || tag === 'ellipse') {
      const stroke = st.stroke && st.stroke !== 'none' && parseFloat(st['stroke-width'] ?? '1') > 0;
      if (stroke) return raw(el, ctx, 'stroke (SVG centers a stroke on the edge, CSS borders do not)');
      let x = 0, y = 0, w = 0, h = 0, radius = '0';
      if (tag === 'rect') {
        x = num0(el.attrs.x); y = num0(el.attrs.y); w = num0(el.attrs.width); h = num0(el.attrs.height);
        const rx = num0(el.attrs.rx, NaN), ry = num0(el.attrs.ry, NaN);
        const rxv = Number.isNaN(rx) ? (Number.isNaN(ry) ? 0 : ry) : rx, ryv = Number.isNaN(ry) ? rxv : ry;
        if (rxv !== ryv) return raw(el, ctx, 'rect with different rx and ry');
        radius = px(Math.min(ctx.s * rxv, ctx.s * w / 2, ctx.s * h / 2));
      } else if (tag === 'circle') { const r = num0(el.attrs.r); x = num0(el.attrs.cx) - r; y = num0(el.attrs.cy) - r; w = h = 2 * r; radius = '50%'; }
      else { const rx = num0(el.attrs.rx), ry = num0(el.attrs.ry); x = num0(el.attrs.cx) - rx; y = num0(el.attrs.cy) - ry; w = 2 * rx; h = 2 * ry; radius = '50%'; }
      const color = cssColor(st.fill, alphaOf(st));
      if (color === null && tag === 'rect' && alphaOf(st) === 1) {
        const paint = imagePaint(st.fill || '', ctx.s * w, ctx.s * h);
        if (paint) {
          const [px0, py0] = A(x, y);
          leaves.push({ kind: 'box', x: px0, y: py0, w: ctx.s * w, h: ctx.s * h, css: { ...paint, ...(radius !== '0' ? { 'border-radius': radius } : {}) }, role: 'image' });
          return;
        }
      }
      if (color === null) return raw(el, ctx, 'fill is a gradient, pattern or keyword CSS cannot match');
      if (color === 'transparent') return;
      const [ax, ay] = A(x, y);
      leaves.push({ kind: 'box', x: ax, y: ay, w: ctx.s * w, h: ctx.s * h, css: { background: color, ...(radius !== '0' ? { 'border-radius': radius } : {}) }, role: tag === 'rect' ? 'box' : 'shape' });
      return;
    }
    if (tag === 'text') {
      if (Object.keys(el.attrs).some((k) => /^(dx|dy|rotate|textLength|lengthAdjust|writing-mode)$/.test(k)) || kidsOf(el).some((k) => Object.keys(k.attrs).some((a) => /^(dx|dy|rotate|textLength)$/.test(a)))) return raw(el, ctx, 'text with dx, dy or rotate');
      const lines: { x: number; y: number; text: string; st: Style }[] = [];
      const tsp = kidsOf(el).filter((k) => k.tag === 'tspan');
      if (!tsp.length) lines.push({ x: num0(el.attrs.x), y: num0(el.attrs.y), text: textOf(el), st });
      else {
        if (el.kids.some((k) => typeof k === 'string' && k.trim())) return raw(el, ctx, 'text mixed with spans');
        for (const t of tsp) {
          if (t.attrs.x === undefined || t.attrs.y === undefined) { if (tsp.length > 1 || t.attrs.x === undefined && el.attrs.x === undefined) return raw(el, ctx, 'inline text run without its own position'); }
          lines.push({ x: num0(t.attrs.x ?? el.attrs.x), y: num0(t.attrs.y ?? el.attrs.y), text: textOf(t), st: styleOf(t, st, classes) });
        }
      }
      for (const ln of lines) {
        const text = ln.text.replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const color = cssColor(ln.st.fill, alphaOf(ln.st));
        if (color === null) return raw(el, ctx, 'text fill is a gradient or keyword');
        const size = parseFloat(ln.st['font-size'] ?? '16') * ctx.s;
        const fam = firstFamily(ln.st['font-family']);
        const weight = cssWeight(ln.st['font-weight']), fstyle = /italic|oblique/.test(ln.st['font-style'] || '') ? 'italic' : 'normal';
        const stack = ln.st['font-family'] || 'sans-serif', key = `${stack}|${weight}|${fstyle}`;
        specs.set(key, { key, stack, family: fam, weight, style: fstyle });
        const measured = metrics && metrics.get(key); // measured in the browser when available, else the table, else Arial
        const known: [number, number] | undefined = measured ? [measured.a, measured.d] : METRICS[fam.toLowerCase()];
        if (!GENERIC.has(fam.toLowerCase())) families.add(fam);
        if (!known) assumed.add(fam);
        const [a, d] = known || METRICS.arial;
        const asc = Math.round(a * size), desc = Math.round(d * size);
        const [ax, ay] = A(ln.x, ln.y);
        const anchor = ln.st['text-anchor'] || 'start';
        const css: Style = { color, 'font-family': (ln.st['font-family'] || 'sans-serif').replace(/'/g, '"'), 'font-size': px(size), 'line-height': px(asc + desc) };
        if (ln.st['font-weight'] && ln.st['font-weight'] !== 'normal' && ln.st['font-weight'] !== '400') css['font-weight'] = ln.st['font-weight'];
        if (ln.st['font-style'] && ln.st['font-style'] !== 'normal') css['font-style'] = ln.st['font-style'];
        if (ln.st['letter-spacing'] && parseFloat(ln.st['letter-spacing'])) css['letter-spacing'] = px(parseFloat(ln.st['letter-spacing']) * ctx.s);
        if (anchor === 'middle') css.transform = 'translateX(-50%)'; else if (anchor === 'end') css.transform = 'translateX(-100%)';
        css['white-space'] = 'pre';
        texts++;
        leaves.push({ kind: 'text', x: ax, y: ay - asc, w: 0, h: asc + desc, css, role: 'text', text });
      }
      return;
    }
    if (tag === 'image') return raw(el, ctx, 'image');
    if (tag === 'path' || tag === 'line' || tag === 'polyline' || tag === 'polygon') return raw(el, ctx, 'vector path');
    if (tag === 'use' || tag === 'foreignObject') return raw(el, ctx, '<' + tag + '>');
    notes.push({ kind: 'skipped', detail: `<${tag}> is not drawn by this converter` });
  };
  const root: Ctx = { tx: hasVb ? -vb[0] : 0, ty: hasVb ? -vb[1] : 0, s: s0, style: styleOf(svg, {}, classes), ancestors: [] };
  kidsOf(svg).forEach((k) => walk(k, root));
  if (!texts && /<path\b/i.test(svgText)) notes.push({ kind: 'no-text', detail: 'no text nodes found: if the design has text, export the SVG again with "Outline text" unchecked (Export settings, SVG) so it can become real HTML text' });
  return { width: Math.round(width), height: Math.round(height), leaves, notes, families: [...families], assumed: [...assumed], assets: [...assets], texts, raws, files: [...files.values()], fontSpecs: [...specs.values()] };
}

// ---- structure: nesting by containment, then flex rows and columns where the geometry is exact
export interface TNode { leaf: Leaf; kids: TNode[]; flex?: { dir: 'row' | 'column'; gap: number; padStart: number; padCross: number; margins: number[]; members: TNode[] } }
const TOL = 0.01;
const inside = (inner: { x: number; y: number; w: number; h: number }, outer: { x: number; y: number; w: number; h: number }): boolean =>
  inner.x >= outer.x - TOL && inner.y >= outer.y - TOL && inner.x + inner.w <= outer.x + outer.w + TOL && inner.y + inner.h <= outer.y + outer.h + TOL;
const rectOf = (l: Leaf): { x: number; y: number; w: number; h: number } => (l.kind === 'text' ? { x: l.x, y: l.y, w: Math.max(l.w, l.text!.length * parseFloat(l.css['font-size']) * 0.6), h: l.h } : l);
const hit = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function buildTree(leaves: Leaf[], width: number, height: number): TNode {
  const rootLeaf: Leaf = { kind: 'box', x: 0, y: 0, w: width, h: height, css: {}, role: 'root' };
  const nodes: TNode[] = leaves.map((leaf) => ({ leaf, kids: [] }));
  const parentOf = new Array<number>(leaves.length).fill(-1);
  const underOf = (i: number, a: number): boolean => { for (let p = parentOf[i]; p >= 0; p = parentOf[p]) if (p === a) return true; return false; };
  for (let b = 0; b < leaves.length; b++) {
    const lb = leaves[b];
    if (lb.kind === 'raw') continue;
    // the latest earlier box that contains this one and does not let a later-painted neighbour change its stacking
    for (let a = b - 1; a >= 0; a--) {
      const la = leaves[a];
      if (la.kind !== 'box' || !inside(rectOf(lb), la)) continue;
      let ok = true;
      for (let m = a + 1; m < b && ok; m++) if (!underOf(m, a) && hit(rectOf(leaves[m]), rectOf(lb))) ok = false;
      if (ok) { parentOf[b] = a; break; }
    }
  }
  const root: TNode = { leaf: rootLeaf, kids: [] };
  nodes.forEach((n, i) => (parentOf[i] >= 0 ? nodes[parentOf[i]] : root).kids.push(n));
  const flexify = (n: TNode): void => {
    n.kids.forEach(flexify);
    const boxes = n.kids.filter((k) => k.leaf.kind === 'box');
    if (boxes.length < 2) return;
    // The longest run of neighbouring boxes that share a top (row) or a left edge (column), do not overlap and are
    // separated by one equal gap. The DOM order is the paint order, so the run must also be in document order. Siblings
    // outside the run stay absolutely positioned, which takes them out of the flow and leaves the run's geometry exact.
    let best: { dir: 'row' | 'column'; members: TNode[]; gap: number } | null = null;
    for (const dir of ['row', 'column'] as const) {
      const main = dir === 'row' ? 'x' : 'y', cross = dir === 'row' ? 'y' : 'x', size = dir === 'row' ? 'w' : 'h';
      for (let s = 0; s < boxes.length - 1; s++) {
        const run = [boxes[s]];
        let gap = NaN;
        for (let i = s + 1; i < boxes.length; i++) {
          const p = run[run.length - 1].leaf, c = boxes[i].leaf;
          const g = c[main] - (p[main] + p[size]);
          if (Math.abs(c[cross] - run[0].leaf[cross]) > TOL || g < -TOL || (!Number.isNaN(gap) && Math.abs(g - gap) > TOL)) break;
          gap = g;
          run.push(boxes[i]);
        }
        if (run.length >= 2 && (!best || run.length > best.members.length)) best = { dir, members: run, gap };
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

export interface Built { html: string; css: string; classes: Record<string, string>; width: number; height: number }

export function emit(tree: TNode, parsed: Parsed, title: string): Built {
  const rules: string[] = [];
  const classes: Record<string, string> = {};
  let n = 0;
  const declare = (role: string, css: Style): string => { const name = 'fc-' + ++n; classes[name] = role; rules.push(`.${name} {\n${Object.entries(css).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`); return name; };
  const html: string[] = [];
  const out = (depth: number, s: string): void => { html.push('  '.repeat(depth) + s); };
  const visit = (t: TNode, parent: TNode, depth: number, inFlow: boolean, flowIndex: number): void => {
    const l = t.leaf;
    if (l.kind === 'raw') {
      const cls = declare('raw', { position: 'absolute', left: '0', top: '0', 'pointer-events': 'none' });
      out(depth, `<div class="${cls}">${l.raw}</div>`);
      return;
    }
    const left = l.x - parent.leaf.x, top = l.y - parent.leaf.y;
    if (l.kind === 'text') {
      const css: Style = { position: 'absolute', left: px(left), top: px(top), ...l.css };
      out(depth, `<span class="${declare('text', css)}">${escT(l.text!)}</span>`);
      return;
    }
    const css: Style = inFlow ? { position: 'relative', 'flex-shrink': '0' } : { position: 'absolute', left: px(left), top: px(top) };
    css.width = px(l.w); css.height = px(l.h);
    if (inFlow && parent.flex) { const m = parent.flex.margins[flowIndex]; if (m) css[parent.flex.dir === 'row' ? 'margin-top' : 'margin-left'] = px(m); }
    Object.assign(css, l.css);
    if (t.flex) {
      css.display = 'flex'; css['flex-direction'] = t.flex.dir; css['align-items'] = 'flex-start'; css.gap = px(t.flex.gap);
      if (t.flex.dir === 'row') { css['padding-left'] = px(t.flex.padStart); css['padding-top'] = px(t.flex.padCross); } else { css['padding-top'] = px(t.flex.padStart); css['padding-left'] = px(t.flex.padCross); }
    }
    const cls = declare(l.role, css);
    if (!t.kids.length) { out(depth, `<div class="${cls}"></div>`); return; }
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
  for (const k of root.kids) { const flowing = !!root.flex && root.flex.members.includes(k); visit(k, root, 2, flowing, flowing ? fi++ : 0); }
  out(1, '</div>');
  const css = ['/* generated by figma-code */', '*, *::before, *::after { box-sizing: border-box; }', 'body { margin: 0; background: #fff; }', ...rules].join('\n') + '\n';
  const doc = `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${escT(title)}</title>\n  <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n${html.join('\n')}\n</body>\n</html>\n`;
  return { html: doc, css, classes, width: parsed.width, height: parsed.height };
}

// ============================================================ the gated pipeline steps
export interface GateResult { diff: DiffResult; ok: boolean; maxDiff: number }
export interface Meta { name: string; width: number; height: number; classes: Record<string, string>; source: string; framework?: string; component?: string; photos?: { x: number; y: number; w: number; h: number }[]; photoTol?: number }
const PHOTO_TOL = 48;
const looseOf = (m: Meta, override?: number): Loose | undefined => (m.photos && m.photos.length ? { rects: m.photos, tol: override ?? m.photoTol ?? PHOTO_TOL } : undefined);

function render(htmlOrSvg: string, w: number, h: number, out: string): Img { screenshot(htmlOrSvg, w, h, out); return decodePng(fs.readFileSync(out)); }

export interface BuildOpts { name?: string; out?: string; maxDiff: number; tol: number; photoTol?: number; faces?: FontFile[]; fontNotes?: string[]; unresolvedFonts?: string[]; root?: string; record?: boolean }
export interface BuildReport {
  name: string; out: string; width: number; height: number; leaves: { boxes: number; texts: number; raws: number; flexRows: number; flexColumns: number };
  notes: BuildNote[]; fonts: { used: string[]; missing: string[]; assumedMetrics: string[]; checked: boolean; files: number; unresolved: string[]; notes: string[] }; gate: GateResult; images: number; recorded: string | null;
}

// ---- the project-context folder (the private, gitignored docs folder of the project-context add-on)
export const contextDesign = (root: string): string | null => { const d = path.join(root, 'project-context', 'design'); return fs.existsSync(d) && fs.statSync(d).isDirectory() ? d : null; };
export function contextSvgs(root: string): string[] {
  const d = contextDesign(root);
  if (!d) return [];
  const out: string[] = [];
  const walk = (p: string): void => { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const f = path.join(p, e.name); if (e.isDirectory()) walk(f); else if (/\.svg$/i.test(e.name)) out.push(f); } };
  walk(d);
  return out.sort();
}
// One row per frame in project-context/design/figma-code.md, replaced on a rebuild, so a later session (or /ctx analyze) sees
// the state of each conversion without opening the output. No pixels and no markup are copied into the private folder.
export function recordBuild(root: string, r: BuildReport, source: string): string | null {
  const d = contextDesign(root);
  if (!d) return null;
  const file = path.join(d, 'figma-code.md');
  const head = ['# figma-code builds', '', 'Written by `figma-code build`; one row per frame, replaced on a rebuild. The conversion output is in the folder named in each row, not here.', '', '| Frame | Source | Size (px) | Diff | Text lines | Inline SVG layers | Images | Fonts missing | Output | Built |', '|---|---|---|---|---|---|---|---|---|---|'];
  const cell = (s: string): string => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
  const row = `| ${cell(r.name)} | ${cell(norm(path.relative(root, source)))} | ${r.width} x ${r.height} | ${r.gate.diff.percent}% (${r.gate.ok ? 'pass' : 'FAIL'}, limit ${r.gate.maxDiff}%) | ${r.leaves.texts} | ${r.leaves.raws} | ${r.images} | ${r.fonts.missing.join(', ') || 'none'} | ${cell(norm(path.relative(root, r.out)))} | ${new Date().toISOString().slice(0, 10)} |`;
  const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => /^\| /.test(l) && !/^\| Frame /.test(l) && !l.startsWith(`| ${cell(r.name)} |`)) : [];
  fs.writeFileSync(file, [...head, ...old, row].join('\n') + '\n');
  return norm(path.relative(root, file));
}

export function outputOf(svgFile: string, name?: string, out?: string): { name: string; out: string } {
  const n = name || path.basename(svgFile, path.extname(svgFile)).replace(/[^A-Za-z0-9_-]+/g, '-').toLowerCase();
  return { name: n, out: path.resolve(out || path.join('figma-code-out', n)) };
}

export function build(svgFile: string, o: BuildOpts): BuildReport {
  const svgText = fs.readFileSync(svgFile, 'utf8');
  const { name, out } = outputOf(svgFile, o.name, o.out);
  const faces = o.faces || [];
  // text metrics and font availability come from the browser that draws the diff; fonts given or downloaded are loaded for it
  const probe = probeFonts(parseSvg(svgText, path.dirname(svgFile)).fontSpecs, faces);
  const parsed = parseSvg(svgText, path.dirname(svgFile), new Map([...probe].map(([k, v]) => [k, { a: v.a, d: v.d }])));
  const tree = buildTree(parsed.leaves, parsed.width, parsed.height);
  const built = emit(tree, parsed, name);
  fs.mkdirSync(out, { recursive: true });
  if (faces.length) {
    fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
    for (const f of faces) { const dest = path.join(out, 'assets', path.basename(f.file)); if (path.resolve(f.file) !== path.resolve(dest)) fs.copyFileSync(f.file, dest); }
    built.css = built.css.replace('/* generated by figma-code */\n', `/* generated by figma-code */\n${fontFaceCss(faces, (f) => 'assets/' + path.basename(f.file))}\n`);
  }
  let html = built.html;
  if (parsed.files.length) { fs.mkdirSync(path.join(out, 'assets'), { recursive: true }); for (const f of parsed.files) fs.writeFileSync(path.join(out, 'assets', f.name), f.data); }
  if (parsed.assets.length) {
    fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
    for (const a of new Set(parsed.assets)) {
      const src = path.resolve(path.dirname(svgFile), a);
      if (fs.existsSync(src)) { fs.copyFileSync(src, path.join(out, 'assets', path.basename(a))); html = html.split(`"${esc(a)}"`).join(`"assets/${esc(path.basename(a))}"`); }
      else parsed.notes.push({ kind: 'missing-asset', detail: `${a} is referenced by the SVG and was not found next to it` });
    }
  }
  fs.writeFileSync(path.join(out, 'index.html'), html);
  fs.writeFileSync(path.join(out, 'styles.css'), built.css);
  const copy = path.join(out, 'source.svg');
  fs.copyFileSync(svgFile, copy);
  const meta: Meta = { name, width: parsed.width, height: parsed.height, classes: built.classes, source: 'source.svg', photos: parsed.leaves.filter((l) => l.role === 'image').map((l) => ({ x: Math.floor(l.x), y: Math.floor(l.y), w: Math.ceil(l.w) + 1, h: Math.ceil(l.h) + 1 })), photoTol: o.photoTol ?? PHOTO_TOL };
  fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
  // With font files the reference SVG is drawn inline in a page that loads them (an SVG file opened directly cannot).
  let refSource = copy;
  const tmpRef = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-code-ref-'));
  try {
    if (faces.length) {
      refSource = path.join(tmpRef, 'reference.html');
      fs.writeFileSync(refSource, `<!doctype html><html><head><meta charset="utf-8"><style>${fontFaceCss(faces, (f) => fileUrl(f.file))}\nbody{margin:0;background:#fff}</style></head><body>${svgText.replace(/^\s*<\?xml[^>]*\?>/, '')}</body></html>`);
    }
    var ref = render(refSource, parsed.width, parsed.height, path.join(out, 'reference.png'));
  } finally { fs.rmSync(tmpRef, { recursive: true, force: true }); }
  const got = render(path.join(out, 'index.html'), parsed.width, parsed.height, path.join(out, 'render.png'));
  const diff = diffImages(ref, got, o.tol, looseOf(meta));
  const missing = [...new Set(parsed.fontSpecs.filter((s) => probe.get(s.key) && !probe.get(s.key)!.avail && !faces.some((f) => f.family === s.family)).map((s) => s.family))].filter((f) => !GENERIC.has(f.toLowerCase()));
  const fonts = { missing, checked: probe.size > 0 };
  const count = (t: TNode, f: (x: TNode) => boolean): number => (f(t) ? 1 : 0) + t.kids.reduce((s, k) => s + count(k, f), 0);
  const report: BuildReport = {
    name, out, width: parsed.width, height: parsed.height,
    leaves: { boxes: parsed.leaves.filter((l) => l.kind === 'box').length, texts: parsed.texts, raws: parsed.raws, flexRows: count(tree, (x) => x.flex?.dir === 'row'), flexColumns: count(tree, (x) => x.flex?.dir === 'column') },
    notes: parsed.notes, fonts: { used: parsed.families, missing: fonts.missing, assumedMetrics: parsed.assumed, checked: fonts.checked, files: faces.length, unresolved: o.unresolvedFonts || [], notes: o.fontNotes || [] },
    gate: { diff, ok: diff.percent <= o.maxDiff && !diff.sizeMismatch, maxDiff: o.maxDiff }, images: parsed.files.length, recorded: null,
  };
  if (o.record !== false) report.recorded = recordBuild(path.resolve(o.root || process.cwd()), report, svgFile);
  return report;
}

// ============================================================ 4d: standards pass
export interface Rule { id: string; kind: 'safe' | 'risky'; type: string; enabled?: boolean; [k: string]: unknown }
export interface Rules { version: number; block?: string; rules: Rule[] }
const RULES_FILE = 'figma-code.standards.json';
export function loadRules(file?: string): Rules {
  const here = path.dirname(__filename);
  const cands = [file, path.join(here, 'standards.json'), path.join(here, RULES_FILE)].filter(Boolean) as string[];
  const f = cands.find((c) => fs.existsSync(c));
  if (!f) throw new Usage('no standards file found; pass --rules <file>');
  const r = JSON.parse(fs.readFileSync(f, 'utf8')) as Rules;
  if (!Array.isArray(r.rules)) throw new Usage(`${f}: "rules" must be a list`);
  for (const x of r.rules) if (x.kind !== 'safe' && x.kind !== 'risky') throw new Usage(`${f}: rule "${x.id}" needs "kind": "safe" or "risky"`);
  return r;
}

interface Files { html: string; css: string; classes: Record<string, string> }
const hexShort = (s: string): string => s.replace(/#([0-9a-fA-F])\1([0-9a-fA-F])\2([0-9a-fA-F])\3\b/g, (_m, a: string, b: string, c: string) => '#' + (a + b + c).toLowerCase()).replace(/#([0-9a-fA-F]{3,6})\b/g, (m) => m.toLowerCase());

export function applyRule(rule: Rule, f: Files, block: string, name: string): Files {
  if (rule.type === 'rename-classes') {
    const scheme = String(rule.scheme || 'bem'), prefix = String(rule.prefix || '');
    const b = prefix + (block || name).replace(/[^A-Za-z0-9-]+/g, '-').toLowerCase();
    const per: Record<string, number> = {};
    const map: Record<string, string> = {};
    for (const [old, role] of Object.entries(f.classes)) {
      per[role] = (per[role] || 0) + 1;
      map[old] = role === 'root' ? b : scheme === 'bem' ? `${b}__${role}-${per[role]}` : scheme === 'kebab' ? `${b}-${role}-${per[role]}` : `${prefix}${role}-${per[role]}`;
    }
    const sub = (s: string): string => s.replace(/\bfc-\d+\b/g, (m) => map[m] ?? m);
    const classes: Record<string, string> = {};
    for (const [old, role] of Object.entries(f.classes)) classes[map[old]] = role;
    return { html: sub(f.html), css: sub(f.css), classes };
  }
  if (rule.type === 'hex-short') return { ...f, css: hexShort(f.css), html: hexShort(f.html) };
  if (rule.type === 'px-to-rem') {
    const base = Number(rule.base) || 16, props = (rule.props as string[] | undefined) || ['font-size', 'gap', 'padding', 'margin'];
    const css = f.css.replace(/^(\s*)([a-z-]+):\s*([^;]+);/gm, (m, ind: string, prop: string, val: string) => (props.some((p) => prop === p || prop.startsWith(p + '-')) ? `${ind}${prop}: ${val.replace(/(-?\d*\.?\d+)px\b/g, (_x, v: string) => (parseFloat(v) === 0 ? '0' : Math.round((parseFloat(v) / base) * 10000) / 10000 + 'rem'))};` : m));
    return { ...f, css };
  }
  if (rule.type === 'round-px') {
    const maxDelta = Number(rule.maxDelta ?? 0.5);
    return { ...f, css: f.css.replace(/(-?\d*\.\d+)px\b/g, (m, v: string) => (Math.abs(Math.round(parseFloat(v)) - parseFloat(v)) <= maxDelta ? Math.round(parseFloat(v)) + 'px' : m)) };
  }
  if (rule.type === 'colors-to-tokens') {
    const tf = String(rule.tokens || '');
    if (!tf || !fs.existsSync(tf)) return f;
    const toks = [...fs.readFileSync(tf, 'utf8').matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*;/g)].map((m) => [m[1], hexShort(m[2])]);
    return { ...f, css: f.css.replace(/#[0-9a-fA-F]{3,6}\b/g, (m) => { const t = toks.find(([, v]) => v === hexShort(m)); return t ? `var(${t[0]})` : m; }) };
  }
  throw new Usage(`unknown rule type "${rule.type}" in rule "${rule.id}"`);
}

export interface RuleResult { id: string; kind: string; outcome: 'applied' | 'reverted' | 'skipped' | 'no-change'; before?: number; after?: number }
export interface StandardsReport { dir: string; baseline: number; final: number; results: RuleResult[]; gate: GateResult }
const rd = (dir: string): Files => ({ html: fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), css: fs.readFileSync(path.join(dir, 'styles.css'), 'utf8'), classes: (JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')) as Meta).classes });
function wr(dir: string, f: Files): void {
  fs.writeFileSync(path.join(dir, 'index.html'), f.html); fs.writeFileSync(path.join(dir, 'styles.css'), f.css);
  const mp = path.join(dir, 'meta.json'), m = JSON.parse(fs.readFileSync(mp, 'utf8')) as Meta; m.classes = f.classes;
  fs.writeFileSync(mp, JSON.stringify(m, null, 2) + '\n');
}
const EPS = 0.05; // percentage points a risky rule may add before it is reverted

export function standards(dir: string, rulesFile: string | undefined, o: { maxDiff: number; tol: number; dryRun: boolean }): StandardsReport {
  const d = path.resolve(dir);
  const meta = JSON.parse(fs.readFileSync(path.join(d, 'meta.json'), 'utf8')) as Meta;
  const rules = loadRules(rulesFile);
  const ref = decodePng(fs.readFileSync(path.join(d, 'reference.png')));
  const score = (): number => { const p = path.join(d, 'render.png'); screenshot(path.join(d, 'index.html'), meta.width, meta.height, p); return diffImages(ref, decodePng(fs.readFileSync(p)), o.tol, looseOf(meta)).percent; };
  const original = rd(d);
  let cur = original;
  const baseline = score();
  let curScore = baseline;
  const results: RuleResult[] = [];
  const on = rules.rules.filter((r) => r.enabled !== false);
  for (const r of rules.rules.filter((x) => x.enabled === false)) results.push({ id: r.id, kind: r.kind, outcome: 'skipped' });
  const safe = on.filter((r) => r.kind === 'safe');
  let next = cur;
  for (const r of safe) next = applyRule(r, next, rules.block || '', meta.name);
  if (safe.length) {
    // all safe rules as one batch; if the batch moves the diff it is a bug in a rule, so none of them is kept
    wr(d, next);
    const s = score();
    if (s <= curScore + EPS) { cur = next; curScore = s; for (const r of safe) results.push({ id: r.id, kind: 'safe', outcome: next.html === original.html && next.css === original.css ? 'no-change' : 'applied', before: baseline, after: s }); }
    else { wr(d, cur); for (const r of safe) results.push({ id: r.id, kind: 'safe', outcome: 'reverted', before: baseline, after: s }); }
  }
  for (const r of on.filter((x) => x.kind === 'risky')) {
    const t = applyRule(r, cur, rules.block || '', meta.name);
    if (t.html === cur.html && t.css === cur.css) { results.push({ id: r.id, kind: 'risky', outcome: 'no-change', before: curScore, after: curScore }); continue; }
    wr(d, t);
    const s = score();
    if (s <= curScore + EPS) { cur = t; results.push({ id: r.id, kind: 'risky', outcome: 'applied', before: curScore, after: s }); curScore = s; }
    else { wr(d, cur); results.push({ id: r.id, kind: 'risky', outcome: 'reverted', before: curScore, after: s }); }
  }
  if (o.dryRun) wr(d, original);
  // The last render may be a reverted trial, so render the state that was kept.
  const finalPng = path.join(d, 'render.png');
  screenshot(path.join(d, 'index.html'), meta.width, meta.height, finalPng);
  const finalDiff = diffImages(ref, decodePng(fs.readFileSync(finalPng)), o.tol, looseOf(meta));
  return { dir: d, baseline, final: finalDiff.percent, results, gate: { diff: finalDiff, ok: finalDiff.percent <= o.maxDiff, maxDiff: o.maxDiff } };
}

// ============================================================ 4c: framework adapter
export type Framework = 'next' | 'astro' | 'laravel' | 'plain';
export function detectFramework(root: string): { framework: Framework; evidence: string } {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    if (deps.next) return { framework: 'next', evidence: 'package.json has next' };
    if (deps.astro) return { framework: 'astro', evidence: 'package.json has astro' };
  } catch { /* no package.json */ }
  try {
    const c = JSON.parse(fs.readFileSync(path.join(root, 'composer.json'), 'utf8')) as { require?: Record<string, string> };
    if (c.require && c.require['laravel/framework']) return { framework: 'laravel', evidence: 'composer.json requires laravel/framework' };
  } catch { /* no composer.json */ }
  return { framework: 'plain', evidence: 'no Next, Astro or Laravel found' };
}

const pascal = (s: string): string => s.replace(/(^|[^A-Za-z0-9]+)([A-Za-z0-9])/g, (_m, _a, c: string) => c.toUpperCase()).replace(/^[0-9]+/, '') || 'FigmaFrame';
const JSX_ATTR: Record<string, string> = { class: 'className', 'xlink:href': 'xlinkHref', 'xmlns:xlink': 'xmlnsXlink', 'stroke-width': 'strokeWidth', 'stroke-linecap': 'strokeLinecap', 'stroke-linejoin': 'strokeLinejoin', 'stroke-miterlimit': 'strokeMiterlimit', 'stroke-dasharray': 'strokeDasharray', 'stroke-dashoffset': 'strokeDashoffset', 'stroke-opacity': 'strokeOpacity', 'fill-rule': 'fillRule', 'fill-opacity': 'fillOpacity', 'clip-rule': 'clipRule', 'clip-path': 'clipPath', 'stop-color': 'stopColor', 'stop-opacity': 'stopOpacity', 'font-family': 'fontFamily', 'font-size': 'fontSize', 'font-weight': 'fontWeight', 'text-anchor': 'textAnchor', 'letter-spacing': 'letterSpacing', 'color-interpolation-filters': 'colorInterpolationFilters', 'flood-opacity': 'floodOpacity', 'flood-color': 'floodColor', 'gradientunits': 'gradientUnits', 'gradientUnits': 'gradientUnits', 'gradientTransform': 'gradientTransform', 'patternUnits': 'patternUnits', 'preserveAspectRatio': 'preserveAspectRatio', 'viewBox': 'viewBox', 'stdDeviation': 'stdDeviation', 'xml:space': 'xmlSpace' };
const JSX_BACK = Object.fromEntries(Object.entries(JSX_ATTR).map(([k, v]) => [v, k]));
const VOID = new Set(['img', 'br', 'hr', 'input', 'link', 'meta']);

function bodyOf(html: string): string { const m = /<body>\n?([\s\S]*?)\n?<\/body>/.exec(html); if (!m) throw new Usage('index.html has no <body>'); return m[1]; }

export function toJsx(markup: string, cssModule: boolean): string {
  const tree = parseXml(markup);
  const attr = (k: string, v: string): string => {
    if (k === 'class') return cssModule ? v.split(/\s+/).map((c) => `styles['${c}']`).join(' + " " + ').replace(/^(.*)$/, (m) => `className={${m}}`) : `className="${esc(v)}"`;
    if (k === 'style') return `style={{${v.split(';').filter((x) => x.trim()).map((d) => { const i = d.indexOf(':'); return `${JSON.stringify(d.slice(0, i).trim().replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase()))}: ${JSON.stringify(d.slice(i + 1).trim())}`; }).join(', ')}}}`;
    return `${JSX_ATTR[k] ?? k}="${esc(v).replace(/\{/g, '&#123;')}"`;
  };
  const one = (n: XNode | string, depth: number): string => {
    const pad = '  '.repeat(depth);
    if (typeof n === 'string') return n.trim() ? pad + n.trim().replace(/[{}<>]/g, (c) => ({ '{': '{"{"}', '}': '{"}"}', '<': '&lt;', '>': '&gt;' }[c] as string)) : '';
    const attrs = Object.entries(n.attrs).map(([k, v]) => ' ' + attr(k, v)).join('');
    const kids = n.kids.map((k) => one(k, depth + 1)).filter(Boolean);
    if (!kids.length) return `${pad}<${n.tag}${attrs} />`;
    if (kids.length === 1 && typeof n.kids[0] === 'string') return `${pad}<${n.tag}${attrs}>${kids[0].trim()}</${n.tag}>`;
    return `${pad}<${n.tag}${attrs}>\n${kids.join('\n')}\n${pad}</${n.tag}>`;
  };
  return kidsOf(tree).map((k) => one(k, 2)).join('\n');
}

// The reverse of the three adapters, used to render what was written and diff it against the baseline.
export function fromJsx(jsx: string, css: string): { html: string; css: string } {
  let body = jsx.replace(/styles\['([^']+)'\](?:\s*\+\s*" "\s*\+\s*)?/g, '$1 ').replace(/className=\{([^}]*)\}/g, (_m, v: string) => `class="${v.replace(/\s+/g, ' ').trim()}"`);
  body = body.replace(/className="/g, 'class="');
  body = body.replace(/ ([a-zA-Z]+)=/g, (m, k: string) => ` ${JSX_BACK[k] ?? k}=`).replace(/&#123;/g, '{');
  body = body.replace(/\{"([{}])"\}/g, '$1');
  body = body.replace(/<([a-zA-Z][\w:-]*)([^<>]*?)\s*\/>/g, (m, tag: string, attrs: string) => (VOID.has(tag) ? m : `<${tag}${attrs}></${tag}>`));
  return { html: body, css };
}

export interface AdaptReport { framework: Framework; evidence: string; component: string | null; files: string[]; gate: GateResult | null; notes: string[] }

export function adapt(dir: string, o: { root: string; framework?: Framework; maxDiff: number; tol: number; dryRun: boolean; force: boolean }): AdaptReport {
  const d = path.resolve(dir), root = path.resolve(o.root);
  const meta = JSON.parse(fs.readFileSync(path.join(d, 'meta.json'), 'utf8')) as Meta;
  const det = o.framework ? { framework: o.framework, evidence: 'chosen with --framework' } : detectFramework(root);
  const f = rd(d);
  const comp = pascal(meta.name);
  const notes: string[] = [];
  const written: string[] = [];
  if (det.framework === 'plain') return { framework: 'plain', evidence: det.evidence, component: null, files: [], gate: null, notes: ['no framework found: index.html and styles.css in ' + d + ' are already standalone'] };
  const src = fs.existsSync(path.join(root, 'src')) && det.framework !== 'laravel' ? path.join(root, 'src') : root;
  const assets = fs.existsSync(path.join(d, 'assets')) ? fs.readdirSync(path.join(d, 'assets')) : [];
  const files: { rel: string; text?: string; copyFrom?: string }[] = [];
  const markup = bodyOf(f.html);
  const pubDir = `figma-code/${meta.name}`;
  const fixAssets = (s: string, prefix: string): string => assets.reduce((t, a) => t.split(`"assets/${a}"`).join(`"${prefix}/${a}"`), s);
  const fixCss = (s: string, prefix: string): string => s.split('url(assets/').join(`url(${prefix}/`); // CSS backgrounds point at the same copied assets
  let verify: { html: string; css: string };
  const need = (rel: string): string => { const p = path.join(root, rel); if (fs.existsSync(p) && !o.force) throw new Usage(`${norm(path.relative(process.cwd(), p))} already exists; pass --force to overwrite it`); return p; };
  if (det.framework === 'astro') {
    const rel = norm(path.relative(root, path.join(src, 'components', comp + '.astro')));
    const body = fixAssets(markup, '/' + pubDir);
    files.push({ rel, text: `---\n// generated by figma-code from ${meta.source}; edit the markup and styles freely\n---\n${body}\n<style is:global>\n${fixCss(f.css, '/' + pubDir)}</style>\n` });
    for (const a of assets) files.push({ rel: `public/${pubDir}/${a}`, copyFrom: path.join(d, 'assets', a) });
    verify = { html: markup, css: f.css };
  } else if (det.framework === 'next') {
    const rel = norm(path.relative(root, path.join(src, 'components', comp + '.jsx')));
    const jsx = fixAssets(toJsx(markup, true), '/' + pubDir);
    const css = fixCss(f.css, '/' + pubDir).replace(/^\*, \*::before, \*::after \{ box-sizing: border-box; \}\nbody \{[^}]*\}\n/m, '').replace(/^(\.fc-root|\.[\w-]+)( \{)/m, '$1$2');
    const rootClass = Object.entries(f.classes).find(([, r]) => r === 'root')![0];
    files.push({ rel, text: `// generated by figma-code from ${meta.source}; edit the markup and styles freely\nimport styles from './${comp}.module.css';\n\nexport default function ${comp}() {\n  return (\n${jsx}\n  );\n}\n` });
    files.push({ rel: norm(path.relative(root, path.join(src, 'components', comp + '.module.css'))), text: `.${rootClass}, .${rootClass} * { box-sizing: border-box; }\n${css}` });
    for (const a of assets) files.push({ rel: `public/${pubDir}/${a}`, copyFrom: path.join(d, 'assets', a) });
    notes.push('CSS Modules rename the classes at build time; no "use client" is needed because the component has no state or events');
    verify = fromJsx(toJsx(markup, true), f.css);
  } else {
    const dash = meta.name.replace(/[^A-Za-z0-9-]+/g, '-').toLowerCase();
    const bl = (s: string): string => s.replace(/@/g, '@@').replace(/\{\{/g, '@{{').replace(/\{!!/g, '@{!!');
    files.push({ rel: `resources/views/components/${dash}.blade.php`, text: `{{-- generated by figma-code from ${meta.source}; edit the markup and styles freely --}}\n<link rel="stylesheet" href="{{ asset('css/figma-code/${dash}.css') }}">\n${bl(fixAssets(markup, "/" + pubDir))}\n` });
    files.push({ rel: `public/css/figma-code/${dash}.css`, text: fixCss(f.css, '/' + pubDir) });
    for (const a of assets) files.push({ rel: `public/${pubDir}/${a}`, copyFrom: path.join(d, 'assets', a) });
    verify = { html: markup, css: f.css };
  }
  const gate = (() => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-code-adapt-'));
    try {
      fs.writeFileSync(path.join(tmp, 'index.html'), `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" href="styles.css"></head><body>\n${verify.html}\n</body></html>\n`);
      fs.writeFileSync(path.join(tmp, 'styles.css'), verify.css);
      if (assets.length) { fs.mkdirSync(path.join(tmp, 'assets')); for (const a of assets) fs.copyFileSync(path.join(d, 'assets', a), path.join(tmp, 'assets', a)); }
      const ref = decodePng(fs.readFileSync(path.join(d, 'reference.png')));
      const img = render(path.join(tmp, 'index.html'), meta.width, meta.height, path.join(tmp, 'render.png'));
      const diff = diffImages(ref, img, o.tol, looseOf(meta));
      return { diff, ok: diff.percent <= o.maxDiff && !diff.sizeMismatch, maxDiff: o.maxDiff } as GateResult;
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  })();
  if (!o.dryRun && gate.ok) {
    for (const fl of files) {
      const p = fl.copyFrom ? path.join(root, fl.rel) : need(fl.rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      if (fl.copyFrom) fs.copyFileSync(fl.copyFrom, p); else fs.writeFileSync(p, fl.text!);
      written.push(fl.rel);
    }
    meta.framework = det.framework; meta.component = files[0].rel;
    fs.writeFileSync(path.join(d, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
  } else if (!gate.ok) notes.push('nothing was written into the project: the rendered component is over the diff limit');
  return { framework: det.framework, evidence: det.evidence, component: files[0].rel, files: o.dryRun ? files.map((x) => x.rel) : written, gate, notes };
}

// ============================================================ output and CLI
const boxLine = (b: Box): string => `  ${b.w}x${b.h} at (${b.x}, ${b.y}), ${b.count} px`;
const gateLines = (g: GateResult, label: string): string[] => [
  `${label}: ${g.diff.percent}% of pixels differ (${g.diff.differing} of ${g.diff.total}), limit ${g.maxDiff}% -> ${g.ok ? 'PASS' : 'FAIL'}`,
  ...(g.diff.sizeMismatch ? ['  ' + g.diff.sizeMismatch] : []),
  ...(g.diff.boxes.length ? ['worst regions:', ...g.diff.boxes.slice(0, 5).map(boxLine)] : []),
];

export function renderBuild(r: BuildReport): string {
  const L = [`figma-code build: ${r.name} (${r.width}x${r.height}) -> ${norm(path.relative(process.cwd(), r.out)) || '.'}`];
  const noText = r.notes.find((n) => n.kind === 'no-text');
  if (noText) L.push('WARNING: ' + noText.detail);
  if (r.fonts.files) L.push(`fonts: ${r.fonts.files} font file(s) loaded for the reference render and written into the page as @font-face (copied to assets/)`);
  for (const n of r.fonts.notes) L.push('fonts: ' + n);
  if (r.fonts.unresolved.length) L.push(`NOT FOUND on Google Fonts: ${r.fonts.unresolved.join(', ')}. Put the font file(s) (.ttf or .otf) in a folder and run again with --fonts <folder>.`);
  if (r.fonts.missing.length) L.push(`FONTS NOT AVAILABLE: ${r.fonts.missing.join(', ')}. Run again with --download-fonts (fetches them from Google Fonts into assets/, self-hosted) or --fonts <folder> with your own .ttf or .otf files. Until then both renders fall back to another font, so the text diff is only as good as the fallback.`);
  if (r.fonts.assumedMetrics.length) L.push(`font metrics assumed (Arial values) for: ${r.fonts.assumedMetrics.join(', ')}; text may sit a pixel or two off`);
  L.push(`${r.leaves.boxes} boxes, ${r.leaves.texts} text lines, ${r.leaves.flexRows} flex rows, ${r.leaves.flexColumns} flex columns, ${r.leaves.raws} inline SVG layers`);
  if (r.images) L.push(`${r.images} image file(s) extracted to assets/ and placed with CSS backgrounds (photo boxes are diffed at a looser tolerance because SVG and CSS resample photos differently; everything else is strict)`);
  // the same reason repeated is one line with a count (a page can have 200 vector paths kept as inline SVG)
  const groups = new Map<string, number>();
  for (const n of r.notes.filter((x) => x.kind !== 'no-text')) { const k = n.detail.replace(/ id="[^"]*"/, '').replace(/^<(\w+)[^>]*>/, '<$1>'); groups.set(k, (groups.get(k) || 0) + 1); }
  const sorted = [...groups].sort((a, b) => b[1] - a[1]);
  for (const [k, c] of sorted.slice(0, 8)) L.push(`note: ${c} x ${k}`);
  if (sorted.length > 8) L.push(`(+${sorted.length - 8} more kinds of notes; --json lists every one)`);
  L.push(...gateLines(r.gate, 'pixel diff vs the SVG'));
  if (r.recorded) L.push(`recorded in ${r.recorded} (project-context)`);
  return L.join('\n');
}

function parseArgs(argv: string[]): { cmd: string; pos: string[]; flags: Record<string, string | boolean> } {
  const [cmd, ...rest] = argv;
  const pos: string[] = [], flags: Record<string, string | boolean> = {};
  const withValue = new Set(['name', 'out', 'max-diff', 'tol', 'rules', 'root', 'framework', 'width', 'height', 'photo-tol', 'fonts']);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) { const k = a.slice(2); if (withValue.has(k)) { if (rest[i + 1] === undefined) throw new Usage(`--${k} needs a value`); flags[k] = rest[++i]; } else flags[k] = true; }
    else pos.push(a);
  }
  return { cmd, pos, flags };
}
const USAGE = 'usage: figma-code.cli.js detect | build <file.svg> | diff <a> <b> | standards <dir> | adapt <dir>  (see the header of this file)';

function detect(root: string): { chrome: string | null; node: string; framework: Framework; evidence: string; svgs: string[]; context: { design: boolean; svgs: string[]; fontsDir: string | null } } {
  const svgs: string[] = [];
  const walk = (d: string, depth: number): void => {
    if (depth > 3 || svgs.length >= 20) return;
    let es: fs.Dirent[]; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) { if (/^(node_modules|\.git|vendor|dist|build|figma-code-out)$/.test(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p, depth + 1); else if (/\.svg$/i.test(e.name)) svgs.push(norm(path.relative(root, p))); }
  };
  walk(root, 0);
  const f = detectFramework(root);
  return { chrome: findChrome(), node: process.version, framework: f.framework, evidence: f.evidence, svgs, context: { design: !!contextDesign(root), svgs: contextSvgs(root).map((p) => norm(path.relative(root, p))), fontsDir: contextDesign(root) && fs.existsSync(path.join(contextDesign(root)!, 'fonts')) ? 'project-context/design/fonts' : null } };
}

async function main(): Promise<void> {
  let json = false;
  try {
    const { cmd, pos, flags } = parseArgs(process.argv.slice(2));
    json = !!flags.json;
    const maxDiff = flags['max-diff'] !== undefined ? Number(flags['max-diff']) : 1;
    const tol = flags.tol !== undefined ? Number(flags.tol) : 16;
    if (!(maxDiff >= 0) || !(tol >= 0)) throw new Usage('--max-diff and --tol must be numbers');
    const noFail = !!flags['no-fail'];
    const done = (ok: boolean): void => { process.exitCode = ok || noFail ? 0 : 1; };
    if (cmd === 'detect') {
      const d = detect(path.resolve(String(flags.root || process.cwd())));
      console.log(json ? JSON.stringify(d) : [`browser: ${d.chrome ?? 'NOT FOUND (install Chrome or Edge, or set CHROME)'}`, `node: ${d.node}`, `framework: ${d.framework} (${d.evidence})`, `project-context: ${d.context.design ? `design/ found, ${d.context.svgs.length} SVG(s)${d.context.fontsDir ? ', fonts folder ' + d.context.fontsDir : ''}` : 'no project-context/design/ folder (run /ctx init to set it up; optional)'}`, `svg files: ${d.svgs.length ? d.svgs.join(', ') : 'none found'}`].join('\n'));
      process.exitCode = d.chrome ? 0 : 3;
    } else if (cmd === 'build') {
      const root = path.resolve(String(flags.root || process.cwd()));
      let svg = pos[0];
      if (!svg) {
        // no file named: the project-context/design/ folder is where design exports live, so look there and say what was assumed
        const found = contextSvgs(root);
        if (found.length === 1) { svg = found[0]; console.error(`assumed: ${norm(path.relative(root, svg))} (the only SVG in project-context/design/)`); }
        else throw new Usage(found.length ? 'several SVGs in project-context/design/; name one:\n  ' + found.map((f) => norm(path.relative(root, f))).join('\n  ') : 'build needs an SVG file (none found in project-context/design/ either)');
      }
      if (!fs.existsSync(svg)) throw new Usage('not found: ' + svg);
      const { out } = outputOf(svg, flags.name as string | undefined, flags.out as string | undefined);
      const faces: FontFile[] = [], fontNotes: string[] = [];
      let unresolved: string[] = [];
      const ctxFonts = contextDesign(root) && fs.existsSync(path.join(contextDesign(root)!, 'fonts')) ? path.join(contextDesign(root)!, 'fonts') : null;
      const fdir = flags.fonts ? String(flags.fonts) : ctxFonts;
      if (fdir) {
        if (!fs.existsSync(fdir)) throw new Usage('no such font folder: ' + fdir);
        const lf = loadFontDir(fdir);
        faces.push(...lf.files);
        if (lf.skipped.length) fontNotes.push(`skipped ${lf.skipped.join(', ')} (only .ttf and .otf files are read, not .woff or .woff2)`);
        if (!flags.fonts && lf.files.length) fontNotes.push(`using the ${lf.files.length} font file(s) in project-context/design/fonts/`);
      }
      if (flags['download-fonts']) {
        const need = parseSvg(fs.readFileSync(svg, 'utf8')).fontSpecs.filter((s) => !faces.some((f) => f.family === s.family) && !GENERIC.has(s.family.toLowerCase()));
        if (need.length) {
          console.error(`downloading fonts from Google Fonts (fonts.googleapis.com and fonts.gstatic.com): ${[...new Set(need.map((s) => s.family))].join(', ')}`);
          const g = await downloadGoogleFonts(need, path.join(out, 'assets'));
          faces.push(...g.files); fontNotes.push(...g.notes); unresolved = g.unresolved;
        }
      }
      const r = build(svg, { name: flags.name as string | undefined, out: flags.out as string | undefined, maxDiff, tol, photoTol: flags['photo-tol'] !== undefined ? Number(flags['photo-tol']) : undefined, faces, fontNotes, unresolvedFonts: unresolved, root, record: !flags['no-record'] });
      console.log(json ? JSON.stringify(r) : renderBuild(r));
      done(r.gate.ok);
    } else if (cmd === 'diff') {
      if (pos.length < 2) throw new Usage('diff needs two files (png, html or svg)');
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-code-diff-'));
      try {
        const load = (f: string, i: number): Img => {
          if (!fs.existsSync(f)) throw new Usage('not found: ' + f);
          if (/\.png$/i.test(f)) return decodePng(fs.readFileSync(f));
          const w = Number(flags.width), h = Number(flags.height);
          if (!(w > 0 && h > 0)) throw new Usage('rendering ' + f + ' needs --width and --height');
          return render(f, w, h, path.join(tmp, `r${i}.png`));
        };
        const diff = diffImages(load(pos[0], 0), load(pos[1], 1), tol);
        const g: GateResult = { diff, ok: diff.percent <= maxDiff && !diff.sizeMismatch, maxDiff };
        console.log(json ? JSON.stringify(g) : gateLines(g, 'pixel diff').join('\n'));
        done(g.ok);
      } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    } else if (cmd === 'standards') {
      if (!pos[0]) throw new Usage('standards needs the build folder');
      const r = standards(pos[0], flags.rules as string | undefined, { maxDiff, tol, dryRun: !!flags['dry-run'] });
      console.log(json ? JSON.stringify(r) : [`figma-code standards: ${norm(path.relative(process.cwd(), r.dir))}${flags['dry-run'] ? ' (dry run, nothing kept)' : ''}`, `baseline ${r.baseline}% -> ${r.final}%`, ...r.results.map((x) => `  ${x.outcome.padEnd(9)} ${x.kind.padEnd(5)} ${x.id}${x.after !== undefined ? `  (${x.before}% -> ${x.after}%)` : ''}`), ...gateLines(r.gate, 'pixel diff vs the SVG')].join('\n'));
      done(r.gate.ok);
    } else if (cmd === 'adapt') {
      if (!pos[0]) throw new Usage('adapt needs the build folder');
      const fw = flags.framework as Framework | undefined;
      if (fw && !['next', 'astro', 'laravel', 'plain'].includes(fw)) throw new Usage('--framework is next, astro, laravel or plain');
      const r = adapt(pos[0], { root: String(flags.root || process.cwd()), framework: fw, maxDiff, tol, dryRun: !!flags['dry-run'], force: !!flags.force });
      console.log(json ? JSON.stringify(r) : [`figma-code adapt: ${r.framework} (${r.evidence})`, ...(r.component ? [`component: ${r.component}`] : []), ...(r.files.length ? [(flags['dry-run'] ? 'would write: ' : 'wrote: ') + r.files.join(', ')] : []), ...r.notes.map((n) => 'note: ' + n), ...(r.gate ? gateLines(r.gate, 'pixel diff of the adapted component') : [])].join('\n'));
      done(r.gate ? r.gate.ok : true);
    } else throw new Usage(cmd ? `unknown command "${cmd}"` : 'missing command');
  } catch (e) {
    const err = e as Error;
    if (err instanceof Usage) { console.error(err.message + '\n' + USAGE); process.exitCode = 2; }
    else if (err instanceof Blocked) { console.error('blocked: ' + err.message); process.exitCode = 3; }
    else { console.error('error: ' + err.message); process.exitCode = 1; }
    void json;
  }
}

if (require.main === module) void main();
