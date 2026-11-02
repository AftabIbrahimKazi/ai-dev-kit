"use strict";
// Manifest and archive/unarchive mechanics shared by install-kit.cli and skill-scope.auto. Lives with
// skill-scope so a project that never gets install-kit still has everything archiving needs.
// Moves a skill folder between the skill root and <tool-dir>/skills-archive/ and keeps .ai-dev-kit.json in step.
// No network, no dependencies.
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
exports.MANIFEST_NAME = void 0;
exports.readManifest = readManifest;
exports.writeManifest = writeManifest;
exports.walkFiles = walkFiles;
exports.ensureShield = ensureShield;
exports.removeShieldIfUnneeded = removeShieldIfUnneeded;
exports.doArchive = doArchive;
exports.doUnarchive = doUnarchive;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
exports.MANIFEST_NAME = '.ai-dev-kit.json';
function readManifest(root) {
    const p = path.join(root, exports.MANIFEST_NAME);
    if (!fs.existsSync(p))
        return { version: 1, tool: null, standards: false, commentStyleLevel: null, contextCode: null, skills: {}, archived: {} };
    const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!m.archived)
        m.archived = {};
    return m;
}
function writeManifest(root, manifest) {
    manifest.updatedAt = new Date().toISOString();
    fs.writeFileSync(path.join(root, exports.MANIFEST_NAME), JSON.stringify(manifest, null, 2) + '\n');
}
function skillRootHasJs(absSkillRoot) {
    if (!fs.existsSync(absSkillRoot))
        return false;
    for (const name of fs.readdirSync(absSkillRoot)) {
        const abs = path.join(absSkillRoot, name);
        if (fs.statSync(abs).isDirectory()) {
            for (const f of walkFiles(abs))
                if (f.endsWith('.js'))
                    return true;
        }
    }
    return false;
}
function* walkFiles(dir) {
    for (const name of fs.readdirSync(dir)) {
        const abs = path.join(dir, name);
        if (fs.statSync(abs).isDirectory())
            yield* walkFiles(abs);
        else
            yield abs;
    }
}
function ensureShield(absSkillRoot) {
    const pkg = path.join(absSkillRoot, 'package.json');
    if (fs.existsSync(pkg)) {
        const body = fs.readFileSync(pkg, 'utf8');
        if (/"type"\s*:\s*"commonjs"/.test(body))
            return false;
    }
    fs.mkdirSync(absSkillRoot, { recursive: true });
    fs.writeFileSync(pkg, '{\n  "type": "commonjs"\n}\n');
    return true;
}
function removeShieldIfUnneeded(absSkillRoot) {
    if (skillRootHasJs(absSkillRoot))
        return false;
    const pkg = path.join(absSkillRoot, 'package.json');
    if (!fs.existsSync(pkg))
        return false;
    const body = fs.readFileSync(pkg, 'utf8');
    if (!/"type"\s*:\s*"commonjs"/.test(body))
        return false;
    fs.rmSync(pkg);
    return true;
}
// Moves a skill out of the active skill root into <tool-dir>/skills-archive/, keeping it on disk but
// invisible to the tool -- the mechanical half of handover's per-session archive decision.
function doArchive(args) {
    const manifest = readManifest(args.root);
    if (!manifest.tool)
        throw new Error('no install manifest found at ' + path.join(args.root, exports.MANIFEST_NAME) + ' -- run install first');
    const absSkillRoot = path.join(args.root, manifest.skillRoot);
    const archiveRoot = path.join(args.root, path.dirname(manifest.skillRoot), 'skills-archive');
    const names = args.all ? Object.keys(manifest.skills) : (args.skills || []);
    const archived = [];
    const kept = [];
    for (const name of names) {
        if (!manifest.skills[name]) {
            kept.push(`${name}: not tracked as installed, left alone`);
            continue;
        }
        const src = path.join(absSkillRoot, name);
        const dest = path.join(archiveRoot, name);
        if (fs.existsSync(src)) {
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.rmSync(dest, { recursive: true, force: true });
            fs.renameSync(src, dest);
        }
        manifest.archived[name] = manifest.skills[name];
        delete manifest.skills[name];
        archived.push(name);
    }
    if (removeShieldIfUnneeded(absSkillRoot))
        archived.push('(shield removed, no longer needed)');
    writeManifest(args.root, manifest);
    return { archived, kept };
}
// Reverses doArchive: moves a skill back from skills-archive/ into the active skill root.
function doUnarchive(args) {
    const manifest = readManifest(args.root);
    if (!manifest.tool)
        throw new Error('no install manifest found at ' + path.join(args.root, exports.MANIFEST_NAME) + ' -- run install first');
    const absSkillRoot = path.join(args.root, manifest.skillRoot);
    const archiveRoot = path.join(args.root, path.dirname(manifest.skillRoot), 'skills-archive');
    const names = args.all ? Object.keys(manifest.archived) : (args.skills || []);
    const restored = [];
    const kept = [];
    for (const name of names) {
        if (!manifest.archived[name]) {
            kept.push(`${name}: not archived, left alone`);
            continue;
        }
        const src = path.join(archiveRoot, name);
        const dest = path.join(absSkillRoot, name);
        if (fs.existsSync(src)) {
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.rmSync(dest, { recursive: true, force: true });
            fs.renameSync(src, dest);
        }
        manifest.skills[name] = manifest.archived[name];
        delete manifest.archived[name];
        restored.push(name);
    }
    ensureShield(absSkillRoot);
    writeManifest(args.root, manifest);
    return { restored, kept };
}
