#!/usr/bin/env node
// Shared cascade for every kit feature that can hand work to a cheaper model so Claude spends fewer tokens.
// The project lists which backends it allows per feature in <root>/.claude/ai-backends.json:
//   { "review": ["code", "ollama", "unified"], "tests": ["ollama"], "goldfish": [], "coding": ["kaggle"] }
// An empty or missing list means Claude does the work itself. The order is FIXED here, whatever order the file lists:
//   code (a free script scan, not a model) > ollama (this machine) > kaggle (your GPU tunnel) > unified (free router) > Claude.
// Claude is always the last step and is never called from a script: when no backend answers, ask() returns a handoff
// and the caller prints HANDOFF so the skill text can say "then do it yourself". Every failure is a quiet note, never a throw.
// Env read: UNIFIED_API_KEY (or the same line in ~/.ai-dev-kit/.env), UNIFIED_API_BASE, LOCAL_LLM_URL, LOCAL_LLM_MODEL, AI_DEV_KIT_HOME.
// Text sent to kaggle or unified is secret-masked first; files that look like secrets are never sent. Plain Node, no dependencies.
import fs = require('node:fs');
import os = require('node:os');
import path = require('node:path');

export type Backend = 'code' | 'ollama' | 'kaggle' | 'unified';
export const ORDER: Backend[] = ['code', 'ollama', 'kaggle', 'unified'];
export type Feature = 'review' | 'goldfish' | 'tests' | 'image' | 'coding';

export interface AskOpts { maxTokens?: number; timeoutMs?: number; maxChars?: number; accept?: (text: string) => boolean }
export type Answer = { text: string; backend: Exclude<Backend, 'code'>; notes: string[] } | { handoff: true; notes: string[] };

const MAX_CHARS = 60000;
const SECRET_FILE = /(^|[\\/])(\.env[^\\/]*|[^\\/]*\.(pem|key|p12|pfx)|id_rsa[^\\/]*|[^\\/]*secret[^\\/]*|[^\\/]*credential[^\\/]*)$/i;
export const neverSend = (file: string): boolean => SECRET_FILE.test(file);

export const mask = (t: string): string => t.replace(/\b(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}|xox[bap]-[A-Za-z0-9-]{10,})\b/g, '[masked]')
  .replace(/((?:api[_-]?key|token|secret|password|authorization)["']?\s*[:=]\s*)["']?[^\s"',;]{6,}/gi, (_m, p: string) => p + '[masked]');

const homeOf = (env: NodeJS.ProcessEnv): string => env.AI_DEV_KIT_HOME || path.join(os.homedir(), '.ai-dev-kit');

// The backends the project allows for a feature, in the fixed order. Unknown names are dropped; no file means none.
export function readBackends(root: string, feature: Feature): Backend[] {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'ai-backends.json'), 'utf8')) as Record<string, unknown>;
    const want = Array.isArray(c[feature]) ? (c[feature] as unknown[]) : [];
    return ORDER.filter((b) => want.includes(b));
  } catch { return []; }
}

export function unifiedKey(env: NodeJS.ProcessEnv): string {
  if (env.UNIFIED_API_KEY) return env.UNIFIED_API_KEY.trim();
  try {
    const m = /^UNIFIED_API_KEY=(.*)$/m.exec(fs.readFileSync(path.join(homeOf(env), '.env'), 'utf8'));
    return m ? m[1].replace(/["'\s]/g, '') : '';
  } catch { return ''; }
}

async function postJson(url: string, body: unknown, headers: Record<string, string>, timeoutMs: number): Promise<{ ok: boolean; status: number; json: unknown }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
    let json: unknown = null;
    try { json = await r.json(); } catch { /* not json */ }
    return { ok: r.ok, status: r.status, json };
  } finally { clearTimeout(timer); }
}

type Raw = string | { text: string };
const why = (e: unknown): string => ((e as Error).name === 'AbortError' ? 'timeout' : (e as Error).message);

function ollamaSettings(env: NodeJS.ProcessEnv): { base: string; model: string } {
  let base = 'http://127.0.0.1:11434', model = 'qwen2.5:1.5b';
  try {
    const m = JSON.parse(fs.readFileSync(path.join(homeOf(env), 'models.json'), 'utf8')) as { system2?: { baseUrl?: string; model?: string } };
    base = m.system2?.baseUrl || base; model = m.system2?.model || model;
  } catch { /* defaults */ }
  return { base, model };
}

async function ollama(prompt: string, text: string, env: NodeJS.ProcessEnv, t: number, cap: number): Promise<Raw> {
  const { base, model } = ollamaSettings(env);
  if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?/i.test(base)) return 'ollama base URL is not loopback; not used';
  try {
    const r = await postJson(`${base.replace(/\/$/, '')}/api/generate`, { model, prompt: `${prompt}\n\n${text}`, stream: false, think: false, options: { temperature: 0, num_predict: cap } }, {}, t);
    if (!r.ok) return `ollama HTTP ${r.status}`;
    return { text: (r.json as { response?: string })?.response || '' };
  } catch (e) { return 'ollama unreachable: ' + why(e); }
}

async function kaggle(prompt: string, text: string, env: NodeJS.ProcessEnv, t: number, cap: number): Promise<Raw> {
  const base = env.LOCAL_LLM_URL;
  if (!base) return 'kaggle: LOCAL_LLM_URL is not set (start the notebook with /kaggle setup)';
  try {
    const r = await postJson(`${base.replace(/\/$/, '')}/api/generate`, { model: env.LOCAL_LLM_MODEL || 'qwen3-coder:30b', prompt: `${prompt}\n\n${mask(text)}`, stream: false, think: false, options: { temperature: 0, num_predict: cap, num_ctx: 8192 } }, {}, t);
    if (!r.ok) return `kaggle HTTP ${r.status}`;
    return { text: (r.json as { response?: string })?.response || '' };
  } catch (e) { return 'kaggle unreachable: ' + why(e); }
}

// The router always gets model "auto": a pinned model has no failover and timed out for 60 s in a probe.
async function unified(prompt: string, text: string, env: NodeJS.ProcessEnv, t: number, cap: number): Promise<Raw> {
  const key = unifiedKey(env);
  if (!key) return 'unified: no UNIFIED_API_KEY (set it in your shell or ~/.ai-dev-kit/.env)';
  const base = (env.UNIFIED_API_BASE || 'http://127.0.0.1:31415').replace(/\/$/, '');
  try {
    const r = await postJson(`${base}/v1/chat/completions`, { model: 'auto', temperature: 0, max_tokens: cap, messages: [{ role: 'user', content: `${prompt}\n\n${mask(text)}` }] }, { authorization: `Bearer ${key}` }, t);
    if (!r.ok) return `unified HTTP ${r.status}`;
    return { text: (r.json as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content || '' };
  } catch (e) { return 'unified unreachable: ' + why(e); }
}

const CALL: Record<Exclude<Backend, 'code'>, typeof ollama> = { ollama, kaggle, unified };

// Try each allowed model backend in the fixed order. First usable reply wins; if none does, the caller hands over to Claude.
// "code" is skipped here: it is the caller's own free scan, which runs before any model is asked.
export async function ask(prompt: string, text: string, backends: Backend[], opts: AskOpts = {}, env: NodeJS.ProcessEnv = process.env): Promise<Answer> {
  const limit = opts.maxChars ?? MAX_CHARS;
  const body = text.length > limit ? text.slice(0, limit) : text;
  const t = opts.timeoutMs ?? 25000;
  const cap = opts.maxTokens ?? 600;
  const accept = opts.accept ?? ((s: string) => s.trim().length > 0);
  const notes: string[] = [];
  for (const b of ORDER) {
    if (b === 'code' || !backends.includes(b)) continue;
    const r = await CALL[b](prompt, body, env, t, cap);
    if (typeof r === 'string') { notes.push(r); continue; }
    if (accept(r.text)) return { text: r.text, backend: b, notes };
    notes.push(`${b} reply was not usable`);
  }
  return { handoff: true, notes };
}

// One image from the router. Only the unified backend makes images (ollama and kaggle are text-only here). The router picks the
// model and the provider; both come back so the caller can say who made it. A failed call returns a note, never throws, and the
// HTTP status so the caller can tell a quota or auth error (pause the step) from a temporary one.
export type ImageResult = { data: Buffer; mime: string; model: string; provider: string } | { note: string; status?: number };
export async function askImage(prompt: string, size: string | undefined, env: NodeJS.ProcessEnv = process.env, timeoutMs = 120000): Promise<ImageResult> {
  const key = unifiedKey(env);
  if (!key) return { note: 'unified: no UNIFIED_API_KEY (set it in your shell or ~/.ai-dev-kit/.env)' };
  const base = (env.UNIFIED_API_BASE || 'http://127.0.0.1:31415').replace(/\/$/, '');
  try {
    const r = await postJson(`${base}/v1/images/generations`, { model: 'auto', n: 1, prompt: mask(prompt).slice(0, 2048), ...(size ? { size } : {}) }, { authorization: `Bearer ${key}` }, timeoutMs);
    if (!r.ok) return { note: `unified HTTP ${r.status}`, status: r.status };
    const j = r.json as { data?: { b64_json?: string }[]; model?: string; provider?: string } | null;
    const b64 = j?.data?.[0]?.b64_json;
    if (!b64) return { note: 'unified returned no image (possibly blocked by a safety filter)', status: 200 };
    const data = Buffer.from(b64, 'base64');
    const mime = data[0] === 0xff && data[1] === 0xd8 ? 'image/jpeg' : data[0] === 0x52 && data[1] === 0x49 ? 'image/webp' : 'image/png';
    return { data, mime, model: j?.model || 'auto', provider: j?.provider || 'router' };
  } catch (e) { return { note: 'unified unreachable: ' + why(e) }; }
}

// A quick "is it up" probe for one backend, so a caller can skip a dead step without waiting for its full timeout.
export async function reachable(b: Backend, env: NodeJS.ProcessEnv = process.env, ms = 800): Promise<boolean> {
  if (b === 'code') return true;
  const get = async (url: string, headers: Record<string, string> = {}): Promise<boolean> => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try { return (await fetch(url, { headers, signal: ctl.signal })).ok; } catch { return false; } finally { clearTimeout(timer); }
  };
  if (b === 'unified') {
    const key = unifiedKey(env);
    return key ? get(`${(env.UNIFIED_API_BASE || 'http://127.0.0.1:31415').replace(/\/$/, '')}/v1/models`, { authorization: `Bearer ${key}` }) : false;
  }
  if (b === 'kaggle') return env.LOCAL_LLM_URL ? get(`${env.LOCAL_LLM_URL.replace(/\/$/, '')}/api/tags`) : false;
  const { base } = ollamaSettings(env);
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?/i.test(base) ? get(`${base.replace(/\/$/, '')}/api/tags`) : false;
}

export const hasModel = (backends: Backend[]): boolean => backends.some((b) => b !== 'code');
