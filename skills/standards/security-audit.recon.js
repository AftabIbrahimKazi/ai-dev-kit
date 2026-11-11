#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_FILES = void 0;
exports.listFiles = listFiles;
exports.recon = recon;
exports.render = render;
exports.summarize = summarize;
// Recon inventory for the security-audit skill (Phase 1 of a full audit). Lists the entry points, environment reads,
// outbound calls, secret-looking strings, dangerous sinks and obvious things, with file:line, so the hunt starts from
// a map instead of a tour. Counts and locations only: it names no finding, the model does. Reads files only; no network.
//
//   node recon.js [--cwd D] [--top N] [--json] [--summary]   (--summary: the grouped map /recon relays, under 20 lines)
//
// Secrets are masked (first 4 characters and the length). Skips node_modules, vendor, dist, build, .git and lockfiles.
// Exit codes: 0 done, 2 bad usage.
const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");
const SKIP = new Set(['node_modules', 'vendor', 'dist', 'build', '.git', 'coverage', '.next', '.astro', '.output', 'out']);
const SOURCE = /\.(js|jsx|mjs|cjs|ts|tsx|mts|php|py|rb|go|java|cs|astro|vue|svelte)$/i;
const CONFIG = /\.(json|ya?ml|toml|env|ini|xml)$|^\.env/i;
const MAX_BYTES = 1024 * 1024;
const norm = (p) => p.split(path.sep).join('/');
const mask = (v) => `${v.slice(0, 4)}… (${v.length} chars)`;
const ROUTE_RE = [
    /\b(?:app|router|server|fastify|api)\s*\.\s*(get|post|put|patch|delete|all|use|route)\s*\(\s*(['"`][^'"`]*['"`])/,
    /\bRoute::(get|post|put|patch|delete|any|match|resource)\s*\(\s*(['"][^'"]*['"])/,
    /@(?:app|router|bp)\.(route|get|post|put|delete|patch)\s*\(\s*(['"][^'"]*['"])/,
    /\bexport\s+(?:const|async function|function)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/,
    /\bhttp\.HandleFunc\s*\(\s*("[^"]*")/,
    /\[(?:Http(Get|Post|Put|Delete|Patch))(?:\(("[^"]*")\))?\]/,
];
const OUTBOUND_RE = /\b(fetch|axios(?:\.(?:get|post|put|delete|request))?|got|request|http\.request|https\.request|urllib|requests\.(?:get|post)|curl_exec|file_get_contents|Guzzle|HttpClient|net\/http|http\.Get|http\.Post)\s*\(/;
const ENV_RE = /process\.env\.([A-Z0-9_]+)|process\.env\[['"]([A-Z0-9_]+)['"]\]|import\.meta\.env\.([A-Z0-9_]+)|(?:getenv|os\.environ\.get|os\.getenv|env)\(\s*['"]([A-Z0-9_]+)['"]|os\.environ\[['"]([A-Z0-9_]+)['"]\]|\$_ENV\[['"]([A-Z0-9_]+)['"]\]/g;
const SECRET_RE = [
    ['AWS key', /\bAKIA[0-9A-Z]{16}\b/],
    ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
    ['Stripe key', /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}\b/],
    ['Slack token', /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/],
    ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
    ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
    ['credential assignment', /\b(?:api[_-]?key|secret|token|password|passwd|client_secret)\b\s*[:=]\s*['"][^'"\s]{12,}['"]/i],
];
const SINKS = [
    ['shell', /\b(?:exec|execSync|spawn|spawnSync|execFile|child_process|system|shell_exec|passthru|popen|subprocess\.(?:run|call|Popen)|os\.system)\s*\(/],
    ['sql-string', /(?:query|execute|raw)\s*\(\s*(?:`[^`]*\$\{|['"][^'"]*['"]\s*\+|f['"])/],
    ['eval', /\b(?:eval|new Function|vm\.run[A-Za-z]*|unserialize|pickle\.loads|yaml\.load)\s*\(/],
    ['html-sink', /\.innerHTML\s*=|dangerouslySetInnerHTML|\bset:html\b|\{@html\b|\bv-html\b|document\.write\s*\(|\|\s*safe\b|\{!!\s/],
    ['file-path', /\b(?:readFile|readFileSync|writeFile|writeFileSync|createReadStream|sendFile|res\.download|open|fopen|include|require_once|file_put_contents)\s*\([^)]*(?:req\.|params|query|body|\$_(?:GET|POST|REQUEST)|request\.)/],
    ['redirect', /\b(?:res\.redirect|redirect|header\s*\(\s*['"]Location|window\.location\s*=|location\.href\s*=)\s*[^;]*(?:req\.|params|query|body|\$_(?:GET|POST|REQUEST)|searchParams)/],
    ['deserialise', /\bJSON\.parse\s*\(\s*(?:req\.|body|localStorage|document\.cookie)/],
];
const AUTH_RE = /\b(?:authenticate|authorize|isAuthenticated|requireAuth|ensureLoggedIn|passport|jwt\.verify|verifyToken|checkPermission|can\(|policy|middleware\s*\(\s*['"]auth|@login_required|@permission_required|\[Authorize\]|Gate::|auth\(\)->)/;
const OBVIOUS = [
    ['todo-auth', /TODO.{0,30}\b(?:auth|permission|security|validate)/i],
    ['debug-flag', /\b(?:DEBUG\s*=\s*(?:true|1|True)|APP_DEBUG\s*=\s*true|debug\s*:\s*true)\b/],
    ['admin-route', /['"`]\/(?:admin|env|metrics|debug|internal|console|phpinfo)['"`]/],
    ['cors-any', /Access-Control-Allow-Origin['"]?\s*[:,]\s*['"]\*|cors\(\s*\)|origin\s*:\s*['"]\*['"]|origin\s*:\s*true/],
    ['disabled-tls', /rejectUnauthorized\s*:\s*false|verify\s*=\s*False|CURLOPT_SSL_VERIFYPEER\s*,\s*false|InsecureSkipVerify\s*:\s*true/],
    ['weak-random', /Math\.random\(\)[^;]{0,40}(?:token|secret|password|id|key)|\brandom\.random\(\)|\brand\(\)/i],
    ['seed-credential', /\b(?:admin|root|test)\s*['"]?\s*[,:]\s*['"](?:admin|password|123456|test|root)['"]/i],
];
// Folders that hold other people's code or caches; the plain walk (no git) never enters them.
const SKIP_WALK = new Set([...SKIP, 'venv', '.venv', 'env', '__pycache__', 'site-packages', 'target', 'bower_components', 'Pods', '.gradle', '.idea']);
exports.MAX_FILES = 20000;
function walk(dir, out = []) {
    let es;
    try {
        es = fs.readdirSync(dir, { withFileTypes: true });
    }
    catch {
        return out;
    }
    for (const e of es) {
        if (out.length >= exports.MAX_FILES)
            return out;
        if (SKIP_WALK.has(e.name) || (e.name.startsWith('.') && e.isDirectory()))
            continue; // dot-folders are tooling (.claude, .git, .next)
        const p = path.join(dir, e.name);
        if (e.isDirectory())
            walk(p, out);
        else
            out.push(p);
    }
    return out;
}
// In a git work tree the files git tracks or does not ignore are the project's own code: a gitignored sandbox, virtual
// environment or build cache is never scanned (a 30,000-file sandbox once made a scan take minutes). Outside git, or when
// git fails, the plain walk runs with the skip list and a file cap.
function listFiles(cwd) {
    try {
        const r = cp.spawnSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
        if (r.status === 0 && r.stdout) {
            const files = r.stdout.split('\0').filter(Boolean).filter((f) => !f.split('/').some((seg, i, a) => SKIP.has(seg) || (i < a.length - 1 && seg.startsWith('.')))).map((f) => path.join(cwd, f));
            return { files: files.slice(0, exports.MAX_FILES), source: 'git', capped: files.length > exports.MAX_FILES };
        }
    }
    catch { /* no git: walk */ }
    const files = walk(cwd);
    return { files, source: 'walk', capped: files.length >= exports.MAX_FILES };
}
function recon(cwd, top = 15) {
    const listed = listFiles(cwd);
    const all = listed.files;
    const rel = (f) => norm(path.relative(cwd, f));
    const r = { source: listed.source, capped: listed.capped, files: 0, stack: [], routes: [], fileRoutes: [], envReads: {}, outbound: [], secrets: [], sinks: {}, authMarkers: [], obvious: [], dataStores: [], entryBins: [], envFilesTracked: [] };
    const stack = new Set();
    const stores = new Set();
    const pkgPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            const deps = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) });
            for (const d of ['express', 'fastify', 'koa', 'hapi', 'next', 'nuxt', 'astro', 'remix', '@sveltejs/kit', 'hono', 'nestjs', '@nestjs/core'])
                if (deps.includes(d))
                    stack.add(d);
            for (const d of ['pg', 'mysql', 'mysql2', 'sqlite3', 'better-sqlite3', 'mongoose', 'mongodb', 'prisma', '@prisma/client', 'knex', 'sequelize', 'typeorm', 'redis', 'ioredis', 'drizzle-orm', 'firebase', 'firebase-admin', '@supabase/supabase-js'])
                if (deps.includes(d))
                    stores.add(d);
            if (pkg.bin)
                r.entryBins = typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin);
        }
        catch { /* unreadable package.json is not a recon failure */ }
    }
    if (fs.existsSync(path.join(cwd, 'composer.json')))
        stack.add('php/composer');
    if (fs.existsSync(path.join(cwd, 'artisan')))
        stack.add('laravel');
    if (fs.existsSync(path.join(cwd, 'requirements.txt')) || fs.existsSync(path.join(cwd, 'pyproject.toml')))
        stack.add('python');
    if (fs.existsSync(path.join(cwd, 'go.mod')))
        stack.add('go');
    if (fs.existsSync(path.join(cwd, 'Gemfile')))
        stack.add('ruby');
    for (const f of all) {
        const rf = rel(f);
        if (/(^|\/)(?:pages|app)\/api\/.*\.(?:ts|js)$/.test(rf) || /(^|\/)app\/.*\/route\.(?:ts|js)$/.test(rf) || /(^|\/)src\/pages\/.*\.(?:ts|js)$/.test(rf) || /(^|\/)server\/api\//.test(rf))
            r.fileRoutes.push(rf);
        if (/(^|\/)\.env(?:\.|$)/.test(rf) && !/\.(example|sample|template)$/.test(rf))
            r.envFilesTracked.push(rf);
        if (/(^|\/)(?:migrations?|models?)\/[^/]+\.(?:js|ts|php|py|rb|sql)$/.test(rf) || /schema\.(?:prisma|sql)$/.test(rf))
            stores.add(rf.split('/').slice(0, -1).join('/') || rf);
        if (/(^|\/)(?:Dockerfile|docker-compose\.ya?ml|\.github\/workflows\/[^/]+\.ya?ml|\.gitlab-ci\.yml)$/.test(rf))
            stack.add(rf);
    }
    const envCount = new Map();
    for (const f of all) {
        const rf = rel(f);
        const isSrc = SOURCE.test(f), isCfg = CONFIG.test(path.basename(f));
        if (!isSrc && !isCfg)
            continue;
        let st;
        try {
            st = fs.statSync(f);
        }
        catch {
            continue;
        }
        if (st.size > MAX_BYTES || /lock\.(json|ya?ml)$|\.min\.|-lock\./.test(rf))
            continue;
        r.files++;
        const text = fs.readFileSync(f, 'utf8');
        const lines = text.split(/\r?\n/);
        lines.forEach((ln, i) => {
            const n = i + 1;
            const hit = (t) => ({ file: rf, line: n, text: t.trim().slice(0, 100) });
            if (isSrc) {
                for (const re of ROUTE_RE) {
                    const m = re.exec(ln);
                    if (m) {
                        r.routes.push(hit((m[1] || '').toUpperCase() + ' ' + (m[2] || '')));
                        break;
                    }
                }
                if (OUTBOUND_RE.test(ln) && !/^\s*(\/\/|\*|#)/.test(ln))
                    r.outbound.push(hit(ln));
                for (const [k, re] of SINKS)
                    if (re.test(ln) && !/^\s*(\/\/|\*|#)/.test(ln))
                        (r.sinks[k] = r.sinks[k] || []).push(hit(ln));
                if (AUTH_RE.test(ln) && !/^\s*(\/\/|\*|#)/.test(ln) && !/_RE\s*=/.test(ln))
                    r.authMarkers.push(hit(ln));
            }
            for (const m of ln.matchAll(ENV_RE)) {
                const name = m.slice(1).find(Boolean);
                if (!envCount.has(name))
                    envCount.set(name, new Set());
                envCount.get(name).add(rf);
            }
            for (const [k, re] of SECRET_RE) {
                const m = re.exec(ln);
                if (m && !/example|placeholder|xxx|your[_-]/i.test(ln)) {
                    r.secrets.push(hit(k + ' ' + mask(m[0])));
                    break;
                }
            }
            for (const [k, re] of OBVIOUS)
                if (re.test(ln))
                    r.obvious.push(hit(k + ': ' + ln));
        });
    }
    for (const [k, v] of envCount)
        r.envReads[k] = [...v].slice(0, 5);
    r.stack = [...stack];
    r.dataStores = [...stores];
    r.routes = r.routes.slice(0, top * 4);
    r.outbound = r.outbound.slice(0, top * 2);
    r.authMarkers = r.authMarkers.slice(0, top);
    r.obvious = r.obvious.slice(0, top * 2);
    for (const k of Object.keys(r.sinks))
        r.sinks[k] = r.sinks[k].slice(0, top);
    return r;
}
function render(r) {
    const L = [];
    const sec = (t, rows) => { L.push(''); L.push(t); if (!rows.length)
        L.push('  none found'); for (const x of rows)
        L.push('  ' + x); };
    L.push(`Recon over ${r.files} source and config files. Stack: ${r.stack.join(', ') || 'unknown'}.`);
    L.push(r.source === 'git' ? 'Scope: files git tracks or does not ignore (a gitignored folder is not scanned).' : 'Scope: every folder except dependency and build folders (not a git work tree).');
    if (r.capped)
        L.push(`NOTE: capped at ${exports.MAX_FILES} files; run it from a subfolder (--cwd) to cover the rest.`);
    sec(`Entry points (${r.routes.length} coded routes, ${r.fileRoutes.length} file routes${r.entryBins.length ? ', bins: ' + r.entryBins.join(', ') : ''}):`, [...r.routes.map((h) => `${h.text}  ${h.file}:${h.line}`), ...r.fileRoutes.slice(0, 20)]);
    sec(`Auth markers (${r.authMarkers.length}): routes with none nearby are the first hunt`, r.authMarkers.map((h) => `${h.file}:${h.line}  ${h.text}`));
    sec(`Data stores:`, r.dataStores);
    sec(`Environment reads (${Object.keys(r.envReads).length} names):`, Object.entries(r.envReads).map(([k, v]) => `${k}  ${v.join(', ')}`));
    sec(`Outbound calls (${r.outbound.length}):`, r.outbound.map((h) => `${h.file}:${h.line}  ${h.text}`));
    for (const [k, hs] of Object.entries(r.sinks))
        sec(`Sink: ${k} (${hs.length})`, hs.map((h) => `${h.file}:${h.line}  ${h.text}`));
    sec(`Secret-looking strings (${r.secrets.length}, masked):`, r.secrets.map((h) => `${h.file}:${h.line}  ${h.text}`));
    if (r.envFilesTracked.length)
        sec('Env files present in the tree (check they are ignored by git):', r.envFilesTracked);
    sec(`Obvious things (${r.obvious.length}):`, r.obvious.map((h) => `${h.file}:${h.line}  ${h.text}`));
    L.push('');
    L.push('This is an inventory, not findings. Pick attack classes from the skill table, then trace each input to its sink.');
    return L.join('\n');
}
// What /recon relays: a grouped map, one line per group, under 20 lines. Names no vulnerability; "check first" only orders the hunt.
function summarize(r) {
    const L = [`Recon over ${r.files} files. Stack: ${r.stack.join(', ') || 'unknown'}.`];
    if (r.capped)
        L.push(`NOTE: capped at ${exports.MAX_FILES} files; run it from a subfolder (--cwd) to cover the rest.`);
    const routeFiles = new Set([...r.routes.map((h) => h.file), ...r.fileRoutes]);
    const authFiles = new Set(r.authMarkers.map((h) => h.file));
    const bare = [...routeFiles].filter((f) => !authFiles.has(f));
    L.push(`Entry points: ${r.routes.length} coded, ${r.fileRoutes.length} file routes${r.entryBins.length ? ', bins ' + r.entryBins.join(', ') : ''}.`);
    L.push(`Route files with no auth marker (${bare.length} of ${routeFiles.size}): ${bare.slice(0, 5).join(', ') || 'none'}${bare.length > 5 ? ', ...' : ''}`);
    L.push(`Data stores: ${r.dataStores.slice(0, 6).join(', ') || 'none found'}.`);
    const outFiles = new Set(r.outbound.map((h) => h.file));
    L.push(`Outbound calls: ${r.outbound.length} in ${outFiles.size} files${outFiles.size ? ' (' + [...outFiles].slice(0, 3).join(', ') + (outFiles.size > 3 ? ', ...' : '') + ')' : ''}. Env names read: ${Object.keys(r.envReads).length}.`);
    const sinks = Object.entries(r.sinks).sort((a, b) => b[1].length - a[1].length);
    L.push(`Sink classes: ${sinks.map(([k, hs]) => k + ' ' + hs.length + ' (' + hs[0].file + ':' + hs[0].line + ')').join('; ') || 'none'}.`);
    const kinds = new Map();
    for (const h of r.obvious) {
        const k = h.text.split(':')[0];
        kinds.set(k, (kinds.get(k) ?? 0) + 1);
    }
    L.push(`Obvious items: ${[...kinds].map(([k, n]) => k + ' x' + n).join(', ') || 'none'}.`);
    const first = [];
    if (r.secrets.length)
        first.push(`${r.secrets.length} secret-looking string(s), e.g. ${r.secrets[0].file}:${r.secrets[0].line} ${r.secrets[0].text}`);
    if (r.envFilesTracked.length)
        first.push(`env file in the tree: ${r.envFilesTracked[0]} (is it git-ignored?)`);
    for (const k of ['disabled-tls', 'cors-any', 'seed-credential', 'debug-flag', 'admin-route']) {
        const h = r.obvious.find((x) => x.text.startsWith(k));
        if (h)
            first.push(`${h.text.slice(0, 60)} at ${h.file}:${h.line}`);
    }
    if (bare.length)
        first.push(`route file without auth marker: ${bare[0]}`);
    L.push(first.length ? 'Check first: ' + first.slice(0, 4).join(' | ') : 'Check first: nothing stands out; pick attack classes from the skill table.');
    L.push('Inventory only, no findings; a finding needs the five parts the security-audit skill lists.');
    return L.join('\n');
}
function main() {
    let cwd = process.cwd(), top = 15, json = false, summary = false;
    const argv = process.argv.slice(2);
    for (let i = 0; i < argv.length; i++) {
        const f = argv[i];
        if (f === '--cwd')
            cwd = path.resolve(argv[++i] ?? '');
        else if (f === '--top')
            top = Number(argv[++i]);
        else if (f === '--json')
            json = true;
        else if (f === '--summary')
            summary = true;
        else {
            console.error('usage: recon.js [--cwd D] [--top N] [--json] [--summary]');
            process.exitCode = 2;
            return;
        }
    }
    if (!(top > 0)) {
        console.error('usage: recon.js [--cwd D] [--top N] [--json] [--summary]');
        process.exitCode = 2;
        return;
    }
    const r = recon(cwd, top);
    console.log(json ? JSON.stringify(r) : summary ? summarize(r) : render(r));
}
if (require.main === module)
    main();
