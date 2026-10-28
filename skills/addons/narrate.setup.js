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
// The Stop hook itself lives in ~/.claude/settings.json and is not touched here. Exit 1 on a usage error.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HERE = __dirname;
const posix = (p) => p.split(path.sep).join('/');

function parseArgs(argv) {
  const o = { controls: '', voices: false, addVoice: null, project: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--controls') o.controls = argv[++i];
    else if (a === '--project') o.project = path.resolve(argv[++i]);
    else if (a === '--skill-root') o.skillRoot = argv[++i];
    else if (a === '--voices') o.voices = true;
    else if (a === '--add-voice') { o.addVoice = { gender: argv[++i], src: argv[++i] }; }
    else throw new Error(`unknown option ${a}`);
  }
  if (o.controls === 'hotkeys' || o.controls === 'both') throw new Error('hotkeys were removed; use --controls commands (or the VS Code controls extension)');
  if (o.controls && o.controls !== 'commands') throw new Error('--controls must be commands');
  if (o.addVoice && (!['male', 'female'].includes(o.addVoice.gender) || !o.addVoice.src)) throw new Error('--add-voice needs male|female and a .onnx file or URL');
  if (!o.controls && !o.voices && !o.addVoice) throw new Error('give --voices, --add-voice, or --controls commands');
  return o;
}

// copy the /narration command template into the project; returns a status line
function installCommand(project, skillRoot) {
  const src = path.join(HERE, '..', 'commands', 'narration.md');
  const dest = path.join(project, '.claude', 'commands', 'narration.md');
  if (fs.existsSync(dest)) return `commands: ${posix(dest)} already exists, left alone`;
  const root = skillRoot || '.claude/skills';
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, fs.readFileSync(src, 'utf8').replace(/\{\{skill-root\}\}/g, root));
  return `commands: installed ${posix(dest)}; type /narration status`;
}

function pythonExe() {
  for (const c of ['python', 'python3', 'py']) if (spawnSync(c, ['--version'], { stdio: 'ignore' }).status === 0) return c;
  return null;
}
const VOICE_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB';
const VOICES = [['jenny_dioco', 'female'], ['northern_english_male', 'male']];
const voiceUrls = (name) => [`${VOICE_BASE}/${name}/medium/en_GB-${name}-medium.onnx`, `${VOICE_BASE}/${name}/medium/en_GB-${name}-medium.onnx.json`];

async function installVoices() {
  const py = pythonExe();
  if (!py) return 'voices: Python not found; install Python 3 and run this again';
  const pip = spawnSync(py, ['-m', 'pip', 'install', '-q', 'piper-tts'], { encoding: 'utf8' });
  if (pip.status !== 0) return `voices: pip install piper-tts failed: ${(pip.stderr || '').trim().split('\n').pop()}`;
  const dir = path.join(os.homedir(), '.claude', 'voices');
  fs.mkdirSync(dir, { recursive: true });
  const got = [];
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

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status}) ${url}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

// register the user's own Piper voice for the male or female slot
async function addVoice({ gender, src }) {
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
    let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(conf, 'utf8')); } catch { /* new config */ }
    cfg.voices = { ...cfg.voices, [gender]: posix(model) };
    fs.mkdirSync(path.dirname(conf), { recursive: true });
    fs.writeFileSync(conf, JSON.stringify(cfg, null, 2) + '\n');
    return `add-voice: ${gender} voice is now ${posix(model)}; try: node narrate.speak.js --voice ${gender} then --say "hello"`;
  } catch (e) { return `add-voice: ${e.message}`; }
}

async function main(argv) {
  let o;
  try { o = parseArgs(argv); } catch (e) { console.error(e.message); process.exitCode = 1; return; }
  if (o.voices) console.log(await installVoices());
  if (o.addVoice) console.log(await addVoice(o.addVoice));
  if (o.controls) console.log(installCommand(o.project, o.skillRoot));
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { addVoice, parseArgs, installCommand, voiceUrls };
