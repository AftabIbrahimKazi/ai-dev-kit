#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_INDEX_LINES = exports.MAX_ENTRY_LINES = exports.FOLDERS = exports.BANK = void 0;
exports.entryFiles = entryFiles;
exports.parseIndex = parseIndex;
exports.check = check;
exports.rebuild = rebuild;
exports.init = init;
// Index upkeep for the memory-bank skill: the mechanical half of its structure and maintenance rules.
//
//   node index.js check   [--cwd D] [--json]        entries not in INDEX.md, index lines pointing nowhere, files over 20 lines,
//                                                    files with no one-line summary, INDEX.md over 40 lines
//   node index.js rebuild [--cwd D] [--dry-run]     rewrite INDEX.md from the files: keeps every existing hook, adds a line for
//                                                    each unindexed file (hook = its first non-heading line), drops dead lines
//   node index.js init    [--cwd D]                 create memory-bank/ with INDEX.md and the three folders
//
// Reads memory-bank/ only; rebuild writes INDEX.md and nothing else. No network. Exit codes: 0 done (check: 1 on a
// problem), 2 bad usage.
const fs = require("node:fs");
const path = require("node:path");
exports.BANK = 'memory-bank';
exports.FOLDERS = ['decisions', 'context', 'solutions'];
exports.MAX_ENTRY_LINES = 20;
exports.MAX_INDEX_LINES = 40;
const norm = (p) => p.split(path.sep).join('/');
function entryFiles(bank) {
    const out = [];
    const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory())
                walk(p);
            else if (e.name.endsWith('.md') && e.name !== 'INDEX.md')
                out.push(norm(path.relative(bank, p)));
        }
    };
    if (fs.existsSync(bank))
        walk(bank);
    return out.sort();
}
function parseIndex(text) {
    const out = [];
    for (const raw of text.split(/\r?\n/)) {
        const m = /^\s*[-*]\s+\[([^\]]+)\]\(([^)]+)\)\s*(?:[—–-]+\s*(.*))?$/.exec(raw);
        if (m)
            out.push({ title: m[1], file: m[2].replace(/^\.\//, ''), hook: (m[3] || '').trim(), raw });
    }
    return out;
}
function summaryOf(text) {
    const lines = text.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
    const heading = lines.find((l) => /^#\s+/.test(l));
    const body = lines.find((l) => l.trim() && !/^#/.test(l) && !/^---/.test(l));
    return { title: heading ? heading.replace(/^#\s+/, '').trim() : '', hook: (body || '').replace(/^\*\*[^*]+\*\*:?\s*/, '').trim(), lines: lines.length };
}
function check(cwd) {
    const bank = path.join(cwd, exports.BANK);
    if (!fs.existsSync(bank))
        return [{ kind: 'missing', file: exports.BANK, detail: 'no memory-bank/ folder (run init)' }];
    const problems = [];
    const indexPath = path.join(bank, 'INDEX.md');
    const indexText = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
    const index = parseIndex(indexText);
    const files = entryFiles(bank);
    const indexed = new Set(index.map((i) => i.file));
    for (const f of files) {
        if (!indexed.has(f))
            problems.push({ kind: 'unindexed', file: f, detail: 'no line in INDEX.md (invisible to recall)' });
        const s = summaryOf(fs.readFileSync(path.join(bank, f), 'utf8'));
        if (s.lines > exports.MAX_ENTRY_LINES)
            problems.push({ kind: 'too-long', file: f, detail: `${s.lines} lines (limit ${exports.MAX_ENTRY_LINES}); distill or split` });
        if (!s.hook)
            problems.push({ kind: 'no-summary', file: f, detail: 'no one-line summary under the heading' });
    }
    for (const i of index)
        if (!files.includes(i.file))
            problems.push({ kind: 'dead-link', file: i.file, detail: 'INDEX.md names a file that does not exist' });
    const indexLines = indexText.split(/\r?\n/).filter((l) => l.trim()).length;
    if (indexLines > exports.MAX_INDEX_LINES)
        problems.push({ kind: 'index-long', file: 'INDEX.md', detail: `${indexLines} lines (limit ${exports.MAX_INDEX_LINES}); run memory-gardener` });
    return problems;
}
function rebuild(cwd, dryRun = false) {
    const bank = path.join(cwd, exports.BANK);
    if (!fs.existsSync(bank))
        throw new Error('no ' + exports.BANK + '/ folder (run init)');
    const indexPath = path.join(bank, 'INDEX.md');
    const old = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
    const existing = new Map(parseIndex(old).map((i) => [i.file, i]));
    const files = entryFiles(bank);
    const added = [], dropped = [];
    const byFolder = new Map();
    for (const f of files) {
        const folder = f.includes('/') ? f.slice(0, f.indexOf('/')) : '.';
        const prev = existing.get(f);
        let line;
        if (prev)
            line = `- [${prev.title}](${f})${prev.hook ? ' — ' + prev.hook : ''}`;
        else {
            const s = summaryOf(fs.readFileSync(path.join(bank, f), 'utf8'));
            line = `- [${s.title || path.basename(f, '.md')}](${f})${s.hook ? ' — ' + s.hook.slice(0, 120) : ''}`;
            added.push(f);
        }
        if (!byFolder.has(folder))
            byFolder.set(folder, []);
        byFolder.get(folder).push(line);
    }
    for (const f of existing.keys())
        if (!files.includes(f))
            dropped.push(f);
    const head = old.split(/\r?\n/).filter((l) => /^#\s+/.test(l))[0] || '# Memory bank';
    const parts = [head, ''];
    for (const folder of [...exports.FOLDERS, ...[...byFolder.keys()].filter((k) => !exports.FOLDERS.includes(k))]) {
        const lines = byFolder.get(folder);
        if (!lines)
            continue;
        parts.push(folder === '.' ? '## Other' : '## ' + folder[0].toUpperCase() + folder.slice(1), ...lines, '');
    }
    const text = parts.join('\n');
    if (!dryRun)
        fs.writeFileSync(indexPath, text);
    return { text, added, dropped };
}
function init(cwd) {
    const bank = path.join(cwd, exports.BANK);
    const made = [];
    for (const d of ['', ...exports.FOLDERS]) {
        const p = path.join(bank, d);
        if (!fs.existsSync(p)) {
            fs.mkdirSync(p, { recursive: true });
            made.push(norm(path.relative(cwd, p)) + '/');
        }
    }
    const idx = path.join(bank, 'INDEX.md');
    if (!fs.existsSync(idx)) {
        fs.writeFileSync(idx, '# Memory bank\n\nOne line per entry: - [Title](folder/file.md) — recall hook.\n');
        made.push(exports.BANK + '/INDEX.md');
    }
    return made;
}
function main() {
    const [cmd, ...rest] = process.argv.slice(2);
    let cwd = process.cwd(), json = false, dryRun = false;
    let ok = cmd === 'check' || cmd === 'rebuild' || cmd === 'init';
    for (let i = 0; i < rest.length && ok; i++) {
        const f = rest[i];
        if (f === '--cwd')
            cwd = path.resolve(rest[++i] ?? '');
        else if (f === '--json')
            json = true;
        else if (f === '--dry-run')
            dryRun = true;
        else
            ok = false;
    }
    if (!ok) {
        console.error('usage: index.js check|rebuild|init [--cwd D] [--dry-run] [--json]');
        process.exitCode = 2;
        return;
    }
    try {
        if (cmd === 'init') {
            const made = init(cwd);
            console.log(made.length ? 'created ' + made.join(', ') : exports.BANK + '/ already set up');
            return;
        }
        if (cmd === 'check') {
            const p = check(cwd);
            if (json)
                console.log(JSON.stringify({ ok: !p.length, problems: p }));
            else if (!p.length)
                console.log(exports.BANK + ': index and entries consistent');
            else {
                for (const x of p)
                    console.log(`${x.kind.padEnd(11)} ${x.file}: ${x.detail}`);
                console.log(`${p.length} problems; "rebuild" fixes unindexed and dead-link, the rest need judgement`);
            }
            if (p.length)
                process.exitCode = 1;
            return;
        }
        const r = rebuild(cwd, dryRun);
        if (dryRun)
            console.log(r.text);
        console.log(`${dryRun ? 'would write' : 'wrote'} ${exports.BANK}/INDEX.md: +${r.added.length} added${r.added.length ? ' (' + r.added.join(', ') + ')' : ''}, -${r.dropped.length} dead${r.dropped.length ? ' (' + r.dropped.join(', ') + ')' : ''}. Added hooks are the file's first line: sharpen them.`);
    }
    catch (e) {
        console.error('error: ' + e.message);
        process.exitCode = 1;
    }
}
if (require.main === module)
    main();
