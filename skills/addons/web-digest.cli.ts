#!/usr/bin/env node
// web-digest: fetch one public page with Obscura (text dump), trim it in code, ask the free router ONE question about it,
// print a short JSON answer. Exit 2 with a one-line reason on any failure (no obscura, private URL, router down, empty
// page, timeout): the caller (the web-digest mod) then lets Claude's own WebFetch run. Never prints a key.
//   node cli.js <url> <question...>      node cli.js check      (prints what is available, exit 0)
// Env read: UNIFIED_API_KEY (or ~/.ai-dev-kit/.env), UNIFIED_API_BASE, AI_DEV_KIT_HOME, E2E_OBSCURA_BIN. Plain Node, no dependencies.
import fs = require('node:fs');
import os = require('node:os');
import path = require('node:path');
import cp = require('node:child_process');

const MAX_PAGE_CHARS = 24000;
const MAX_ANSWER_TOKENS = 220;
const FETCH_MS = 20000;
const ASK_MS = 25000;

const home = (): string => process.env.AI_DEV_KIT_HOME || path.join(os.homedir(), '.ai-dev-kit');

export function findObscura(): string | null {
  if (process.env.E2E_OBSCURA_BIN) return process.env.E2E_OBSCURA_BIN;
  const exe = process.platform === 'win32' ? 'obscura.exe' : 'obscura';
  const own = path.join(home(), 'external', 'obscura', exe);
  if (fs.existsSync(own)) return own;
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const p = path.join(dir, exe);
    try { if (fs.statSync(p).isFile()) return p; } catch { /* next */ }
  }
  return null;
}

// Public http(s) only. Loopback, private ranges, link-local and bare or .local hosts stay with Claude's own tool.
export function publicUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h.includes('.') && !h.includes(':')) return null;
  if (/(^|\.)(localhost|local|internal|lan|home|corp)$/.test(h)) return null;
  if (h.includes(':')) return /^(::1?|f[cd]|fe80)/.test(h) ? null : u;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) return null;
  }
  return u;
}

// Code-side trim before any model sees the text: collapse blank runs, drop short nav-like lines, cap the size.
export function trimPage(text: string): string {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim());
  const out: string[] = [];
  let prev = '';
  for (const l of lines) {
    if (!l || l === prev) continue;
    out.push(l);
    prev = l;
  }
  return out.join('\n').slice(0, MAX_PAGE_CHARS);
}

function unifiedKey(): string {
  if (process.env.UNIFIED_API_KEY) return process.env.UNIFIED_API_KEY.trim();
  try {
    const m = /^UNIFIED_API_KEY=(.*)$/m.exec(fs.readFileSync(path.join(home(), '.env'), 'utf8'));
    return m ? m[1].replace(/["'\s]/g, '') : '';
  } catch { return ''; }
}

const routerBase = (): string => (process.env.UNIFIED_API_BASE || 'http://127.0.0.1:31415').replace(/\/$/, '');

function fetchText(exe: string, url: string): Promise<{ text: string; ms: number } | string> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let out = '';
    let done = false;
    // A .js file (a test stand-in) runs through node; the real tool is a native binary and spawns directly.
    const isJs = /.js$/i.test(exe);
    const child = cp.spawn(isJs ? process.execPath : exe, isJs ? [exe, 'fetch', url, '--dump', 'text'] : ['fetch', url, '--dump', 'text'], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    const finish = (v: { text: string; ms: number } | string): void => { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
    const timer = setTimeout(() => { child.kill(); finish('obscura timeout'); }, FETCH_MS);
    child.stdout.on('data', (d: Buffer) => { if (out.length < 400000) out += d.toString('utf8'); });
    child.on('error', (e) => finish('obscura could not start: ' + e.message));
    child.on('close', (code) => finish(code === 0 && out.trim() ? { text: out, ms: Date.now() - t0 } : `obscura exit ${code}, ${out.trim() ? 'output' : 'empty page'}`));
  });
}

async function askRouter(question: string, page: string, url: string): Promise<string> {
  const key = unifiedKey();
  if (!key) return Promise.reject(new Error('no UNIFIED_API_KEY'));
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ASK_MS);
  try {
    const prompt = `Answer the question using ONLY the page text below. Be brief: at most 120 words, plain text, no preamble. If the page does not contain the answer, say so in one sentence.\n\nQuestion: ${question}\n\nPage (${url}):\n${page}`;
    const r = await fetch(`${routerBase()}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: 'auto', temperature: 0, max_tokens: MAX_ANSWER_TOKENS, messages: [{ role: 'user', content: prompt }] }),
      signal: ctl.signal,
    });
    if (!r.ok) throw new Error(`router HTTP ${r.status}`);
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const text = (j.choices?.[0]?.message?.content || '').trim();
    if (!text) throw new Error('router gave an empty answer');
    return text;
  } catch (e) {
    throw new Error((e as Error).name === 'AbortError' ? 'router timeout' : (e as Error).message);
  } finally { clearTimeout(timer); }
}

async function main(): Promise<number> {
  const [first, ...rest] = process.argv.slice(2);
  if (first === 'check') {
    console.log(`obscura: ${findObscura() ? 'found' : 'not found'}`);
    console.log(`router key: ${unifiedKey() ? 'set' : 'missing'}`);
    console.log(`router: ${routerBase()}`);
    return 0;
  }
  const question = rest.join(' ').trim();
  if (!first || !question) { console.error('usage: cli.js <url> <question...> | check'); return 2; }
  const url = publicUrl(first);
  if (!url) { console.error('skip: not a public http(s) URL'); return 2; }
  const exe = findObscura();
  if (!exe) { console.error('skip: obscura not installed'); return 2; }
  const t0 = Date.now();
  const page = await fetchText(exe, url.href);
  if (typeof page === 'string') { console.error('skip: ' + page); return 2; }
  const trimmed = trimPage(page.text);
  if (trimmed.length < 40) { console.error('skip: page text too short'); return 2; }
  let answer: string;
  try { answer = await askRouter(question, trimmed, url.href); } catch (e) { console.error('skip: ' + (e as Error).message); return 2; }
  console.log(JSON.stringify({ url: url.href, bytes: Buffer.byteLength(page.text), result: answer, durationMs: Date.now() - t0, pageChars: trimmed.length }));
  return 0;
}

if (require.main === module) main().then((c) => { process.exitCode = c; }, (e) => { console.error('skip: ' + (e as Error).message); process.exitCode = 2; });
