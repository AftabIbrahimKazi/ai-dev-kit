#!/usr/bin/env node
// A second model reads a file or plan so Claude spends no tokens on it. Which models may be asked is the project's choice,
// listed per feature in <root>/.claude/ai-backends.json ("review", "goldfish"); the shared cascade in backends.js tries
// them in a fixed order (ollama, kaggle, unified). When none answers the caller falls back to its free scan or to Claude.
// Every failure (no key, rate limit, offline, timeout, bad reply) is a quiet UNAVAILABLE, never an error: work is never blocked.
// Plain Node, no dependencies.
//
//   node reviewer.js --prompt <prompt.txt> --file <file> [--root <dir>] [--backends ollama,kaggle,unified]
//
// Old projects: with no ai-backends.json, a "reviewer" of "ollama" or "auto" in .claude/state-audit.json means ["ollama"]
// ("auto" used to try Gemini first; that backend is gone). timeoutMs and maxTokens stay in state-audit.json.
// The model's reply must start with PASS, WARN or FAIL on its own line; anything else counts as UNAVAILABLE.
// Exit codes: 0 PASS or UNAVAILABLE, 1 WARN or FAIL (findings on stdout), 2 bad usage.
import fs = require('node:fs');
import path = require('node:path');
import type * as BackendsModule from './plan-first.backends';

function sibling<T>(installed: string, library: string): T {
  return require(path.join(__dirname, fs.existsSync(path.join(__dirname, installed)) ? installed : library)) as T;
}
const bk = sibling<typeof BackendsModule>('backends.js', 'plan-first.backends.js');

export type Backend = BackendsModule.Backend;
export interface ReviewResult { status: 'PASS' | 'WARN' | 'FAIL' | 'UNAVAILABLE'; findings: string; backend: Exclude<Backend, 'code'> | 'static'; note?: string }
export interface ReviewConfig { backends: Backend[]; timeoutMs?: number; maxTokens?: number }

export const neverSend = bk.neverSend;

export function readConfig(root: string, feature: BackendsModule.Feature = 'review'): ReviewConfig {
  let timeoutMs: number | undefined, maxTokens: number | undefined, legacy: Backend[] = [];
  try {
    const c = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'state-audit.json'), 'utf8')) as { reviewer?: string; timeoutMs?: number; maxTokens?: number };
    timeoutMs = c.timeoutMs; maxTokens = c.maxTokens;
    if (c.reviewer === 'ollama' || c.reviewer === 'auto') legacy = ['ollama'];
  } catch { /* no state-audit.json */ }
  const listed = fs.existsSync(path.join(root, '.claude', 'ai-backends.json'));
  return { backends: listed ? bk.readBackends(root, feature) : feature === 'review' ? legacy : [], timeoutMs, maxTokens };
}

// The reply must open with PASS, WARN or FAIL on its own line.
export function parseVerdict(text: string): { status: 'PASS' | 'WARN' | 'FAIL'; findings: string } | null {
  const lines = text.replace(/\r/g, '').trim().split('\n');
  const first = (lines[0] || '').trim().replace(/[*`#:.]/g, '').toUpperCase();
  if (first !== 'PASS' && first !== 'WARN' && first !== 'FAIL') return null;
  return { status: first, findings: lines.slice(1).join('\n').trim() };
}

type Reply = { text: string; backend: Exclude<Backend, 'code'>; note?: string } | { note: string };
const opts = (cfg: ReviewConfig, accept: (t: string) => boolean, cap: number): BackendsModule.AskOpts => ({ timeoutMs: cfg.timeoutMs ?? 25000, maxTokens: cfg.maxTokens ?? cap, accept });

async function run(prompt: string, text: string, cfg: ReviewConfig, env: NodeJS.ProcessEnv, accept: (t: string) => boolean, cap: number): Promise<Reply> {
  if (!bk.hasModel(cfg.backends)) return { note: 'no model backend is allowed for this feature: no model was asked' };
  const r = await bk.ask(prompt, text, cfg.backends, opts(cfg, accept, cap), env);
  if ('handoff' in r) return { note: r.notes.join('; ') };
  return { text: r.text, backend: r.backend, note: r.notes.length ? r.notes.join('; ') : undefined };
}

// Free text from the same backends (goldfish uses this). A note-only result means nothing answered.
export async function generate(prompt: string, text: string, cfg: ReviewConfig, env: NodeJS.ProcessEnv = process.env): Promise<Reply> {
  return run(prompt, text, cfg, env, (t) => t.trim().length > 0, 1500);
}

export async function review(prompt: string, text: string, cfg: ReviewConfig, env: NodeJS.ProcessEnv = process.env): Promise<ReviewResult> {
  const r = await run(prompt, text, cfg, env, (t) => parseVerdict(t) !== null, 600);
  if (!('text' in r)) return { status: 'UNAVAILABLE', findings: '', backend: 'static', note: r.note };
  const v = parseVerdict(r.text)!;
  return { ...v, backend: r.backend, note: r.note };
}

async function main(): Promise<void> {
  const a = process.argv.slice(2);
  let promptFile = '', file = '', root = process.cwd(), backends: Backend[] | undefined;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--prompt') promptFile = a[++i]; else if (a[i] === '--file') file = a[++i]; else if (a[i] === '--root') root = path.resolve(a[++i] || '');
    else if (a[i] === '--backends') backends = (a[++i] || '').split(',').filter(Boolean) as Backend[]; else { promptFile = ''; break; }
  }
  if (!promptFile || !file || (backends && !backends.every((b) => bk.ORDER.includes(b)))) { console.error('usage: reviewer.js --prompt <prompt.txt> --file <file> [--root <dir>] [--backends ollama,kaggle,unified]'); process.exitCode = 2; return; }
  if (bk.neverSend(file)) return;
  try {
    const prompt = fs.readFileSync(path.resolve(root, promptFile), 'utf8');
    const text = fs.readFileSync(path.resolve(root, file), 'utf8');
    const cfg = { ...readConfig(root), ...(backends ? { backends } : {}) };
    const r = await review(prompt, text, cfg);
    if (r.status === 'WARN' || r.status === 'FAIL') { console.log(`${r.status} (${r.backend})\n${r.findings}`); process.exitCode = 1; }
  } catch { /* fail open */ }
}

if (require.main === module) void main();
