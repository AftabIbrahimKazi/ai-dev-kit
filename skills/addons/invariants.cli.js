#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Script half of the invariants add-on: runs each project rule's check, then proves the check can fail by applying a
// small breaking edit (a mutation) and confirming the check goes red, then restores the file. A check that stays green
// under its own mutation is reported VACUOUS. Also reports rules whose covered files changed since they were last
// verified. No model is involved at any step. Plain Node, no dependencies, no network.
//
//   node cli.js [all]                                 run + probe + stale in one report (the /invariants default)
//   node cli.js run   [--file F] [--id ID] [--json]   run checks and mutations; exit 1 on FAIL, VACUOUS or BADMUTATION
//   node cli.js probe [--file F] [--target F] [--max N] [--json]
//                                                     auto-generate mutants (operator flips, flag and exit-code edits) of each
//                                                     covered .js file, run every rule covering it, list the survivors: places
//                                                     the rules are too thin. --max caps mutants per file (default 60). Survivors
//                                                     listed in invariants/probe-ignore.json as "file:line:op" are skipped. Exit 1
//                                                     on a survivor or a failing baseline.
//   node cli.js stale [--file F] [--json]           list rules whose covered files changed since `verified`; exit 1 if any
//   node cli.js stamp [--file F] [--id ID]            run, then record HEAD as `verified` for rules that fully passed
//   node cli.js check [--file F]                      validate the rules file only
// Rules file (default invariants/invariants.json): [{ id, rule, covers: [files], check: "cmd",
//   mutate?: { file, find, replace }, verified?: "<commit>" }]
// Exit codes: 0 ok, 1 problem found, 2 bad usage. It edits a covered file only for the length of one mutation run and
// always restores the original bytes (also on Ctrl-C; after a forced kill the next run restores them from <file>.invariants-bak). It writes the rules file only for `stamp`. Never commits or deletes.
const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");
const TIMEOUT_MS = 120000;
function parseArgs(argv) {
    const [cmd = '', ...rest] = argv;
    const flags = {};
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (!a.startsWith('--'))
            throw new Error('unexpected argument: ' + a);
        const key = a.slice(2);
        if (key === 'json')
            flags.json = true;
        else if (key === 'count')
            flags.count = true;
        else if (key === 'file' || key === 'id' || key === 'target' || key === 'max' || key === 'slice') {
            const v = rest[++i];
            if (v === undefined)
                throw new Error('--' + key + ' needs a value');
            flags[key] = v;
        }
        else
            throw new Error('unknown flag: ' + a);
    }
    return { cmd, flags };
}
function loadRules(file) {
    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    catch (e) {
        throw new Error('cannot read ' + file + ': ' + e.message);
    }
    if (!Array.isArray(raw))
        throw new Error(file + ' must be a JSON array of rules');
    const seen = new Set();
    for (const r of raw) {
        if (!r || typeof r.id !== 'string' || !r.id)
            throw new Error('every rule needs an id');
        if (seen.has(r.id))
            throw new Error('duplicate id ' + r.id);
        seen.add(r.id);
        if (typeof r.rule !== 'string' || !r.rule)
            throw new Error(r.id + ': missing rule sentence');
        if (typeof r.check !== 'string' || !r.check)
            throw new Error(r.id + ': missing check command');
        if (!Array.isArray(r.covers) || !r.covers.length)
            throw new Error(r.id + ': covers must list at least one file');
        if (r.mutate && (typeof r.mutate.file !== 'string' || typeof r.mutate.find !== 'string' || typeof r.mutate.replace !== 'string' || !r.mutate.find))
            throw new Error(r.id + ': mutate needs file, find and replace');
    }
    return raw;
}
function runCheck(cmd, cwd) {
    const r = cp.spawnSync(cmd, { cwd, shell: true, stdio: 'ignore', timeout: TIMEOUT_MS });
    return r.status === null ? 124 : r.status;
}
function evaluate(rule, root) {
    if (runCheck(rule.check, root) !== 0)
        return { id: rule.id, status: 'FAIL', note: 'check fails on the current code' };
    if (!rule.mutate)
        return { id: rule.id, status: 'UNPROVEN', note: 'passes, but no mutation proves it can fail' };
    const target = path.resolve(root, rule.mutate.file);
    let original;
    try {
        original = fs.readFileSync(target, 'utf8');
    }
    catch {
        return { id: rule.id, status: 'BADMUTATION', note: 'cannot read ' + rule.mutate.file };
    }
    const idx = original.indexOf(rule.mutate.find);
    if (idx < 0)
        return { id: rule.id, status: 'BADMUTATION', note: '"find" text not in ' + rule.mutate.file };
    const bak = target + '.invariants-bak'; // survives a forced kill (Windows skips signal handlers); the next run restores it
    fs.writeFileSync(bak, original);
    const restore = () => { fs.writeFileSync(target, original); try {
        fs.unlinkSync(bak);
    }
    catch { /* already gone */ } };
    const onSig = () => { restore(); process.exit(130); };
    process.once('SIGINT', onSig);
    process.once('SIGTERM', onSig);
    let code;
    try {
        fs.writeFileSync(target, original.slice(0, idx) + rule.mutate.replace + original.slice(idx + rule.mutate.find.length));
        code = runCheck(rule.check, root);
    }
    finally {
        restore();
        process.removeListener('SIGINT', onSig);
        process.removeListener('SIGTERM', onSig);
    }
    return code !== 0
        ? { id: rule.id, status: 'PASS', note: 'green on the code, red when broken' }
        : { id: rule.id, status: 'VACUOUS', note: 'still green with the code broken; the check proves nothing' };
}
function git(root, args) {
    const r = cp.spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    return r.status === 0 ? r.stdout.trim() : null;
}
const OPS = [
    { op: '=== to !==', re: /===/g, to: '!==' },
    { op: '!== to ===', re: /!==/g, to: '===' },
    { op: '>= to >', re: />=/g, to: '>' },
    { op: '<= to <', re: /<=/g, to: '<' },
    { op: '> to >=', re: /(?<![=>\-<])>(?![=>])/g, to: '>=' },
    { op: '< to <=', re: /(?<![<=\-!])<(?![<=])/g, to: '<=' },
    { op: '&& to ||', re: /&&/g, to: '||' },
    { op: '|| to &&', re: /\|\|/g, to: '&&' },
    { op: '+ to -', re: /(?<=\s)\+(?=\s)/g, to: '-' },
    { op: '- to +', re: /(?<=\s)-(?=\s)/g, to: '+' },
    { op: 'true to false', re: /\btrue\b/g, to: 'false' },
    { op: 'false to true', re: /\bfalse\b/g, to: 'true' },
    { op: '?? 0 to ?? 1', re: /\?\? 0\b/g, to: '?? 1' },
    { op: 'exit 0 to exit 1', re: /process\.exit\(0\)/g, to: 'process.exit(1)' },
    { op: 'exit 1 to exit 0', re: /process\.exit\(1\)/g, to: 'process.exit(0)' },
    { op: 'exit 2 to exit 1', re: /process\.exit\(2\)/g, to: 'process.exit(1)' },
];
// Index where code on this line stops (a // comment starts outside a string), and a per-index "inside a string" test.
function lineCode(line) {
    const inStr = [];
    let q = '';
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) {
            inStr[i] = true;
            if (ch === '\\') {
                i++;
                inStr[i] = true;
            }
            else if (ch === q)
                q = '';
        }
        else if (ch === '"' || ch === "'" || ch === '`') {
            q = ch;
            inStr[i] = true;
        }
        else if (ch === '/' && line[i + 1] === '/')
            return { end: i, inStr };
        else
            inStr[i] = false;
    }
    return { end: line.length, inStr };
}
// Regex literals on a line, so operators inside them (e.g. the < in /[*<>]/) are not mutated.
const REGEX_LIT = /(?:^|[(=,:|&!?{;]\s*)(\/(?![\/*])(?:[^\/\\\n[]|\\.|\[(?:[^\]\\\n]|\\.)*\])+\/[gimsuy]*)/g;
function markRegex(line, inStr) {
    REGEX_LIT.lastIndex = 0;
    let m;
    while ((m = REGEX_LIT.exec(line))) {
        const s = m.index + m[0].length - m[1].length;
        for (let i = s; i < s + m[1].length; i++)
            inStr[i] = true;
    }
}
function genMutants(src) {
    const out = [];
    let offset = 0;
    let helper = false; // tsc's emitted helper functions (var __createBinding = ... ) are not the project's own logic
    src.split('\n').forEach((line, n) => {
        if (/^var __\w+ = /.test(line))
            helper = true;
        else if (helper && /^\S/.test(line) && !line.startsWith('}'))
            helper = false;
        const t = line.trim();
        if (!helper && t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && !line.includes('__esModule') && !line.includes('sourceMappingURL')) {
            const { end, inStr } = lineCode(line);
            markRegex(line, inStr);
            for (const o of OPS) {
                o.re.lastIndex = 0;
                let m;
                while ((m = o.re.exec(line))) {
                    if (m.index >= end)
                        break;
                    if (!inStr[m.index])
                        out.push({ line: n + 1, op: o.op, from: m[0], to: o.to, start: offset + m.index, end: offset + m.index + m[0].length });
                }
            }
        }
        offset += line.length + 1;
    });
    return out.sort((a, b) => a.start - b.start);
}
function probeFile(rel, rules, root, max, ignore, slice = [0, 1], countOnly = false) {
    const target = path.resolve(root, rel);
    const mine = rules.filter(r => r.covers.some(c => path.resolve(root, c) === target));
    const res = { file: rel, baselineOk: true, total: 0, killed: 0, invalid: 0, ignored: 0, survivors: [] };
    if (!countOnly && mine.some(r => runCheck(r.check, root) !== 0)) {
        res.baselineOk = false;
        return res;
    }
    const original = fs.readFileSync(target, 'utf8');
    let all = genMutants(original);
    if (all.length > max)
        all = Array.from({ length: max }, (_, i) => all[Math.floor(i * all.length / max)]);
    if (slice[1] > 1)
        all = all.filter((_, i) => i % slice[1] === slice[0]);
    res.total = all.length;
    if (countOnly)
        return res;
    const bak = target + '.invariants-bak'; // survives a forced kill (Windows skips signal handlers); the next run restores it
    fs.writeFileSync(bak, original);
    const restore = () => { fs.writeFileSync(target, original); try {
        fs.unlinkSync(bak);
    }
    catch { /* already gone */ } };
    const onSig = () => { restore(); process.exit(130); };
    process.once('SIGINT', onSig);
    process.once('SIGTERM', onSig);
    try {
        for (const m of all) {
            fs.writeFileSync(target, original.slice(0, m.start) + m.to + original.slice(m.end));
            if (cp.spawnSync(process.execPath, ['--check', target], { stdio: 'ignore' }).status !== 0) {
                res.invalid++;
                continue;
            }
            if (mine.some(r => runCheck(r.check, root) !== 0)) {
                res.killed++;
                continue;
            }
            if (ignore.has(rel + ':' + m.line + ':' + m.op)) {
                res.ignored++;
                continue;
            }
            res.survivors.push({ line: m.line, op: m.op, from: m.from, to: m.to });
        }
    }
    finally {
        restore();
        process.removeListener('SIGINT', onSig);
        process.removeListener('SIGTERM', onSig);
    }
    return res;
}
function probe(rules, root, flags) {
    const max = typeof flags.max === 'string' ? Number(flags.max) : 60;
    if (!Number.isInteger(max) || max < 1)
        throw new Error('--max must be a whole number of 1 or more');
    let files = [...new Set(rules.flatMap(r => r.covers).filter(c => /\.(c|m)?js$/.test(c)))];
    if (typeof flags.target === 'string')
        files = files.filter(f => path.resolve(root, f) === path.resolve(root, flags.target));
    const slice = typeof flags.slice === 'string' ? flags.slice.split('/').map(Number) : [0, 1];
    if (slice.length !== 2 || !Number.isInteger(slice[0]) || !Number.isInteger(slice[1]) || slice[1] < 1 || slice[0] < 0 || slice[0] >= slice[1])
        throw new Error('--slice must look like 0/4');
    let ignore = new Set();
    const ig = path.join(root, 'invariants/probe-ignore.json');
    if (fs.existsSync(ig))
        ignore = new Set(JSON.parse(fs.readFileSync(ig, 'utf8')));
    const out = files.map(f => probeFile(f, rules, root, max, ignore, slice, flags.count === true));
    return { out, bad: out.some(f => !f.baselineOk || f.survivors.length > 0) };
}
function printProbe(out, json) {
    if (json) {
        console.log(JSON.stringify(out, null, 2));
        return;
    }
    for (const f of out) {
        if (!f.baselineOk) {
            console.log(f.file + ': a rule fails on the current code, fix it first');
            continue;
        }
        console.log(f.file + ': ' + f.total + ' mutants, ' + f.killed + ' killed, ' + f.survivors.length + ' survived, ' + f.invalid + ' invalid' + (f.ignored ? ', ' + f.ignored + ' ignored' : ''));
        for (const s of f.survivors)
            console.log('  SURVIVED ' + f.file + ':' + s.line + '  ' + s.op + '  (' + s.from + ' -> ' + s.to + ')');
    }
}
// A run killed mid-mutation leaves <file>.invariants-bak with the original bytes: put them back before doing anything else.
function recover(rules, root) {
    const files = new Set(rules.flatMap(r => [...r.covers, ...(r.mutate ? [r.mutate.file] : [])]));
    for (const f of files) {
        const target = path.resolve(root, f), bak = target + '.invariants-bak';
        if (fs.existsSync(bak)) {
            fs.copyFileSync(bak, target);
            fs.unlinkSync(bak);
            console.error('recovered ' + f + ' from an interrupted run');
        }
    }
}
function staleRules(rules, root) {
    const head = git(root, ['rev-parse', 'HEAD']);
    return rules.map((r) => {
        if (!r.verified)
            return { id: r.id, status: 'FAIL', note: 'never verified' };
        if (!head)
            return { id: r.id, status: 'FAIL', note: 'not a git repo, cannot compare' };
        const committed = git(root, ['diff', '--name-only', r.verified, 'HEAD', '--', ...r.covers]);
        const dirty = git(root, ['status', '--porcelain', '--', ...r.covers]);
        if (committed === null)
            return { id: r.id, status: 'FAIL', note: 'verified commit ' + r.verified + ' not found' };
        const changed = [committed, dirty ? dirty.split('\n').map(l => l.replace(/^\s*\S+\s+/, '')).join('\n') : ''].filter(Boolean).join('\n');
        return changed ? { id: r.id, status: 'FAIL', note: 'stale: ' + changed.split('\n').join(', ') } : { id: r.id, status: 'PASS', note: 'covered files unchanged since verified' };
    });
}
function print(results, json) {
    if (json) {
        console.log(JSON.stringify(results, null, 2));
        return;
    }
    for (const r of results)
        console.log(r.status.padEnd(12) + r.id + '  ' + r.note);
}
function main() {
    let parsed;
    try {
        parsed = parseArgs(process.argv.slice(2));
    }
    catch (e) {
        console.error(e.message);
        return 2;
    }
    const { flags } = parsed;
    const cmd = parsed.cmd || 'all';
    if (!['all', 'run', 'stale', 'stamp', 'check', 'probe'].includes(cmd)) {
        console.error('usage: invariants [all|run|probe|stale|stamp|check] [--file F] [--id ID] [--target F] [--max N] [--json]');
        return 2;
    }
    const file = path.resolve(typeof flags.file === 'string' ? flags.file : 'invariants/invariants.json');
    const root = process.cwd();
    let rules;
    try {
        rules = loadRules(file);
    }
    catch (e) {
        console.error(e.message);
        return 1;
    }
    if (cmd !== 'check')
        recover(rules, root);
    if (typeof flags.id === 'string') {
        rules = rules.filter(r => r.id === flags.id);
        if (!rules.length) {
            console.error('no rule with id ' + flags.id);
            return 1;
        }
    }
    const json = flags.json === true;
    if (cmd === 'check') {
        console.log(rules.length + ' rule(s) valid');
        return 0;
    }
    if (cmd === 'stale') {
        const res = staleRules(rules, root);
        print(res, json);
        return res.some(r => r.status === 'FAIL') ? 1 : 0;
    }
    if (cmd === 'all') { // one command: prove the rules, probe for thin spots, flag stale rules
        const res = rules.map(r => evaluate(r, root));
        console.log('== rules');
        print(res, false);
        let bad = res.some(r => r.status === 'FAIL' || r.status === 'VACUOUS' || r.status === 'BADMUTATION');
        try {
            const p = probe(rules, root, flags);
            console.log('== probe');
            printProbe(p.out, false);
            bad = bad || p.bad;
        }
        catch (e) {
            console.error(e.message);
            return 2;
        }
        const st = staleRules(rules, root);
        console.log('== stale');
        print(st, false);
        return bad || st.some(r => r.status === 'FAIL') ? 1 : 0;
    }
    if (cmd === 'probe') {
        try {
            const p = probe(rules, root, flags);
            printProbe(p.out, json);
            return p.bad ? 1 : 0;
        }
        catch (e) {
            console.error(e.message);
            return 2;
        }
    }
    const results = rules.map(r => evaluate(r, root));
    print(results, json);
    if (cmd === 'stamp') {
        const head = git(root, ['rev-parse', 'HEAD']);
        if (!head) {
            console.error('stamp needs a git repo');
            return 1;
        }
        const all = loadRules(file);
        for (const res of results)
            if (res.status === 'PASS') {
                const r = all.find(x => x.id === res.id);
                if (r)
                    r.verified = head;
            }
        fs.writeFileSync(file, JSON.stringify(all, null, '\t') + '\n');
    }
    return results.some(r => r.status === 'FAIL' || r.status === 'VACUOUS' || r.status === 'BADMUTATION') ? 1 : 0;
}
if (require.main === module)
    process.exit(main());
module.exports = { loadRules, evaluate, staleRules };
