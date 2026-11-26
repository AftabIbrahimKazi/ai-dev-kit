#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasModel = exports.mask = exports.neverSend = exports.ORDER = void 0;
exports.readBackends = readBackends;
exports.ask = ask;
// Shared cascade for every kit feature that can hand work to a cheaper model so Claude spends fewer tokens.
// The project lists which backends it allows per feature in <root>/.claude/ai-backends.json:
//   { "review": ["code", "ollama", "unified"], "tests": ["ollama"], "goldfish": [], "coding": ["kaggle"] }
// An empty or missing list means Claude does the work itself. The order is FIXED here, whatever order the file lists:
//   code (a free script scan, not a model) > ollama (this machine) > kaggle (your GPU tunnel) > unified (free router) > Claude.
// Claude is always the last step and is never called from a script: when no backend answers, ask() returns a handoff
// and the caller prints HANDOFF so the skill text can say "then do it yourself". Every failure is a quiet note, never a throw.
// Env read: UNIFIED_API_KEY (or the same line in ~/.ai-dev-kit/.env), UNIFIED_API_BASE, LOCAL_LLM_URL, LOCAL_LLM_MODEL, AI_DEV_KIT_HOME.
// Text sent to kaggle or unified is secret-masked first; files that look like secrets are never sent. Plain Node, no dependencies.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
exports.ORDER = ['code', 'ollama', 'kaggle', 'unified'];
const MAX_CHARS = 60000;
const SECRET_FILE = /(^|[\\/])(\.env[^\\/]*|[^\\/]*\.(pem|key|p12|pfx)|id_rsa[^\\/]*|[^\\/]*secret[^\\/]*|[^\\/]*credential[^\\/]*)$/i;
const neverSend = (file) => SECRET_FILE.test(file);
exports.neverSend = neverSend;
const mask = (t) => t.replace(/\b(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}|xox[bap]-[A-Za-z0-9-]{10,})\b/g, '[masked]')
    .replace(/((?:api[_-]?key|token|secret|password|authorization)["']?\s*[:=]\s*)["']?[^\s"',;]{6,}/gi, (_m, p) => p + '[masked]');
exports.mask = mask;
const homeOf = (env) => env.AI_DEV_KIT_HOME || path.join(os.homedir(), '.ai-dev-kit');
// The backends the project allows for a feature, in the fixed order. Unknown names are dropped; no file means none.
function readBackends(root, feature) {
    try {
        const c = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'ai-backends.json'), 'utf8'));
        const want = Array.isArray(c[feature]) ? c[feature] : [];
        return exports.ORDER.filter((b) => want.includes(b));
    }
    catch {
        return [];
    }
}
function unifiedKey(env) {
    if (env.UNIFIED_API_KEY)
        return env.UNIFIED_API_KEY.trim();
    try {
        const m = /^UNIFIED_API_KEY=(.*)$/m.exec(fs.readFileSync(path.join(homeOf(env), '.env'), 'utf8'));
        return m ? m[1].replace(/["'\s]/g, '') : '';
    }
    catch {
        return '';
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
const why = (e) => (e.name === 'AbortError' ? 'timeout' : e.message);
async function ollama(prompt, text, env, t, cap) {
    let base = 'http://127.0.0.1:11434', model = 'qwen2.5:1.5b';
    try {
        const m = JSON.parse(fs.readFileSync(path.join(homeOf(env), 'models.json'), 'utf8'));
        base = m.system2?.baseUrl || base;
        model = m.system2?.model || model;
    }
    catch { /* defaults */ }
    if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?/i.test(base))
        return 'ollama base URL is not loopback; not used';
    try {
        const r = await postJson(`${base.replace(/\/$/, '')}/api/generate`, { model, prompt: `${prompt}\n\n${text}`, stream: false, think: false, options: { temperature: 0, num_predict: cap } }, {}, t);
        if (!r.ok)
            return `ollama HTTP ${r.status}`;
        return { text: r.json?.response || '' };
    }
    catch (e) {
        return 'ollama unreachable: ' + why(e);
    }
}
async function kaggle(prompt, text, env, t, cap) {
    const base = env.LOCAL_LLM_URL;
    if (!base)
        return 'kaggle: LOCAL_LLM_URL is not set (start the notebook with /kaggle setup)';
    try {
        const r = await postJson(`${base.replace(/\/$/, '')}/api/generate`, { model: env.LOCAL_LLM_MODEL || 'qwen3-coder:30b', prompt: `${prompt}\n\n${(0, exports.mask)(text)}`, stream: false, think: false, options: { temperature: 0, num_predict: cap, num_ctx: 8192 } }, {}, t);
        if (!r.ok)
            return `kaggle HTTP ${r.status}`;
        return { text: r.json?.response || '' };
    }
    catch (e) {
        return 'kaggle unreachable: ' + why(e);
    }
}
// The router always gets model "auto": a pinned model has no failover and timed out for 60 s in a probe.
async function unified(prompt, text, env, t, cap) {
    const key = unifiedKey(env);
    if (!key)
        return 'unified: no UNIFIED_API_KEY (set it in your shell or ~/.ai-dev-kit/.env)';
    const base = (env.UNIFIED_API_BASE || 'http://127.0.0.1:31415').replace(/\/$/, '');
    try {
        const r = await postJson(`${base}/v1/chat/completions`, { model: 'auto', temperature: 0, max_tokens: cap, messages: [{ role: 'user', content: `${prompt}\n\n${(0, exports.mask)(text)}` }] }, { authorization: `Bearer ${key}` }, t);
        if (!r.ok)
            return `unified HTTP ${r.status}`;
        return { text: r.json?.choices?.[0]?.message?.content || '' };
    }
    catch (e) {
        return 'unified unreachable: ' + why(e);
    }
}
const CALL = { ollama, kaggle, unified };
// Try each allowed model backend in the fixed order. First usable reply wins; if none does, the caller hands over to Claude.
// "code" is skipped here: it is the caller's own free scan, which runs before any model is asked.
async function ask(prompt, text, backends, opts = {}, env = process.env) {
    const body = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
    const t = opts.timeoutMs ?? 25000;
    const cap = opts.maxTokens ?? 600;
    const accept = opts.accept ?? ((s) => s.trim().length > 0);
    const notes = [];
    for (const b of exports.ORDER) {
        if (b === 'code' || !backends.includes(b))
            continue;
        const r = await CALL[b](prompt, body, env, t, cap);
        if (typeof r === 'string') {
            notes.push(r);
            continue;
        }
        if (accept(r.text))
            return { text: r.text, backend: b, notes };
        notes.push(`${b} reply was not usable`);
    }
    return { handoff: true, notes };
}
const hasModel = (backends) => backends.some((b) => b !== 'code');
exports.hasModel = hasModel;
