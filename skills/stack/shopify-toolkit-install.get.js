#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TELEMETRY = exports.SOURCE = void 0;
exports.skillRootFor = skillRootFor;
exports.clone = clone;
exports.sessionFile = sessionFile;
exports.writeNote = writeNote;
exports.install = install;
exports.status = status;
// Mechanical half of the shopify-toolkit-install skill: shallow-clone Shopify's toolkit to a scratch folder, copy the
// chosen skill folders into the project's skill root, write the snapshot note, print the telemetry notice. The model
// still confirms scope (Step 1) and asks about the telemetry opt-out (Step 4); this script never applies the opt-out.
//
//   node get.js list     [--source URL]                            skill folders available upstream (clones to scratch)
//   node get.js install  --root <project> [--skills a,b] [--skill-root .claude/skills] [--source URL] [--dry-run] [--force] [--json]
//   node get.js status   --root <project> [--skill-root ...]        shopify-* skills present and their recorded commit
//
// Needs git and network for list and install. Never copies into this kit, never edits a pulled skill, never writes a
// hook. Exit codes: 0 done, 1 error, 2 bad usage, 3 git missing.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");
const { spawnSync } = childProcess;
exports.SOURCE = 'https://github.com/Shopify/Shopify-AI-Toolkit.git';
const NOTE_START = '<!-- shopify-toolkit:start -->';
const NOTE_END = '<!-- shopify-toolkit:end -->';
exports.TELEMETRY = 'Telemetry: the toolkit\'s scripts send usage data (queries, code, model ids) to shopify.dev by default. Opt out with OPT_OUT_INSTRUMENTATION=true or an empty file at ~/.config/shopify-ai-toolkit/opt-out. Ask the user before applying either; this script applies neither.';
function skillRootFor(root, given) {
    if (given)
        return given;
    const manifest = path.join(root, '.ai-dev-kit.json');
    if (fs.existsSync(manifest)) {
        try {
            const m = JSON.parse(fs.readFileSync(manifest, 'utf8'));
            if (m.skillRoot)
                return m.skillRoot;
        }
        catch { /* fall through */ }
    }
    if (fs.existsSync(path.join(root, '.opencode')))
        return '.opencode/skills';
    if (fs.existsSync(path.join(root, '.agents')))
        return '.agents/skills';
    return '.claude/skills';
}
function git(args, cwd) {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 120000 });
    return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim(), enoent: r.error?.code === 'ENOENT' };
}
function clone(source) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopify-toolkit-'));
    const r = git(['clone', '--depth', '1', '--quiet', source, dir]);
    if (r.enoent) {
        const e = new Error('git is not installed or not on PATH');
        e.code = 3;
        throw e;
    }
    if (!r.ok)
        throw new Error('clone failed: ' + (r.err.split('\n').pop() || 'unknown') + ' (check the URL and your network)');
    const commit = git(['rev-parse', '--short', 'HEAD'], dir).out;
    const skillsDir = path.join(dir, 'skills');
    if (!fs.existsSync(skillsDir))
        throw new Error('no skills/ folder in the clone: the upstream layout moved; update the skill\'s Source line');
    const skills = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(skillsDir, e.name, 'SKILL.md'))).map((e) => e.name).sort();
    return { dir, commit, skills };
}
function copyDir(src, dst) {
    let n = 0;
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, e.name), d = path.join(dst, e.name);
        if (e.isDirectory())
            n += copyDir(s, d);
        else {
            fs.copyFileSync(s, d);
            n++;
        }
    }
    return n;
}
function sessionFile(root) {
    for (const f of ['CLAUDE.md', 'AGENTS.md'])
        if (fs.existsSync(path.join(root, f)))
            return path.join(root, f);
    return path.join(root, 'AGENTS.md');
}
function writeNote(root, skills, commit, dryRun) {
    const file = sessionFile(root);
    const note = `${NOTE_START}\n## Shopify AI Toolkit skills\nShopify-authored, pulled by the shopify-toolkit-install skill (${exports.SOURCE}, commit ${commit}): ${skills.join(', ')}. Not hand-edited; re-run that skill to refresh.\n${NOTE_END}\n`;
    const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const re = new RegExp(NOTE_START.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '[\\s\\S]*?' + NOTE_END.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '\\n?');
    const text = re.test(old) ? old.replace(re, note) : old + (old && !old.endsWith('\n') ? '\n' : '') + (old ? '\n' : '') + note;
    if (!dryRun)
        fs.writeFileSync(file, text);
    return path.relative(root, file);
}
function install(root, opt) {
    if (fs.existsSync(path.join(root, 'skills', 'meta', 'install-kit.md')))
        throw new Error('refusing: ' + root + ' is the ai-dev-kit library itself; Shopify files are never copied into the kit');
    const c = clone(opt.source ?? exports.SOURCE);
    try {
        const wanted = opt.skills?.length ? opt.skills : c.skills;
        const missing = wanted.filter((s) => !c.skills.includes(s));
        const relRoot = skillRootFor(root, opt.skillRoot);
        const absRoot = path.join(root, relRoot);
        const installed = [], skipped = [];
        for (const s of wanted.filter((x) => c.skills.includes(x))) {
            const dst = path.join(absRoot, s);
            if (fs.existsSync(dst) && !opt.force) {
                skipped.push(s);
                continue;
            }
            if (!opt.dryRun) {
                fs.rmSync(dst, { recursive: true, force: true });
                copyDir(path.join(c.dir, 'skills', s), dst);
            }
            installed.push(s);
        }
        const all = [...new Set([...installed, ...skipped])].sort();
        const note = all.length ? writeNote(root, all, c.commit, !!opt.dryRun) : '';
        return { installed, skipped, missing, commit: c.commit, note, skillRoot: relRoot, telemetry: exports.TELEMETRY };
    }
    finally {
        fs.rmSync(c.dir, { recursive: true, force: true });
    }
}
function status(root, skillRoot) {
    const relRoot = skillRootFor(root, skillRoot);
    const abs = path.join(root, relRoot);
    const present = fs.existsSync(abs) ? fs.readdirSync(abs).filter((n) => n.startsWith('shopify-') && fs.existsSync(path.join(abs, n, 'SKILL.md'))).sort() : [];
    const sf = sessionFile(root);
    const m = fs.existsSync(sf) ? /commit ([0-9a-f]{6,})\)/.exec(fs.readFileSync(sf, 'utf8')) : null;
    return { skillRoot: relRoot, present, commit: m ? m[1] : null };
}
function main() {
    const [cmd, ...rest] = process.argv.slice(2);
    const a = { dryRun: false, force: false, json: false };
    let ok = cmd === 'list' || cmd === 'install' || cmd === 'status';
    for (let i = 0; i < rest.length && ok; i++) {
        const f = rest[i];
        if (f === '--root')
            a.root = path.resolve(rest[++i] ?? '');
        else if (f === '--skills')
            a.skills = (rest[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        else if (f === '--skill-root')
            a.skillRoot = rest[++i];
        else if (f === '--source')
            a.source = rest[++i];
        else if (f === '--dry-run')
            a.dryRun = true;
        else if (f === '--force')
            a.force = true;
        else if (f === '--json')
            a.json = true;
        else
            ok = false;
    }
    if ((cmd === 'install' || cmd === 'status') && !a.root)
        ok = false;
    if (!ok) {
        console.error('usage: get.js list [--source URL] | install --root <project> [--skills a,b] [--skill-root DIR] [--dry-run] [--force] [--json] | status --root <project>');
        process.exitCode = 2;
        return;
    }
    try {
        if (cmd === 'list') {
            const c = clone(a.source ?? exports.SOURCE);
            fs.rmSync(c.dir, { recursive: true, force: true });
            if (a.json)
                console.log(JSON.stringify({ commit: c.commit, skills: c.skills }));
            else {
                console.log(`upstream commit ${c.commit}, ${c.skills.length} skills:`);
                for (const s of c.skills)
                    console.log('  ' + s);
            }
            return;
        }
        if (cmd === 'status') {
            const s = status(a.root, a.skillRoot);
            if (a.json)
                console.log(JSON.stringify(s));
            else
                console.log(s.present.length ? `${s.present.length} Shopify skills in ${s.skillRoot} (commit ${s.commit ?? 'unrecorded'}): ${s.present.join(', ')}` : `no shopify-* skills in ${s.skillRoot}`);
            return;
        }
        const r = install(a.root, a);
        if (a.json) {
            console.log(JSON.stringify(r));
            return;
        }
        const v = a.dryRun ? 'would install' : 'installed';
        console.log(`${v} ${r.installed.length} skills into ${r.skillRoot} (upstream ${r.commit}): ${r.installed.join(', ') || '-'}`);
        if (r.skipped.length)
            console.log(`kept ${r.skipped.join(', ')} (already present; --force replaces)`);
        if (r.missing.length)
            console.log(`not upstream: ${r.missing.join(', ')}`);
        if (r.note)
            console.log(`${a.dryRun ? 'would note' : 'noted'} the snapshot in ${r.note}`);
        console.log(r.telemetry);
    }
    catch (e) {
        const err = e;
        console.error('error: ' + err.message);
        process.exitCode = err.code === 3 ? 3 : 1;
    }
}
if (require.main === module)
    main();
