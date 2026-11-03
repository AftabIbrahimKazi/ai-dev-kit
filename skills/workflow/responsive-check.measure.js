#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseArgs = parseArgs;
exports.loadChromium = loadChromium;
exports.scanText = scanText;
exports.parseColor = parseColor;
exports.contrast = contrast;
exports.lowContrast = lowContrast;
exports.classify = classify;
exports.run = run;
exports.measure = measure;
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
// Browser half of the responsive-check skill: loads a page at each viewport width and reports layout problems.
// Needs Playwright in the project (the e2e-scaffold skill installs it); the kit itself has no dependencies.
//
//   node measure.js --url URL --widths 320,448,575 [--height 900] [--tap 44] [--shots DIR] [--out DIR] [--cwd D] [--json]
//
// Per width: overflow-x (with up to 5 offending selectors), tap targets under --tap px (inline links are exempt),
// text clipped by overflow:hidden without an ellipsis, secrets printed in the page text, NaN/undefined/null shown as
// values, and text below WCAG contrast (skipped over images and gradients). Page level: console and page errors,
// failed requests, responses of 400+, and a navigation timeout or crash. Widths are whole pixels: pass the plan's
// "viewport" values.
//
// --out DIR writes evidence.json (and screenshots under DIR/shots) and prints only a verdict, so a clean run costs the
// caller one line: VERDICT pass|escalate|retry evidence=PATH, plus up to 5 reasons. Open the evidence on escalate only.
// Exit 0 pass, 1 escalate (any finding), 3 retry (the page did not load), 2 on a usage or setup error.
const fs = require("node:fs");
const path = require("node:path");
function parseArgs(argv) {
    const o = { url: null, widths: [], height: 900, tap: 44, shots: null, out: null, cwd: process.cwd(), json: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--url')
            o.url = argv[++i];
        else if (a === '--widths')
            o.widths = String(argv[++i]).split(',').map(Number);
        else if (a === '--height')
            o.height = Number(argv[++i]);
        else if (a === '--tap')
            o.tap = Number(argv[++i]);
        else if (a === '--shots')
            o.shots = path.resolve(argv[++i]);
        else if (a === '--out')
            o.out = path.resolve(argv[++i]);
        else if (a === '--cwd')
            o.cwd = path.resolve(argv[++i]);
        else if (a === '--json')
            o.json = true;
    }
    if (o.out && !o.shots)
        o.shots = path.join(o.out, 'shots');
    if (!o.url)
        throw new Error('--url is required');
    if (!o.widths.length || o.widths.some((w) => !Number.isInteger(w) || w <= 0))
        throw new Error('--widths needs whole pixel widths, e.g. 320,448,575');
    return o;
}
function loadChromium(cwd, names = ['playwright', '@playwright/test', 'playwright-core']) {
    for (const name of names) {
        try {
            return require(require.resolve(name, { paths: [cwd] })).chromium;
        }
        catch { /* try the next package */ }
    }
    throw new Error(`Playwright is not installed for ${cwd}; run the e2e-scaffold skill, or: npm i -D playwright && npx playwright install chromium`);
}
// ---- pure checks: run in Node on what the page returned, so they are unit-tested without a browser ----
const SECRET_PATTERNS = [
    ['Stripe-style key', /\b(?:sk|rk)_live_[A-Za-z0-9]{8,}/],
    ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
    ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{20,}/],
    ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
    ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ['credentials in a URL', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@/i],
    ['secret assignment', /\b(?:password|passwd|pwd|api[_-]?key|secret)\s*=\s*[^\s*•]{4,}/i],
];
const BAD_VALUE = /(?<![\w.-])(NaN|undefined|null|Infinity|\[object Object\])(?![\w-])/g;
const around = (text, i, len) => text.slice(Math.max(0, i - 15), i + len + 15).replace(/\s+/g, ' ').trim();
function scanText(text) {
    const secrets = [];
    const badValues = [];
    for (const [label, re] of SECRET_PATTERNS) {
        const m = re.exec(text);
        if (m)
            secrets.push(`${label}: "${m[0].slice(0, 8)}…"`); // never print a whole secret
    }
    for (const m of text.matchAll(BAD_VALUE)) {
        const hit = `${m[1]}: "${around(text, m.index, m[1].length)}"`;
        if (!badValues.includes(hit))
            badValues.push(hit);
        if (badValues.length >= 5)
            break;
    }
    return { secrets, badValues };
}
function parseColor(s) {
    const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/.exec(s.trim());
    if (!m)
        return null;
    const a = m[4] === undefined ? 1 : m[5] ? Number(m[4]) / 100 : Number(m[4]);
    return [Number(m[1]), Number(m[2]), Number(m[3]), a];
}
const over = (top, under) => [0, 1, 2].map((i) => Math.round(top[i] * top[3] + under[i] * (1 - top[3])));
const luminance = ([r, g, b]) => {
    const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
// WCAG contrast ratio of text colour fg over background layers (nearest first, ending at an opaque layer or the white page).
function contrast(fg, layers) {
    const f = parseColor(fg);
    if (!f)
        return null;
    let base = [255, 255, 255];
    for (let i = layers.length - 1; i >= 0; i--) {
        const c = parseColor(layers[i]);
        if (!c)
            return null;
        base = over(c, base);
    }
    const text = over(f, base);
    const [hi, lo] = [luminance(text), luminance(base)].sort((a, b) => b - a);
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}
function lowContrast(els) {
    const out = [];
    for (const e of els) {
        if (!e.layers)
            continue; // over an image or gradient: unknown, never flagged
        const ratio = contrast(e.color, e.layers);
        const large = e.size >= 24 || (e.size >= 18.66 && e.weight >= 700);
        if (ratio !== null && ratio < (large ? 3 : 4.5))
            out.push(`${e.name} ${ratio}:1`);
        if (out.length >= 5)
            break;
    }
    return out;
}
// Runs inside the page: everything here must be self-contained (it is serialised into the browser).
function inspect(minTap) {
    const vw = document.documentElement.clientWidth;
    const name = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : ''));
    const shown = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const all = [...document.querySelectorAll('body *')];
    const overflowX = document.documentElement.scrollWidth > vw + 1;
    const layersOf = (el) => {
        const out = [];
        for (let n = el; n; n = n.parentElement) {
            const s = getComputedStyle(n);
            if (s.backgroundImage !== 'none')
                return null;
            out.push(s.backgroundColor);
            if (s.backgroundColor.startsWith('rgb('))
                break; // opaque: nothing below it shows
        }
        return out;
    };
    const ownText = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent || '').trim().length > 0);
    return {
        overflowX,
        offenders: overflowX ? all.filter((e) => shown(e) && e.getBoundingClientRect().right > vw + 1).slice(0, 5).map(name) : [],
        taps: [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button]')]
            .filter((e) => shown(e) && getComputedStyle(e).display !== 'inline')
            .filter((e) => { const r = e.getBoundingClientRect(); return r.width < minTap || r.height < minTap; })
            .slice(0, 10).map(name),
        clipped: all.filter((e) => { const s = getComputedStyle(e); return (s.overflow === 'hidden' || s.overflowX === 'hidden') && s.textOverflow !== 'ellipsis' && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1; }).slice(0, 5).map(name),
        text: (document.body ? document.body.innerText : '').slice(0, 200000),
        textEls: all
            .filter((e) => ownText(e) && shown(e) && !e.disabled && getComputedStyle(e).opacity !== '0' && e.getBoundingClientRect().width >= 2 && e.getBoundingClientRect().height >= 2)
            .slice(0, 300)
            .map((e) => { const s = getComputedStyle(e); return { name: name(e), color: s.color, layers: layersOf(e), size: parseFloat(s.fontSize), weight: Number(s.fontWeight) || 400 }; }),
    };
}
// A page that did not load is a retry; anything found on a page that did load is an escalate; otherwise pass.
function classify(r) {
    const reasons = [];
    if (r.load.failed)
        return { verdict: 'retry', reasons: [r.load.failed] };
    if (r.load.status !== null && r.load.status >= 400)
        reasons.push(`document returned ${r.load.status}`);
    for (const e of r.load.pageErrors)
        reasons.push(`page error: ${e}`);
    for (const e of r.load.consoleErrors)
        reasons.push(`console error: ${e}`);
    for (const e of r.load.failedRequests)
        reasons.push(`request failed: ${e}`);
    for (const w of r.rows) {
        if (w.overflowX)
            reasons.push(`${w.width}: overflow-x ${w.offenders.join(', ') || 'page wider than viewport'}`);
        if (w.taps.length)
            reasons.push(`${w.width}: small tap targets ${w.taps.join(', ')}`);
        if (w.clipped.length)
            reasons.push(`${w.width}: clipped text ${w.clipped.join(', ')}`);
        for (const x of w.secrets)
            reasons.push(`${w.width}: secret in page text, ${x}`);
        for (const x of w.badValues)
            reasons.push(`${w.width}: bad value ${x}`);
        if (w.lowContrast.length)
            reasons.push(`${w.width}: low contrast ${w.lowContrast.join(', ')}`);
    }
    return { verdict: reasons.length ? 'escalate' : 'pass', reasons };
}
async function run(o) {
    const chromium = loadChromium(o.cwd);
    const browser = await chromium.launch();
    const load = { failed: null, status: null, pageErrors: [], consoleErrors: [], failedRequests: [] };
    const rows = [];
    const push = (list, v) => { if (list.length < 10 && !list.includes(v))
        list.push(v); };
    try {
        const page = await browser.newPage();
        page.on('pageerror', (e) => push(load.pageErrors, String(e.message || e).slice(0, 200)));
        page.on('console', (m) => { if (m.type() === 'error')
            push(load.consoleErrors, m.text().slice(0, 200)); });
        page.on('requestfailed', (r) => push(load.failedRequests, `${r.url()} ${(r.failure() || { errorText: '' }).errorText}`.trim()));
        page.on('response', (r) => { if (r.status() >= 400)
            push(load.failedRequests, `${r.status()} ${r.url()}`); });
        try {
            const res = await page.goto(o.url, { waitUntil: 'load', timeout: 30000 });
            load.status = res ? res.status() : null;
        }
        catch (e) {
            load.failed = `navigation failed: ${String(e.message || e).split('\n')[0]}`;
            return { url: o.url, load, rows };
        }
        for (const width of o.widths) {
            await page.setViewportSize({ width, height: o.height });
            await page.waitForTimeout(150);
            const r = await page.evaluate(inspect, o.tap);
            if (o.shots) {
                fs.mkdirSync(o.shots, { recursive: true });
                await page.screenshot({ path: path.join(o.shots, `w${width}.png`) });
            }
            const { secrets, badValues } = scanText(r.text);
            const low = lowContrast(r.textEls);
            rows.push({ width, overflowX: r.overflowX, offenders: r.offenders, taps: r.taps, clipped: r.clipped, secrets, badValues, lowContrast: low, ok: !r.overflowX && !r.taps.length && !r.clipped.length && !secrets.length && !badValues.length && !low.length });
        }
    }
    finally {
        await browser.close();
    }
    return { url: o.url, load, rows };
}
async function measure(o) { return (await run(o)).rows; }
async function main() {
    const o = parseArgs(process.argv.slice(2));
    const report = await run(o);
    const { verdict, reasons } = classify(report);
    if (o.out) {
        fs.mkdirSync(o.out, { recursive: true });
        const file = path.join(o.out, 'evidence.json');
        fs.writeFileSync(file, JSON.stringify({ ...report, verdict, reasons }, null, 1));
        console.log(`VERDICT ${verdict} evidence=${file}`);
        for (const r of reasons.slice(0, 5))
            console.log('  ' + r);
        if (reasons.length > 5)
            console.log(`  (+${reasons.length - 5} more in the evidence file)`);
    }
    else if (o.json)
        console.log(JSON.stringify(report.rows, null, 1));
    else {
        if (report.load.failed)
            console.log(report.load.failed);
        for (const e of [...report.load.pageErrors.map((x) => 'page error: ' + x), ...report.load.consoleErrors.map((x) => 'console error: ' + x), ...report.load.failedRequests.map((x) => 'request failed: ' + x)])
            console.log(e);
        for (const r of report.rows) {
            console.log(`${r.width}  ${r.ok ? 'ok' : 'FINDING'}`);
            if (r.overflowX)
                console.log(`  overflow-x: ${r.offenders.join(', ') || 'page wider than viewport'}`);
            if (r.taps.length)
                console.log(`  tap targets under ${o.tap}px: ${r.taps.join(', ')}`);
            if (r.clipped.length)
                console.log(`  clipped text: ${r.clipped.join(', ')}`);
            if (r.secrets.length)
                console.log(`  secret in page text: ${r.secrets.join('; ')}`);
            if (r.badValues.length)
                console.log(`  bad value shown: ${r.badValues.join('; ')}`);
            if (r.lowContrast.length)
                console.log(`  low contrast: ${r.lowContrast.join(', ')}`);
        }
    }
    process.exitCode = verdict === 'pass' ? 0 : verdict === 'retry' ? 3 : 1;
}
if (require.main === module)
    main().catch((e) => { console.error('error: ' + e.message); process.exitCode = 2; });
