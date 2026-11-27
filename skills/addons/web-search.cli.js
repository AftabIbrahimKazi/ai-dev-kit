#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitSentences = void 0;
exports.cleanUrl = cleanUrl;
exports.bestWindow = bestWindow;
exports.shape = shape;
exports.scoreSentence = scoreSentence;
exports.shapeSentences = shapeSentences;
exports.saveCache = saveCache;
exports.readCache = readCache;
exports.moreText = moreText;
// web-search: send ONE query to the free router's /v1/search (the router picks the engine), trim the hits in code and print
// a compact JSON list. No model is asked. Exit 2 with a one-line reason on any failure (no key, router down, no hits): the
// caller (the web-search mod) then lets Claude's own WebSearch run. Never prints a key.
//   node cli.js <query...> [--max 5] [--allow a.com,b.org] [--block x.com]      node cli.js check
// Env read: UNIFIED_API_KEY (or ~/.ai-dev-kit/.env), UNIFIED_API_BASE, AI_DEV_KIT_HOME. Plain Node, no dependencies.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const SNIPPET_CHARS = 360;
const ASK_MS = 20000;
const SIFT_MS = 15000;
const home = () => process.env.AI_DEV_KIT_HOME || path.join(os.homedir(), '.ai-dev-kit');
const base = () => (process.env.UNIFIED_API_BASE || 'http://127.0.0.1:31415').replace(/\/$/, '');
function key() {
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
// Same page, different tracking tail: drop utm_*, fbclid, gclid and the fragment so duplicates collapse.
function cleanUrl(raw) {
    try {
        const u = new URL(raw);
        for (const k of [...u.searchParams.keys()])
            if (/^(utm_|fbclid|gclid|mc_|ref$)/i.test(k))
                u.searchParams.delete(k);
        u.hash = '';
        u.pathname = u.pathname.replace(/\/+$/, '') || '/';
        return u.href.replace(/\/$/, '');
    }
    catch {
        return raw;
    }
}
const host = (u) => { try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, '');
}
catch {
    return '';
} };
const inDomains = (u, list) => { const h = host(u); return list.some((d) => h === d || h.endsWith('.' + d)); };
// The SNIPPET_CHARS window of the page text that holds the most query words (first window on a tie), cut at a word edge.
function bestWindow(text, query, size = SNIPPET_CHARS) {
    const t = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#*_`>|]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (t.length <= size)
        return t;
    const words = [...new Set(query.toLowerCase().split(/[^a-z0-9.]+/).filter((w) => w.length > 2))];
    if (!words.length)
        return t.slice(0, size).replace(/\s\S*$/, '') + '...';
    const low = t.toLowerCase();
    let best = 0, bestScore = -1;
    for (let i = 0; i + size <= t.length + 60; i += 60) {
        const w = low.slice(i, i + size);
        const score = words.reduce((n, x) => n + (w.includes(x) ? 1 : 0), 0);
        if (score > bestScore) {
            bestScore = score;
            best = i;
        }
    }
    const start = best === 0 ? 0 : t.indexOf(' ', best) + 1 || best;
    const out = t.slice(start, start + size).replace(/\s\S*$/, '');
    return (start > 0 ? '...' : '') + out + '...';
}
// Usable hits: has a title and url, tracking tail removed, duplicates and filtered domains dropped, capped.
function pickRows(raw, max, allow, block) {
    const seen = new Set();
    const out = [];
    for (const r of raw) {
        if (!r.url || !r.title)
            continue;
        const url = cleanUrl(r.url);
        if (seen.has(url))
            continue;
        if (allow.length && !inDomains(url, allow))
            continue;
        if (block.length && inDomains(url, block))
            continue;
        seen.add(url);
        out.push({ title: r.title.replace(/\s+/g, ' ').trim().slice(0, 140), url, content: r.content || '' });
        if (out.length >= max)
            break;
    }
    return out;
}
function shape(raw, query, max, allow, block) {
    return pickRows(raw, max, allow, block).map((r) => ({ title: r.title, url: r.url, snippet: bestWindow(r.content, query) }));
}
const flat = (t) => t.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#*_`>|]+/g, ' ').replace(/\s+/g, ' ').trim();
const splitSentences = (t) => flat(t).split(/(?<=[.!?])\s+(?=[A-Z0-9"'(\[])/).map((s) => s.trim()).filter((s) => s.length > 25 && s.length < 600);
exports.splitSentences = splitSentences;
// Score one sentence: query-word overlap counts most, a few digits and capitalised names (facts) add a little, a very long one loses a point.
function scoreSentence(s, words) {
    const l = s.toLowerCase();
    let n = 0;
    for (const w of words)
        if (l.includes(w))
            n += 1;
    return n * 3 + Math.min((s.match(/\d+/g) || []).length, 3) * 0.7 + Math.min((s.match(/\b[A-Z][a-z]+\b/g) || []).length, 4) * 0.2 - (s.length > 400 ? 1 : 0);
}
// The best sentences across all hits, at most perHit from one hit and budget characters in total; a hit with none chosen is dropped.
// Measured offline (15 fact questions): same recall as the 360-character window with about 11% fewer characters.
function shapeSentences(raw, query, max, allow, block, budget = 1500, perHit = 3) {
    const words = [...new Set(query.toLowerCase().split(/[^a-z0-9.]+/).filter((w) => w.length > 2))];
    const rows = pickRows(raw, max, allow, block);
    const all = [];
    rows.forEach((r, hi) => { for (const s of (0, exports.splitSentences)(r.content))
        all.push({ hi, s, sc: scoreSentence(s, words) }); });
    all.sort((a, b) => b.sc - a.sc);
    const used = new Map();
    const chosen = new Map();
    let total = 0;
    for (const x of all) {
        if ((used.get(x.hi) || 0) >= perHit || total + x.s.length > budget)
            continue;
        used.set(x.hi, (used.get(x.hi) || 0) + 1);
        total += x.s.length;
        chosen.set(x.hi, [...(chosen.get(x.hi) || []), x]);
    }
    const out = [];
    rows.forEach((r, hi) => { const c = chosen.get(hi); if (c)
        out.push({ title: r.title, url: r.url, snippet: c.map((x) => x.s).join(' ') }); });
    if (!out.length)
        return shape(raw, query, max, allow, block);
    return out;
}
// A router model reads the full hits and copies out only the facts that answer the query. One call, retried once; empty string on any failure
// so the caller keeps the sentence result. Measured offline (15 fact questions): every answer kept, about 78% fewer characters, about 5 s more.
async function sift(query, rows) {
    const k = key();
    if (!k || !rows.length)
        return '';
    const body = rows.map((r) => `${r.title}\n${r.url}\n${flat(r.content).slice(0, 1500)}`).join('\n\n');
    const prompt = `From the search results below, copy ONLY the sentences or short facts that help answer the question. Keep the source URL next to each fact. At most 120 words, no commentary.\n\nQuestion: ${query}\n\n${body}`;
    for (let i = 0; i < 2; i++) {
        try {
            const r = await fetch(`${base()}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${k}` }, body: JSON.stringify({ model: 'auto', temperature: 0, max_tokens: 300, messages: [{ role: 'user', content: prompt }] }), signal: AbortSignal.timeout(SIFT_MS) });
            if (!r.ok)
                continue;
            const t = ((await r.json()).choices?.[0]?.message?.content || '').trim();
            if (t)
                return t;
        }
        catch { /* retry once, then give up */ }
    }
    return '';
}
async function search(query, want) {
    const k = key();
    if (!k)
        throw new Error('no UNIFIED_API_KEY');
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ASK_MS);
    try {
        const r = await fetch(`${base()}/v1/search`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${k}` }, body: JSON.stringify({ query, max_results: want }), signal: ctl.signal });
        if (!r.ok)
            throw new Error(`router HTTP ${r.status}`);
        const j = (await r.json());
        return { hits: Array.isArray(j.results) ? j.results : [], provider: String(j.provider || '') };
    }
    catch (e) {
        throw new Error(e.name === 'AbortError' ? 'router timeout' : e.message);
    }
    finally {
        clearTimeout(timer);
    }
}
// ---- saved results: the full hits stay on disk (outside the context) so a later `more` call can read or re-sift them ----
const cacheDir = () => path.join(home(), 'search-cache');
const CACHE_KEEP = 40;
const CACHE_MAX_AGE_MS = 24 * 3600 * 1000;
function saveCache(query, rows) {
    try {
        const id = require('node:crypto').createHash('sha1').update(query + Date.now()).digest('hex').slice(0, 6);
        fs.mkdirSync(cacheDir(), { recursive: true });
        fs.writeFileSync(path.join(cacheDir(), `${id}.json`), JSON.stringify({ query, ts: Date.now(), rows }));
        const files = fs.readdirSync(cacheDir()).filter((f) => /^[0-9a-f]{6}\.json$/.test(f)).map((f) => ({ f, t: fs.statSync(path.join(cacheDir(), f)).mtimeMs })).sort((a, b) => b.t - a.t);
        files.forEach((x, i) => { if (i >= CACHE_KEEP || Date.now() - x.t > CACHE_MAX_AGE_MS)
            fs.rmSync(path.join(cacheDir(), x.f), { force: true }); });
        return id;
    }
    catch {
        return '';
    }
}
function readCache(id) {
    if (!/^[0-9a-f]{6}$/.test(id))
        return null;
    try {
        return JSON.parse(fs.readFileSync(path.join(cacheDir(), `${id}.json`), 'utf8'));
    }
    catch {
        return null;
    }
}
// `more <id>` lists the saved hits; `--hit n` prints one hit's full text (capped); `--ask "<question>"` picks the best sentences for a new question
// from ALL saved hits with a larger budget. No network, no model.
function moreText(id, hit, ask) {
    const c = readCache(id);
    if (!c)
        return null;
    if (hit !== undefined) {
        const r = c.rows[hit - 1];
        return r ? `${r.title}\n${r.url}\n${flat(r.content).slice(0, 6000)}` : `no hit ${hit}; there are ${c.rows.length}`;
    }
    if (ask) {
        const hits = shapeSentences(c.rows.map((r) => ({ title: r.title, url: r.url, content: r.content })), ask, 10, [], [], 4000, 6);
        return hits.map((h) => `${h.title}\n${h.url}\n${h.snippet}`).join('\n\n');
    }
    return c.rows.map((r, i) => `${i + 1}. ${r.title} (${r.url}, ${flat(r.content).length} chars)`).join('\n');
}
// Setting chosen once at install (`install-kit mods --web-search-sift router|off`): ~/.ai-dev-kit/web-search.json. The env variable overrides it.
function configuredMode() {
    const env = process.env.WEB_SEARCH_MODE;
    if (env)
        return env.toLowerCase();
    try {
        return JSON.parse(fs.readFileSync(path.join(home(), 'web-search.json'), 'utf8')).sift === 'router' ? 'sift' : 'sentence';
    }
    catch {
        return 'sentence';
    }
}
const list = (v) => (v || '').split(',').map((x) => x.trim().toLowerCase().replace(/^www\./, '')).filter(Boolean);
async function main() {
    const argv = process.argv.slice(2);
    if (argv[0] === 'check') {
        console.log(`router key: ${key() ? 'set' : 'missing'}`);
        console.log(`router: ${base()}`);
        return 0;
    }
    if (argv[0] === 'more') {
        const id = argv[1] || '';
        let hit, ask;
        for (let i = 2; i < argv.length; i++) {
            if (argv[i] === '--hit')
                hit = parseInt(argv[++i], 10) || undefined;
            else if (argv[i] === '--ask')
                ask = argv.slice(++i).join(' ');
        }
        const t = moreText(id, hit, ask);
        if (t === null) {
            console.error('skip: no saved results with that id (they are kept for a day)');
            return 2;
        }
        console.log(t);
        return 0;
    }
    const words = [];
    let max = 5, allow = [], block = [];
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--max')
            max = Math.min(10, Math.max(1, parseInt(argv[++i], 10) || 5));
        else if (argv[i] === '--allow')
            allow = list(argv[++i]);
        else if (argv[i] === '--block')
            block = list(argv[++i]);
        else
            words.push(argv[i]);
    }
    const query = words.join(' ').trim();
    if (!query) {
        console.error('usage: cli.js <query...> [--max n] [--allow a,b] [--block x] | check');
        return 2;
    }
    const t0 = Date.now();
    const mode = configuredMode(); // sentence (default), window (the older fixed window), sift (router model, slower; chosen at install or by env)
    let res;
    try {
        res = await search(query, mode === 'sift' ? 8 : allow.length || block.length ? Math.min(10, max * 2) : max);
    }
    catch (e) {
        console.error('skip: ' + e.message);
        return 2;
    }
    const hits = mode === 'window' ? shape(res.hits, query, max, allow, block) : shapeSentences(res.hits, query, max, allow, block);
    if (!hits.length) {
        console.error('skip: no usable hits');
        return 2;
    }
    const out = { query, provider: res.provider, hits, durationMs: 0 };
    const cacheId = saveCache(query, pickRows(res.hits, 10, [], []));
    if (cacheId)
        out.cacheId = cacheId;
    if (mode === 'sift') {
        const digest = await sift(query, pickRows(res.hits, 8, allow, block));
        if (digest)
            out.digest = digest; // empty: the sentence hits above stand in
    }
    out.durationMs = Date.now() - t0;
    console.log(JSON.stringify(out));
    return 0;
}
if (require.main === module)
    main().then((c) => { process.exitCode = c; }, (e) => { console.error('skip: ' + e.message); process.exitCode = 2; });
