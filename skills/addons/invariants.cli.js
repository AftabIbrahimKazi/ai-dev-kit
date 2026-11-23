#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Script half of the invariants add-on: runs each project rule's check, then proves the check can fail by applying a
// small breaking edit (a mutation) and confirming the check goes red, then restores the file. A check that stays green
// under its own mutation is reported VACUOUS. Also reports rules whose covered files changed since they were last
// verified. No model is involved at any step. Plain Node, no dependencies, no network.
//
//   node cli.js run   [--file F] [--id ID] [--json]   run checks and mutations; exit 1 on FAIL, VACUOUS or BADMUTATION
//   node cli.js stale [--file F] [--json]             list rules whose covered files changed since `verified`; exit 1 if any
//   node cli.js stamp [--file F] [--id ID]            run, then record HEAD as `verified` for rules that fully passed
//   node cli.js check [--file F]                      validate the rules file only
// Rules file (default invariants/invariants.json): [{ id, rule, covers: [files], check: "cmd",
//   mutate?: { file, find, replace }, verified?: "<commit>" }]
// Exit codes: 0 ok, 1 problem found, 2 bad usage. It edits a covered file only for the length of one mutation run and
// always restores the original bytes (also on Ctrl-C). It writes the rules file only for `stamp`. Never commits or deletes.
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
        else if (key === 'file' || key === 'id') {
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
    const restore = () => fs.writeFileSync(target, original);
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
    const { cmd, flags } = parsed;
    if (!['run', 'stale', 'stamp', 'check'].includes(cmd)) {
        console.error('usage: invariants <run|stale|stamp|check> [--file F] [--id ID] [--json]');
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
