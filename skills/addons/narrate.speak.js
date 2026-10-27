#!/usr/bin/env node
// Reads Claude's last reply aloud. Runs as a Stop hook: gets the hook JSON on stdin, takes the final assistant text
// from the transcript, strips code, tables and links, and speaks the rest in the background. Never talks to Claude,
// never blocks, always exits 0. Plain Node, no dependencies; the voice engine is whatever is installed.
//
//   node narrate.speak.js                 Stop-hook mode (stdin = hook JSON)
//   node narrate.speak.js --say "hi"      speak this text now (test a voice)
//   --mute | --unmute | --stop | --status | --replay   (a reply is spoken once; --replay is the only way to hear it again)
//   --voice male|female   --volume 0-100   --speed 0.5-2   --pitch -12..12 (semitones)   --maxSeconds 30-1800   each saved in the config
// Config (optional) ~/.claude/narrate.json: {"engine":"sapi|piper|command", "gender":"female", "volume":100, "speed":1,
//   "pitch":0, "maxSeconds":300 (longest reading; becomes a character limit at the current speed), "max":0 (fixed character limit instead), "voices":{"female":"<.onnx>","male":"<.onnx>"}, "piper":{"exe":"piper","args":[]},
//   "voice":"Microsoft Zira Desktop" (sapi), "command":"my-tts --out {wav}"}. "command" gets the text on stdin and must
//   write a wav to {wav}: this is where a personal cloned voice plugs in; keep that voice and its audio out of the repo.
//   Pitch and speed are exact with piper; sapi has speed and volume only. NARRATE=0 also mutes.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const HOME = path.join(os.homedir(), '.claude');
const CONF = path.join(HOME, 'narrate.json');
const OFF = path.join(HOME, 'narrate.off');
// NARRATE_TMP moves the lock, queue and temp files, so tests never touch a live narration
const TMP = process.env.NARRATE_TMP || os.tmpdir();
const STATE = path.join(HOME, 'narrate-last.json');
const LOCK = path.join(TMP, 'narrate.lock');
const QUEUE = path.join(TMP, 'narrate-queue');
const MAX_PENDING = 3;
const VOICE_FILES = { female: 'en_US-ljspeech-medium.onnx', male: 'en_US-joe-medium.onnx' };
const LIMITS = { volume: [0, 100], speed: [0.5, 2], pitch: [-12, 12], maxSeconds: [30, 1800] };
// both voices speak 16-19 characters a second at speed 1; the time limit becomes a character limit at the current speed
const CHARS_PER_SECOND = 16;
const MAX_CHARS = 12000;

// final assistant text of the transcript (JSONL), read from the end, with an id that tells the same reply apart from
// a new one that happens to read the same
function lastReplyEntry(jsonl) {
  const lines = jsonl.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    let e; try { e = JSON.parse(lines[i]); } catch { continue; }
    const m = e && e.message;
    if (!m || m.role !== 'assistant' || !Array.isArray(m.content)) continue;
    const t = m.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (t) return { text: t, id: String(e.uuid || e.timestamp || `line${i}`) };
  }
  return { text: '', id: '' };
}
const lastReply = (jsonl) => lastReplyEntry(jsonl).text;

// what was already spoken, so a reply is never read twice on its own, and the text a replay repeats
function readState() {
  try { const s = JSON.parse(fs.readFileSync(STATE, 'utf8')); return { seen: s.seen || {}, text: s.text || '' }; } catch { return { seen: {}, text: '' }; }
}
function writeState(st) {
  const keys = Object.keys(st.seen);
  for (const k of keys.slice(0, Math.max(0, keys.length - 20))) delete st.seen[k];
  try { fs.mkdirSync(HOME, { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(st)); } catch { /* ignore */ }
}

// markdown to speakable prose, cut at a sentence end near max characters
function clean(md, max = 6000) {
  const lines = md
    .replace(/```[\s\S]*?```/g, '\n')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(\*\*|__|~~|\*)/g, '')
    .split('\n')
    .filter((l) => !/^\s*\|.*\|\s*$/.test(l) && !/^\s*[-=_*]{3,}\s*$/.test(l))
    .map((l) => l.replace(/^\s{0,3}#{1,6}\s*/, '').replace(/^\s*([-+]|\d+\.)\s+/, '').replace(/^\s*>\s?/, '').trim())
    .filter(Boolean)
    .map((l) => (/[.!?:;]$/.test(l) ? l : l + '.'));
  let s = lines.join(' ').replace(/\s+/g, ' ').trim();
  const truncated = s.length > max;
  if (truncated) {
    const cut = s.slice(0, max);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    s = end > max / 2 ? cut.slice(0, end + 1) : cut;
  }
  // code and tables are not spoken, so say that they exist instead of going silent
  const notes = [truncated && 'The rest is on screen.', /```|^\s*\|.*\|\s*$/m.test(md) && 'Code and tables are on screen.'].filter(Boolean);
  return [s, ...notes].join(' ').trim();
}

function config() {
  try { return JSON.parse(fs.readFileSync(CONF, 'utf8')); } catch { return {}; }
}
const clamp = (n, [lo, hi]) => Math.min(hi, Math.max(lo, n));
// effective settings with defaults and limits applied
function settings(cfg = config()) {
  const num = (k, d) => (Number.isFinite(Number(cfg[k])) && cfg[k] !== '' && cfg[k] != null ? clamp(Number(cfg[k]), LIMITS[k]) : d);
  const gender = cfg.gender === 'male' ? 'male' : 'female';
  return {
    engine: cfg.engine || 'sapi', gender, volume: num('volume', 100), speed: num('speed', 1), pitch: num('pitch', 0),
    max: cfg.max > 0 ? Number(cfg.max) : Math.min(MAX_CHARS, Math.round(num('maxSeconds', 300) * CHARS_PER_SECOND * num('speed', 1))), model: (cfg.voices && cfg.voices[gender]) || path.join(HOME, 'voices', VOICE_FILES[gender]),
    piper: cfg.piper || {}, command: cfg.command, voice: cfg.voice,
  };
}
function setConfig(key, value) {
  const cfg = config();
  cfg[key] = value;
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(CONF, JSON.stringify(cfg, null, 2) + '\n');
}
const isOff = () => process.env.NARRATE === '0' || fs.existsSync(OFF);

// volume and pitch on a 16-bit PCM wav. Pitch raises the playback sample rate; speed is compensated at synthesis
// (piper length scale = pitch factor / speed), so pitch changes the voice and not the pace.
function shape(buf, volume, pitch) {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF') return buf;
  const out = Buffer.from(buf);
  for (let p = 12; p + 8 <= out.length;) {
    const id = out.toString('ascii', p, p + 4), size = out.readUInt32LE(p + 4);
    if (id === 'fmt ') {
      if (out.readUInt16LE(p + 22) !== 16) return buf;
      const rate = Math.round(out.readUInt32LE(p + 12) * 2 ** (pitch / 12));
      out.writeUInt32LE(rate, p + 12);
      out.writeUInt32LE(rate * out.readUInt16LE(p + 20), p + 16);
    } else if (id === 'data') {
      const end = Math.min(out.length, p + 8 + size);
      const g = volume / 100;
      for (let i = p + 8; i + 1 < end; i += 2) out.writeInt16LE(Math.round(clamp(out.readInt16LE(i) * g, [-32768, 32767])), i);
      return out;
    }
    p += 8 + size + (size & 1);
  }
  return buf;
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const pending = () => { try { return fs.readdirSync(QUEUE).filter((f) => f.endsWith('.txt')).sort(); } catch { return []; } };
const rm = (f) => { try { fs.unlinkSync(f); return true; } catch { return false; } };

// replies wait their turn so parallel sessions never cut each other off; only the newest few are kept
function enqueue(text) {
  fs.mkdirSync(QUEUE, { recursive: true });
  fs.writeFileSync(path.join(QUEUE, `${Date.now()}-${process.pid}.txt`), text);
  for (const f of pending().slice(0, -MAX_PENDING)) rm(path.join(QUEUE, f));
}

// stop what is playing and drop everything waiting (mute, stop, and a spoken test)
function stopAll() {
  for (const f of pending()) rm(path.join(QUEUE, f));
  let pid; try { pid = Number(fs.readFileSync(LOCK, 'utf8')); } catch { return; }
  if (pid && alive(pid)) {
    try {
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' });
      else process.kill(-pid, 'SIGTERM');
    } catch { /* already gone */ }
  }
  rm(LOCK);
  try { for (const f of fs.readdirSync(TMP)) if (f.startsWith(`narrate-${pid}-`)) rm(path.join(TMP, f)); } catch { /* ignore */ }
}

// WPF MediaPlayer plays on whatever Windows has as the default output when it starts, so headphones plugged in or
// switched to are used; SoundPlayer is the fallback
const WIN_PLAY = 'Add-Type -AssemblyName presentationCore; $p = New-Object System.Windows.Media.MediaPlayer; ' +
  '$p.Open([Uri]$env:NARRATE_WAV); $t = 0; while (-not $p.NaturalDuration.HasTimeSpan -and $t -lt 100) { Start-Sleep -Milliseconds 50; $t++ }; ' +
  'if (-not $p.NaturalDuration.HasTimeSpan) { exit 2 }; $p.Play(); ' +
  'Start-Sleep -Milliseconds ([int]$p.NaturalDuration.TimeSpan.TotalMilliseconds + 400); $p.Close()';

function playWav(wav) {
  if (process.platform === 'win32') {
    const o = { env: { ...process.env, NARRATE_WAV: wav }, stdio: 'ignore', windowsHide: true };
    if (spawnSync('powershell', ['-NoProfile', '-Command', WIN_PLAY], o).status !== 0) {
      spawnSync('powershell', ['-NoProfile', '-Command', '(New-Object Media.SoundPlayer $env:NARRATE_WAV).PlaySync()'], o);
    }
  } else {
    const cmd = otherPlayer(wav, has);
    if (!cmd) return;
    spawnSync(cmd[0], cmd.slice(1), { stdio: 'ignore' });
    if (cmd.wait) spawnSync(process.execPath, ['-e', `setTimeout(()=>{},${cmd.wait})`], { stdio: 'ignore' });
  }
}

// macOS, Linux and Termux (Android). Every choice plays on the system's current default output.
const has = (c) => spawnSync(process.platform === 'win32' ? 'where' : 'which', [c], { stdio: 'ignore' }).status === 0;
const isTermux = (env = process.env) => /com\.termux/.test(env.PREFIX || '');
function wavSeconds(file) {
  try {
    const b = fs.readFileSync(file);
    return b.length > 44 ? Math.ceil((b.length - 44) / b.readUInt32LE(28) * 1000) : 0;
  } catch { return 0; }
}
// the first available player; termux-media-player returns at once, so cmd.wait carries the clip length
function otherPlayer(wav, hasCmd, platform = process.platform, env = process.env) {
  if (platform === 'darwin') return hasCmd('afplay') ? ['afplay', wav] : null;
  if (isTermux(env)) {
    if (hasCmd('termux-media-player')) return Object.assign(['termux-media-player', 'play', wav], { wait: wavSeconds(wav) + 300 });
    return null;
  }
  const options = [['paplay', wav], ['pw-play', wav], ['aplay', '-q', wav], ['ffplay', '-nodisp', '-autoexit', '-loglevel', 'quiet', wav], ['play', '-q', wav]];
  return options.find((o) => hasCmd(o[0])) || null;
}
// text straight to the platform's own voice when no wav engine is set up
function otherSpeech(text, hasCmd, platform = process.platform, env = process.env) {
  if (platform === 'darwin') return ['say', text];
  if (isTermux(env)) return hasCmd('termux-tts-speak') ? ['termux-tts-speak', text] : null;
  const options = [['spd-say', '-w', text], ['espeak-ng', text], ['espeak', text]];
  return options.find((o) => hasCmd(o[0])) || null;
}
function shapeAndPlay(wav, s) {
  fs.writeFileSync(wav, shape(fs.readFileSync(wav), s.volume, s.pitch));
  playWav(wav);
}

// sentence-aligned pieces of about `size` characters: playback starts after the first piece, and the next one is
// synthesized while the current one plays, so a long reply is read in full without a long wait
function chunks(text, size = 350) {
  const out = [];
  let cur = '';
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (cur && cur.length + 1 + sentence.length > size) { out.push(cur); cur = sentence; } else cur = cur ? `${cur} ${sentence}` : sentence;
  }
  if (cur) out.push(cur);
  return out;
}

// one piece to a wav file with the wav engines (piper, command); resolves true when the file was written
function synth(text, s, wav) {
  return new Promise((resolve) => {
    const o = { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true };
    let child;
    if (s.engine === 'piper') {
      const factor = 2 ** (s.pitch / 12);
      const args = [...(s.piper.args || []), '--model', s.model, '--length-scale', String(factor / s.speed), '--output_file', wav];
      child = spawn(s.piper.exe || 'piper', args, o);
    } else child = spawn(s.command.replace(/\{wav\}/g, `"${wav}"`), { ...o, shell: true });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
    child.stdin.on('error', () => {});
    child.stdin.end(text);
  });
}

async function speakWav(text, s) {
  const parts = chunks(text);
  const file = (i) => path.join(TMP, `narrate-${process.pid}-${i}.wav`);
  let next = synth(parts[0], s, file(0));
  for (let i = 0; i < parts.length; i++) {
    const ok = await next;
    if (i + 1 < parts.length) next = synth(parts[i + 1], s, file(i + 1));
    if (ok) shapeAndPlay(file(i), s);
    rm(file(i));
  }
}

// runs inside the detached worker: speak one queued reply
async function speak(text, s) {
  {
    if (s.engine === 'piper' || s.engine === 'command') {
      await speakWav(text, s);
    } else if (process.platform === 'win32') {
      const ps = 'Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ' +
        'if ($env:NARRATE_VOICE) { $s.SelectVoice($env:NARRATE_VOICE) } else { $s.SelectVoiceByHints($env:NARRATE_GENDER) }; ' +
        '$s.Rate = [int]$env:NARRATE_RATE; $s.Volume = [int]$env:NARRATE_VOLUME; $s.Speak($env:NARRATE_TEXT)';
      spawnSync('powershell', ['-NoProfile', '-Command', ps], {
        env: { ...process.env, NARRATE_TEXT: text, NARRATE_VOICE: s.voice || '', NARRATE_GENDER: s.gender === 'male' ? 'Male' : 'Female',
          NARRATE_RATE: String(Math.round(clamp((s.speed - 1) * 10, [-10, 10]))), NARRATE_VOLUME: String(s.volume) },
        stdio: 'ignore', windowsHide: true,
      });
    } else {
      const cmd = otherSpeech(text, has);
      if (cmd) spawnSync(cmd[0], cmd.slice(1), { stdio: 'ignore' });
    }
  }
}

// only one worker plays at a time: the lock holds its pid, and a dead owner's lock is taken over
function acquire() {
  for (let i = 0; i < 2; i++) {
    try { fs.writeFileSync(LOCK, String(process.pid), { flag: 'wx' }); return true; } catch { /* held */ }
    let pid = 0; try { pid = Number(fs.readFileSync(LOCK, 'utf8')); } catch { /* gone */ }
    if (pid && alive(pid)) return false;
    rm(LOCK);
  }
  return false;
}

// runs inside the detached worker: play the queue in order, then release the lock and re-check for late arrivals
async function drain() {
  while (acquire()) {
    for (let f; (f = pending()[0]);) {
      const file = path.join(QUEUE, f);
      let text = ''; try { text = fs.readFileSync(file, 'utf8'); } catch { /* unreadable */ }
      if (!rm(file)) break;
      if (text) await speak(text, settings());
    }
    rm(LOCK);
    if (!pending().length) return;
  }
}

// queue the text and start a detached worker so the hook returns at once. A spoken test or hotkey feedback
// (interrupt) cuts in front; a reply waits for what is already playing.
function launch(text, interrupt) {
  if (interrupt) stopAll();
  enqueue(text);
  spawn(process.execPath, [__filename, '--worker'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function status() {
  const s = settings();
  return `${isOff() ? 'muted' : 'on'} | engine ${s.engine} | voice ${s.gender} | volume ${s.volume} | speed ${s.speed} | pitch ${s.pitch} | reads up to ${s.max} characters`;
}

function main(argv) {
  const [a, v] = argv;
  if (a === '--unmute' || a === '--on') { try { fs.unlinkSync(OFF); } catch { /* already on */ } return console.log('unmuted'); }
  if (a === '--mute' || a === '--off') { fs.mkdirSync(HOME, { recursive: true }); fs.writeFileSync(OFF, ''); stopAll(); return console.log('muted'); }
  if (a === '--stop') return stopAll();
  if (a === '--status') return console.log(status());
  if (a === '--voice') {
    if (v !== 'male' && v !== 'female') return console.log('use --voice male or --voice female');
    setConfig('gender', v); return console.log(status());
  }
  const key = a && a.slice(2);
  if (LIMITS[key]) {
    const n = Number(v);
    if (!Number.isFinite(n) || v === undefined || v === '') return console.log(`use --${key} ${LIMITS[key][0]} to ${LIMITS[key][1]}`);
    setConfig(key, clamp(n, LIMITS[key])); return console.log(status());
  }
  if (a === '--worker') return drain();
  if (a === '--say') return launch(clean(argv.slice(1).join(' '), settings().max), true);
  if (a === '--replay') {
    const st = readState();
    if (!st.text) return console.log('nothing to replay yet');
    if (isOff()) return console.log('muted; unmute first');
    launch(st.text, true);
    return console.log('replaying the last reply');
  }
  let hook; try { hook = JSON.parse(readStdin()); } catch { return; }
  if (!hook || !hook.transcript_path || !fs.existsSync(hook.transcript_path)) return;
  const entry = lastReplyEntry(fs.readFileSync(hook.transcript_path, 'utf8'));
  if (!entry.text) return;
  // a Stop with no new reply text (a turn that ended on a tool call, a notification) finds the previous reply again:
  // never speak the same reply twice on its own; the replay command is the only way to hear it again
  const st = readState();
  if (st.seen[hook.transcript_path] === entry.id) return;
  const text = clean(entry.text, settings().max);
  st.seen[hook.transcript_path] = entry.id;
  st.text = text;
  writeState(st);
  if (text && !isOff()) launch(text, false);
}

if (require.main === module) {
  try {
    const r = main(process.argv.slice(2));
    if (r && r.catch) r.catch(() => {}); // the worker's promise; fail open
  } catch { /* fail open */ }
  process.exitCode = 0;
}
module.exports = { lastReply, lastReplyEntry, clean, shape, settings, otherPlayer, otherSpeech, wavSeconds, chunks };
