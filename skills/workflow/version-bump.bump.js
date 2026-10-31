#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseVersion = parseVersion;
exports.bumpVersion = bumpVersion;
exports.findPackageJsons = findPackageJsons;
exports.readVersion = readVersion;
exports.writeVersion = writeVersion;
exports.changelogBlock = changelogBlock;
exports.insertChangelog = insertChangelog;
exports.planPackage = planPackage;
exports.applyPlan = applyPlan;
// Mechanical half of the version-bump skill: bump package.json version(s) and insert the matching
// CHANGELOG.md entry, per coding-standards/versioning-standards.md. Plain Node, no dependencies.
//
//   node bump.js <major|feature|patch|alpha|beta|rc|release> [scope] [options]
//
// scope: a directory (bumps every package.json found under it, each independently, skipping
//   node_modules and dotdirs) or a direct path to one package.json. Defaults to cwd -- so the base
//   command with no scope bumps every package in the project; a subfolder scopes to a group; a
//   package.json path scopes to one package.
//
// options:
//   --added/--changed/--fixed/--removed <text>   repeatable; become CHANGELOG bullets (RULE V-08)
//   --no-changelog                                skip the changelog requirement/insertion
//   --for <major|feature|patch>                   base bump to compute before starting -alpha/-beta/-rc.1
//   --force                                        allow a prerelease stage to move backward
//   --date YYYY-MM-DD                              override today's date
//   --dry-run                                      compute and print, write nothing
//   --json                                         machine-readable output
const fs = require("node:fs");
const path = require("node:path");
const STAGE_RANK = { alpha: 1, beta: 2, rc: 3 };
const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?$/;
function parseVersion(v) {
    const m = VERSION_RE.exec(v.trim());
    if (!m)
        return null;
    const out = { major: Number(m[1]), feature: Number(m[2]), patch: Number(m[3]) };
    if (m[4])
        out.pre = { stage: m[4], num: Number(m[5]) };
    return out;
}
const fmtBase = (major, feature, patch) => `${major}.${feature}.${patch}`;
function bumpVersion(current, bump, opts = {}) {
    const v = parseVersion(current);
    if (!v)
        throw new Error(`current version "${current}" is not [major].[feature].[patch] (optionally -alpha|beta|rc.N)`);
    if (bump === 'major')
        return fmtBase(v.major + 1, 0, 0);
    if (bump === 'feature')
        return fmtBase(v.major, v.feature + 1, 0);
    if (bump === 'patch')
        return fmtBase(v.major, v.feature, v.patch + 1);
    const base = fmtBase(v.major, v.feature, v.patch);
    if (bump === 'release') {
        if (!v.pre)
            throw new Error(`${current} has no prerelease suffix to release`);
        return base;
    }
    const stage = bump;
    if (v.pre) {
        if (v.pre.stage === stage)
            return `${base}-${stage}.${v.pre.num + 1}`;
        if (STAGE_RANK[stage] < STAGE_RANK[v.pre.stage] && !opts.force) {
            throw new Error(`cannot move from -${v.pre.stage} back to -${stage} without --force`);
        }
        return `${base}-${stage}.1`;
    }
    if (!opts.for)
        throw new Error(`${current} has no prerelease; pass --for major|feature|patch to start -${stage}.1`);
    return `${bumpVersion(current, opts.for)}-${stage}.1`;
}
// ---- package discovery ----
function findPackageJsons(scopePath) {
    const abs = path.resolve(scopePath);
    const st = fs.statSync(abs);
    if (st.isFile()) {
        if (path.basename(abs) !== 'package.json')
            throw new Error(`${abs} is not a package.json`);
        return [abs];
    }
    const out = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules')
                continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory())
                walk(full);
            else if (entry.name === 'package.json')
                out.push(full);
        }
    };
    walk(abs);
    return out.sort();
}
function readVersion(pkgPath) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (typeof pkg.version !== 'string')
        throw new Error(`${pkgPath} has no top-level "version" string`);
    return pkg.version;
}
// Regex substitution (not JSON.parse + stringify) so the file's own formatting survives untouched.
function writeVersion(pkgPath, oldVersion, newVersion) {
    const text = fs.readFileSync(pkgPath, 'utf8');
    const re = new RegExp(`"version"\\s*:\\s*"${oldVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`);
    if (!re.test(text))
        throw new Error(`${pkgPath}: could not find a literal "version": "${oldVersion}" to replace`);
    fs.writeFileSync(pkgPath, text.replace(re, `"version": "${newVersion}"`));
}
const HEADINGS = [['Added', 'added'], ['Changed', 'changed'], ['Fixed', 'fixed'], ['Removed', 'removed']];
function changelogBlock(version, date, entries) {
    const lines = [`## [${version}] — ${date}`];
    for (const [heading, key] of HEADINGS) {
        const items = entries[key];
        if (items && items.length) {
            lines.push('', `### ${heading}`);
            for (const item of items)
                lines.push(`- ${item}`);
        }
    }
    return lines.join('\n');
}
function insertChangelog(changelogPath, block) {
    const text = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : '# Changelog\n';
    const lines = text.split('\n');
    let headerEnd = 0;
    if (lines[0] && lines[0].startsWith('# ')) {
        headerEnd = 1;
        while (headerEnd < lines.length && lines[headerEnd].trim() === '')
            headerEnd++;
    }
    const before = lines.slice(0, headerEnd).join('\n').replace(/\n+$/, '');
    const after = lines.slice(headerEnd).join('\n');
    const result = `${before}\n\n${block}\n\n${after}`.replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '\n');
    fs.writeFileSync(changelogPath, result);
}
function planPackage(pkgPath, bump, opts) {
    const dir = path.dirname(pkgPath);
    const oldVersion = readVersion(pkgPath);
    const newVersion = bumpVersion(oldVersion, bump, opts);
    const changelogPath = path.join(dir, 'CHANGELOG.md');
    return { pkgPath, dir, oldVersion, newVersion, changelogPath, changelogExists: fs.existsSync(changelogPath) };
}
function applyPlan(plan, date, entries, skipChangelog) {
    writeVersion(plan.pkgPath, plan.oldVersion, plan.newVersion);
    if (skipChangelog || !plan.changelogExists)
        return { changelogWritten: false };
    insertChangelog(plan.changelogPath, changelogBlock(plan.newVersion, date, entries));
    return { changelogWritten: true };
}
function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function main() {
    const a = process.argv.slice(2);
    const bump = a[0];
    if (!bump || !['major', 'feature', 'patch', 'alpha', 'beta', 'rc', 'release'].includes(bump)) {
        console.error('usage: bump.js <major|feature|patch|alpha|beta|rc|release> [scope] [options]');
        process.exitCode = 1;
        return;
    }
    let scope = '.';
    const entries = { added: [], changed: [], fixed: [], removed: [] };
    const opts = {};
    let date = todayISO();
    let dryRun = false;
    let json = false;
    let noChangelog = false;
    for (let i = 1; i < a.length; i++) {
        const k = a[i];
        if (k === '--added')
            entries.added.push(a[++i]);
        else if (k === '--changed')
            entries.changed.push(a[++i]);
        else if (k === '--fixed')
            entries.fixed.push(a[++i]);
        else if (k === '--removed')
            entries.removed.push(a[++i]);
        else if (k === '--for')
            opts.for = a[++i];
        else if (k === '--force')
            opts.force = true;
        else if (k === '--date')
            date = a[++i];
        else if (k === '--dry-run')
            dryRun = true;
        else if (k === '--json')
            json = true;
        else if (k === '--no-changelog')
            noChangelog = true;
        else if (!k.startsWith('--'))
            scope = k;
    }
    const hasEntries = Object.values(entries).some((v) => v && v.length);
    if (!noChangelog && !hasEntries) {
        console.error('no --added/--changed/--fixed/--removed given (RULE V-08 requires a changelog entry); pass one or use --no-changelog');
        process.exitCode = 1;
        return;
    }
    let pkgPaths;
    try {
        pkgPaths = findPackageJsons(scope);
    }
    catch (e) {
        console.error(`${e.message}`);
        process.exitCode = 1;
        return;
    }
    if (!pkgPaths.length) {
        console.error(`no package.json found under ${path.resolve(scope)}`);
        process.exitCode = 1;
        return;
    }
    const results = [];
    for (const pkgPath of pkgPaths) {
        try {
            const plan = planPackage(pkgPath, bump, opts);
            if (dryRun)
                results.push({ plan, changelogWritten: !noChangelog && plan.changelogExists });
            else
                results.push({ plan, ...applyPlan(plan, date, entries, noChangelog) });
        }
        catch (e) {
            results.push({ pkgPath, error: e.message });
        }
    }
    const failed = results.filter((r) => 'error' in r);
    if (json) {
        console.log(JSON.stringify({ dryRun, results }, null, 2));
    }
    else {
        for (const r of results) {
            if ('error' in r) {
                console.log(`FAIL  ${r.pkgPath}: ${r.error}`);
                continue;
            }
            const rel = path.relative(process.cwd(), r.plan.pkgPath) || r.plan.pkgPath;
            const cl = noChangelog ? 'skipped (--no-changelog)' : r.plan.changelogExists ? (dryRun ? 'would update' : 'updated') : 'skipped (no CHANGELOG.md)';
            console.log(`${dryRun ? 'DRY-RUN ' : ''}${rel}: ${r.plan.oldVersion} -> ${r.plan.newVersion}  changelog: ${cl}`);
            if (!dryRun)
                console.log(`  suggested: git tag v${r.plan.newVersion}  (run from ${r.plan.dir}, after the push)`);
        }
    }
    if (failed.length)
        process.exitCode = 1;
}
if (require.main === module)
    main();
