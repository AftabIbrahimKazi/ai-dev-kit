#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractBlock = extractBlock;
exports.applySlots = applySlots;
exports.place = place;
exports.run = run;
exports.parseArgs = parseArgs;
// Copies one block of markup from a source file into other files, swapping per-target values (text, image and video
// paths). The model names the block and the values; this script does the copying, so a section used on 5 pages is
// written once, not retyped 5 times. Plain Node, no dependencies, no network.
//
//   node dupe.js --from <file> (--block <name> | --lines <a-b>) --to <file>[,<file>...] [--slots <json file>] [options]
//
// The source block is either wrapped in marker comments (<!-- dupe:name --> ... <!-- /dupe:name -->) or a line range.
// Slots: a JSON file { "<target file>": { "<exact text in the block>": "<replacement>", ... }, ... }. Every occurrence of
// each key inside the copied block is replaced; keys are literal strings, never patterns. "*" applies to every target.
//
// Where it lands in each target: at a <!-- dupe-here:name --> marker if present; else replacing an earlier copy of the same
// block (re-running is safe); else before the --before text (default </main>, then </body>).
//
// options:
//   --before <text>   insert before the first occurrence of this text
//   --after <text>    insert after the first occurrence of this text
//   --dry-run         print what would change, write nothing
//   --json            machine-readable result
// Exit codes: 0 done, 1 error, 2 bad usage.
const fs = require("node:fs");
const path = require("node:path");
const EOL = (s) => (s.includes('\r\n') ? '\r\n' : '\n');
function extractBlock(text, name, lines) {
    if (name) {
        const re = new RegExp(`[ \\t]*<!--\\s*dupe:${name}\\s*-->[\\s\\S]*?<!--\\s*/dupe:${name}\\s*-->`);
        const m = re.exec(text);
        if (!m)
            throw new Error(`no block named "${name}": wrap it in <!-- dupe:${name} --> ... <!-- /dupe:${name} --> or use --lines`);
        return { block: m[0], wrapped: true };
    }
    const r = /^(\d+)-(\d+)$/.exec(lines || '');
    if (!r)
        throw new Error('give --block <name> or --lines <first>-<last>');
    const all = text.split(/\r?\n/);
    const a = Number(r[1]), b = Number(r[2]);
    if (a < 1 || b < a || b > all.length)
        throw new Error(`--lines ${lines} is outside the file (1-${all.length})`);
    return { block: all.slice(a - 1, b).join(EOL(text)), wrapped: false };
}
// Literal replacement of every occurrence; returns the new text and how many times a key was found.
function applySlots(block, slots) {
    let out = block, count = 0;
    for (const [k, v] of Object.entries(slots)) {
        if (!k)
            continue;
        const parts = out.split(k);
        count += parts.length - 1;
        out = parts.join(v);
    }
    return { text: out, count };
}
function place(target, block, name, o) {
    const eol = EOL(target);
    const body = block.replace(/\r?\n/g, eol);
    if (name) {
        const here = new RegExp(`[ \\t]*<!--\\s*dupe-here:${name}\\s*-->`);
        if (here.test(target))
            return { text: target.replace(here, () => body), action: 'inserted' };
        const prior = new RegExp(`[ \\t]*<!--\\s*dupe:${name}\\s*-->[\\s\\S]*?<!--\\s*/dupe:${name}\\s*-->`);
        if (prior.test(target))
            return { text: target.replace(prior, () => body), action: 'replaced' };
    }
    const anchor = o.after ?? o.before;
    const candidates = anchor ? [anchor] : ['</main>', '</body>'];
    for (const c of candidates) {
        const i = target.indexOf(c);
        if (i < 0)
            continue;
        const at = o.after !== undefined ? i + c.length : i;
        const lead = target.slice(0, at), tail = target.slice(at);
        const pre = lead.endsWith(eol) || lead === '' ? '' : eol;
        return { text: lead + pre + body + eol + tail, action: 'inserted' };
    }
    throw new Error(`no place to insert: the target has none of ${candidates.join(', ')}; add a <!-- dupe-here:${name || 'name'} --> marker or pass --before/--after`);
}
function run(a, cwd) {
    const src = path.resolve(cwd, a.from);
    if (!fs.existsSync(src))
        throw new Error(`source file ${a.from} does not exist`);
    const { block } = extractBlock(fs.readFileSync(src, 'utf8'), a.block, a.lines);
    const slotsAll = a.slots ? JSON.parse(fs.readFileSync(path.resolve(cwd, a.slots), 'utf8')) : {};
    const results = [];
    for (const t of a.to) {
        const abs = path.resolve(cwd, t);
        if (!fs.existsSync(abs))
            throw new Error(`target ${t} does not exist`);
        const slots = { ...(slotsAll['*'] || {}), ...(slotsAll[t] || slotsAll[path.basename(t)] || {}) };
        const { text: filled, count } = applySlots(block, slots);
        const before = fs.readFileSync(abs, 'utf8');
        const placed = place(before, filled, a.block, { before: a.before, after: a.after });
        const unused = Object.keys(slots).filter((k) => !block.includes(k));
        const r = { file: t, action: placed.text === before ? 'unchanged' : placed.action, replaced: count };
        if (unused.length)
            r.note = `slot key not found in the block: ${unused.map((k) => JSON.stringify(k.slice(0, 30))).join(', ')}`;
        if (!a.dryRun && placed.text !== before)
            fs.writeFileSync(abs, placed.text);
        results.push(r);
    }
    return results;
}
function parseArgs(argv) {
    const a = { to: [], dryRun: false, json: false };
    for (let i = 0; i < argv.length; i++) {
        const k = argv[i];
        if (k === '--from')
            a.from = argv[++i];
        else if (k === '--block')
            a.block = argv[++i];
        else if (k === '--lines')
            a.lines = argv[++i];
        else if (k === '--to')
            a.to.push(...(argv[++i] || '').split(',').filter(Boolean));
        else if (k === '--slots')
            a.slots = argv[++i];
        else if (k === '--before')
            a.before = argv[++i];
        else if (k === '--after')
            a.after = argv[++i];
        else if (k === '--dry-run')
            a.dryRun = true;
        else if (k === '--json')
            a.json = true;
        else
            return null;
    }
    return a.from && (a.block || a.lines) && a.to.length ? a : null;
}
function main() {
    const a = parseArgs(process.argv.slice(2));
    if (!a) {
        console.error('usage: dupe.js --from <file> (--block <name> | --lines <a-b>) --to <file>[,<file>...] [--slots <json>] [--before <text>|--after <text>] [--dry-run] [--json]');
        process.exitCode = 2;
        return;
    }
    try {
        const res = run(a, process.cwd());
        if (a.json)
            console.log(JSON.stringify({ dryRun: a.dryRun, results: res }));
        else {
            for (const r of res)
                console.log(`${a.dryRun ? 'would be ' : ''}${r.action}  ${r.file}  (${r.replaced} slot replacement${r.replaced === 1 ? '' : 's'})${r.note ? '  note: ' + r.note : ''}`);
            if (a.dryRun)
                console.log('dry run: nothing was written');
        }
    }
    catch (e) {
        console.error('error: ' + e.message);
        process.exitCode = 1;
    }
}
if (require.main === module)
    main();
