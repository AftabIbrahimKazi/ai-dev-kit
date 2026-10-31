#!/usr/bin/env node
// Installs the voices and the /narration command for the narrate add-on.
//
//   node narrate.setup.js --voices                      pip-install Piper, download the female and male voice (~125 MB)
//   node narrate.setup.js --add-voice male|female <file.onnx | https://...onnx>   use your own Piper voice
//   node narrate.setup.js --controls commands [--project D] [--skill-root P]
// add-voice: registers your own Piper voice (needs the model.onnx and its model.onnx.json side by side) for the male or
//           female slot in ~/.claude/narrate.json. A local file is used in place; a URL is downloaded (with its .json)
//           into ~/.claude/voices first. Check the voice's licence yourself; never commit it to a shared repo.
// voices:   installs piper-tts, downloads en_GB-jenny_dioco-medium (female, Jenny (Dioco), attribution required) and en_GB-northern_english_male-medium (male, CC-BY-SA 4.0)
//           from huggingface.co/rhasspy/piper-voices into ~/.claude/voices (skips files already there), and writes
//           ~/.claude/narrate.json if it does not exist. Ask the user first: it is a download.
// commands: copies commands/narration.md into <project>/.claude/commands (never overwrites), {{skill-root}} filled in
//           (--skill-root, default .claude/skills; the script then runs as <skill-root>/narrate/speak.js).
// hook:     copies speak.js to ~/.claude/skills/narrate/ and points the Stop hook in ~/.claude/settings.json at that copy,
//           adding the hook or repairing one that names another (stale) copy. Re-run after a kit update. Exit 1 on a usage error.
import fs = require('node:fs');
import os = require('node:os');
import path = require('node:path');
import childProcess = require('node:child_process');

const { spawnSync } = childProcess;

const HERE = __dirname;
const posix = (p: string): string => p.split(path.sep).join('/');

export interface AddVoiceArgs { gender: string; src: string }
export interface SetupArgs { controls: string; voices: boolean; hook: boolean; addVoice: AddVoiceArgs | null; project: string; skillRoot?: string }

export function parseArgs(argv: string[]): SetupArgs {
  const o: SetupArgs = { controls: '', voices: false, hook: false, addVoice: null, project: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--controls') o.controls = argv[++i];
    else if (a === '--project') o.project = path.resolve(argv[++i]);
    else if (a === '--skill-root') o.skillRoot = argv[++i];
    else if (a === '--voices') o.voices = true;
    else if (a === '--hook') o.hook = true;
    else if (a === '--add-voice') { o.addVoice = { gender: argv[++i], src: argv[++i] }; }
    else throw new Error(`unknown option ${a}`);
  }
  if (o.controls === 'hotkeys' || o.controls === 'both') throw new Error('hotkeys were removed; use --controls commands (or the VS Code controls extension)');
  if (o.controls && o.controls !== 'commands') throw new Error('--controls must be commands');
  if (o.addVoice && (!['male', 'female'].includes(o.addVoice.gender) || !o.addVoice.src)) throw new Error('--add-voice needs male|female and a .onnx file or URL');
  if (!o.controls && !o.voices && !o.hook && !o.addVoice) throw new Error('give --voices, --hook, --add-voice, or --controls commands');
  return o;
}

// copy the /narration command template into the project; returns a status line
export function installCommand(project: string, skillRoot?: string): string {
  const src = path.join(HERE, '..', 'commands', 'narration.md');
  const dest = path.join(project, '.claude', 'commands', 'narration.md');
  if (fs.existsSync(dest)) return `commands: ${posix(dest)} already exists, left alone`;
  const root = skillRoot || '.claude/skills';
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, fs.readFileSync(src, 'utf8').replace(/\{\{skill-root\}\}/g, root));
  return `commands: installed ${posix(dest)}; type /narration status`;
}

function pythonExe(): string | null {
  for (const c of ['python', 'python3', 'py']) if (spawnSync(c, ['--version'], { stdio: 'ignore' }).status === 0) return c;
  return null;
}
const VOICE_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB';
const VOICES: [string, string][] = [['jenny_dioco', 'female'], ['northern_english_male', 'male']];
export const voiceUrls = (name: string): string[] => [`${VOICE_BASE}/${name}/medium/en_GB-${name}-medium.onnx`, `${VOICE_BASE}/${name}/medium/en_GB-${name}-medium.onnx.json`];

async function installVoices(): Promise<string> {
  const py = pythonExe();
  if (!py) return 'voices: Python not found; install Python 3 and run this again';
  const pip = spawnSync(py, ['-m', 'pip', 'install', '-q', 'piper-tts'], { encoding: 'utf8' });
  if (pip.status !== 0) return `voices: pip install piper-tts failed: ${(pip.stderr || '').trim().split('\n').pop()}`;
  const dir = path.join(os.homedir(), '.claude', 'voices');
  fs.mkdirSync(dir, { recursive: true });
  const got: string[] = [];
  for (const [name, gender] of VOICES) {
    for (const url of voiceUrls(name)) {
      const dest = path.join(dir, path.basename(url));
      if (fs.existsSync(dest)) continue;
      const res = await fetch(url);
      if (!res.ok) return `voices: download failed (${res.status}) ${url}`;
      fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    }
    got.push(`${name} (${gender})`);
  }
  const conf = path.join(os.homedir(), '.claude', 'narrate.json');
  if (!fs.existsSync(conf)) {
    const exe = spawnSync(py, ['-c', 'import sys;print(sys.executable)'], { encoding: 'utf8' }).stdout.trim() || py;
    fs.writeFileSync(conf, JSON.stringify({ engine: 'piper', gender: 'female', piper: { exe: posix(exe), args: ['-m', 'piper'] } }, null, 2) + '\n');
  }
  return `voices: piper-tts installed; ${got.join(' and ')} ready in ${posix(dir)}; try: node narrate.speak.js --say "hello"`;
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status}) ${url}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

interface NarrateConfig { voices?: Record<string, string>; [key: string]: unknown }

// register the user's own Piper voice for the male or female slot
export async function addVoice({ gender, src }: AddVoiceArgs): Promise<string> {
  try {
    let model = path.resolve(src);
    if (/^https?:\/\//i.test(src)) {
      const dir = path.join(os.homedir(), '.claude', 'voices');
      fs.mkdirSync(dir, { recursive: true });
      model = path.join(dir, path.basename(new URL(src).pathname));
      if (!fs.existsSync(model)) await download(src, model);
      if (!fs.existsSync(model + '.json')) await download(src + '.json', model + '.json');
    }
    if (!model.endsWith('.onnx') || !fs.existsSync(model)) return `add-voice: ${src} is not a Piper .onnx file`;
    if (!fs.existsSync(model + '.json')) return `add-voice: ${posix(model)}.json is missing; Piper needs it next to the model`;
    const conf = path.join(os.homedir(), '.claude', 'narrate.json');
    let cfg: NarrateConfig = {}; try { cfg = JSON.parse(fs.readFileSync(conf, 'utf8')); } catch { /* new config */ }
    cfg.voices = { ...cfg.voices, [gender]: posix(model) };
    fs.mkdirSync(path.dirname(conf), { recursive: true });
    fs.writeFileSync(conf, JSON.stringify(cfg, null, 2) + '\n');
    return `add-voice: ${gender} voice is now ${posix(model)}; try: node narrate.speak.js --voice ${gender} then --say "hello"`;
  } catch (e) { return `add-voice: ${(e as Error).message}`; }
}


// Registers (or repairs) a user-level hook in ~/.claude/settings.json so it runs the per-user copy of the script, never a
// project's copy that goes stale. Any existing hook whose command names `marker` is repointed; otherwise one is added.
export function registerHook(event: string, marker: string, script: string): string {
  const file = path.join(os.homedir(), '.claude', 'settings.json');
  let s: any = {};
  if (fs.existsSync(file)) { try { s = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return `hook: ${posix(file)} is not valid JSON; fix it, then run this again`; } }
  const command = `node "${posix(script)}"`;
  s.hooks = s.hooks || {};
  const groups: any[] = (s.hooks[event] = s.hooks[event] || []);
  let found = false, changed = false;
  for (const g of groups) for (const h of g.hooks || []) {
    if (typeof h.command === 'string' && h.command.includes(marker)) { found = true; if (h.command !== command) { h.command = command; changed = true; } }
  }
  if (!found) { groups.push({ hooks: [{ type: 'command', command }] }); changed = true; }
  if (!changed) return `hook: ${event} already runs ${posix(script)}`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(s, null, 2) + '\n');
  return `hook: ${event} now runs ${posix(script)}`;
}

export function installHook(): string {
  const dest = path.join(os.homedir(), '.claude', 'skills', 'narrate', 'speak.js');
  const src = path.join(HERE, 'narrate.speak.js');
  if (!fs.existsSync(src)) return 'hook: narrate.speak.js is not next to this script; run setup from the kit repo';
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return registerHook('Stop', 'speak.js', dest);
}

async function main(argv: string[]): Promise<void> {
  let o: SetupArgs;
  try { o = parseArgs(argv); } catch (e) { console.error((e as Error).message); process.exitCode = 1; return; }
  if (o.voices) console.log(await installVoices());
  if (o.addVoice) console.log(await addVoice(o.addVoice));
  if (o.hook) console.log(installHook());
  if (o.controls) console.log(installCommand(o.project, o.skillRoot));
}

if (require.main === module) main(process.argv.slice(2));
