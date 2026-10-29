#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROOT = void 0;
exports.parseArgs = parseArgs;
exports.ignoreState = ignoreState;
exports.guessType = guessType;
exports.candidates = candidates;
exports.detect = detect;
exports.buildRoot = buildRoot;
exports.init = init;
exports.addFiles = addFiles;
exports.status = status;
exports.changed = changed;
exports.stamp = stamp;
// Mechanical half of the project-context addon: a gitignored project-context/ folder of user-supplied docs,
// each sub-folder with an INDEX.md that Claude writes. This script sets the folders up, tracks which files changed
// since the last analysis (so only those are re-read), rebuilds the root index table and guards against the folder
// being committed. Plain Node + git, any tool. It never edits or deletes a user's file.
//
//   node scan.js detect                       project type, existing doc candidates, recommended folders
//   node scan.js init [--folders a,b] [--type web|backend|mobile|generic] [--copy]
//                                             without --folders: prints the options to ask the user about
//   node scan.js status                       folders, file counts, stale or current, gitignore and leak check
//   node scan.js changed|analyze [folder]     new / modified / deleted files since the last stamp (default: stale folders)
//   node scan.js stamp <folder>                record the current files as analyzed (after INDEX.md is written)
//   node scan.js root                         rebuild the folder table in project-context/INDEX.md
//   node scan.js add <folder> <file>...       copy files into a folder (originals stay)
// Options: --cwd D, --json.  Exit 1 on a usage error or when tracked files leak, 2 on other errors.
const crypto = require("node:crypto");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = childProcess;
const ROOT = 'project-context';
exports.ROOT = ROOT;
const IGNORE_LINE = ROOT + '/';
const START = '<!-- folders:start -->';
const END = '<!-- folders:end -->';
const SKIP_DIRS = new Set(['node_modules', 'vendor', '.git', 'dist', 'build', '.next', '.astro', 'coding-standards', ROOT]);
const REQ = ['requirements', 'goals, audience, must-haves, constraints'];
const DEC = ['decisions', 'dated decisions that are settled'];
const FEAT = ['features', 'feature list and priorities'];
const ASSET = ['assets', 'logos, images, fonts, copy to use'];
const RECOMMENDED = {
    web: [REQ, ['taste', 'look and feel, references, brand, tone'], ['design', 'figma links, tokens, mockups, page list'], ASSET, FEAT, ['content', 'page copy and site structure'], DEC],
    backend: [REQ, ['api', 'specs, endpoints, contracts'], ['data', 'schemas, sample data, migrations notes'], ['integrations', 'third-party services and how they connect (never keys)'], ['compliance', 'legal, security, privacy'], DEC],
    mobile: [REQ, ['taste', 'look and feel, references, brand'], ['design', 'figma links, tokens, mockups, screens'], ASSET, FEAT, ['platform', 'store rules, devices, permissions'], DEC],
    generic: [REQ, FEAT, ASSET, ['references', 'inspiration, competitors, research'], DEC],
};
const PURPOSE = Object.fromEntries(Object.values(RECOMMENDED).flat().map(([n, p]) => [n, p]));
// Existing material: file-name pattern -> the folder it belongs in.
const GUESS = [
    [/(prd|requirement|brief|spec|scope)/i, 'requirements'],
    [/(brand|style[- ]?guide|moodboard|taste|look)/i, 'taste'],
    [/(figma|design|wireframe|mockup|ui[- ]?kit|tokens?)/i, 'design'],
    [/(asset|logo|icon|image|font)/i, 'assets'],
    [/(roadmap|feature|backlog|stories)/i, 'features'],
    [/(copy|content|sitemap)/i, 'content'],
];
const DOC_EXT = /\.(md|txt|pdf|docx?|xlsx?|pptx?|fig|sketch|xd|csv)$/i;
const DOC_DIRS = /^(docs?|design|designs|brand|branding|requirements|specs?|references|research|wireframes|mockups|figma|briefs?)$/i;
const KIND = { text: 'md txt json csv html css js ts yaml yml xml rst svg', pdf: 'pdf', image: 'png jpg jpeg webp avif gif', office: 'doc docx xls xlsx ppt pptx key', design: 'fig sketch xd psd ai', media: 'mp4 mov mp3 wav' };
const KIND_BY_EXT = Object.fromEntries(Object.entries(KIND).flatMap(([k, v]) => v.split(' ').map((e) => [e, k])));
const norm = (p) => p.split(path.sep).join('/');
const kb = (n) => Math.round(n / 1024);
const ext = (f) => path.extname(f).slice(1).toLowerCase();
const git = (args, cwd) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8' }); return { out: (r.stdout || '').trim(), code: r.status }; };
function parseArgs(argv) {
    const o = { cmd: 'status', args: [], folders: null, type: null, copy: false, json: false, cwd: process.cwd() };
    const cmds = ['detect', 'init', 'status', 'changed', 'analyze', 'stamp', 'root', 'add'];
    const rest = cmds.includes(argv[0]) ? (o.cmd = argv[0] === 'analyze' ? 'changed' : argv[0], argv.slice(1)) : argv;
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (a === '--folders')
            o.folders = String(rest[++i]).split(',').map((s) => s.trim()).filter(Boolean);
        else if (a === '--type')
            o.type = rest[++i];
        else if (a === '--cwd')
            o.cwd = path.resolve(rest[++i]);
        else if (a === '--copy')
            o.copy = true;
        else if (a === '--json')
            o.json = true;
        else if (a.startsWith('--'))
            throw new Error(`unknown option ${a}`);
        else
            o.args.push(a);
    }
    if (o.type && !RECOMMENDED[o.type])
        throw new Error(`--type must be one of ${Object.keys(RECOMMENDED).join(', ')}`);
    return o;
}
const rootDir = (cwd) => path.join(cwd, ROOT);
function folderName(n) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(n))
        throw new Error(`folder name "${n}" must be lowercase letters, digits and dashes`);
    return n;
}
function folderDirs(cwd) {
    try {
        return fs.readdirSync(rootDir(cwd), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
    }
    catch {
        return [];
    }
}
function listFiles(dir) {
    const out = [];
    const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) {
                walk(p);
                continue;
            }
            const rel = norm(path.relative(dir, p));
            if (rel === 'INDEX.md' || rel === '.index.json')
                continue;
            const st = fs.statSync(p);
            const sha = st.size > 100 * 1024 * 1024 ? `big:${st.size}:${Math.round(st.mtimeMs)}` : crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 12);
            out.push({ rel, bytes: st.size, sha, kind: KIND_BY_EXT[ext(rel)] || 'other' });
        }
    };
    walk(dir);
    return out.sort((a, b) => a.rel.localeCompare(b.rel));
}
function readStamp(dir) { try {
    return JSON.parse(fs.readFileSync(path.join(dir, '.index.json'), 'utf8'));
}
catch {
    return null;
} }
function diff(dir) {
    const now = listFiles(dir);
    const stamp = readStamp(dir);
    const had = (stamp && stamp.files) || {};
    const seen = new Set(now.map((f) => f.rel));
    const added = now.filter((f) => !had[f.rel]);
    const modified = now.filter((f) => had[f.rel] && had[f.rel].sha !== f.sha);
    const deleted = Object.keys(had).filter((r) => !seen.has(r));
    const hasIndex = fs.existsSync(path.join(dir, 'INDEX.md'));
    const nothingYet = !stamp && now.length === 0;
    return { files: now, added, modified, deleted, analyzed: stamp && stamp.analyzed, hasIndex, stale: !nothingYet && (!stamp || !hasIndex || added.length + modified.length + deleted.length > 0) };
}
function ignoreState(cwd) {
    const f = path.join(cwd, '.gitignore');
    let text = '';
    try {
        text = fs.readFileSync(f, 'utf8');
    }
    catch { /* none yet */ }
    const ignored = text.split(/\r?\n/).some((l) => ['project-context', 'project-context/', '/project-context', '/project-context/'].includes(l.trim()));
    const tracked = git(['ls-files', ROOT], cwd);
    return { ignored, tracked: tracked.code === 0 && tracked.out ? tracked.out.split('\n').length : 0 };
}
function ensureIgnored(cwd) {
    if (ignoreState(cwd).ignored)
        return false;
    const f = path.join(cwd, '.gitignore');
    const cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
    fs.writeFileSync(f, cur + (cur && !cur.endsWith('\n') ? '\n' : '') + '# private project docs\n' + IGNORE_LINE + '\n');
    return true;
}
// ---- detect ----
function guessType(cwd) {
    const has = (f) => fs.existsSync(path.join(cwd, f));
    let deps = {};
    try {
        const p = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
        deps = { ...p.dependencies, ...p.devDependencies };
    }
    catch { /* no package.json */ }
    const any = (re) => Object.keys(deps).some((d) => re.test(d));
    if (has('pubspec.yaml') || has('android') || has('ios') || any(/^(expo|react-native|@ionic)/))
        return 'mobile';
    if (any(/^(astro|next|nuxt|gatsby|vite|react|vue|svelte|@angular\/core)$/) || has('index.html') || has('theme.liquid') || has('wp-content') || has('functions.php'))
        return 'web';
    if (any(/^(express|fastify|@nestjs\/core|koa|hono)$/) || has('composer.json') || has('go.mod') || has('requirements.txt') || has('pom.xml'))
        return 'backend';
    return 'generic';
}
function candidates(cwd) {
    const out = [];
    const walk = (dir, depth) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) {
                if (SKIP_DIRS.has(e.name) || e.name.startsWith('.'))
                    continue;
                if (depth < 2)
                    walk(p, depth + 1);
            }
            else if (DOC_EXT.test(e.name) && !/^(readme|changelog|license|handover|claude|agents|contributing)/i.test(e.name)) {
                const rel = norm(path.relative(cwd, p));
                const hint = GUESS.find(([re]) => re.test(rel));
                const inDocDir = rel.split('/').slice(0, -1).some((d) => DOC_DIRS.test(d));
                if (hint || inDocDir)
                    out.push({ file: rel, kb: kb(fs.statSync(p).size), folder: hint ? hint[1] : 'other' });
            }
        }
    };
    walk(cwd, 0);
    return out.slice(0, 60);
}
function detect(cwd) {
    const type = guessType(cwd);
    const found = candidates(cwd);
    const byFolder = {};
    for (const c of found)
        (byFolder[c.folder] = byFolder[c.folder] || []).push(c.file);
    return { type, recommended: RECOMMENDED[type].map(([name, purpose]) => ({ name, purpose })), candidates: found, autoFolders: Object.keys(byFolder), existing: folderDirs(cwd) };
}
// ---- init, root, add ----
function purposeOf(cwd, name) {
    try {
        const m = /^Purpose:\s*(.+)$/m.exec(fs.readFileSync(path.join(rootDir(cwd), name, 'INDEX.md'), 'utf8'));
        if (m)
            return m[1].trim();
    }
    catch { /* no index yet */ }
    return PURPOSE[name] || '-';
}
function buildRoot(cwd) {
    const rows = folderDirs(cwd).map((n) => {
        const d = diff(path.join(rootDir(cwd), n));
        const when = d.analyzed ? d.analyzed.slice(0, 10) : 'not analyzed';
        return `| ${n} | ${d.files.length} | ${when} | ${purposeOf(cwd, n)} |`;
    });
    const table = [START, '| Folder | Files | Analyzed | Purpose |', '|---|---|---|---|', ...rows, END].join('\n');
    const f = path.join(rootDir(cwd), 'INDEX.md');
    let text;
    try {
        text = fs.readFileSync(f, 'utf8');
    }
    catch {
        text = null;
    }
    if (text && text.includes(START) && text.includes(END))
        text = text.replace(new RegExp(`${START}[\\s\\S]*?${END}`), () => table);
    else
        text = `# Project context\n\nPrivate project docs. Never committed. Read this file first, then open one folder's INDEX.md for the task at hand. Open a raw file only when that index says to.\n\n${table}\n`;
    fs.writeFileSync(f, text);
    return folderDirs(cwd).length;
}
function init(o) {
    const names = (o.folders || []).map(folderName);
    const made = [];
    fs.mkdirSync(rootDir(o.cwd), { recursive: true });
    const found = o.copy ? candidates(o.cwd) : [];
    for (const n of names) {
        const d = path.join(rootDir(o.cwd), n);
        fs.mkdirSync(d, { recursive: true });
        const idx = path.join(d, 'INDEX.md');
        if (!fs.existsSync(idx)) {
            fs.writeFileSync(idx, `# ${n}\n\nPurpose: ${PURPOSE[n] || 'to be described after the first analysis'}\nStatus: not analyzed. Drop docs in this folder, then run /ctx analyze ${n}.\n`);
            made.push(n);
        }
    }
    const copied = [];
    for (const c of found) {
        if (!names.includes(c.folder))
            continue;
        const dest = path.join(rootDir(o.cwd), c.folder, path.basename(c.file));
        if (!fs.existsSync(dest)) {
            fs.copyFileSync(path.join(o.cwd, c.file), dest);
            copied.push(`${c.file} -> ${ROOT}/${c.folder}/`);
        }
    }
    const gitignored = ensureIgnored(o.cwd);
    buildRoot(o.cwd);
    return { root: ROOT, created: made, gitignoreUpdated: gitignored, copied };
}
function addFiles(o) {
    const [folder, ...files] = o.args;
    if (!folder || !files.length)
        throw new Error('add needs a folder and at least one file');
    folderName(folder);
    const dir = path.join(rootDir(o.cwd), folder);
    if (!fs.existsSync(dir))
        throw new Error(`folder "${folder}" does not exist; run init first`);
    return files.map((f) => {
        const src = path.resolve(o.cwd, f);
        if (!fs.existsSync(src) || fs.statSync(src).isDirectory())
            return { file: f, status: 'error', error: 'not a file' };
        const dest = path.join(dir, path.basename(src));
        if (fs.existsSync(dest))
            return { file: f, status: 'skipped-exists' };
        fs.copyFileSync(src, dest);
        return { file: f, status: 'copied', to: norm(path.relative(o.cwd, dest)) };
    });
}
function status(cwd) {
    const g = ignoreState(cwd);
    const folders = folderDirs(cwd).map((name) => {
        const d = diff(path.join(rootDir(cwd), name));
        return { name, files: d.files.length, kb: kb(d.files.reduce((s, f) => s + f.bytes, 0)), analyzed: d.analyzed || null, stale: d.stale, added: d.added.length, modified: d.modified.length, deleted: d.deleted.length, hasIndex: d.hasIndex };
    });
    return { exists: fs.existsSync(rootDir(cwd)), ignored: g.ignored, tracked: g.tracked, folders };
}
function changed(o) {
    const names = o.args.length ? o.args.map(folderName) : folderDirs(o.cwd);
    return names.map((name) => {
        const dir = path.join(rootDir(o.cwd), name);
        if (!fs.existsSync(dir))
            throw new Error(`folder "${name}" does not exist`);
        const d = diff(dir);
        return { name, stale: d.stale, hasIndex: d.hasIndex, added: d.added, modified: d.modified, deleted: d.deleted, unchanged: d.files.length - d.added.length - d.modified.length };
    }).filter((f) => o.args.length || f.stale);
}
function stamp(o) {
    const name = folderName(o.args[0] || '');
    const dir = path.join(rootDir(o.cwd), name);
    if (!fs.existsSync(path.join(dir, 'INDEX.md')))
        throw new Error(`write ${ROOT}/${name}/INDEX.md before stamping`);
    const files = Object.fromEntries(listFiles(dir).map((f) => [f.rel, { sha: f.sha, bytes: f.bytes }]));
    fs.writeFileSync(path.join(dir, '.index.json'), JSON.stringify({ analyzed: new Date().toISOString(), files }, null, 1));
    buildRoot(o.cwd);
    return { folder: name, files: Object.keys(files).length };
}
function printStatus(s) {
    if (!s.exists) {
        console.log(`${ROOT}/ does not exist. Run /ctx init to set it up.`);
        return;
    }
    console.log(`${ROOT}/: ${s.folders.length} folders, ${s.folders.reduce((n, f) => n + f.files, 0)} files`);
    console.log(`gitignore: ${s.ignored ? 'ok' : 'MISSING, add "project-context/" to .gitignore'}`);
    console.log(`tracked by git: ${s.tracked ? `WARN ${s.tracked} file(s); run git rm -r --cached ${ROOT}` : 'none'}`);
    for (const f of s.folders) {
        const state = !f.files ? 'empty, drop docs then analyze' : !f.hasIndex || !f.analyzed ? 'not analyzed' : f.stale ? `stale (${f.added} new, ${f.modified} modified, ${f.deleted} deleted)` : 'current';
        console.log(`${f.name.padEnd(14)} ${String(f.files).padStart(3)} files  ${String(f.kb).padStart(6)} KB  ${state}`);
    }
}
function printDetect(d, o) {
    console.log(`Project type guess: ${d.type}`);
    console.log(`Existing material: ${d.candidates.length ? '' : 'none found'}`);
    for (const c of d.candidates.slice(0, 25))
        console.log(`  ${c.file}  (${c.kb} KB)  -> ${c.folder}`);
    if (o.cmd === 'init') {
        console.log('\nSetup options (ask the user which):');
        console.log(`  A  Auto-detect (best for established projects): folders ${d.autoFolders.length ? d.autoFolders.join(', ') : '(none found; use B)'}`);
        console.log(`  B  Recommended for a ${d.type} project: ${d.recommended.map((r) => r.name).join(', ')}`);
        console.log('  C  Other: the user names the folders; may be added to A or B');
        console.log('Then run: node scan.js init --folders <comma list> [--copy]');
    }
}
function main() {
    const o = parseArgs(process.argv.slice(2));
    const out = (v, print) => { if (o.json)
        console.log(JSON.stringify(v, null, 1));
    else
        print(v); };
    if (o.cmd === 'detect') {
        out(detect(o.cwd), (d) => printDetect(d, o));
        return;
    }
    if (o.cmd === 'init') {
        if (!o.folders) {
            out(detect(o.cwd), (d) => printDetect(d, o));
            return;
        }
        out(init(o), (r) => console.log(`${r.root}/: created ${r.created.join(', ') || 'nothing new'}${r.gitignoreUpdated ? '; added to .gitignore' : ''}${r.copied.length ? '\ncopied:\n  ' + r.copied.join('\n  ') : ''}`));
        return;
    }
    if (o.cmd === 'status') {
        const s = status(o.cwd);
        out(s, printStatus);
        if (s.tracked)
            process.exitCode = 1;
        return;
    }
    if (o.cmd === 'changed') {
        out(changed(o), (rows) => {
            if (!rows.length) {
                console.log('Nothing to analyze: every folder is current.');
                return;
            }
            for (const r of rows) {
                console.log(`${r.name}: ${r.added.length} new, ${r.modified.length} modified, ${r.deleted.length} deleted, ${r.unchanged} unchanged${r.hasIndex ? '' : ' (no INDEX.md content yet)'}`);
                for (const f of r.added)
                    console.log(`  NEW      ${f.rel}  ${f.kind}  ${kb(f.bytes)} KB`);
                for (const f of r.modified)
                    console.log(`  MODIFIED ${f.rel}  ${f.kind}  ${kb(f.bytes)} KB`);
                for (const f of r.deleted)
                    console.log(`  DELETED  ${f}`);
            }
        });
        return;
    }
    if (o.cmd === 'stamp') {
        out(stamp(o), (r) => console.log(`stamped ${r.folder}: ${r.files} files recorded`));
        return;
    }
    if (o.cmd === 'root') {
        out({ folders: buildRoot(o.cwd) }, (r) => console.log(`${ROOT}/INDEX.md rebuilt: ${r.folders} folders`));
        return;
    }
    if (o.cmd === 'add') {
        const rows = addFiles(o);
        out(rows, (r) => r.forEach((x) => console.log(`${x.status.toUpperCase().padEnd(14)} ${x.file}${x.to ? ' -> ' + x.to : ''}${x.error ? '  ' + x.error : ''}`)));
        if (rows.some((r) => r.status === 'error'))
            process.exitCode = 1;
    }
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
