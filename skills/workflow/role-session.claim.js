"use strict";
// Lane mechanics for role-session, done by script: the atomic claim (mkdir), key encoding, owner files, status
// changes, the @git token, role ownership and the stale check. The model passes arguments and reads one line back.
// Plain Node, no dependencies. Run from the project root, or pass --root <project>.
//
//   node role-session.claim.js id <tool>                            new session id, e.g. claude-a3f9
//   node role-session.claim.js role <session> <role>                take @role__<role> (one live session per role)
//   node role-session.claim.js free <path...>                       pre-check: is every path unclaimed?
//   node role-session.claim.js claim <session> <role> "<task>" <path...>   claim all paths or none
//   node role-session.claim.js status <session> editing|awaiting-review     rewrite status on your claims
//   node role-session.claim.js release <session> [--role]           release your claims (and @role__ with --role)
//   node role-session.claim.js git take|release <session>           the commit token
//   node role-session.claim.js list [--stale-hours 8] [--json]      every claim, age, suspect flag
//   node role-session.claim.js key <path>                           print the lock key for a path
//
// Exit 0 = done; 1 = refused (held by another session, or bad input). It never edits a claim it does not own.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.STATUSES = void 0;
exports.keyFor = keyFor;
exports.locksDir = locksDir;
exports.parseOwner = parseOwner;
exports.formatOwner = formatOwner;
exports.readOwner = readOwner;
exports.take = take;
exports.drop = drop;
exports.claimAll = claimAll;
exports.mine = mine;
exports.list = list;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const crypto = __importStar(require("node:crypto"));
exports.STATUSES = ['editing', 'awaiting-review'];
// % -> %25, _ -> %5F, @ -> %40, then / and \ -> __ ; a raw "__" can then only be a separator.
function keyFor(p) {
    return p.replace(/^\.\//, '').replace(/%/g, '%25').replace(/_/g, '%5F').replace(/@/g, '%40').replace(/[\\/]+/g, '__');
}
function locksDir(root) { return path.join(root, 'handover', 'locks.d'); }
function parseOwner(text) {
    const p = text.trim().split('|').map((s) => s.trim());
    if (p.length < 5)
        return null;
    return { session: p[0], role: p[1], task: p[2], status: p[3], claimed: p.slice(4).join('|') };
}
function formatOwner(o) {
    return [o.session, o.role, o.task.replace(/\|/g, '/'), o.status, o.claimed].join(' | ') + '\n';
}
function readOwner(dir) {
    try {
        return parseOwner(fs.readFileSync(path.join(dir, 'owner'), 'utf8'));
    }
    catch {
        return null;
    }
}
// mkdir without recursion is the atomic step: it succeeds for exactly one session.
function take(root, key, o) {
    const dir = path.join(locksDir(root), key);
    try {
        fs.mkdirSync(dir);
    }
    catch (e) {
        if (e.code === 'EEXIST')
            return { ok: false, heldBy: readOwner(dir) };
        throw e;
    }
    fs.writeFileSync(path.join(dir, 'owner'), formatOwner(o));
    return { ok: true };
}
function drop(root, key) {
    const dir = path.join(locksDir(root), key);
    try {
        fs.rmSync(path.join(dir, 'owner'), { force: true });
        fs.rmdirSync(dir);
    }
    catch { /* already gone */ }
}
function claimAll(root, session, role, task, paths) {
    const taken = [];
    const now = new Date().toISOString();
    for (const p of paths) {
        const key = keyFor(p);
        const r = take(root, key, { session, role, task, status: 'editing', claimed: now });
        if (!r.ok) {
            for (const k of taken)
                drop(root, k);
            return { ok: false, taken: [], blocked: { path: p, heldBy: r.heldBy } };
        }
        taken.push(key);
    }
    return { ok: true, taken };
}
function mine(root, session) {
    const d = locksDir(root);
    if (!fs.existsSync(d))
        return [];
    return fs.readdirSync(d).filter((k) => readOwner(path.join(d, k))?.session === session);
}
function list(root, staleHours, nowMs = Date.now()) {
    const d = locksDir(root);
    if (!fs.existsSync(d))
        return [];
    return fs.readdirSync(d).sort().map((key) => {
        const owner = readOwner(path.join(d, key));
        const t = owner ? Date.parse(owner.claimed) : NaN;
        const ageHours = Number.isFinite(t) ? Math.max(0, (nowMs - t) / 3600000) : Infinity;
        return { key, owner, ageHours, suspect: !owner || ageHours >= staleHours };
    });
}
function findRoot(start) {
    let d = path.resolve(start);
    for (;;) {
        if (fs.existsSync(path.join(d, 'handover', 'locks.d')))
            return d;
        const up = path.dirname(d);
        if (up === d)
            return path.resolve(start);
        d = up;
    }
}
function die(msg) { console.error(msg); process.exit(1); }
function main() {
    const argv = process.argv.slice(2);
    const ri = argv.indexOf('--root');
    const rootArg = ri >= 0 ? argv.splice(ri, 2)[1] : undefined;
    const sh = argv.indexOf('--stale-hours');
    const stale = sh >= 0 ? Number(argv.splice(sh, 2)[1]) || 8 : 8;
    const json = argv.includes('--json');
    const withRole = argv.includes('--role');
    const args = argv.filter((a) => a !== '--json' && a !== '--role');
    const cmd = args.shift();
    const root = rootArg ? path.resolve(rootArg) : findRoot(process.cwd());
    const needLocks = () => { if (!fs.existsSync(locksDir(root)))
        die(`No handover/locks.d in ${root}. Parallel mode is off; the user activates it.`); };
    if (cmd === 'id') {
        console.log(`${args[0] || 'claude'}-${crypto.randomBytes(2).toString('hex')}`);
        return;
    }
    if (cmd === 'key') {
        if (!args[0])
            die('usage: key <path>');
        console.log(keyFor(args[0]));
        return;
    }
    needLocks();
    if (cmd === 'role') {
        const [session, role] = args;
        if (!session || !role)
            die('usage: role <session> <role>');
        const r = take(root, `@role__${role}`, { session, role, task: '-', status: 'editing', claimed: new Date().toISOString() });
        if (!r.ok)
            die(`Role ${role} is held by ${r.heldBy?.session ?? 'an unknown session'}. Take another role, or ask the user to confirm that session is dead.`);
        console.log(`role ${role} taken by ${session}`);
        return;
    }
    if (cmd === 'free') {
        const busy = args.filter((p) => fs.existsSync(path.join(locksDir(root), keyFor(p))));
        if (busy.length) {
            for (const p of busy) {
                const o = readOwner(path.join(locksDir(root), keyFor(p)));
                console.log(`LOCKED ${p} by ${o?.session ?? '?'} (${o?.role ?? '?'}, ${o?.status ?? '?'})`);
            }
            process.exit(1);
        }
        console.log(`free: ${args.length} path(s)`);
        return;
    }
    if (cmd === 'claim') {
        const [session, role, task, ...paths] = args;
        if (!session || !role || !task || !paths.length)
            die('usage: claim <session> <role> "<task>" <path...>');
        const r = claimAll(root, session, role, task, paths);
        if (!r.ok) {
            const b = r.blocked;
            die(`Blocked: ${b.path} is held by ${b.heldBy?.session ?? '?'} (${b.heldBy?.role ?? '?'}, ${b.heldBy?.status ?? '?'}). Nothing was claimed. Tell the user and wait.`);
        }
        console.log(`claimed ${r.taken.length}: ${paths.join(', ')}`);
        return;
    }
    if (cmd === 'status') {
        const [session, status] = args;
        if (!session || !exports.STATUSES.includes(status))
            die('usage: status <session> editing|awaiting-review');
        const keys = mine(root, session).filter((k) => !k.startsWith('@'));
        for (const k of keys) {
            const d = path.join(locksDir(root), k);
            const o = readOwner(d);
            fs.writeFileSync(path.join(d, 'owner'), formatOwner({ ...o, status }));
        }
        console.log(`${keys.length} claim(s) now ${status}`);
        return;
    }
    if (cmd === 'release') {
        const [session] = args;
        if (!session)
            die('usage: release <session> [--role]');
        const keys = mine(root, session).filter((k) => withRole || !k.startsWith('@role__'));
        const kept = keys.filter((k) => k === '@git');
        for (const k of keys)
            drop(root, k);
        console.log(`released ${keys.length}${kept.length ? ' (including the @git token)' : ''}`);
        return;
    }
    if (cmd === 'git') {
        const [sub, session] = args;
        if (!session || (sub !== 'take' && sub !== 'release'))
            die('usage: git take|release <session>');
        if (sub === 'take') {
            const r = take(root, '@git', { session, role: '-', task: 'commit', status: 'editing', claimed: new Date().toISOString() });
            if (!r.ok)
                die(`@git is held by ${r.heldBy?.session ?? '?'}. Someone else is committing: wait and retry.`);
            console.log('git token taken. Stage only your claimed files; release right after the commit.');
            return;
        }
        const o = readOwner(path.join(locksDir(root), '@git'));
        if (o && o.session !== session)
            die(`@git belongs to ${o.session}, not you.`);
        drop(root, '@git');
        console.log('git token released');
        return;
    }
    if (cmd === 'list') {
        const rows = list(root, stale);
        if (json) {
            console.log(JSON.stringify(rows, null, 2));
            return;
        }
        if (!rows.length) {
            console.log('no claims');
            return;
        }
        for (const r of rows)
            console.log(`${r.suspect ? 'SUSPECT ' : ''}${r.key} | ${r.owner ? `${r.owner.session} | ${r.owner.role} | ${r.owner.status} | ${Number.isFinite(r.ageHours) ? r.ageHours.toFixed(1) + 'h' : 'no owner file'}` : 'no owner file'}`);
        return;
    }
    die('commands: id, role, free, claim, status, release, git, list, key');
}
if (require.main === module)
    main();
