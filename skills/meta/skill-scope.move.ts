// Manifest and archive/unarchive mechanics shared by install-kit.cli and skill-scope.auto. Lives with
// skill-scope so a project that never gets install-kit still has everything archiving needs.
// Moves a skill folder between the skill root and <tool-dir>/skills-archive/ and keeps .ai-dev-kit.json in step.
// No network, no dependencies.

import * as fs from 'node:fs';
import * as path from 'node:path';

export const MANIFEST_NAME = '.ai-dev-kit.json';

export interface MoveArgs { root?: string; skills: string[]; all?: boolean }

export interface SkillRecord { dir: string; companions: string[] }
export interface Manifest {
  version: number;
  tool: string | null;
  skillRoot?: string;
  protocolFile?: string;
  standards: boolean;
  commentStyleLevel: string | null;
  contextCode: string | null;
  skills: Record<string, SkillRecord>;
  archived: Record<string, SkillRecord>;
  updatedAt?: string;
}

export function readManifest(root: string): Manifest {
  const p = path.join(root, MANIFEST_NAME);
  if (!fs.existsSync(p)) return { version: 1, tool: null, standards: false, commentStyleLevel: null, contextCode: null, skills: {}, archived: {} };
  const m: Manifest = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!m.archived) m.archived = {};
  return m;
}

export function writeManifest(root: string, manifest: Manifest): void {
  manifest.updatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(root, MANIFEST_NAME), JSON.stringify(manifest, null, 2) + '\n');
}

function skillRootHasJs(absSkillRoot: string): boolean {
  if (!fs.existsSync(absSkillRoot)) return false;
  for (const name of fs.readdirSync(absSkillRoot)) {
    const abs = path.join(absSkillRoot, name);
    if (fs.statSync(abs).isDirectory()) {
      for (const f of walkFiles(abs)) if (f.endsWith('.js')) return true;
    }
  }
  return false;
}

export function* walkFiles(dir: string): Generator<string> {
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    if (fs.statSync(abs).isDirectory()) yield* walkFiles(abs);
    else yield abs;
  }
}

export function ensureShield(absSkillRoot: string): boolean {
  const pkg = path.join(absSkillRoot, 'package.json');
  if (fs.existsSync(pkg)) {
    const body = fs.readFileSync(pkg, 'utf8');
    if (/"type"\s*:\s*"commonjs"/.test(body)) return false;
  }
  fs.mkdirSync(absSkillRoot, { recursive: true });
  fs.writeFileSync(pkg, '{\n  "type": "commonjs"\n}\n');
  return true;
}

export function removeShieldIfUnneeded(absSkillRoot: string): boolean {
  if (skillRootHasJs(absSkillRoot)) return false;
  const pkg = path.join(absSkillRoot, 'package.json');
  if (!fs.existsSync(pkg)) return false;
  const body = fs.readFileSync(pkg, 'utf8');
  if (!/"type"\s*:\s*"commonjs"/.test(body)) return false;
  fs.rmSync(pkg);
  return true;
}


export interface ArchiveResult { archived: string[]; kept: string[] }

// Moves a skill out of the active skill root into <tool-dir>/skills-archive/, keeping it on disk but
// invisible to the tool -- the mechanical half of handover's per-session archive decision.
export function doArchive(args: MoveArgs): ArchiveResult {
  const manifest = readManifest(args.root!);
  if (!manifest.tool) throw new Error('no install manifest found at ' + path.join(args.root!, MANIFEST_NAME) + ' -- run install first');
  const absSkillRoot = path.join(args.root!, manifest.skillRoot!);
  const archiveRoot = path.join(args.root!, path.dirname(manifest.skillRoot!), 'skills-archive');
  const names = args.all ? Object.keys(manifest.skills) : (args.skills || []);

  const archived: string[] = [];
  const kept: string[] = [];
  for (const name of names) {
    if (!manifest.skills[name]) { kept.push(`${name}: not tracked as installed, left alone`); continue; }
    const src = path.join(absSkillRoot, name);
    const dest = path.join(archiveRoot, name);
    if (fs.existsSync(src)) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.rmSync(dest, { recursive: true, force: true }); fs.renameSync(src, dest); }
    manifest.archived[name] = manifest.skills[name];
    delete manifest.skills[name];
    archived.push(name);
  }
  if (removeShieldIfUnneeded(absSkillRoot)) archived.push('(shield removed, no longer needed)');

  writeManifest(args.root!, manifest);
  return { archived, kept };
}

export interface UnarchiveResult { restored: string[]; kept: string[] }

// Reverses doArchive: moves a skill back from skills-archive/ into the active skill root.
export function doUnarchive(args: MoveArgs): UnarchiveResult {
  const manifest = readManifest(args.root!);
  if (!manifest.tool) throw new Error('no install manifest found at ' + path.join(args.root!, MANIFEST_NAME) + ' -- run install first');
  const absSkillRoot = path.join(args.root!, manifest.skillRoot!);
  const archiveRoot = path.join(args.root!, path.dirname(manifest.skillRoot!), 'skills-archive');
  const names = args.all ? Object.keys(manifest.archived) : (args.skills || []);

  const restored: string[] = [];
  const kept: string[] = [];
  for (const name of names) {
    if (!manifest.archived[name]) { kept.push(`${name}: not archived, left alone`); continue; }
    const src = path.join(archiveRoot, name);
    const dest = path.join(absSkillRoot, name);
    if (fs.existsSync(src)) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.rmSync(dest, { recursive: true, force: true }); fs.renameSync(src, dest); }
    manifest.skills[name] = manifest.archived[name];
    delete manifest.archived[name];
    restored.push(name);
  }
  ensureShield(absSkillRoot);

  writeManifest(args.root!, manifest);
  return { restored, kept };
}

