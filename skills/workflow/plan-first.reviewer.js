#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.neverSend = void 0;
exports.readConfig = readConfig;
exports.parseVerdict = parseVerdict;
exports.generate = generate;
exports.review = review;
// A second model reads a file or plan so Claude spends no tokens on it. Order is fixed: Gemini first, then a local
// Ollama model, then nothing (the caller falls back to its static scan). Every failure (no key, rate limit, offline,
// timeout, bad reply) is a quiet UNAVAILABLE, never an error: the work is never blocked. Plain Node, no dependencies.
//
//   node reviewer.js --prompt <prompt.txt> --file <file> [--root <dir>] [--reviewer auto|ollama|static]
//
// Config: <root>/.claude/state-audit.json  { "reviewer": "auto" | "ollama" | "static" }; default "static" (no network
// until the user picks a reviewer, e.g. in the installer). "auto" sends the file to Gemini (free tier may keep inputs:
// choose "ollama" for private code), then Ollama. Files that look like secrets are never sent.
// Env read: GEMINI_API_KEY (secret, from your shell), GEMINI_API_BASE, GEMINI_REVIEW_MODEL, AI_DEV_KIT_HOME.
// The model's reply must start with PASS, WARN or FAIL on its own line; anything else counts as UNAVAILABLE.
// Exit codes: 0 PASS or UNAVAILABLE, 1 WARN or FAIL (findings on stdout), 2 bad usage.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const SECRET_FILE = /(^|[\\/])(\.env[^\\/]*|[^\\/]*\.(pem|key|p12|pfx)|id_rsa[^\\/]*|[^\\/]*secret[^\\/]*|[^\\/]*credential[^\\/]*)$/i;
const MAX_CHARS = 60000;
const neverSend = (file) => SECRET_FILE.test(file);
exports.neverSend = neverSend;
function readConfig(root) {
    try {
        const c = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'state-audit.json'), 'utf8'));
        if (c.reviewer === 'auto' || c.reviewer === 'ollama' || c.reviewer === 'static')
            return { reviewer: c.reviewer, timeoutMs: c.timeoutMs, maxTokens: c.maxTokens };
    }
    catch { /* no config: static */ }
    return { reviewer: 'static' };
}
function ollamaSettings(env) {
    const home = env.AI_DEV_KIT_HOME || path.join(os.homedir(), '.ai-dev-kit');
    try {
        const m = JSON.parse(fs.readFileSync(path.join(home, 'models.json'), 'utf8'));
        return { base: m.system2?.baseUrl || 'http://127.0.0.1:11434', model: m.system2?.model || 'qwen2.5:1.5b' };
    }
    catch {
        return { base: 'http://127.0.0.1:11434', model: 'qwen2.5:1.5b' };
    }
}
async function postJson(url, body, headers, timeoutMs) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
        const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
        let json = null;
        try {
            json = await r.json();
        }
        catch { /* not json */ }
        return { ok: r.ok, status: r.status, json };
    }
    finally {
        clearTimeout(timer);
    }
}
// The reply must open with PASS, WARN or FAIL on its own line.
function parseVerdict(text) {
    const lines = text.replace(/\r/g, '').trim().split('\n');
    const first = (lines[0] || '').trim().replace(/[*`#:.]/g, '').toUpperCase();
    if (first !== 'PASS' && first !== 'WARN' && first !== 'FAIL')
        return null;
    return { status: first, findings: lines.slice(1).join('\n').trim() };
}
async function geminiRaw(prompt, text, env, timeoutMs, maxTokens) {
    const key = env.GEMINI_API_KEY;
    if (!key)
        return 'no GEMINI_API_KEY';
    const base = (env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
    const model = env.GEMINI_REVIEW_MODEL || 'gemini-2.5-flash';
    try {
        const r = await postJson(`${base}/v1beta/models/${model}:generateContent`, { contents: [{ parts: [{ text: `${prompt}\n\n${text}` }] }], generationConfig: { temperature: 0, maxOutputTokens: maxTokens } }, { 'x-goog-api-key': key }, timeoutMs);
        if (!r.ok)
            return r.status === 429 ? 'Gemini rate limit (429)' : `Gemini HTTP ${r.status}`;
        return { text: (r.json?.candidates?.[0]?.content?.parts?.[0]?.text) || '', backend: 'gemini' };
    }
    catch (e) {
        return 'Gemini unreachable: ' + (e.name === 'AbortError' ? 'timeout' : e.message);
    }
}
async function ollamaRaw(prompt, text, env, timeoutMs, maxTokens) {
    const { base, model } = ollamaSettings(env);
    if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?/i.test(base))
        return 'Ollama base URL is not loopback; not used';
    try {
        const r = await postJson(`${base.replace(/\/$/, '')}/api/generate`, { model, prompt: `${prompt}\n\n${text}`, stream: false, options: { temperature: 0, num_predict: maxTokens } }, {}, timeoutMs);
        if (!r.ok)
            return `Ollama HTTP ${r.status}`;
        return { text: (r.json?.response) || '', backend: 'ollama' };
    }
    catch (e) {
        return 'Ollama unreachable: ' + (e.name === 'AbortError' ? 'timeout' : e.message);
    }
}
// Same order for both uses: Gemini (when allowed), then Ollama, then nothing. `accept` decides whether a reply is usable.
async function ask(prompt, text, cfg, env, accept, defaultCap = 600) {
    if (cfg.reviewer === 'static')
        return { note: 'reviewer is "static": no model was asked' };
    const body = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
    const t = cfg.timeoutMs ?? 25000;
    const cap = cfg.maxTokens ?? defaultCap; // an uncapped small model can ramble for thousands of tokens and hit the timeout
    const notes = [];
    const steps = [];
    if (cfg.reviewer === 'auto')
        steps.push(() => geminiRaw(prompt, body, env, t, cap));
    steps.push(() => ollamaRaw(prompt, body, env, t, cap));
    for (const step of steps) {
        const r = await step();
        if (typeof r === 'string') {
            notes.push(r);
            continue;
        }
        if (accept(r.text))
            return { ...r, note: notes.length ? notes.join('; ') : undefined };
        notes.push(`${r.backend === 'gemini' ? 'Gemini' : 'Ollama'} reply was not usable`);
    }
    return { note: notes.join('; ') };
}
// Free text from the same backends (the external planner uses this). Returns null note-only when nothing answered.
async function generate(prompt, text, cfg, env = process.env) {
    return ask(prompt, text, cfg, env, (t) => t.trim().length > 0, 1500);
}
async function review(prompt, text, cfg, env = process.env) {
    const r = await ask(prompt, text, cfg, env, (t) => parseVerdict(t) !== null);
    if (!('text' in r))
        return { status: 'UNAVAILABLE', findings: '', backend: 'static', note: r.note };
    const v = parseVerdict(r.text);
    return { ...v, backend: r.backend, note: r.note };
}
async function main() {
    const a = process.argv.slice(2);
    let promptFile = '', file = '', root = process.cwd(), reviewer;
    for (let i = 0; i < a.length; i++) {
        if (a[i] === '--prompt')
            promptFile = a[++i];
        else if (a[i] === '--file')
            file = a[++i];
        else if (a[i] === '--root')
            root = path.resolve(a[++i] || '');
        else if (a[i] === '--reviewer')
            reviewer = a[++i];
        else {
            promptFile = '';
            break;
        }
    }
    if (!promptFile || !file || (reviewer && !['auto', 'ollama', 'static'].includes(reviewer))) {
        console.error('usage: reviewer.js --prompt <prompt.txt> --file <file> [--root <dir>] [--reviewer auto|ollama|static]');
        process.exitCode = 2;
        return;
    }
    if ((0, exports.neverSend)(file))
        return;
    try {
        const prompt = fs.readFileSync(path.resolve(root, promptFile), 'utf8');
        const text = fs.readFileSync(path.resolve(root, file), 'utf8');
        const cfg = { ...readConfig(root), ...(reviewer ? { reviewer } : {}) };
        const r = await review(prompt, text, cfg);
        if (r.status === 'WARN' || r.status === 'FAIL') {
            console.log(`${r.status} (${r.backend})\n${r.findings}`);
            process.exitCode = 1;
        }
    }
    catch { /* fail open */ }
}
if (require.main === module)
    void main();
