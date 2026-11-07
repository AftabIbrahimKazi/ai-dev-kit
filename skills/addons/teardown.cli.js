#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Cdp = void 0;
exports.classify = classify;
exports.extractFacts = extractFacts;
exports.draftSpec = draftSpec;
exports.validateSpec = validateSpec;
exports.lintSource = lintSource;
exports.checkDir = checkDir;
exports.scaffold = scaffold;
exports.buildDist = buildDist;
exports.findChrome = findChrome;
exports.withPage = withPage;
exports.renderSheet = renderSheet;
exports.probePage = probePage;
exports.findModels = findModels;
exports.detectProject = detectProject;
// Mechanical half of the teardown add-on: finds out whether a project can host an interactive 3D machine simulator,
// turns a plain description into a spec, scaffolds the machine from a Triforge-based starter, checks it, builds it into
// an offline page, and renders review sheets in a headless browser. Claude only supplies what a script cannot: the
// real dimensions, the reference, and the machine's own geometry. Plain Node, no dependencies, no network.
// Adapted in idea from github.com/elvarofficial/teardown (MIT, itself built on whaleyxbt/claude-motion, MIT);
// the scaffold, checks, bundler and capture here are our own and no code was copied.
//
//   node cli.js detect [--about "text"] [--model FILE] [--name N] [--root D] [--json] [--dry-run] [--force]
//                                  report the project (three, Triforge packages, Chrome, Node, existing machines,
//                                  reference files); with --about, also classify the machine, draft
//                                  teardown/<name>/spec.json and print the questions left open. Any .glb or .gltf in
//                                  the project can be the machine (--model): its nodes become the parts
//   node cli.js init <name> [--root D] [--json] [--dry-run] [--force]
//                                  scaffold teardown/<name>/ from the gears, crank or custom starter, numbers from its spec.json
//   node cli.js check <dir> [--json]
//                                  validate the spec and lint the sources; exit 1 on any error
//   node cli.js build <dir> [--json] [--dry-run]
//                                  copy the app and only the library files it imports into <dir>/dist with an import map
//   node cli.js probe <dir> [--json]
//                                  drive the live page like a visitor in headless Chrome: drag, wheel, part buttons, cut,
//                                  glass, the quiet-time handover back to the tour; fail on any miss or console error
//   node cli.js sheet <dir> [--at 0,4,8] [--size 1280x720] [--json]
//                                  build if needed, serve dist, render stills at the timeline beats in headless
//                                  Chrome, write PNGs and one contact sheet, fail on any console error or empty frame
// Exit codes: 0 done, 1 error, 2 bad usage, 3 blocked by a preflight (no Chrome, packages missing).
// It writes only inside teardown/<name>/ and teardown-out/<name>/. It never commits, pushes or deletes, and makes
// no network call: library files are copied from the project's own node_modules.
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const cp = require("node:child_process");
const STARTER_KINDS = ['gears', 'crank', 'custom'];
const MAX_PARTS = 8;
const TOOL = 'teardown add-on';
const out = (s) => process.stdout.write(s + '\n');
const warn = (s) => process.stderr.write(s + '\n');
function fail(msg, code = 1) { warn('error: ' + msg); process.exitCode = code; }
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rel = (from, to) => path.relative(from, to).split(path.sep).join('/') || '.';
// ---------- what each kind of machine needs ----------
// kind is the starter the page is built from: gears, crank (one slider-crank cylinder) or custom (any other machine
// or a model file). family is what the machine is, which decides the Triforge packages that suit it.
const KINDS = [
    { kind: 'gears', family: 'gears', re: /\b(gear|gears|gearbox|transmission|pinion|reducer|differential|gear ?train)\b/i, packages: ['modifier-core', 'keyframe', 'render-budget-core'], why: 'repeated and chamfered parts, the tour timeline, an adaptive quality tier' },
    { kind: 'crank', family: 'engine', re: /\b(engine|piston|cylinder|crankshaft|slider.?crank|compressor|reciprocating|connecting rod|v8)\b/i, packages: ['modifier-core', 'keyframe', 'render-budget-core', 'compositor-core'], why: 'finned and bevelled parts, the tour, bloom for the burn' },
    { kind: 'custom', family: 'linkage', re: /\b(linkage|walker|strandbeest|four.?bar|crank.?rocker|mechanism|landing gear|rack)\b/i, packages: ['curve-core', 'animation-core', 'keyframe', 'render-budget-core'], why: 'bevelled link tubes, joint rigs, the tour' },
    { kind: 'custom', family: 'pump', re: /\b(pump|impeller|turbine|fan|propeller|rotor)\b/i, packages: ['geometry-nodes', 'curve-core', 'keyframe', 'render-budget-core'], why: 'blades placed on points, curved ducts, the tour' },
];
const FALLBACK_PACKAGES = ['modifier-core', 'keyframe', 'render-budget-core'];
function classify(about) {
    const hit = KINDS.find((k) => k.re.test(about));
    return hit ? { kind: hit.kind, family: hit.family, packages: hit.packages, why: hit.why } : { kind: 'custom', family: 'other', packages: FALLBACK_PACKAGES, why: 'a generic set: modifiers, the tour timeline, an adaptive quality tier' };
}
/** Pull the numbers and names a person already stated in the description; anything missing becomes an open question. */
function extractFacts(about) {
    let teeth = [];
    const before = about.match(/((?:\d{1,3}\s*(?:,|\/|&|and)\s*)+\d{1,3})\s*-?\s*(?:teeth|tooth|t\b)/i);
    const after = about.match(/teeth\s*(?:of|:|=)?\s*((?:\d{1,3}\s*(?:,|\/|&|and)\s*)+\d{1,3})/i);
    const list = before || after;
    if (list)
        teeth = [...list[1].matchAll(/\d{1,3}/g)].map((m) => Number(m[0]));
    else
        for (const m of about.matchAll(/(\d{1,3})\s*-?\s*(?:teeth|tooth|t\b)/gi))
            teeth.push(Number(m[1]));
    const num = (re) => { const m = about.match(re); return m ? Number(m[1]) : undefined; };
    const WORD = { one: 1, single: 1, two: 2, twin: 2, three: 3, four: 4, five: 5, six: 6, eight: 8, ten: 10, twelve: 12 };
    const vM = about.match(/\bv[- ]?(\d{1,2})\b/i);
    const inlM = about.match(/\b(?:inline|in-line|straight|flat)[- ]?(\d{1,2})\b/i) || about.match(/\bi(\d)\b/);
    const cylM = about.match(/\b(\d{1,2}|one|two|three|four|five|six|eight|ten|twelve)[- ]cylinders?\b/i);
    const cylN = vM ? Number(vM[1]) : inlM ? Number(inlM[1]) : cylM ? (WORD[cylM[1].toLowerCase()] ?? Number(cylM[1])) : undefined;
    const bankM = about.match(/(\d{2,3})\s*(?:°|deg(?:ree)?s?)/i);
    const partsM = about.match(/parts?\s*:\s*([^.;\n]+)/i);
    const modelM = about.match(/([\w./\\-]+\.(?:glb|gltf))/i);
    return {
        teeth,
        rpm: num(/(\d+(?:\.\d+)?)\s*rpm/i),
        torque: num(/(\d+(?:\.\d+)?)\s*n\s*[·.*-]?\s*m\b/i),
        module: num(/module\s*(?:of|=|:)?\s*(\d+(?:\.\d+)?)/i),
        stroke: num(/stroke\s*(?:of|=|:)?\s*(\d+(?:\.\d+)?)/i) ?? num(/(\d+(?:\.\d+)?)\s*mm\s*stroke/i),
        bore: num(/bore\s*(?:of|=|:)?\s*(\d+(?:\.\d+)?)/i) ?? num(/(\d+(?:\.\d+)?)\s*mm\s*bore/i),
        rod: num(/(?:con(?:necting)?\s*)?rod\s*(?:length)?\s*(?:of|=|:)?\s*(\d+(?:\.\d+)?)/i),
        cylinders: cylN && cylN >= 1 && cylN <= 12 ? cylN : undefined,
        vee: !!vM || /\bv[- ]?(?:engine|twin|shaped)\b/i.test(about),
        bank: bankM ? Number(bankM[1]) : undefined,
        parts: partsM ? partsM[1].split(/,|\band\b/).map((x) => x.trim()).filter(Boolean).slice(0, 40) : [],
        model: modelM ? modelM[1] : undefined,
    };
}
function draftSpec(about, name, model) {
    const f = extractFacts(about);
    // a supplied model is the geometry, so it decides the starter; the words only pick the family and the packages
    const c = { ...classify(about), ...((model || f.model) ? { kind: 'custom' } : {}) };
    const open = [];
    const base = { kind: c.kind, family: c.family, units: 'mm', reference: '', packages: c.packages.map((p) => '@triforge/' + p), generated_by: TOOL };
    const label = about.replace(/\s+/g, ' ').trim().slice(0, 60);
    const head = {
        title: label ? label.charAt(0).toUpperCase() + label.slice(1) : name,
        description: `An interactive 3D model of ${label || name} that you can take apart, with live readouts from the same math that moves the parts.`,
    };
    if (c.kind !== 'custom' && f.rpm === undefined)
        open.push('What is the input speed in rpm? (guessed 1200)');
    const input = { name: c.kind === 'gears' ? 'input shaft' : c.kind === 'crank' ? 'crankshaft' : 'input', rpm: f.rpm ?? 1200, torque_nm: f.torque ?? 10 };
    let spec;
    if (c.kind === 'gears') {
        let teeth = f.teeth.filter((n) => n >= 8 && n <= 200).slice(0, MAX_PARTS);
        if (teeth.length < 2) {
            open.push('How many gears, and how many teeth on each? (guessed 14, 28, 20)');
            teeth = [14, 28, 20];
        }
        if (f.torque === undefined)
            open.push('What is the input torque in N·m? (guessed 10)');
        if (f.module === undefined)
            open.push('What is the gear module in mm? (guessed 3)');
        spec = { ...head, ...base, module_mm: f.module ?? 3, width_mm: 20, input, parts: teeth.map((t, i) => ({ id: 'g' + (i + 1), label: i === 0 ? 'Input gear' : i === teeth.length - 1 ? 'Output gear' : `Gear ${i + 1}`, teeth: t })) };
    }
    else if (c.kind === 'crank') {
        if (f.stroke === undefined)
            open.push('What is the stroke in mm? (guessed 80)');
        if (f.bore === undefined)
            open.push('What is the bore in mm? (guessed 80)');
        if (f.rod === undefined)
            open.push('What is the connecting-rod length in mm, centre to centre? (guessed 2 x stroke + 20)');
        const stroke = f.stroke ?? 80;
        const cyl = f.cylinders ?? (f.vee ? 2 : 1);
        const bore = f.bore ?? 80;
        const bank = f.vee && cyl > 1 ? f.bank ?? (cyl === 8 ? 90 : 60) : 0;
        if (f.cylinders === undefined && !f.vee)
            open.push('How many cylinders, and inline or V? Say "V8", "inline 4" or "6 cylinders". (guessed one cylinder)');
        if (cyl > 1 && cyl !== 8 && f.vee)
            open.push(`Crank throw angles for the V${cyl} are spread evenly; set "crank_phases_deg" (one number per throw) if the real shaft differs.`);
        spec = { ...head, ...base, cylinders: cyl, bank_angle_deg: bank, cylinder_spacing_mm: Math.round(bore * 1.3), crank_radius_mm: stroke / 2, rod_length_mm: f.rod ?? 2 * stroke + 20, bore_mm: bore, input, parts: cyl === 1 ? [{ id: 'crank', label: 'Crankshaft' }, { id: 'rod', label: 'Connecting rod' }, { id: 'piston', label: 'Piston' }, { id: 'cylinder', label: 'Cylinder' }] : [{ id: 'crank', label: 'Crankshaft' }, ...Array.from({ length: cyl }, (_, i) => ({ id: 'cyl' + (i + 1), label: `Cylinder ${i + 1}` }))] };
    }
    else {
        const mdl = model || f.model;
        if (mdl)
            open.push(`Model ${mdl}: parts are its top-level nodes. List part names in "parts" (id = the node's name) to choose and label them.`);
        else
            open.push('Give the machine as a .glb or .gltf file ("model"), or list its parts in "parts" and replace the placeholder blocks in machine.js with real geometry built from the reference.');
        if (!mdl && !f.parts.length)
            open.push('What are the parts? (guessed Part 1, Part 2, Part 3)');
        open.push('Real dimensions and the one input that drives it (angle, stroke or speed) go in kin.js. Without them the page shows the model and its parts but no readouts.');
        spec = { ...head, ...base, ...(mdl ? { model: mdl } : {}), input, parts: f.parts.map((n, i) => ({ id: slug(n) || 'p' + (i + 1), label: n.charAt(0).toUpperCase() + n.slice(1) })) };
    }
    open.push('Is there a reference: a photo, a cutaway drawing from a manual, a clip? Put its path in "reference". Without one the machine comes out generic.');
    return { spec, open };
}
// ---------- spec checks ----------
function validateSpec(s) {
    const f = [];
    const e = (msg) => f.push({ level: 'error', file: 'spec.json', msg });
    if (!s || typeof s !== 'object')
        return [{ level: 'error', file: 'spec.json', msg: 'spec is not an object' }];
    if (!s.title)
        e('title is missing (it names the page)');
    if (!s.description)
        e('description is missing (one sentence of what the page shows)');
    if (!STARTER_KINDS.includes(s.kind))
        e(`kind must be one of ${STARTER_KINDS.join(', ')}`);
    if (s.kind !== 'custom' && (!s.input || !(s.input.rpm > 0)))
        e('input.rpm must be a number above 0');
    const parts = Array.isArray(s.parts) ? s.parts : [];
    const ids = new Set();
    for (const p of parts) {
        if (!p.id || !p.label)
            e('every part needs id and label');
        if (ids.has(p.id))
            e(`duplicate part id "${p.id}"`);
        ids.add(p.id);
    }
    if (s.kind === 'gears') {
        if (!(s.input && s.input.torque_nm > 0))
            e('input.torque_nm must be a number above 0');
        if (!(s.module_mm > 0))
            e('module_mm must be above 0');
        if (!(s.width_mm > 0))
            e('width_mm must be above 0');
        if (parts.length < 2)
            e('a gear train needs at least 2 parts');
        if (parts.length > MAX_PARTS)
            e(`${parts.length} parts; the limit is ${MAX_PARTS}`);
        for (const p of parts)
            if (!Number.isInteger(p.teeth) || p.teeth < 8)
                e(`part "${p.id}": teeth must be a whole number of 8 or more`);
    }
    else if (s.kind === 'crank') {
        for (const k of ['crank_radius_mm', 'rod_length_mm', 'bore_mm'])
            if (!(s[k] > 0))
                e(`${k} must be above 0`);
        if (s.crank_radius_mm > 0 && s.rod_length_mm > 0 && s.rod_length_mm <= s.crank_radius_mm)
            e('rod_length_mm must be longer than crank_radius_mm, or the mechanism cannot turn');
        const cyl = s.cylinders === undefined ? 1 : s.cylinders;
        if (!Number.isInteger(cyl) || cyl < 1 || cyl > 12)
            e('cylinders must be a whole number from 1 to 12');
        if (s.bank_angle_deg !== undefined && !(s.bank_angle_deg >= 0 && s.bank_angle_deg < 180))
            e('bank_angle_deg must be 0 (inline) or an angle below 180');
        if (s.bank_angle_deg > 0 && cyl < 2)
            e('a V needs at least 2 cylinders');
        if (s.cylinder_spacing_mm !== undefined && s.bore_mm > 0 && s.cylinder_spacing_mm < s.bore_mm * 1.05)
            f.push({ level: 'warning', file: 'spec.json', msg: 'cylinder_spacing_mm under 1.05 x the bore: neighbouring cylinders will touch' });
        if (Array.isArray(s.crank_phases_deg)) {
            const throws = s.bank_angle_deg > 0 && cyl > 1 ? Math.ceil(cyl / 2) : cyl;
            if (s.crank_phases_deg.length !== throws)
                e(`crank_phases_deg needs ${throws} numbers, one per crank throw`);
        }
        if (s.crank_radius_mm > 0 && s.rod_length_mm > 0 && s.rod_length_mm <= s.crank_radius_mm) { /* reported above */ }
        else if (s.crank_radius_mm > 0 && s.rod_length_mm > 0 && s.rod_length_mm < 1.5 * s.crank_radius_mm)
            f.push({ level: 'warning', file: 'spec.json', msg: 'a rod under 1.5 x the crank radius is unusual; check the dimensions' });
    }
    else if (s.kind === 'custom') {
        if (!s.model && !parts.length)
            f.push({ level: 'warning', file: 'spec.json', msg: 'no model and no parts: the page shows three placeholder blocks' });
        if (s.model && !/\.(glb|gltf)$/i.test(s.model))
            e('model must be a .glb or .gltf file');
        if (parts.length > 40)
            e(`${parts.length} parts; the limit is 40`);
    }
    if (!s.reference)
        f.push({ level: 'warning', file: 'spec.json', msg: 'no reference. A machine built from a sentence comes out generic; add a photo or drawing path' });
    return f;
}
// ---------- source lint ----------
function listFiles(dir, skip = ['dist', 'node_modules', 'vendor']) {
    const res = [];
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
        if (skip.includes(d.name))
            continue;
        const p = path.join(dir, d.name);
        if (d.isDirectory())
            res.push(...listFiles(p, skip));
        else
            res.push(p);
    }
    return res;
}
const PURE = new Set(['kin.js', 'machine.js', 'film.js']);
const RAW_NOTES = [
    [/new\s+THREE\.TubeGeometry|new\s+TubeGeometry/, 'a tube along a curve: @triforge/curve-core (CurveTube) builds it with a parameters object you can animate'],
    [/new\s+THREE\.InstancedMesh|new\s+InstancedMesh/, 'many copies of one part: @triforge/modifier-core ArrayModifier or @triforge/geometry-nodes InstanceOnPoints'],
];
function lintSource(file, text) {
    const f = [];
    const base = path.basename(file);
    const lines = text.split(/\r?\n/);
    lines.forEach((ln, i) => {
        const code = ln.replace(/(^|[^:])\/\/.*$/, '$1');
        const at = (level, msg) => f.push({ level, file: base, line: i + 1, msg });
        if (PURE.has(base) && /Math\.random\s*\(|Date\.now\s*\(|new\s+Date\s*\(|performance\.now\s*\(/.test(code))
            at('error', 'render must be a pure function of time: no Math.random, Date or performance.now here (the sheet calls it at any t and frames must repeat)');
        if (/https?:\/\/[^'"\s]*(cdn|unpkg|jsdelivr|googleapis|cdnjs)/i.test(code))
            at('error', 'a CDN link. Libraries are copied into dist/vendor so the page works offline');
        for (const m of code.matchAll(/smoothstep\(\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*,/g))
            if (Number(m[1]) > Number(m[2]))
                at('warning', 'smoothstep with edge0 above edge1 returns 0 on Windows (ANGLE/D3D). Write 1.0 - smoothstep(b, a, x)');
        for (const m of code.matchAll(/\bpow\(\s*([^,()]+(?:\([^)]*\))?[^,()]*),/g))
            if (!/^\s*(max|abs|clamp|saturate)\b|^\s*[0-9.]+\s*$/.test(m[1]))
                at('warning', 'pow() with an unclamped base. One NaN pixel blacks out the frame through bloom; wrap the base in max(x, 0.0)');
    });
    if (/ShadowMaterial/.test(text) && !/polygonOffset/.test(text))
        f.push({ level: 'warning', file: base, msg: 'ShadowMaterial without polygonOffset loses the depth test inside a post-processing target' });
    if (/GTAOPass/.test(text) && /clippingPlanes/.test(text) && !/normalMaterial\.clippingPlanes/.test(text))
        f.push({ level: 'warning', file: base, msg: 'GTAO on a clipped model needs the same clipping planes on gtao.normalMaterial, or the cut half returns as a pale ghost' });
    for (const [re, tip] of RAW_NOTES)
        if (re.test(text))
            f.push({ level: 'note', file: base, msg: 'triforge: ' + tip });
    if (/\.html$/.test(base) && !/<title>[^<]+<\/title>/.test(text))
        f.push({ level: 'error', file: base, msg: 'the page needs a <title>' });
    return f;
}
function checkDir(dir) {
    const f = [];
    const specFile = path.join(dir, 'spec.json');
    if (!fs.existsSync(specFile))
        return [{ level: 'error', msg: `${specFile} not found. Run init first.` }];
    let spec;
    try {
        spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
    }
    catch (e) {
        return [{ level: 'error', file: 'spec.json', msg: 'not valid JSON: ' + e.message }];
    }
    f.push(...validateSpec(spec));
    for (const file of listFiles(dir).filter((p) => /\.(js|html)$/.test(p)))
        f.push(...lintSource(file, fs.readFileSync(file, 'utf8')));
    for (const need of ['kin.js', 'machine.js', 'film.js', 'main.js', 'index.html'])
        if (!fs.existsSync(path.join(dir, need)))
            f.push({ level: 'error', file: need, msg: 'is missing. Run init --force to restore it' });
    const mach = path.join(dir, 'machine.js');
    if (spec.kind === 'custom' && !spec.model && fs.existsSync(mach) && /TEARDOWN-PLACEHOLDER/.test(fs.readFileSync(mach, 'utf8')))
        f.push({ level: 'warning', file: 'machine.js', msg: 'still the placeholder blocks. Build the real geometry from the reference, or set "model" to a .glb, then delete the marker line' });
    if (spec.model && !fs.existsSync(path.join(dir, spec.model)))
        f.push({ level: 'error', file: 'spec.json', msg: `model "${spec.model}" is not in the machine folder. Run init, or copy the file next to spec.json` });
    const dist = path.join(dir, 'dist', 'index.html');
    if (fs.existsSync(dist)) {
        const size = fs.statSync(dist).size;
        if (size > 1_000_000)
            f.push({ level: 'warning', file: 'dist/index.html', msg: `${(size / 1e6).toFixed(1)} MB. Link crawlers give up on a page over about 1 MB; move big models into files next to it` });
    }
    return f;
}
// ---------- scaffold ----------
function templateDir() {
    for (const p of [path.join(__dirname, 'teardown.template'), path.join(__dirname, 'template')])
        if (fs.existsSync(p))
            return p;
    throw new Error('starter template folder not found next to this script');
}
const paramsJs = (spec) => `// Written by teardown init from spec.json. Edit spec.json and run init --force to refresh; do not edit by hand.\nexport const SPEC = ${JSON.stringify(spec, null, 2)};\n`;
function scaffold(dest, spec, force, dry) {
    const src = templateDir();
    const written = [], skipped = [];
    const put = (name, body) => {
        const p = path.join(dest, name);
        if (fs.existsSync(p) && !force) {
            skipped.push(name);
            return;
        }
        if (!dry) {
            fs.mkdirSync(path.dirname(p), { recursive: true });
            fs.writeFileSync(p, body);
        }
        written.push(name);
    };
    for (const folder of ['shell', spec.kind]) {
        const dir = path.join(src, folder);
        if (!fs.existsSync(dir))
            throw new Error(`starter "${folder}" not found in ${src}`);
        for (const name of listFiles(dir, []).map((p) => path.relative(dir, p))) {
            let body = fs.readFileSync(path.join(dir, name), 'utf8');
            if (name === 'index.html')
                body = body.replace(/__TITLE__/g, esc(spec.title)).replace(/__DESCRIPTION__/g, esc(spec.description));
            put(name, body);
        }
    }
    put('params.js', paramsJs(spec));
    put('spec.json', JSON.stringify(spec, null, 2) + '\n');
    return { written, skipped };
}
function findPkg(root, name) {
    for (let d = path.resolve(root);; d = path.dirname(d)) {
        const p = path.join(d, 'node_modules', ...name.split('/'));
        if (fs.existsSync(path.join(p, 'package.json')))
            return { dir: p, name, json: JSON.parse(fs.readFileSync(path.join(p, 'package.json'), 'utf8')) };
        if (path.dirname(d) === d)
            return null;
    }
}
function pickExport(v) {
    if (typeof v === 'string')
        return v;
    if (v && typeof v === 'object')
        for (const k of ['import', 'module', 'browser', 'default']) {
            const r = pickExport(v[k]);
            if (r)
                return r;
        }
    return null;
}
function entryFile(pkg, sub) {
    const ex = pkg.json.exports;
    const key = sub ? './' + sub : '.';
    if (ex && typeof ex === 'object' && !Array.isArray(ex)) {
        const direct = key in ex ? ex[key] : ('.' in ex || !Object.keys(ex).some((k) => k.startsWith('.')) ? (sub ? undefined : ex) : undefined);
        const r = pickExport(direct);
        if (r)
            return path.join(pkg.dir, r);
        for (const k of Object.keys(ex))
            if (k.endsWith('/*') && key.startsWith(k.slice(0, -1))) {
                const t = pickExport(ex[k]);
                if (t)
                    return path.join(pkg.dir, t.replace('*', key.slice(k.length - 1)));
            }
        if (sub)
            return null;
    }
    else if (typeof ex === 'string' && !sub)
        return path.join(pkg.dir, ex);
    if (!sub)
        return path.join(pkg.dir, pkg.json.module || pkg.json.main || 'index.js');
    const guess = path.join(pkg.dir, sub);
    return fs.existsSync(guess) ? guess : fs.existsSync(guess + '.js') ? guess + '.js' : null;
}
const IMPORT_RE = /(?:import|export)\s+(?:[^'"()]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
const specifiersOf = (text) => [...text.matchAll(IMPORT_RE)].map((m) => m[1] || m[2]);
const isBare = (s) => !/^(\.|\/|https?:|data:)/.test(s);
function splitBare(s) {
    const parts = s.split('/');
    const n = s.startsWith('@') ? 2 : 1;
    return [parts.slice(0, n).join('/'), parts.slice(n).join('/')];
}
function buildDist(dir, root, dry) {
    const dist = path.join(dir, 'dist');
    const problems = [];
    const map = {};
    const copy = new Map();
    const seen = new Set();
    const queue = [];
    const app = listFiles(dir).filter((p) => /\.(js|json|html|glb|gltf|bin|png|jpe?g|webp)$/i.test(p) && path.basename(p) !== 'spec.json');
    const walk = (file, owner) => {
        if (seen.has(file))
            return;
        seen.add(file);
        if (!fs.existsSync(file)) {
            problems.push('missing file ' + file);
            return;
        }
        const text = fs.readFileSync(file, 'utf8');
        for (const s of specifiersOf(text)) {
            if (isBare(s)) {
                if (map[s])
                    continue;
                const [name, sub] = splitBare(s);
                const pkg = findPkg(root, name);
                if (!pkg) {
                    problems.push(`"${s}" is imported but ${name} is not installed. Run: npm install ${name}`);
                    continue;
                }
                // three's addons live under examples/jsm and are imported as three/addons/...
                const target = name === 'three' && sub.startsWith('addons/') ? path.join(pkg.dir, 'examples', 'jsm', sub.slice(7)) : entryFile(pkg, sub);
                if (!target || !fs.existsSync(target)) {
                    problems.push(`cannot resolve "${s}" inside ${name}`);
                    continue;
                }
                const vend = 'vendor/' + name + '/' + rel(pkg.dir, target);
                map[s] = './' + vend;
                copy.set(target, vend);
                walk(target, pkg);
            }
            else if (owner && s.startsWith('.')) {
                const t = path.resolve(path.dirname(file), s);
                const resolved = fs.existsSync(t) && fs.statSync(t).isFile() ? t : fs.existsSync(t + '.js') ? t + '.js' : t;
                copy.set(resolved, 'vendor/' + owner.name + '/' + rel(owner.dir, resolved));
                walk(resolved, owner);
            }
        }
    };
    for (const f of app)
        if (/\.js$/.test(f))
            walk(f, null);
    const files = [];
    for (const f of app)
        files.push([f, rel(dir, f)]);
    for (const [src, to] of copy)
        files.push([src, to]);
    let bytes = 0;
    if (!dry && !problems.length) {
        fs.rmSync(dist, { recursive: true, force: true });
        for (const [src, to] of files) {
            const dst = path.join(dist, to);
            fs.mkdirSync(path.dirname(dst), { recursive: true });
            if (to === 'index.html') {
                const tag = `<script type="importmap">\n${JSON.stringify({ imports: map }, null, 2)}\n</script>`;
                fs.writeFileSync(dst, fs.readFileSync(src, 'utf8').replace('__IMPORTMAP__', tag));
            }
            else
                fs.copyFileSync(src, dst);
            bytes += fs.statSync(dst).size;
        }
    }
    else
        for (const [src] of files)
            bytes += fs.statSync(src).size;
    return { dist, files: files.length, bytes, map, problems };
}
// ---------- headless browser ----------
function findChrome() {
    const env = process.env.CHROME || process.env.CHROME_PATH;
    if (env && fs.existsSync(env))
        return env;
    const pf = [process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'], process.env['LOCALAPPDATA']].filter(Boolean);
    const cands = [
        ...pf.flatMap((b) => [path.join(b, 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(b, 'Microsoft', 'Edge', 'Application', 'msedge.exe')]),
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium',
    ];
    return cands.find((c) => fs.existsSync(c)) || null;
}
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream' };
function serve(root, extra) {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            const url = decodeURIComponent((req.url || '/').split('?')[0]);
            if (url === '/favicon.ico') {
                res.writeHead(204);
                res.end();
                return;
            }
            if (extra[url]) {
                res.writeHead(200, { 'content-type': 'text/html' });
                res.end(extra[url]);
                return;
            }
            const p = path.join(root, url === '/' ? 'index.html' : url);
            if (!p.startsWith(root) || !fs.existsSync(p) || !fs.statSync(p).isFile()) {
                res.writeHead(404);
                res.end('not found');
                return;
            }
            res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
            fs.createReadStream(p).pipe(res);
        });
        srv.listen(0, '127.0.0.1', () => resolve({ port: srv.address().port, close: () => srv.close() }));
    });
}
class Cdp {
    ws;
    id = 0;
    waits = new Map();
    listeners = [];
    constructor(ws) {
        this.ws = ws;
        ws.addEventListener('message', (ev) => {
            const m = JSON.parse(String(ev.data));
            if (m.id && this.waits.has(m.id)) {
                this.waits.get(m.id)(m);
                this.waits.delete(m.id);
            }
            else if (m.method)
                this.listeners.forEach((l) => l(m.method, m.params));
        });
    }
    on(l) { this.listeners.push(l); }
    send(method, params = {}) {
        const id = ++this.id;
        return new Promise((res, rej) => {
            const t = setTimeout(() => rej(new Error(`browser did not answer ${method}`)), 60000);
            this.waits.set(id, (m) => { clearTimeout(t); m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result); });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }
    close() { try {
        this.ws.close();
    }
    catch { /* already closed */ } }
}
exports.Cdp = Cdp;
/** Build the page, serve it, open it in headless Chrome and hand a live page to fn. Cleans everything up after. */
async function withPage(dir, root, opts, fn) {
    const chrome = findChrome();
    if (!chrome)
        throw Object.assign(new Error('no Chrome or Edge found. Install Chrome, or set CHROME to the browser file.'), { code: 3 });
    const built = buildDist(dir, root, false);
    if (built.problems.length)
        throw Object.assign(new Error(built.problems.join('; ')), { code: 3 });
    const port = await freePort();
    const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'teardown-chrome-'));
    const server = await serve(path.join(dir, 'dist'), {});
    const child = cp.spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
    const errors = [];
    let cdp = null;
    try {
        let wsUrl = '';
        for (let i = 0; i < 80 && !wsUrl; i++) {
            await sleep(250);
            try {
                const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
                wsUrl = (list.find((x) => x.type === 'page') || {}).webSocketDebuggerUrl || '';
            }
            catch { /* not up yet */ }
        }
        if (!wsUrl)
            throw new Error('the browser did not start');
        const WS = globalThis.WebSocket;
        if (!WS)
            throw Object.assign(new Error('this Node has no WebSocket. Use Node 22 or newer.'), { code: 3 });
        const ws = new WS(wsUrl);
        await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', () => rej(new Error('cannot reach the browser'))); });
        cdp = new Cdp(ws);
        cdp.on((m, p) => {
            if (m === 'Runtime.exceptionThrown')
                errors.push((p.exceptionDetails.exception && p.exceptionDetails.exception.description) || p.exceptionDetails.text);
            else if (m === 'Runtime.consoleAPICalled' && p.type === 'error')
                errors.push(p.args.map((a) => a.value ?? a.description ?? '').join(' '));
            else if (m === 'Log.entryAdded' && p.entry.level === 'error')
                errors.push(p.entry.text + (p.entry.url ? ' ' + p.entry.url : ''));
        });
        await cdp.send('Runtime.enable');
        await cdp.send('Log.enable');
        await cdp.send('Page.enable');
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: opts.w, height: opts.h, deviceScaleFactor: 1, mobile: false });
        await cdp.send('Page.navigate', { url: `http://127.0.0.1:${server.port}/index.html${opts.query}` });
        const c = cdp;
        const ev = async (expr, wait = false) => { const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: wait }); return r.result.value; };
        let ready = false;
        for (let i = 0; i < 120 && !ready; i++) {
            await sleep(250);
            ready = !!(await ev('!!(window.SIM && window.SIM.ready)'));
            if (errors.length)
                break;
        }
        if (!ready)
            throw new Error('the page never became ready' + (errors.length ? ': ' + errors[0] : ''));
        return await fn({ cdp: c, errors, port: server.port, ev });
    }
    finally {
        cdp?.close();
        server.close();
        if (process.platform === 'win32' && child.pid)
            cp.execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => undefined);
        else
            child.kill();
        setTimeout(() => { try {
            fs.rmSync(prof, { recursive: true, force: true });
        }
        catch { /* browser still releasing the folder */ } }, 1500).unref();
    }
}
async function renderSheet(dir, root, opts) {
    const outDir = path.join(root, 'teardown-out', path.basename(dir));
    fs.mkdirSync(outDir, { recursive: true });
    return withPage(dir, root, { w: opts.w, h: opts.h, query: '?capture' }, async ({ cdp, errors, ev }) => {
        const gpu = (await ev('window.SIM.renderer()')) || 'unknown';
        // the page owns the tour, so the beats come from it: one source, and the same list is written for any recorder
        const tl = (await ev('({beats: window.SIM.beats, duration: window.SIM.duration})'));
        fs.writeFileSync(path.join(outDir, 'timeline.json'), JSON.stringify(tl, null, 2) + '\n');
        const beats = opts.at ? opts.at.map((t) => ({ t, name: 't=' + t })) : tl.beats;
        const tiles = [];
        for (const b of beats) {
            const cov = await ev(`window.SIM.render(${b.t} + 0.3), window.SIM.coverage()`);
            const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
            const file = path.join(outDir, `t-${String(b.t).replace('.', '_')}.png`);
            fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
            tiles.push({ t: b.t, name: b.name, file, coverage: Number(cov) || 0 });
        }
        const cols = Math.min(3, tiles.length), tw = 480, th = Math.round((tw * opts.h) / opts.w), rows = Math.ceil(tiles.length / cols);
        const html = `<!doctype html><meta charset="utf-8"><title>sheet</title><body style="margin:0;background:#20242b;font:13px system-ui;color:#e8ebef"><div style="display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:6px;padding:6px">${tiles.map((t) => `<figure style="margin:0"><img width="${tw}" height="${th}" src="data:image/png;base64,${fs.readFileSync(t.file).toString('base64')}"><figcaption style="padding:2px 4px">t=${t.t} · ${esc(t.name)}</figcaption></figure>`).join('')}</div>`;
        const sheetSrv = await serve(path.join(dir, 'dist'), { '/__sheet': html });
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: cols * (tw + 6) + 6, height: rows * (th + 30) + 6, deviceScaleFactor: 1, mobile: false });
        await cdp.send('Page.navigate', { url: `http://127.0.0.1:${sheetSrv.port}/__sheet` });
        await sleep(500);
        const sh = await cdp.send('Page.captureScreenshot', { format: 'png' });
        sheetSrv.close();
        const sheet = path.join(outDir, 'sheet.png');
        fs.writeFileSync(sheet, Buffer.from(sh.data, 'base64'));
        return { dir: outDir, sheet, tiles, errors: [...new Set(errors)], gpu };
    });
}
/** Drive the live page like a visitor: drag, wheel, click a part, move the cut, toggle glass, wait for the tour to return. */
async function probePage(dir, root, opts) {
    return withPage(dir, root, { w: opts.w, h: opts.h, query: '?idle=700' }, async ({ cdp, errors, ev }) => {
        const checks = [];
        const check = (name, ok, detail = '') => checks.push({ name, ok, detail });
        const st = () => ev('window.SIM.state()');
        const mouse = (type, x, y, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
        const click = async (sel) => {
            const r = await ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
            if (!r)
                return false;
            await mouse('mouseMoved', r[0], r[1], { button: 'none' });
            await mouse('mousePressed', r[0], r[1]);
            await mouse('mouseReleased', r[0], r[1]);
            return true;
        };
        const gpu = (await ev('window.SIM.renderer()')) || 'unknown';
        const fps = Number(await ev('new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); })', true)) || 0;
        check('draws frames', fps > 0, `${fps.toFixed(1)} fps`);
        const s0 = await st();
        check('starts as a tour', s0.manual === false);
        const cx = opts.w * 0.65, cy = opts.h * 0.5;
        await mouse('mouseMoved', cx, cy, { button: 'none' });
        await mouse('mousePressed', cx, cy);
        await mouse('mouseMoved', cx + 120, cy + 30, { buttons: 1 });
        await mouse('mouseReleased', cx + 120, cy + 30);
        const s1 = await st();
        check('a drag hands control over and turns the view', s1.manual === true && Math.abs(s1.azimuth - s0.azimuth) > 5, `azimuth ${s0.azimuth.toFixed(0)} to ${s1.azimuth.toFixed(0)}`);
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: 300 });
        const s2 = await st();
        check('the wheel zooms', s2.radius > s1.radius, `radius ${s1.radius.toFixed(1)} to ${s2.radius.toFixed(1)}`);
        const clicked = await click('[data-focus="1"]');
        const s3 = await st();
        check('a part button isolates that part', clicked && s3.focus === 1, `focus ${s3.focus}`);
        await ev(`(() => { const e = document.getElementById('cut'); e.value = '0.6'; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        const s4 = await st();
        check('the cut slider moves the cut', Math.abs(s4.cut - 0.6) < 0.01, `cut ${s4.cut}`);
        await click('#glass');
        check('glass mode toggles', (await st()).glass === true);
        // the quiet time is 0.7 s here, but a software renderer draws about one frame a second, so wait for it
        let waited = 0;
        while (waited < 12000 && (await st()).manual) {
            await sleep(500);
            waited += 500;
        }
        check('the tour takes over again after the quiet time', !(await st()).manual, `after ${(waited / 1000).toFixed(1)} s`);
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', text: 'a' });
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA' });
        check('a key press hands control over', (await st()).manual === true);
        await click('#tour');
        check('the Tour button hands control back', (await st()).manual === false);
        return { gpu, fps, checks, errors: [...new Set(errors)] };
    });
}
/** Model files anywhere in the project (a few levels deep): the objects a machine page can be built from. */
function findModels(root, depth = 4, max = 20) {
    const skip = new Set(['node_modules', 'dist', 'vendor', 'teardown-out', '.git', '.claude', 'venv', '__pycache__']);
    const hits = [];
    const walk = (d, n) => {
        if (hits.length >= max)
            return;
        let ents = [];
        try {
            ents = fs.readdirSync(d, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const e of ents) {
            if (hits.length >= max)
                return;
            const p = path.join(d, e.name);
            if (e.isDirectory()) {
                if (n > 0 && !skip.has(e.name))
                    walk(p, n - 1);
            }
            else if (/\.(glb|gltf)$/i.test(e.name))
                hits.push(rel(root, p));
        }
    };
    walk(root, depth);
    return hits;
}
function detectProject(root) {
    const pj = path.join(root, 'package.json');
    const triforge = {};
    let declared = [];
    if (fs.existsSync(pj)) {
        try {
            const j = JSON.parse(fs.readFileSync(pj, 'utf8'));
            declared = Object.keys({ ...(j.dependencies || {}), ...(j.devDependencies || {}) });
        }
        catch { /* unreadable package.json */ }
    }
    const scope = path.join(root, 'node_modules', '@triforge');
    if (fs.existsSync(scope))
        for (const d of fs.readdirSync(scope)) {
            try {
                triforge['@triforge/' + d] = JSON.parse(fs.readFileSync(path.join(scope, d, 'package.json'), 'utf8')).version;
            }
            catch { /* partial install */ }
        }
    for (const d of declared)
        if (d.startsWith('@triforge/') && !triforge[d])
            triforge[d] = 'declared, not installed';
    const three = findPkg(root, 'three');
    const tdir = path.join(root, 'teardown');
    const machines = fs.existsSync(tdir) ? fs.readdirSync(tdir, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(tdir, d.name, 'spec.json'))).map((d) => d.name) : [];
    const references = [];
    for (const sub of ['reference', 'references', 'refs', 'manuals', 'project-context', 'docs']) {
        const d = path.join(root, sub);
        if (fs.existsSync(d) && fs.statSync(d).isDirectory())
            for (const p of listFiles(d).filter((x) => /\.(png|jpe?g|webp|pdf|mp4|mov)$/i.test(x)).slice(0, 12))
                references.push(rel(root, p));
    }
    const major = Number(process.versions.node.split('.')[0]);
    return { root, node: { version: process.versions.node, ok: major >= 22 }, three: three ? three.json.version : null, triforge, chrome: findChrome(), machines, references, models: findModels(root), packageJson: fs.existsSync(pj) };
}
// ---------- command line ----------
const BOOL = new Set(['json', 'dry-run', 'force']);
function parseArgs(argv) {
    const pos = [], f = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const k = a.slice(2);
            if (BOOL.has(k))
                f[k] = true;
            else {
                if (i + 1 >= argv.length)
                    throw new Error(`--${k} needs a value`);
                f[k] = argv[++i];
            }
        }
        else
            pos.push(a);
    }
    return { cmd: pos[0] || '', pos: pos.slice(1), f };
}
const USAGE = 'usage: teardown <detect|init|check|build|sheet|probe> ...  (detect [--about "a gearbox..."] [--model file.glb], init <name>, check <dir>, build <dir>, sheet <dir>, probe <dir>)';
const printFindings = (fs_) => fs_.forEach((x) => warn(`${x.level}: ${x.file ? x.file + (x.line ? ':' + x.line : '') + ' ' : ''}${x.msg}`));
async function main() {
    let a;
    try {
        a = parseArgs(process.argv.slice(2));
    }
    catch (e) {
        fail(e.message + '\n' + USAGE, 2);
        return;
    }
    const { cmd, pos, f } = a;
    const json = !!f.json, dry = !!f['dry-run'], force = !!f.force;
    const root = path.resolve(typeof f.root === 'string' ? f.root : process.cwd());
    const say = (s) => { if (!json)
        out(s); };
    if (cmd === 'detect') {
        const d = detectProject(root);
        let drafted = null;
        const about = typeof f.about === 'string' ? f.about : '';
        if (about) {
            const name = slug(typeof f.name === 'string' ? f.name : about.split(/\s+/).slice(0, 4).join(' ')) || 'machine';
            const dr = draftSpec(about, name, typeof f.model === 'string' ? f.model : undefined);
            const file = path.join(root, 'teardown', name, 'spec.json');
            if (fs.existsSync(file) && !force) {
                warn(`notice: ${rel(root, file)} exists; not replaced (use --force)`);
                drafted = { ...dr, file: undefined };
            }
            else {
                if (!dry) {
                    fs.mkdirSync(path.dirname(file), { recursive: true });
                    fs.writeFileSync(file, JSON.stringify(dr.spec, null, 2) + '\n');
                }
                drafted = { ...dr, file };
            }
        }
        const need = drafted ? drafted.spec.packages.filter((p) => !d.triforge[p] || d.triforge[p].startsWith('declared')) : [];
        const install = [...(d.three ? [] : ['three']), ...need].join(' ');
        if (json) {
            out(JSON.stringify({ ok: true, ...d, spec: drafted ? { file: drafted.file ? rel(root, drafted.file) : null, kind: drafted.spec.kind, family: drafted.spec.family, packages: drafted.spec.packages, open: drafted.open } : null, install: install ? 'npm install ' + install : null }));
            return;
        }
        say(`Node ${d.node.version} ${d.node.ok ? 'ok' : '(too old: the sheet command needs 22 or newer)'}`);
        say(`three: ${d.three || 'not installed'}`);
        say(`Triforge: ${Object.keys(d.triforge).length ? Object.entries(d.triforge).map(([k, v]) => `${k}@${v}`).join(', ') : 'none installed'}`);
        say(`Browser for review sheets: ${d.chrome || 'not found (set CHROME to a Chrome or Edge file)'}`);
        say(`Machines here: ${d.machines.length ? d.machines.join(', ') : 'none'}`);
        say(`3D models here: ${d.models.length ? d.models.slice(0, 6).join(', ') + (d.models.length > 6 ? ', ...' : '') + '  (any of these can be the machine: --model <file>)' : 'none found'}`);
        say(`Reference files: ${d.references.length ? d.references.slice(0, 6).join(', ') + (d.references.length > 6 ? ', ...' : '') : 'none found'}`);
        if (drafted) {
            say(`\nMachine: ${drafted.spec.kind} starter (${drafted.spec.family}). Best-fit Triforge packages: ${drafted.spec.packages.join(', ')}.`);
            say(drafted.file ? `${dry ? 'would write' : 'wrote'} ${rel(root, drafted.file)}` : 'spec not written');
            say('Questions left open:\n' + drafted.open.map((q) => '  - ' + q).join('\n'));
            if (install)
                say(`\nInstall once: npm install ${install}`);
            say(`Next: answer the questions in spec.json, then: init ${path.basename(path.dirname(drafted.file || 'machine/x'))}`);
        }
        else
            say('\nTell detect what to build: detect --about "a 3-gear reducer, 12/36/18 teeth, 1200 rpm"');
        return;
    }
    if (cmd === 'init') {
        const name = slug(pos[0] || '');
        if (!name) {
            fail('init needs a machine name.\n' + USAGE, 2);
            return;
        }
        const dest = path.join(root, 'teardown', name);
        const specFile = path.join(dest, 'spec.json');
        if (!fs.existsSync(specFile)) {
            fail(`${rel(root, specFile)} not found. Run: detect --about "<what to build>" --name ${name}`, 1);
            return;
        }
        let spec;
        try {
            spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
        }
        catch (e) {
            fail('spec.json is not valid JSON: ' + e.message);
            return;
        }
        const errs = validateSpec(spec).filter((x) => x.level === 'error');
        if (errs.length) {
            printFindings(errs);
            fail('fix spec.json first');
            return;
        }
        if (spec.model && !fs.existsSync(path.join(dest, spec.model))) {
            const found = [path.join(root, spec.model), path.resolve(spec.model)].find((c) => fs.existsSync(c));
            if (!found) {
                fail(`model "${spec.model}" not found. Give its path from the project folder, or copy it into ${rel(root, dest)}.`);
                return;
            }
            const base = path.basename(found);
            if (!dry) {
                fs.mkdirSync(dest, { recursive: true });
                fs.copyFileSync(found, path.join(dest, base));
            }
            spec.model = base;
            if (!dry)
                fs.writeFileSync(specFile, JSON.stringify(spec, null, 2) + '\n');
            say(`${dry ? 'would copy' : 'copied'} the model into ${rel(root, dest)}/${base}`);
        }
        const r = scaffold(dest, spec, force, dry);
        if (json) {
            out(JSON.stringify({ ok: true, dryRun: dry, dir: rel(root, dest), ...r }));
            return;
        }
        say(`${dry ? 'would write' : 'wrote'} ${r.written.length} files in ${rel(root, dest)}${r.skipped.length ? `; kept ${r.skipped.length} that already exist (use --force)` : ''}`);
        say(`Next: node teardown.cli.js check ${rel(root, dest)}, then sheet ${rel(root, dest)}`);
        return;
    }
    if (cmd === 'check' || cmd === 'build' || cmd === 'sheet' || cmd === 'probe') {
        if (!pos[0]) {
            fail(`${cmd} needs a machine folder.\n` + USAGE, 2);
            return;
        }
        const dir = path.resolve(root, pos[0]);
        if (!fs.existsSync(dir)) {
            fail(`${dir} does not exist`);
            return;
        }
        if (cmd === 'check') {
            const fnd = checkDir(dir);
            const errs = fnd.filter((x) => x.level === 'error');
            if (json)
                out(JSON.stringify({ ok: !errs.length, findings: fnd }));
            else {
                printFindings(fnd);
                say(errs.length ? `${errs.length} error(s)` : 'ok');
            }
            if (errs.length)
                process.exitCode = 1;
            return;
        }
        if (cmd === 'build') {
            const b = buildDist(dir, root, dry);
            if (b.problems.length) {
                b.problems.forEach((p) => warn('error: ' + p));
                process.exitCode = 3;
                if (json)
                    out(JSON.stringify({ ok: false, problems: b.problems }));
                return;
            }
            if (json) {
                out(JSON.stringify({ ok: true, dryRun: dry, dist: rel(root, b.dist), files: b.files, bytes: b.bytes, imports: b.map }));
                return;
            }
            say(`${dry ? 'would copy' : 'wrote'} ${b.files} files (${(b.bytes / 1e6).toFixed(2)} MB) to ${rel(root, b.dist)}; serve that folder with any static server`);
            return;
        }
        if (cmd === 'probe') {
            try {
                const r = await probePage(dir, root, { w: 1280, h: 720 });
                const bad = r.checks.filter((c) => !c.ok);
                if (json)
                    out(JSON.stringify({ ok: !bad.length && !r.errors.length, gpu: r.gpu, fps: r.fps, checks: r.checks, errors: r.errors }));
                else {
                    say(`GPU: ${r.gpu}${/swiftshader|software|llvmpipe/i.test(r.gpu) ? ' (software renderer: the fps below says nothing about a real GPU)' : ''}`);
                    r.checks.forEach((c) => say(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.name}${c.detail ? ' (' + c.detail + ')' : ''}`));
                    r.errors.forEach((e) => warn('console error: ' + e));
                }
                if (bad.length || r.errors.length)
                    process.exitCode = 1;
            }
            catch (e) {
                fail(e.message, e.code === 3 ? 3 : 1);
            }
            return;
        }
        const size = typeof f.size === 'string' && /^\d+x\d+$/.test(f.size) ? f.size.split('x').map(Number) : [1280, 720];
        const at = typeof f.at === 'string' ? f.at.split(',').map(Number).filter((n) => Number.isFinite(n)) : undefined;
        try {
            const r = await renderSheet(dir, root, { at, w: size[0], h: size[1] });
            const empty = r.tiles.filter((t) => t.coverage < 0.02);
            if (json)
                out(JSON.stringify({ ok: !r.errors.length && !empty.length, gpu: r.gpu, sheet: rel(root, r.sheet), tiles: r.tiles.map((t) => ({ ...t, file: rel(root, t.file) })), errors: r.errors }));
            else {
                say(`GPU: ${r.gpu}${/swiftshader|software|llvmpipe/i.test(r.gpu) ? ' (software renderer: fine for a sheet, slow for motion)' : ''}`);
                r.tiles.forEach((t) => say(`  t=${t.t}  ${t.name.padEnd(12)} ${(t.coverage * 100).toFixed(0)}% filled  ${rel(root, t.file)}`));
                say(`Sheet: ${rel(root, r.sheet)}  (read it, then read single tiles to zoom)`);
                r.errors.forEach((e) => warn('console error: ' + e));
                empty.forEach((t) => warn(`warning: t=${t.t} looks empty (under 2% of pixels differ from the background)`));
            }
            if (r.errors.length || empty.length)
                process.exitCode = 1;
        }
        catch (e) {
            fail(e.message, e.code === 3 ? 3 : 1);
        }
        return;
    }
    fail(USAGE, 2);
}
if (require.main === module)
    main().catch((e) => fail(`teardown failed: ${e.message}`));
