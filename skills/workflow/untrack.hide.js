#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rel = rel;
exports.hide = hide;
exports.show = show;
exports.list = list;
// Manual local untracking: hides files from `git status` and the VS Code Changes tree, even after you edit them.
// Plain Node + git, no dependencies. Runs only when you call it; nothing here is automatic and nothing is committed.
//
//   node hide.js hide <path|folder|glob>... [--cwd D]   stop showing these locally
//   node hide.js show <path|folder|glob>... [--cwd D]   show them again
//   node hide.js list [--cwd D]                         what is hidden right now
//
// Two mechanisms, both local to this clone (never pushed, never in .gitignore):
//   tracked file   git update-index --skip-worktree     edits stay invisible; the file stays in the repo
//   untracked file a marked block in .git/info/exclude  new and existing matches stay invisible
// Caveat: a skip-worktree file that someone else changes upstream makes `git pull` refuse until you run `show` on it.
const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");
const { spawnSync } = childProcess;
const BEGIN = '# ai-dev-kit untrack: begin (managed by untrack/hide.js, edit with hide/show)';
const END = '# ai-dev-kit untrack: end';
const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const fwd = (p) => p.split(path.sep).join('/');
const nul = (s) => s.split('\0').filter(Boolean);
function locate(cwd) {
    const top = git(cwd, 'rev-parse', '--show-toplevel');
    if (top.status !== 0)
        throw new Error('not inside a git repository');
    const root = path.resolve(top.stdout.trim());
    const ex = git(cwd, 'rev-parse', '--git-path', 'info/exclude');
    return { root, exclude: path.resolve(cwd, ex.stdout.trim()) };
}
// "src/a" given from cwd -> "src/a" relative to the repo root; globs pass through untouched.
function rel(root, cwd, spec) {
    const abs = path.isAbsolute(spec) ? path.resolve(spec) : path.resolve(cwd, spec);
    const r = fwd(path.relative(root, abs));
    if (r.startsWith('..') || r === '')
        throw new Error(`${spec} is outside the repository or is the repository root`);
    return r;
}
function readBlock(file) {
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const b = text.indexOf(BEGIN);
    const e = text.indexOf(END);
    if (b === -1 || e === -1 || e < b)
        return { before: text, entries: [], after: '' };
    const entries = text.slice(b + BEGIN.length, e).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return { before: text.slice(0, b), entries, after: text.slice(e + END.length).replace(/^\r?\n/, '') };
}
function writeBlock(file, blk) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const before = blk.before.length && !blk.before.endsWith('\n') ? blk.before + '\n' : blk.before;
    const mid = blk.entries.length ? `${BEGIN}\n${blk.entries.join('\n')}\n${END}\n` : '';
    fs.writeFileSync(file, before + mid + blk.after);
}
const tracked = (cwd, spec) => nul(git(cwd, 'ls-files', '-z', '--', spec).stdout);
function skipped(cwd) {
    return git(cwd, 'ls-files', '-v', '-z').stdout.split('\0').filter((l) => l.startsWith('S ')).map((l) => l.slice(2));
}
function hide(cwd, specs) {
    const { root, exclude } = locate(cwd);
    const out = [];
    const blk = readBlock(exclude);
    for (const spec of specs) {
        const r = rel(root, cwd, spec);
        const files = tracked(root, r);
        let n = 0;
        for (let i = 0; i < files.length; i += 200) {
            const res = git(root, 'update-index', '--skip-worktree', '--', ...files.slice(i, i + 200));
            if (res.status !== 0)
                throw new Error(res.stderr.trim());
            n += Math.min(200, files.length - i);
        }
        const isDir = fs.existsSync(path.join(root, r)) && fs.statSync(path.join(root, r)).isDirectory();
        const pending = nul(git(root, 'ls-files', '-z', '--others', '--exclude-standard', '--', r).stdout);
        let ex = '';
        if (pending.length || (!files.length && !fs.existsSync(path.join(root, r)))) {
            ex = '/' + r + (isDir ? '/' : '');
            if (!blk.entries.includes(ex))
                blk.entries.push(ex);
        }
        out.push(`hidden  ${r}: ${n} tracked file(s)${ex ? `, exclude ${ex}` : ''}${!n && !ex ? ', nothing matched' : ''}`);
    }
    writeBlock(exclude, blk);
    return out;
}
function show(cwd, specs) {
    const { root, exclude } = locate(cwd);
    const out = [];
    const blk = readBlock(exclude);
    for (const spec of specs) {
        const r = rel(root, cwd, spec);
        const hidden = new Set(skipped(root));
        const files = tracked(root, r).filter((f) => hidden.has(f));
        for (let i = 0; i < files.length; i += 200) {
            const res = git(root, 'update-index', '--no-skip-worktree', '--', ...files.slice(i, i + 200));
            if (res.status !== 0)
                throw new Error(res.stderr.trim());
        }
        const drop = blk.entries.filter((e) => e === '/' + r || e === '/' + r + '/');
        blk.entries = blk.entries.filter((e) => !drop.includes(e));
        out.push(`shown   ${r}: ${files.length} tracked file(s)${drop.length ? `, removed exclude ${drop.join(' ')}` : ''}${!files.length && !drop.length ? ', nothing was hidden here' : ''}`);
    }
    writeBlock(exclude, blk);
    return out;
}
function list(cwd) {
    const { root, exclude } = locate(cwd);
    const files = skipped(root);
    const entries = readBlock(exclude).entries;
    return [
        `tracked, edits hidden (skip-worktree): ${files.length}`, ...files.map((f) => `  ${f}`),
        `untracked, excluded locally: ${entries.length}`, ...entries.map((e) => `  ${e}`),
    ];
}
function main(argv) {
    let cwd = process.cwd();
    const rest = [];
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--cwd')
            cwd = path.resolve(argv[++i] || '.');
        else
            rest.push(argv[i]);
    }
    const cmd = rest.shift();
    const usage = 'usage: node hide.js <hide|show> <path|folder|glob>... | list  [--cwd D]';
    if (!cmd || !['hide', 'show', 'list'].includes(cmd) || (cmd !== 'list' && !rest.length)) {
        console.error(usage);
        return 2;
    }
    try {
        const out = cmd === 'hide' ? hide(cwd, rest) : cmd === 'show' ? show(cwd, rest) : list(cwd);
        console.log(out.join('\n'));
        return 0;
    }
    catch (e) {
        console.error(`untrack: ${e.message}`);
        return 1;
    }
}
if (require.main === module)
    process.exitCode = main(process.argv.slice(2));
