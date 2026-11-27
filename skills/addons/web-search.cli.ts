#!/usr/bin/env node
// web-search: send ONE query to the free router's /v1/search (the router picks the engine), trim the hits in code and print
// a compact JSON list. No model is asked. Exit 2 with a one-line reason on any failure (no key, router down, no hits): the
// caller (the web-search mod) then lets Claude's own WebSearch run. Never prints a key.
//   node cli.js <query...> [--max 5] [--allow a.com,b.org] [--block x.com]      node cli.js check
// Env read: UNIFIED_API_KEY (or ~/.ai-dev-kit/.env), UNIFIED_API_BASE, AI_DEV_KIT_HOME. Plain Node, no dependencies.
import fs = require('node:fs');
import os = require('node:os');
import path = require('node:path');

const SNIPPET_CHARS = 360;
const ASK_MS = 20000;

interface Hit { title: string; url: string; snippet: string }
interface RawHit { title?: string; url?: string; content?: string; score?: number }

const home = (): string => process.env.AI_DEV_KIT_HOME || path.join(os.homedir(), '.ai-dev-kit');
const base = (): string => (process.env.UNIFIED_API_BASE || 'http://127.0.0.1:31415').replace(/\/$/, '');

function key(): string {
  if (process.env.UNIFIED_API_KEY) return process.env.UNIFIED_API_KEY.trim();
  try {
    const m = /^UNIFIED_API_KEY=(.*)$/m.exec(fs.readFileSync(path.join(home(), '.env'), 'utf8'));
    return m ? m[1].replace(/["'\s]/g, '') : '';
  } catch { return ''; }
}

// Same page, different tracking tail: drop utm_*, fbclid, gclid and the fragment so duplicates collapse.
export function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_|ref$)/i.test(k)) u.searchParams.delete(k);
    u.hash = '';
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return u.href.replace(/\/$/, '');
  } catch { return raw; }
}

const host = (u: string): string => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };
const inDomains = (u: string, list: string[]): boolean => { const h = host(u); return list.some((d) => h === d || h.endsWith('.' + d)); };

// The SNIPPET_CHARS window of the page text that holds the most query words (first window on a tie), cut at a word edge.
export function bestWindow(text: string, query: string, size = SNIPPET_CHARS): string {
  const t = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#*_`>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length <= size) return t;
  const words = [...new Set(query.toLowerCase().split(/[^a-z0-9.]+/).filter((w) => w.length > 2))];
  if (!words.length) return t.slice(0, size).replace(/\s\S*$/, '') + '...';
  const low = t.toLowerCase();
  let best = 0, bestScore = -1;
  for (let i = 0; i + size <= t.length + 60; i += 60) {
    const w = low.slice(i, i + size);
    const score = words.reduce((n, x) => n + (w.includes(x) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  const start = best === 0 ? 0 : t.indexOf(' ', best) + 1 || best;
  const out = t.slice(start, start + size).replace(/\s\S*$/, '');
  return (start > 0 ? '...' : '') + out + '...';
}

export function shape(raw: RawHit[], query: string, max: number, allow: string[], block: string[]): Hit[] {
  const seen = new Set<string>();
  const out: Hit[] = [];
  for (const r of raw) {
    if (!r.url || !r.title) continue;
    const url = cleanUrl(r.url);
    if (seen.has(url)) continue;
    if (allow.length && !inDomains(url, allow)) continue;
    if (block.length && inDomains(url, block)) continue;
    seen.add(url);
    out.push({ title: r.title.replace(/\s+/g, ' ').trim().slice(0, 140), url, snippet: bestWindow(r.content || '', query) });
    if (out.length >= max) break;
  }
  return out;
}

async function search(query: string, want: number): Promise<{ hits: RawHit[]; provider: string }> {
  const k = key();
  if (!k) throw new Error('no UNIFIED_API_KEY');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ASK_MS);
  try {
    const r = await fetch(`${base()}/v1/search`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${k}` }, body: JSON.stringify({ query, max_results: want }), signal: ctl.signal });
    if (!r.ok) throw new Error(`router HTTP ${r.status}`);
    const j = (await r.json()) as { results?: RawHit[]; provider?: string };
    return { hits: Array.isArray(j.results) ? j.results : [], provider: String(j.provider || '') };
  } catch (e) {
    throw new Error((e as Error).name === 'AbortError' ? 'router timeout' : (e as Error).message);
  } finally { clearTimeout(timer); }
}

const list = (v: string | undefined): string[] => (v || '').split(',').map((x) => x.trim().toLowerCase().replace(/^www\./, '')).filter(Boolean);

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv[0] === 'check') {
    console.log(`router key: ${key() ? 'set' : 'missing'}`);
    console.log(`router: ${base()}`);
    return 0;
  }
  const words: string[] = [];
  let max = 5, allow: string[] = [], block: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--max') max = Math.min(10, Math.max(1, parseInt(argv[++i], 10) || 5));
    else if (argv[i] === '--allow') allow = list(argv[++i]);
    else if (argv[i] === '--block') block = list(argv[++i]);
    else words.push(argv[i]);
  }
  const query = words.join(' ').trim();
  if (!query) { console.error('usage: cli.js <query...> [--max n] [--allow a,b] [--block x] | check'); return 2; }
  const t0 = Date.now();
  let res: { hits: RawHit[]; provider: string };
  try { res = await search(query, allow.length || block.length ? Math.min(10, max * 2) : max); } catch (e) { console.error('skip: ' + (e as Error).message); return 2; }
  const hits = shape(res.hits, query, max, allow, block);
  if (!hits.length) { console.error('skip: no usable hits'); return 2; }
  console.log(JSON.stringify({ query, provider: res.provider, hits, durationMs: Date.now() - t0 }));
  return 0;
}

if (require.main === module) main().then((c) => { process.exitCode = c; }, (e) => { console.error('skip: ' + (e as Error).message); process.exitCode = 2; });
