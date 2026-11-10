#!/usr/bin/env node
// Convention discovery for the astro-page skill (Step 1) and the grep half of its verify step (Step 3).
// One summary instead of a round of greps per new page. Reads files only; never edits. No network.
//
//   node conventions.js scan  [--cwd D] [--json]            prefixes, folders, entry-script pattern, client:* use, asset path
//   node conventions.js check <file>... [--cwd D] [--json]  new files: hardcoded colours with a token available, unprefixed
//                                                            selectors, inline <script> where siblings use entry scripts
// Exit codes: 0 done (check: 0 clean, 1 findings), 2 bad usage.
import fs = require('node:fs');
import path = require('node:path');

const SKIP = new Set(['node_modules', '.git', 'dist', '.astro', '.output', 'coverage']);
const norm = (p: string): string => p.split(path.sep).join('/');

export interface Conventions {
  astro: boolean;
  tokenPrefix: string | null; tokenFile: string | null; tokenCount: number;
  selectorPrefix: string | null;
  pagesDir: string | null; componentsDir: string | null; layoutsDir: string | null; stylesDir: string | null; scriptsDir: string | null;
  entryPattern: string | null; entryExamples: string[];
  clientDirectives: Record<string, number>;
  assetPath: 'public' | 'src/assets' | 'both' | 'none';
  scopedStyles: number; externalStyles: number;
  transitions: string[];
  siblings: { pages: string[]; components: string[] };
}

function walk(dir: string, out: string[] = [], depth = 0): string[] {
  if (depth > 8) return out;
  let es: fs.Dirent[];
  try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of es) {
    if (SKIP.has(e.name) || (e.name.startsWith('.') && e.isDirectory())) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out, depth + 1); else out.push(p);
  }
  return out;
}

function mostCommonPrefix(names: string[], sep: string): string | null {
  const count = new Map<string, number>();
  for (const n of names) { const i = n.indexOf(sep); if (i > 0) count.set(n.slice(0, i + 1), (count.get(n.slice(0, i + 1)) || 0) + 1); }
  let best: string | null = null, bestN = 0;
  for (const [k, v] of count) if (v > bestN) { best = k; bestN = v; }
  return best && names.length && bestN / names.length >= 0.5 ? best : null;
}

export function scan(cwd: string): Conventions {
  const files = walk(cwd);
  const rel = (f: string): string => norm(path.relative(cwd, f));
  const astro = fs.existsSync(path.join(cwd, 'astro.config.mjs')) || fs.existsSync(path.join(cwd, 'astro.config.ts')) || fs.existsSync(path.join(cwd, 'astro.config.js'));
  const dirOf = (pred: (r: string) => boolean): string | null => {
    const hits = files.map(rel).filter(pred).map((r) => r.slice(0, r.lastIndexOf('/')));
    const count = new Map<string, number>();
    for (const h of hits) count.set(h, (count.get(h) || 0) + 1);
    let best: string | null = null, n = 0;
    for (const [k, v] of count) if (v > n || (v === n && best && k.length < best.length)) { best = k; n = v; }
    return best;
  };
  const pagesDir = dirOf((r) => /(^|\/)pages\/[^/]+\.(astro|md|mdx)$/.test(r));
  const componentsDir = dirOf((r) => /(^|\/)components\/.*\.(astro|tsx|jsx|svelte|vue)$/.test(r)) ?? dirOf((r) => /(^|\/)components\/[^/]+\.(astro|tsx|jsx|svelte|vue)$/.test(r));
  const layoutsDir = dirOf((r) => /(^|\/)layouts\/[^/]+\.astro$/.test(r));
  const cssFiles = files.filter((f) => /\.(css|scss|pcss)$/i.test(f));
  const stylesDir = dirOf((r) => /\.(css|scss|pcss)$/i.test(r) && !/\.min\./.test(r));
  const scriptFiles = files.filter((f) => /\.(ts|js|mjs)$/i.test(f) && !/\.(config|d)\.(ts|js|mjs)$/i.test(f) && /(^|\/)(src|public)\//.test(rel(f)));
  const scriptsDir = dirOf((r) => /(^|\/)(scripts|js)\/[^/]+\.(ts|js|mjs)$/i.test(r));
  // tokens: the CSS file with the most custom properties in :root
  let tokenFile: string | null = null, tokenNames: string[] = [];
  for (const f of cssFiles) {
    const text = fs.readFileSync(f, 'utf8');
    const names = [...text.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)].map((m) => m[1]);
    if (names.length > tokenNames.length) { tokenNames = names; tokenFile = rel(f); }
  }
  const tokenPrefix = mostCommonPrefix(tokenNames.map((n) => n.slice(2)), '-');
  const classNames: string[] = [];
  for (const f of cssFiles) for (const m of fs.readFileSync(f, 'utf8').matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)) classNames.push(m[1]);
  const selectorPrefix = mostCommonPrefix(classNames, '-');
  const entries = scriptFiles.map(rel).filter((r) => /(entry|main|index)\.(ts|js|mjs)$/i.test(r) || /-entry\./.test(r));
  let entryPattern: string | null = null;
  if (entries.some((e) => /-entry\.(ts|js)$/.test(e))) entryPattern = '<page>-entry.ts';
  else if (entries.length) entryPattern = 'single ' + entries[0].split('/').pop();
  const clientDirectives: Record<string, number> = {};
  let scopedStyles = 0, externalStyles = 0;
  const transitions = new Set<string>();
  for (const f of files.filter((x) => /\.astro$/.test(x))) {
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(/client:(load|idle|visible|media|only)/g)) clientDirectives[m[1]] = (clientDirectives[m[1]] || 0) + 1;
    if (/<style[\s>]/.test(text)) scopedStyles++;
    if (/<link[^>]+rel=["']stylesheet|import\s+['"][^'"]+\.css['"]/.test(text)) externalStyles++;
    if (/ViewTransitions|ClientRouter|transition:/.test(text)) transitions.add('astro view transitions');
    for (const m of text.matchAll(/astro:(page-load|after-swap|before-preparation)/g)) transitions.add(m[0]);
  }
  for (const f of scriptFiles) for (const m of fs.readFileSync(f, 'utf8').matchAll(/astro:(page-load|after-swap|before-preparation)/g)) transitions.add(m[0]);
  const hasPublic = files.some((f) => /(^|\/)public\/.*\.(png|jpe?g|webp|avif|svg|woff2?)$/i.test(rel(f)));
  const hasSrcAssets = files.some((f) => /(^|\/)src\/assets\//.test(rel(f)));
  const assetPath: Conventions['assetPath'] = hasPublic && hasSrcAssets ? 'both' : hasPublic ? 'public' : hasSrcAssets ? 'src/assets' : 'none';
  const list = (dir: string | null, re: RegExp): string[] => (dir ? files.map(rel).filter((r) => r.startsWith(dir + '/') && re.test(r)).slice(0, 8) : []);
  return {
    astro, tokenPrefix: tokenPrefix ? '--' + tokenPrefix : null, tokenFile, tokenCount: tokenNames.length, selectorPrefix,
    pagesDir, componentsDir, layoutsDir, stylesDir, scriptsDir, entryPattern, entryExamples: entries.slice(0, 5),
    clientDirectives, assetPath, scopedStyles, externalStyles, transitions: [...transitions],
    siblings: { pages: list(pagesDir, /\.(astro|md|mdx)$/), components: list(componentsDir, /\.(astro|tsx|jsx|svelte|vue)$/) },
  };
}

export interface Finding { file: string; line: number; kind: string; detail: string }

const COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch)\(/g;

export function check(cwd: string, files: string[], conv: Conventions): Finding[] {
  const out: Finding[] = [];
  for (const rel of files) {
    const abs = path.resolve(cwd, rel);
    if (!fs.existsSync(abs)) { out.push({ file: rel, line: 0, kind: 'missing', detail: 'file not found' }); continue; }
    const text = fs.readFileSync(abs, 'utf8');
    const lines = text.split(/\r?\n/);
    const isCss = /\.(css|scss|pcss)$/i.test(rel), isAstro = /\.astro$/.test(rel);
    lines.forEach((ln, i) => {
      const n = i + 1;
      if ((isCss || (isAstro && /<style/.test(text))) && conv.tokenCount && COLOUR.test(ln) && !/^\s*--/.test(ln) && !/var\(/.test(ln)) out.push({ file: rel, line: n, kind: 'hardcoded-colour', detail: ln.trim().slice(0, 80) + ` (tokens in ${conv.tokenFile})` });
      COLOUR.lastIndex = 0;
      if (isCss && conv.selectorPrefix) for (const m of ln.matchAll(/^\s*\.([a-zA-Z][a-zA-Z0-9_-]*)/g)) if (!m[1].startsWith(conv.selectorPrefix)) out.push({ file: rel, line: n, kind: 'unprefixed-selector', detail: '.' + m[1] + ' (expected ' + conv.selectorPrefix + ')' });
      if (isAstro && conv.tokenPrefix && /--[a-zA-Z]/.test(ln) && !ln.includes(conv.tokenPrefix) && /var\(--/.test(ln)) out.push({ file: rel, line: n, kind: 'foreign-token', detail: ln.trim().slice(0, 80) });
      if (isAstro && /\bclient:load\b/.test(ln)) out.push({ file: rel, line: n, kind: 'client-load', detail: 'prefer client:visible unless above the fold' });
    });
    if (isAstro && conv.entryPattern && /<script(?![^>]*\bsrc=)[^>]*>/.test(text) && !/<script[^>]*\bis:inline/.test(text)) {
      const idx = lines.findIndex((l) => /<script/.test(l));
      out.push({ file: rel, line: idx + 1, kind: 'inline-script', detail: 'siblings use ' + conv.entryPattern });
    }
  }
  return out;
}

export function renderScan(c: Conventions): string {
  const L: string[] = [];
  L.push(c.astro ? 'Astro project' : 'no astro.config found (conventions still scanned)');
  L.push(`tokens:      ${c.tokenCount ? `${c.tokenCount} in ${c.tokenFile}, prefix ${c.tokenPrefix ?? '(none dominant)'}` : 'none found'}`);
  L.push(`selectors:   prefix ${c.selectorPrefix ?? '(none dominant)'}`);
  L.push(`pages:       ${c.pagesDir ?? '-'}    components: ${c.componentsDir ?? '-'}    layouts: ${c.layoutsDir ?? '-'}`);
  L.push(`styles:      ${c.stylesDir ?? '-'} (${c.scopedStyles} components with <style>, ${c.externalStyles} linking stylesheets)`);
  L.push(`scripts:     ${c.scriptsDir ?? '-'}, entry pattern ${c.entryPattern ?? 'none'}${c.entryExamples.length ? ' e.g. ' + c.entryExamples.slice(0, 2).join(', ') : ''}`);
  const cd = Object.entries(c.clientDirectives).map(([k, v]) => `${k} ${v}`).join(', ');
  L.push(`client:*     ${cd || 'none (static islands)'}`);
  L.push(`assets:      ${c.assetPath}`);
  if (c.transitions.length) L.push(`lifecycle:   ${c.transitions.join(', ')} (new pages must hook the same)`);
  if (c.siblings.pages.length) L.push(`sibling pages: ${c.siblings.pages.slice(0, 4).join(', ')}`);
  if (c.siblings.components.length) L.push(`sibling components: ${c.siblings.components.slice(0, 4).join(', ')}`);
  L.push('Mirror the nearest sibling; grep it before inventing a location.');
  return L.join('\n');
}

function main(): void {
  const [cmd, ...rest] = process.argv.slice(2);
  let cwd = process.cwd(), json = false; const files: string[] = [];
  let ok = cmd === 'scan' || cmd === 'check';
  for (let i = 0; i < rest.length && ok; i++) {
    const f = rest[i];
    if (f === '--cwd') cwd = path.resolve(rest[++i] ?? '');
    else if (f === '--json') json = true;
    else if (f.startsWith('--')) ok = false;
    else files.push(f);
  }
  if (cmd === 'check' && !files.length) ok = false;
  if (!ok) { console.error('usage: conventions.js scan [--cwd D] [--json] | check <file>... [--cwd D] [--json]'); process.exitCode = 2; return; }
  const conv = scan(cwd);
  if (cmd === 'scan') { console.log(json ? JSON.stringify(conv) : renderScan(conv)); return; }
  const f = check(cwd, files, conv);
  if (json) console.log(JSON.stringify({ ok: !f.length, findings: f }));
  else if (!f.length) console.log('clean: ' + files.join(', '));
  else { for (const x of f) console.log(`${x.file}:${x.line} ${x.kind}: ${x.detail}`); console.log(`${f.length} findings`); }
  if (f.length) process.exitCode = 1;
}

if (require.main === module) main();
