#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loopback = loopback;
exports.keyNames = keyNames;
exports.detect = detect;
exports.render = render;
// backends (skill-scope companion): read-only check of which model back ends this machine can reach RIGHT NOW, so setup
// can offer only what exists. Loopback only (Ollama, LM Studio, llama.cpp, Laya, the free router), 800 ms per probe, never
// starts or installs anything, never prints a key value (key NAMES only).
//   node backends.js [--json]
// Env read: OLLAMA_HOST, LMSTUDIO_PORT, LLAMACPP_PORT, LAYA_PORT, UNIFIED_API_BASE, UNIFIED_API_KEY, AI_DEV_KIT_HOME.
// Plain Node 18+, no dependencies.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const PROBE_MS = 800;
const home = () => process.env.AI_DEV_KIT_HOME || path.join(os.homedir(), '.ai-dev-kit');
async function getJson(url, headers = {}) {
    try {
        const r = await fetch(url, { headers, signal: AbortSignal.timeout(PROBE_MS) });
        let json = null;
        try {
            json = await r.json();
        }
        catch { /* not json */ }
        return { ok: r.ok, json };
    }
    catch {
        return { ok: false, json: null };
    }
}
// Only 127.0.0.1 or localhost is ever probed, whatever a variable says.
function loopback(raw, fallback) {
    try {
        const u = new URL(/^https?:\/\//.test(raw) ? raw : `http://${raw}`);
        if (u.hostname === '127.0.0.1' || u.hostname === 'localhost')
            return u.origin;
    }
    catch { /* fall through */ }
    return fallback;
}
// Names (never values) of keys set in the environment or in ~/.ai-dev-kit/.env.
function keyNames(env = process.env) {
    const names = new Set();
    for (const [k, v] of Object.entries(env))
        if (/^[A-Z][A-Z0-9_]*(API_KEY|TOKEN)$/.test(k) && v)
            names.add(k);
    try {
        for (const l of fs.readFileSync(path.join(home(), '.env'), 'utf8').split(/\r?\n/)) {
            const m = /^\s*([A-Z][A-Z0-9_]*(?:API_KEY|TOKEN|KEY))\s*=\s*\S/.exec(l);
            if (m)
                names.add(m[1]);
        }
    }
    catch { /* no .env */ }
    return [...names].sort();
}
function routerKey() {
    if (process.env.UNIFIED_API_KEY)
        return process.env.UNIFIED_API_KEY.trim();
    try {
        const m = /^UNIFIED_API_KEY=(.*)$/m.exec(fs.readFileSync(path.join(home(), '.env'), 'utf8'));
        return m ? m[1].replace(/["'\s]/g, '') : '';
    }
    catch {
        return '';
    }
}
const first = (a, n = 6) => a.slice(0, n);
async function detect() {
    const ollamaUrl = loopback(process.env.OLLAMA_HOST || '', 'http://127.0.0.1:11434');
    const lmUrl = `http://127.0.0.1:${process.env.LMSTUDIO_PORT || '1234'}`;
    const llamaUrl = `http://127.0.0.1:${process.env.LLAMACPP_PORT || '8080'}`;
    const layaUrl = `http://127.0.0.1:${process.env.LAYA_PORT || '8000'}`;
    const routerUrl = loopback(process.env.UNIFIED_API_BASE || '', 'http://127.0.0.1:31415');
    const key = routerKey();
    const [ol, lm, ll, ly, rm, rp] = await Promise.all([
        getJson(`${ollamaUrl}/api/tags`),
        getJson(`${lmUrl}/v1/models`),
        getJson(`${llamaUrl}/v1/models`),
        getJson(`${layaUrl}/health`),
        key ? getJson(`${routerUrl}/v1/models`, { authorization: `Bearer ${key}` }) : Promise.resolve({ ok: false, json: null }),
        key ? getJson(`${routerUrl}/v1/providers`, { authorization: `Bearer ${key}` }) : Promise.resolve({ ok: false, json: null }),
    ]);
    const names = (j, pick) => {
        const rows = j?.data ?? j?.models ?? [];
        return Array.isArray(rows) ? rows.map(pick).filter((x) => !!x) : [];
    };
    const olModels = names(ol.json, (x) => x.name);
    const lmModels = names(lm.json, (x) => x.id);
    const llModels = names(ll.json, (x) => x.id);
    const rmModels = names(rm.json, (x) => x.id);
    const providers = Array.isArray(rp.json?.providers) ? rp.json.providers.map((p) => String(p.platform)) : [];
    const backends = [
        { id: 'ollama', label: 'Ollama', url: ollamaUrl, reachable: ol.ok, models: first(olModels), count: olModels.length },
        { id: 'lmstudio', label: 'LM Studio', url: lmUrl, reachable: lm.ok, models: first(lmModels), count: lmModels.length },
        { id: 'llamacpp', label: 'llama.cpp server', url: llamaUrl, reachable: ll.ok, models: first(llModels), count: llModels.length },
        { id: 'laya', label: 'Laya (local ranking model)', url: layaUrl, reachable: ly.ok, models: [], count: 0 },
        { id: 'router', label: 'Free router', url: routerUrl, reachable: rm.ok, models: first(rmModels), count: rmModels.length, note: key ? (rm.ok ? undefined : 'key set, router not answering') : 'no UNIFIED_API_KEY' },
    ];
    return { backends, keys: keyNames(), searchReady: rm.ok && providers.some((p) => /parallel|keenable|search/i.test(p)), chatModels: [...olModels.map((m) => `ollama:${m}`), ...lmModels.map((m) => `lmstudio:${m}`)] };
}
function render(r) {
    const lines = r.backends.map((b) => `${b.reachable ? 'up  ' : 'down'}  ${b.label.padEnd(28)} ${b.url}${b.reachable && b.count ? `  (${b.count} model${b.count === 1 ? '' : 's'}: ${b.models.slice(0, 3).join(', ')}${b.count > 3 ? ', ...' : ''})` : ''}${!b.reachable && b.note ? `  [${b.note}]` : ''}`);
    lines.push(`keys (names only): ${r.keys.length ? r.keys.join(', ') : 'none'}`);
    lines.push(`web search through the router: ${r.searchReady ? 'ready' : 'not available'}`);
    return lines.join('\n');
}
async function main() {
    const r = await detect();
    console.log(process.argv.includes('--json') ? JSON.stringify(r) : render(r));
}
if (require.main === module)
    main().catch(() => { console.log(process.argv.includes('--json') ? JSON.stringify({ backends: [], keys: [], searchReady: false, chatModels: [] }) : 'backends: check failed'); });
