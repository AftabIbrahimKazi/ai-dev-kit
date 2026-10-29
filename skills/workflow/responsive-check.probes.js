#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseArgs = parseArgs;
exports.plan = plan;
exports.detect = detect;
// Browser-free half of the responsive-check skill: turns check flags into a viewport plan and detects the
// breakpoints a project already uses. Plain Node, any tool.
//
//   node probes.js [--range a-b[,c-d]]... [--min N]... [--max N]... [--width W[,W]]... [--ranges a-b,c-d,e-]
//                  [--detect] [--built] [--include-vendor] [--max-probes N] [--cwd D] [--json]
//
// No check flag: the six RULE 17 zones (css-standards.md). --detect alone prints the breakpoint report only.
// --min / --max with no value take their values from the detected queries. Widths are CSS px; a browser
// viewport is a whole number, so each probe also carries viewport = floor(width) (767.98 is probed at 767).
// Exit 3 when the plan is over the probe cap and needs the user's confirmation.
const fs = require("node:fs");
const path = require("node:path");
const ZONES = [[0, 575.98], [576, 767.98], [768, 991.98], [992, 1199.98], [1200, 1399.98], [1400, Infinity]];
const ZONE_NAMES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const FLOOR = 320;
const CEIL = 1920;
const DEFAULT_CAP = 24;
const STANDARD_EDGES = new Set([575.98, 576, 767.98, 768, 991.98, 992, 1199.98, 1200, 1399.98, 1400]);
const r2 = (n) => Math.round(n * 100) / 100;
const fmt = (n) => (n === Infinity ? '' : String(r2(n)));
const uniq = (a) => [...new Set(a)];
function parseArgs(argv) {
    const o = { range: [], min: [], max: [], width: [], ranges: null, detect: false, built: false, vendor: false, maxProbes: DEFAULT_CAP, cwd: process.cwd(), json: false };
    const value = (i) => (i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[i + 1] : null);
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (['--range', '--min', '--max', '--width', '--ranges'].includes(a)) {
            const v = value(i);
            if (v !== null)
                i++;
            if (v === null && a !== '--min' && a !== '--max')
                throw new Error(`${a} needs a value`);
            if (a === '--ranges')
                o.ranges = parseRanges(v);
            else if (a === '--range')
                o.range.push(...v.split(','));
            else if (a === '--width')
                o.width.push(...v.split(',').map(num));
            else if (a === '--min')
                o.min.push(...(v === null ? [null] : v.split(',').map(num)));
            else
                o.max.push(...(v === null ? [null] : v.split(',').map(num)));
        }
        else if (a === '--detect')
            o.detect = true;
        else if (a === '--built')
            o.built = true;
        else if (a === '--include-vendor')
            o.vendor = true;
        else if (a === '--json')
            o.json = true;
        else if (a === '--max-probes')
            o.maxProbes = num(argv[++i]);
        else if (a === '--cwd')
            o.cwd = path.resolve(argv[++i]);
    }
    return o;
}
function num(s) {
    const n = Number(s);
    if (s === undefined || s === '' || Number.isNaN(n) || n < 0)
        throw new Error(`"${s}" is not a width`);
    return n;
}
function parseRange(s) {
    const m = /^(\d*\.?\d*)-(\d*\.?\d*)$/.exec(s.trim());
    if (!m)
        throw new Error(`"${s}" is not a range like 600-900`);
    const lo = m[1] === '' ? 0 : Number(m[1]);
    const hi = m[2] === '' ? Infinity : Number(m[2]);
    if (hi <= lo)
        throw new Error(`range "${s}" must end above where it starts`);
    return [lo, hi];
}
const parseRanges = (v) => v.split(',').map(parseRange);
function rangeProbes(lo, hi) {
    const a = lo === 0 ? FLOOR : lo;
    const b = hi === Infinity ? CEIL : hi;
    return uniq([a, Math.round((a + b) / 2), b]);
}
const zoneOf = (w, zones) => {
    let z = 0;
    zones.forEach(([lo], i) => { if (w >= lo)
        z = i; });
    return zones === ZONES ? ZONE_NAMES[z] : `Z${z + 1}`;
};
function plan(o, found) {
    const zones = o.ranges || ZONES;
    const lowers = zones.slice(1).map((z) => z[0]);
    const uppers = zones.slice(0, -1).map((z) => z[1]);
    const checks = [];
    const warns = [];
    const explicit = o.range.length || o.min.length || o.max.length || o.width.length;
    const detectedMin = (found && found.minValues) || [];
    const detectedMax = (found && found.maxValues) || [];
    const detectedAll = (found && found.breakpoints) || [];
    if (!explicit)
        zones.forEach(([lo, hi]) => checks.push({ label: `range ${fmt(lo)}-${fmt(hi)}`, type: 'range', lo, hi, probes: rangeProbes(lo, hi) }));
    for (const s of o.range) {
        const [lo, hi] = parseRange(s);
        checks.push({ label: `range ${s.trim()}`, type: 'range', lo, hi, probes: rangeProbes(lo, hi) });
    }
    for (const v of o.min) {
        const vals = v === null ? detectedMin : [v];
        if (!vals.length)
            throw new Error('--min without a value found no min-width queries to detect');
        const top = Math.max(...vals);
        const ladder = [...lowers, ...(o.detect || v === null ? detectedAll : [])].filter((x) => x > top);
        checks.push({ label: `min-width ${v === null ? 'detected' : v}`, type: 'min', probes: uniq([...vals.flatMap((x) => [r2(x - 0.02), x]), ...ladder, CEIL]) });
        warns.push('--min is min-width only: non-standard, RULE 17 is range-based; changes bleed upward');
    }
    for (const v of o.max) {
        const vals = v === null ? detectedMax : [v];
        if (!vals.length)
            throw new Error('--max without a value found no max-width queries to detect');
        const low = Math.min(...vals);
        const ladder = [...uppers, ...(o.detect || v === null ? detectedAll : [])].filter((x) => x < low);
        checks.push({ label: `max-width ${v === null ? 'detected' : v}`, type: 'max', probes: uniq([...vals.flatMap((x) => [x, r2(x + 0.02)]), ...ladder, FLOOR]) });
        warns.push('--max is max-width only: non-standard, RULE 17 is range-based; changes bleed downward');
    }
    for (const w of o.width)
        checks.push({ label: `width ${w}`, type: 'width', probes: [w] });
    const ranged = checks.filter((c) => c.type === 'range');
    for (let i = 0; i < ranged.length; i++)
        for (let j = i + 1; j < ranged.length; j++) {
            const a = ranged[i];
            const b = ranged[j];
            if (a.lo < b.hi && b.lo < a.hi && !(a.lo === b.lo && a.hi === b.hi))
                warns.push(`${a.label} overlaps ${b.label}: RULE 17 zones are isolated`);
        }
    const byWidth = new Map();
    for (const c of checks)
        for (const p of c.probes) {
            const w = r2(p);
            if (!byWidth.has(w))
                byWidth.set(w, { width: w, viewport: Math.floor(w), zone: zoneOf(w, zones), checks: [] });
            byWidth.get(w).checks.push(c.label);
        }
    const probes = [...byWidth.values()].sort((a, b) => a.width - b.width);
    return { checks: checks.map((c) => c.label), probes, warnings: uniq(warns), cap: o.maxProbes, needsConfirm: probes.length > o.maxProbes };
}
// ---- detect: the width breakpoints a project's stylesheets already use ----
const CSS_EXT = /\.(css|scss|sass|less|pcss)$/i;
const SKIP_DIRS = new Set(['node_modules', 'vendor', '.git']);
const BUILT_DIRS = new Set(['dist', 'build', 'out', '.next', '.astro', 'coverage']);
const UNIT = '(\\d*\\.?\\d+)(px|em|rem)';
const px = (v, unit) => r2(unit === 'px' ? Number(v) : Number(v) * 16);
function walk(dir, o, out) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) {
            if (SKIP_DIRS.has(e.name) && !(o.vendor && e.name !== '.git'))
                continue;
            if (BUILT_DIRS.has(e.name) && !o.built)
                continue;
            walk(path.join(dir, e.name), o, out);
        }
        else if (CSS_EXT.test(e.name) && !/\.min\.css$/i.test(e.name))
            out.push(path.join(dir, e.name));
        if (out.length > 5000)
            return;
    }
}
function parseCondition(prelude) {
    let lo = null;
    let hi = null;
    let m = new RegExp('min-width\\s*:\\s*' + UNIT).exec(prelude);
    if (m)
        lo = px(m[1], m[2]);
    m = new RegExp('max-width\\s*:\\s*' + UNIT).exec(prelude);
    if (m)
        hi = px(m[1], m[2]);
    m = new RegExp(UNIT + '\\s*(<=|<)\\s*width\\s*(<=|<)\\s*' + UNIT).exec(prelude);
    if (m) {
        lo = px(m[1], m[2]) + (m[3] === '<' ? 0.02 : 0);
        hi = px(m[5], m[6]) - (m[4] === '<' ? 0.02 : 0);
    }
    m = new RegExp('\\bwidth\\s*(>=|>|<=|<)\\s*' + UNIT).exec(prelude);
    if (m) {
        const v = px(m[2], m[3]);
        if (m[1] === '>=')
            lo = v;
        else if (m[1] === '>')
            lo = v + 0.02;
        else if (m[1] === '<=')
            hi = v;
        else
            hi = v - 0.02;
    }
    return { lo: lo === null ? null : r2(lo), hi: hi === null ? null : r2(hi) };
}
const lineAt = (text, i) => text.slice(0, i).split('\n').length;
function detect(o) {
    const files = [];
    walk(o.cwd, o, files);
    const queries = [];
    const unresolved = [];
    let ignored = 0;
    for (const f of files) {
        const rel = path.relative(o.cwd, f).split(path.sep).join('/');
        const text = fs.readFileSync(f, 'utf8');
        for (const m of text.matchAll(/@(media|container)\b([^{;]*)\{/g)) {
            const prelude = m[2];
            if (!/width/.test(prelude)) {
                ignored++;
                continue;
            }
            const c = parseCondition(prelude);
            if (c.lo === null && c.hi === null)
                unresolved.push({ file: rel, line: lineAt(text, m.index), text: `@${m[1]}${prelude}`.trim() });
            else
                queries.push({ file: rel, line: lineAt(text, m.index), ...c });
        }
        for (const m of text.matchAll(/@include\s+([\w-]*(?:media|respond|breakpoint|mq|screen|bp|up|down|between)[\w-]*)\s*\(([^)]*)\)/gi)) {
            unresolved.push({ file: rel, line: lineAt(text, m.index), text: `@include ${m[1]}(${m[2]})` });
        }
    }
    const style = { range: 0, min: 0, max: 0 };
    for (const q of queries)
        style[q.lo !== null && q.hi !== null ? 'range' : q.lo !== null ? 'min' : 'max']++;
    const values = queries.flatMap((q) => [q.lo, q.hi]).filter((v) => v !== null && v > 0);
    const breakpoints = uniq(values).sort((a, b) => a - b);
    const minValues = uniq(queries.filter((q) => q.lo !== null && q.hi === null).map((q) => q.lo)).sort((a, b) => a - b);
    const maxValues = uniq(queries.filter((q) => q.hi !== null && q.lo === null).map((q) => q.hi)).sort((a, b) => a - b);
    const overlaps = [];
    const byFile = {};
    for (const q of queries.filter((x) => x.lo !== null && x.hi !== null))
        (byFile[q.file] = byFile[q.file] || []).push(q);
    for (const [file, qs] of Object.entries(byFile))
        for (let i = 0; i < qs.length; i++)
            for (let j = i + 1; j < qs.length; j++) {
                const a = qs[i];
                const b = qs[j];
                if (a.lo < b.hi && b.lo < a.hi && !(a.lo === b.lo && a.hi === b.hi))
                    overlaps.push(`${file}: ${a.lo}-${a.hi} vs ${b.lo}-${b.hi}`);
            }
    const uncovered = queries.length
        ? ZONES.map(([lo, hi], i) => ({ lo, hi, name: ZONE_NAMES[i] })).filter(({ lo, hi }) => !queries.some((q) => (q.lo === null ? 0 : q.lo) <= hi && (q.hi === null ? Infinity : q.hi) >= lo)).map((z) => `${z.name} (${fmt(z.lo)}-${fmt(z.hi)})`)
        : [];
    const extra = {};
    for (const v of values)
        if (!STANDARD_EDGES.has(v))
            extra[v] = (extra[v] || 0) + 1;
    let suggest = 'standard';
    if (queries.length)
        suggest = style.range >= style.min && style.range >= style.max ? 'range' : style.min >= style.max ? 'min' : 'max';
    return { files: files.length, queries: queries.length, ignored, style, breakpoints, minValues, maxValues, overlaps: uniq(overlaps).slice(0, 10), uncovered, extra, unresolved, suggest };
}
function printDetect(d) {
    console.log(`Breakpoints found (${d.files} files, ${d.queries} width queries, ${d.ignored} non-width ignored)`);
    console.log('  ' + (d.breakpoints.join(' · ') || 'none'));
    console.log(`Query style: range pair ${d.style.range}, min-width ${d.style.min}, max-width ${d.style.max}`);
    console.log('Against RULE 17');
    console.log('  overlap    ' + (d.overlaps.join('; ') || 'none'));
    console.log('  uncovered  ' + (d.uncovered.join(', ') || 'none'));
    console.log('  extra      ' + (Object.entries(d.extra).map(([v, n]) => `${v} (x${n})`).join(', ') || 'none'));
    console.log(`Unresolved (SCSS variables, mixins, custom properties): ${d.unresolved.length}`);
    for (const u of d.unresolved.slice(0, 10))
        console.log(`  ${u.file}:${u.line}  ${u.text}`);
    console.log('Suggested: ' + (d.suggest === 'standard' ? 'no queries found; use the six standard zones' : d.suggest === 'range' ? 'range mode on the detected zones' : `${d.suggest}-width mode (non-standard, RULE 17 warns) with the detected values as the ladder`));
}
function main() {
    const o = parseArgs(process.argv.slice(2));
    const checkFlags = o.range.length || o.min.length || o.max.length || o.width.length || o.ranges;
    const needsFound = o.detect || o.min.includes(null) || o.max.includes(null);
    const found = needsFound ? detect(o) : null;
    if (o.detect && !checkFlags) {
        if (o.json)
            console.log(JSON.stringify(found, null, 1));
        else
            printDetect(found);
        return;
    }
    const p = plan(o, found);
    if (o.json)
        console.log(JSON.stringify(p, null, 1));
    else {
        console.log(`Plan: ${p.probes.length} viewports from ${p.checks.length} checks (${p.checks.join('; ')})`);
        for (const x of p.probes)
            console.log(`${x.width}  viewport=${x.viewport}  ${x.zone}  ${x.checks.join(', ')}`);
        for (const w of p.warnings)
            console.log('WARN ' + w);
        if (p.needsConfirm)
            console.log(`CONFIRM ${p.probes.length} viewports is over the cap of ${p.cap}; ask the user, or pass --max-probes`);
    }
    if (p.needsConfirm)
        process.exitCode = 3;
}
if (require.main === module) {
    try {
        main();
    }
    catch (e) {
        console.error('error: ' + e.message);
        process.exitCode = 2;
    }
}
