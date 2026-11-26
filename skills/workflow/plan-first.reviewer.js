#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.neverSend = void 0;
exports.readConfig = readConfig;
exports.parseVerdict = parseVerdict;
exports.generate = generate;
exports.review = review;
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
const fs = require("node:fs");
const path = require("node:path");
function sibling(installed, library) {
    return require(path.join(__dirname, fs.existsSync(path.join(__dirname, installed)) ? installed : library));
}
const bk = sibling('backends.js', 'plan-first.backends.js');
exports.neverSend = bk.neverSend;
function readConfig(root, feature = 'review') {
    let timeoutMs, maxTokens, legacy = [];
    try {
        const c = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'state-audit.json'), 'utf8'));
        timeoutMs = c.timeoutMs;
        maxTokens = c.maxTokens;
        if (c.reviewer === 'ollama' || c.reviewer === 'auto')
            legacy = ['ollama'];
    }
    catch { /* no state-audit.json */ }
    const listed = fs.existsSync(path.join(root, '.claude', 'ai-backends.json'));
    return { backends: listed ? bk.readBackends(root, feature) : feature === 'review' ? legacy : [], timeoutMs, maxTokens };
}
// The reply must open with PASS, WARN or FAIL on its own line.
function parseVerdict(text) {
    const lines = text.replace(/\r/g, '').trim().split('\n');
    const first = (lines[0] || '').trim().replace(/[*`#:.]/g, '').toUpperCase();
    if (first !== 'PASS' && first !== 'WARN' && first !== 'FAIL')
        return null;
    return { status: first, findings: lines.slice(1).join('\n').trim() };
}
// A local model answers or fails fast; the router can need a minute on a first call (a slow provider, then failover), so a remote
// backend gets 60 s (75 s for a pinned verdict) unless the project set timeoutMs. The state-audit hook allows the reviewer 90 s.
const remote = (cfg) => cfg.backends.some((b) => b === 'unified' || b === 'kaggle');
// A verdict is short, so the router is asked for the models measured fastest (qwen first, 2 s), one per try, and the loop moves to
// the next on a stuck call. Goldfish and other long answers keep the router's own pick.
const opts = (cfg, accept, cap, pin = false) => ({ timeoutMs: cfg.timeoutMs ?? (remote(cfg) ? (pin ? 75000 : 60000) : 25000), maxTokens: cfg.maxTokens ?? cap, accept, ...(pin ? { models: bk.FAST_MODELS, slices: bk.FAST_SLICES } : {}) });
async function run(prompt, text, cfg, env, accept, cap, pin = false) {
    if (!bk.hasModel(cfg.backends))
        return { note: 'no model backend is allowed for this feature: no model was asked' };
    const r = await bk.ask(prompt, text, cfg.backends, opts(cfg, accept, cap, pin), env);
    if ('handoff' in r)
        return { note: r.notes.join('; ') };
    return { text: r.text, backend: r.backend, note: r.notes.length ? r.notes.join('; ') : undefined };
}
// Free text from the same backends (goldfish uses this). A note-only result means nothing answered.
async function generate(prompt, text, cfg, env = process.env) {
    return run(prompt, text, cfg, env, (t) => t.trim().length > 0, 1500);
}
async function review(prompt, text, cfg, env = process.env) {
    const r = await run(prompt, text, cfg, env, (t) => parseVerdict(t) !== null, 600, true);
    if (!('text' in r))
        return { status: 'UNAVAILABLE', findings: '', backend: 'static', note: r.note };
    const v = parseVerdict(r.text);
    return { ...v, backend: r.backend, note: r.note };
}
async function main() {
    const a = process.argv.slice(2);
    let promptFile = '', file = '', root = process.cwd(), backends;
    for (let i = 0; i < a.length; i++) {
        if (a[i] === '--prompt')
            promptFile = a[++i];
        else if (a[i] === '--file')
            file = a[++i];
        else if (a[i] === '--root')
            root = path.resolve(a[++i] || '');
        else if (a[i] === '--backends')
            backends = (a[++i] || '').split(',').filter(Boolean);
        else {
            promptFile = '';
            break;
        }
    }
    if (!promptFile || !file || (backends && !backends.every((b) => bk.ORDER.includes(b)))) {
        console.error('usage: reviewer.js --prompt <prompt.txt> --file <file> [--root <dir>] [--backends ollama,kaggle,unified]');
        process.exitCode = 2;
        return;
    }
    if (bk.neverSend(file))
        return;
    try {
        const prompt = fs.readFileSync(path.resolve(root, promptFile), 'utf8');
        const text = fs.readFileSync(path.resolve(root, file), 'utf8');
        const cfg = { ...readConfig(root), ...(backends ? { backends } : {}) };
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
