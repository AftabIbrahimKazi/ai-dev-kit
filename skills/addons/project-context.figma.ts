#!/usr/bin/env node
// Connector-free Figma intake for the project-context addon. The user exports frames from Figma as PNG or SVG
// (free, no MCP, no tokens); this script reads the files and writes project-context/design/figma.md: a file table
// with sizes, and for SVG the colors, fonts, type sizes and text found. PNG, JPG and WebP are only measured; open
// them as images only when a layout question needs it. Plain Node, any tool. Never edits an export.
//
//   node figma.js <file-or-folder>...   print the draft to stdout
//   node figma.js <file-or-folder>... --write   write project-context/design/figma.md (needs project-context/design/)
// Options: --cwd D, --link <figma url> (recorded in the file), --json.  Exit 1 on a usage error, 2 on other errors.
import fs = require('node:fs');
import path = require('node:path');

const IMG = new Set(['png', 'jpg', 'jpeg', 'webp', 'svg']);
const ext = (f: string): string => path.extname(f).slice(1).toLowerCase();
const norm = (p: string): string => p.split(path.sep).join('/');

export interface FigmaArgs { inputs: string[]; cwd: string; write?: boolean; json?: boolean; link?: string }

export function parseArgs(argv: string[]): FigmaArgs {
  const o: FigmaArgs = { inputs: [], cwd: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--write') o.write = true;
    else if (a === '--json') o.json = true;
    else if (a === '--cwd') o.cwd = argv[++i];
    else if (a === '--link') o.link = argv[++i];
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else o.inputs.push(a);
  }
  if (!o.inputs.length) throw new Error('give at least one exported file or folder');
  return o;
}

function expand(inputs: string[], cwd: string): string[] {
  const out: string[] = [];
  const walk = (p: string): void => {
    const abs = path.resolve(cwd, p);
    if (!fs.existsSync(abs)) throw new Error(`not found: ${p}`);
    if (fs.statSync(abs).isDirectory()) { for (const e of fs.readdirSync(abs).sort()) walk(path.join(abs, e)); return; }
    if (IMG.has(ext(abs))) out.push(abs);
  };
  inputs.forEach(walk);
  return out;
}

type Dims = [number, number];

// width and height from the file header, no decoding
export function rasterSize(buf: Buffer, e: string): Dims | null {
  if (e === 'png' && buf.length > 24 && buf.toString('latin1', 1, 4) === 'PNG') return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  if (e === 'webp' && buf.toString('latin1', 0, 4) === 'RIFF') {
    const k = buf.toString('latin1', 12, 16);
    if (k === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
    if (k === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
    if (k === 'VP8L') { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
  }
  if (e === 'jpg' || e === 'jpeg') {
    for (let i = 2; i + 9 < buf.length;) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})\b/gi;
const RGB = /rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/gi;
const NAMED: Record<string, string> = { white: '#ffffff', black: '#000000' };
const NAMED_USE = /(?:fill|stroke|stop-color|color)\s*[=:]\s*["']?\s*(white|black)\b/gi;
const hex6 = (h: string): string => {
  h = h.toLowerCase();
  if (h.length === 4) h = '#' + [...h.slice(1)].map((c) => c + c).join('');
  return h.slice(0, 7);
};
const toHex = (r: string | number, g: string | number, b: string | number): string => '#' + [r, g, b].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('');

export interface SvgInfo { size: Dims | null; colors: string[]; fonts: string[]; sizes: number[]; texts: string[]; hasImage: boolean; outlined: boolean }

export function svgInfo(text: string): SvgInfo {
  const root = /<svg\b[^>]*>/i.exec(text);
  const attr = (n: string): string | null => { const m = root && new RegExp(`\\b${n}="([^"]*)"`, 'i').exec(root[0]); return m ? m[1] : null; };
  let size: Dims | null = null;
  const vb = (attr('viewBox') || '').split(/[\s,]+/).map(Number);
  const num = (v: string | null): number | null => (v && /^[\d.]+(px)?$/.test(v) ? parseFloat(v) : null);
  const w = num(attr('width')), h = num(attr('height'));
  if (w && h) size = [w, h];
  else if (vb.length === 4 && vb.every((n) => !Number.isNaN(n))) size = [vb[2], vb[3]];
  const colors: string[] = [];
  for (const m of text.matchAll(HEX)) colors.push(hex6(m[0]));
  for (const m of text.matchAll(RGB)) colors.push(toHex(m[1], m[2], m[3]));
  for (const m of text.matchAll(NAMED_USE)) colors.push(NAMED[m[1].toLowerCase()]);
  const fonts = [...text.matchAll(/font-family\s*[=:]\s*["']?([^;"'>]+)/gi)].map((m) => m[1].split(',')[0].trim().replace(/['"]/g, ''));
  const sizes = [...text.matchAll(/font-size\s*[=:]\s*["']?(\d+(?:\.\d+)?)/gi)].map((m) => Number(m[1]));
  const texts = [...text.matchAll(/<(?:text|tspan)\b[^>]*>([^<]+)</gi)].map((m) => m[1].trim()).filter(Boolean);
  return { size, colors, fonts, sizes, texts, hasImage: /<image\b/i.test(text), outlined: texts.length === 0 && /<path\b/i.test(text) };
}

function tally<T>(arr: T[]): [T, number][] {
  const m = new Map<T, number>();
  for (const v of arr) m.set(v, (m.get(v) || 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

function shown(o: FigmaArgs, abs: string): string {
  const rel = norm(path.relative(o.cwd, abs));
  if (rel && !rel.startsWith('..')) return rel;
  for (const i of o.inputs) {
    const root = path.resolve(o.cwd, i);
    const base = fs.existsSync(root) && fs.statSync(root).isDirectory() ? root : path.dirname(root);
    const r = norm(path.relative(base, abs));
    if (r && !r.startsWith('..')) return r;
  }
  return path.basename(abs);
}

export interface FrameInfo extends Partial<SvgInfo> { file: string; kind: 'svg' | 'raster'; kb: number }
export interface FigmaScanResult {
  link: string | null; files: FrameInfo[]; colors: [string, number][]; fonts: [string, number][];
  sizes: [number, number][]; flat: number;
}

export function scan(o: FigmaArgs): FigmaScanResult {
  const files: FrameInfo[] = expand(o.inputs, o.cwd).map((abs) => {
    const buf = fs.readFileSync(abs);
    const e = ext(abs);
    const f: FrameInfo = { file: shown(o, abs), kind: e === 'svg' ? 'svg' : 'raster', kb: Math.round(buf.length / 1024) };
    if (e === 'svg') Object.assign(f, svgInfo(buf.toString('utf8')));
    else f.size = rasterSize(buf, e);
    return f;
  });
  const svgs = files.filter((f) => f.kind === 'svg');
  return {
    link: o.link || null,
    files,
    colors: tally(svgs.flatMap((f) => f.colors || [])),
    fonts: tally(svgs.flatMap((f) => f.fonts || [])),
    sizes: tally(svgs.flatMap((f) => f.sizes || [])).sort((a, b) => a[0] - b[0]),
    flat: files.filter((f) => f.kind === 'raster').length,
  };
}

const dims = (s: Dims | null | undefined): string => (s ? `${Math.round(s[0])} x ${Math.round(s[1])}` : 'unknown');
const cell = (s: unknown): string => String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\s+/g, ' ');

export function render(r: FigmaScanResult): string {
  const L = ['# Figma intake', '', r.link ? `Source: ${r.link}` : 'Source: exported frames (no link recorded)', '',
    'Generated by `figma.js` from exported files. Edit freely; re-run to refresh the tables.', '',
    '## Frames', '', '| File | Type | Size (px) | KB | Text found |', '|---|---|---|---|---|'];
  for (const f of r.files) L.push(`| ${cell(f.file)} | ${f.kind} | ${dims(f.size)} | ${f.kb} | ${f.texts ? f.texts.length : 'n/a'} |`);
  if (r.colors.length) { L.push('', '## Colors (SVG exports, by use)', '', '| Color | Uses |', '|---|---|'); for (const [c, n] of r.colors.slice(0, 24)) L.push(`| ${c} | ${n} |`); }
  if (r.fonts.length) { L.push('', '## Fonts', '', '| Family | Uses |', '|---|---|'); for (const [c, n] of r.fonts) L.push(`| ${cell(c)} | ${n} |`); }
  if (r.sizes.length) { L.push('', '## Type sizes (px)', '', r.sizes.map(([s]) => s).join(', ')); }
  const txt = r.files.filter((f) => f.texts && f.texts.length);
  if (txt.length) {
    L.push('', '## Text per frame', '');
    for (const f of txt) L.push(`- **${cell(f.file)}**: ${f.texts!.slice(0, 12).map(cell).join(' / ')}${f.texts!.length > 12 ? ' / ...' : ''}`);
  }
  if (r.flat) L.push('', `${r.flat} PNG/JPG/WebP file(s) are measured only. Colors, fonts and text need an SVG export, or open the image when a layout question needs it.`);
  if (r.files.some((f) => f.outlined)) L.push('', 'Some SVGs have no text nodes: Figma outlines text into paths by default. Re-export with "Outline text" unchecked (Export settings, SVG) to get text and fonts.');
  if (r.files.some((f) => f.hasImage)) L.push('', 'Some SVGs embed raster images; their colors are not counted.');
  return L.join('\n') + '\n';
}

function main(): void {
  const o = parseArgs(process.argv.slice(2));
  const r = scan(o);
  if (o.json) { process.stdout.write(JSON.stringify(r, null, 1) + '\n'); return; }
  const md = render(r);
  if (!o.write) { process.stdout.write(md); return; }
  const dir = path.join(o.cwd, 'project-context', 'design');
  if (!fs.existsSync(dir)) throw new Error('project-context/design/ does not exist; run /ctx init first');
  fs.writeFileSync(path.join(dir, 'figma.md'), md);
  console.log(`wrote project-context/design/figma.md (${r.files.length} file(s))`);
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('error: ' + (e as Error).message); process.exitCode = /give at least|unknown option/.test((e as Error).message) ? 1 : 2; }
}
