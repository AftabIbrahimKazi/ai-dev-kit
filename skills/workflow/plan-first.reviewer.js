#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.neverSend = void 0;
exports.readConfig = readConfig;
exports.parseVerdict = parseVerdict;
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
            return { reviewer: c.reviewer, timeoutMs: c.timeoutMs };
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
async function gemini(prompt, text, env, timeoutMs) {
    const key = env.GEMINI_API_KEY;
    if (!key)
        return 'no GEMINI_API_KEY';
    const base = (env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
    const model = env.GEMINI_REVIEW_MODEL || 'gemini-2.5-flash';
    try {
        const r = await postJson(`${base}/v1beta/models/${model}:generateContent`, { contents: [{ parts: [{ text: `${prompt}\n\n${text}` }] }], generationConfig: { temperature: 0 } }, { 'x-goog-api-key': key }, timeoutMs);
        if (!r.ok)
            return r.status === 429 ? 'Gemini rate limit (429)' : `Gemini HTTP ${r.status}`;
        const out = (r.json?.candidates?.[0]?.content?.parts?.[0]?.text) || '';
        const v = parseVerdict(out);
        return v ? { ...v, backend: 'gemini' } : 'Gemini reply had no PASS/WARN/FAIL line';
    }
    catch (e) {
        return 'Gemini unreachable: ' + (e.name === 'AbortError' ? 'timeout' : e.message);
    }
}
async function ollama(prompt, text, env, timeoutMs) {
    const { base, model } = ollamaSettings(env);
    if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?/i.test(base))
        return 'Ollama base URL is not loopback; not used';
    try {
        const r = await postJson(`${base.replace(/\/$/, '')}/api/generate`, { model, prompt: `${prompt}\n\n${text}`, stream: false, options: { temperature: 0 } }, {}, timeoutMs);
        if (!r.ok)
            return `Ollama HTTP ${r.status}`;
        const v = parseVerdict((r.json?.response) || '');
        return v ? { ...v, backend: 'ollama' } : 'Ollama reply had no PASS/WARN/FAIL line';
    }
    catch (e) {
        return 'Ollama unreachable: ' + (e.name === 'AbortError' ? 'timeout' : e.message);
    }
}
async function review(prompt, text, cfg, env = process.env) {
    if (cfg.reviewer === 'static')
        return { status: 'UNAVAILABLE', findings: '', backend: 'static', note: 'reviewer is "static": no model was asked' };
    const body = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
    const t = cfg.timeoutMs ?? 25000;
    const notes = [];
    if (cfg.reviewer === 'auto') {
        const g = await gemini(prompt, body, env, t);
        if (typeof g !== 'string')
            return g;
        notes.push(g);
    }
    const o = await ollama(prompt, body, env, t);
    if (typeof o !== 'string')
        return notes.length ? { ...o, note: notes.join('; ') } : o;
    notes.push(o);
    return { status: 'UNAVAILABLE', findings: '', backend: 'static', note: notes.join('; ') };
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
