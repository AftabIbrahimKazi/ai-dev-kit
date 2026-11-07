#!/usr/bin/env node
// Reads Claude's last reply aloud. Runs as a Stop hook: gets the hook JSON on stdin, takes the final assistant text
// from the transcript, strips code, tables and links, and speaks the rest in the background. Never talks to Claude,
// never blocks, always exits 0. Plain Node, no dependencies; the voice engine is whatever is installed.
//
//   node narrate.speak.js                 Stop-hook mode (stdin = hook JSON)
//   node narrate.speak.js --say "hi"      speak this text now (test a voice)
//   --mode manual|auto   manual (default, like the play button on claude.ai): the hook only keeps the reply; auto: speaks it
//   --mute | --unmute | --stop | --status | --play (= --replay)   (a reply is spoken once on its own; --play is how you hear it in manual mode, or again)
//   --voice male|female   --volume 0-100   --speed 0.5-2   --pitch -12..12 (semitones)   --maxSeconds 30-1800   each saved in the config
//   --pause / --resume   hold the speech where it is / carry on from there (--stop cuts it and clears the queue)
//   --alertCommand "<cmd {wav}>"|off   alerts through your own engine (text on stdin, wav at {wav}); the Piper alert voice if it fails or takes over 150 s
//   --alertPrerender   record the lead-in lines and common questions through the custom engine ahead of time; --alertCache status|clear
//   (every rendered alert piece is cached, so only a question not heard before is ever rendered; the cache is ~/.claude/narrate-cache)
//   --alertEngine piper|custom   all-Piper, or alerts through the saved --alertCommand engine (replies stay on Piper either way)
//   --alerts on|off   --alertVoice male|female   --alertIdle 0-600   spoken alert in a second voice when a reply ends on a question
//   and you are away from the keyboard for alertIdle seconds (0 = always); --alert "text" speaks a sample. Config keys: alerts,
//   alertGender (default: the other voice), alertIdle (30), alertPhrases (["Your input is needed. {q}", ...]), voices.alert (own .onnx)
// Config (optional) ~/.claude/narrate.json: {"engine":"sapi|piper|command", "gender":"female", "volume":100, "speed":1,
//   "pitch":0, "maxSeconds":300 (longest reading; becomes a character limit at the current speed), "max":0 (fixed character limit instead), "voices":{"female":"<.onnx>","male":"<.onnx>"}, "piper":{"exe":"piper","args":[]},
//   "voice":"Microsoft Zira Desktop" (sapi), "command":"my-tts --out {wav}"}. "command" gets the text on stdin and must
//   write a wav to {wav}: this is where a personal cloned voice plugs in; keep that voice and its audio out of the repo.
//   Pitch and speed are exact with piper; sapi has speed and volume only. NARRATE=0 also mutes.
import fs = require('node:fs');
import os = require('node:os');
import path = require('node:path');
import childProcess = require('node:child_process');

const { spawn, spawnSync } = childProcess;

const HOME = path.join(os.homedir(), '.claude');
const CONF = path.join(HOME, 'narrate.json');
const OFF = path.join(HOME, 'narrate.off');
// NARRATE_TMP moves the lock, queue and temp files, so tests never touch a live narration
const TMP = process.env.NARRATE_TMP || os.tmpdir();
const STATE = path.join(HOME, 'narrate-last.json');
const LOCK = path.join(TMP, 'narrate.lock');
const QUEUE = path.join(TMP, 'narrate-queue');
// while this file exists the worker holds: the clip playing is paused in place and nothing new starts; removing it continues
const PAUSE = path.join(TMP, 'narrate.pause');
const MAX_PENDING = 3;
// British by default (easier to listen to in long sessions). Each slot lists voices best first; the first one that is
// downloaded wins, so installs that only have an older voice keep working until `setup.js --voices` fetches the new one.
type Gender = 'female' | 'male';
const VOICE_FILES: Record<Gender, string> = { female: 'en_GB-jenny_dioco-medium.onnx', male: 'en_GB-northern_english_male-medium.onnx' };
const VOICE_FALLBACKS: Record<Gender, string[]> = { female: ['en_US-ljspeech-medium.onnx'], male: ['en_US-joe-medium.onnx'] };
export const defaultVoice = (gender: Gender): string => {
  const dir = path.join(HOME, 'voices');
  const have = [VOICE_FILES[gender], ...VOICE_FALLBACKS[gender]].find((f) => fs.existsSync(path.join(dir, f)));
  return path.join(dir, have || VOICE_FILES[gender]);
};
const LIMITS: Record<string, [number, number]> = { volume: [0, 100], speed: [0.5, 2], pitch: [-12, 12], maxSeconds: [30, 1800], alertIdle: [0, 600] };
// both voices speak 16-19 characters a second at speed 1; the time limit becomes a character limit at the current speed
const CHARS_PER_SECOND = 16;
const MAX_CHARS = 12000;

export interface ReplyEntry { text: string; id: string }

// final assistant text of the transcript (JSONL), read from the end, with an id that tells the same reply apart from
// a new one that happens to read the same
export function lastReplyEntry(jsonl: string): ReplyEntry {
  const lines = jsonl.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    let e: { message?: { role?: string; content?: unknown }; uuid?: string; timestamp?: string } | undefined;
    try { e = JSON.parse(lines[i]); } catch { continue; }
    const m = e && e.message;
    if (!m || m.role !== 'assistant' || !Array.isArray(m.content)) continue;
    const t = (m.content as { type: string; text: string }[]).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (t) return { text: t, id: String(e!.uuid || e!.timestamp || `line${i}`) };
  }
  return { text: '', id: '' };
}
export const lastReply = (jsonl: string): string => lastReplyEntry(jsonl).text;

export interface NarrateState { seen: Record<string, string>; text: string; pending: boolean }

// what was already spoken, so a reply is never read twice on its own, and the text a replay repeats
function readState(): NarrateState {
  try { const s = JSON.parse(fs.readFileSync(STATE, 'utf8')); return { seen: s.seen || {}, text: s.text || '', pending: !!s.pending }; } catch { return { seen: {}, text: '', pending: false }; }
}
function writeState(st: NarrateState): void {
  const keys = Object.keys(st.seen);
  for (const k of keys.slice(0, Math.max(0, keys.length - 20))) delete st.seen[k];
  try { fs.mkdirSync(HOME, { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(st)); } catch { /* ignore */ }
}

// markdown to speakable prose, cut at a sentence end near max characters
export function clean(md: string, max = 6000): string {
  const lines = md
    .replace(/^\s*\[CX(?: [^\]]*)?\]\s*/, '')
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

interface NarrateConfigFile {
  mode?: string; engine?: string; gender?: string; volume?: number | string; speed?: number | string; pitch?: number | string;
  maxSeconds?: number | string; max?: number | string; voices?: Record<string, string>; piper?: { exe?: string; args?: string[] };
  command?: string; voice?: string; alerts?: boolean | string; alertCommand?: string; alertEngine?: string; alertGender?: string; alertIdle?: number | string; alertPhrases?: string[];
  [key: string]: unknown;
}

// Spoken alerts: when a reply ends on a question to the user, a short line in a second voice says so, so a long
// session can be left running. Wording is the alert persona's; it never reads Claude's reply (that is the narration).
export const ALERT_PHRASES = ['Your input is needed. {q}', 'Claude is waiting on you. {q}', 'Over to you. {q}'];

// The question a reply ends on, or '' when it does not end on one: the last prose line (code and tables dropped)
// must end with a question mark, and the last sentence of it is the question.
export function trailingQuestion(md: string): string {
  const prose = md.replace(/```[\s\S]*?```/g, '\n').split('\n').map((l) => l.trim()).filter((l) => l && !/^\|.*\|$/.test(l));
  const last = (prose[prose.length - 1] || '').replace(/(\*\*|__|~~|\*|`)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/^\s*([-+>]|\d+\.)\s+/, '');
  if (!/\?["')\]]*$/.test(last)) return '';
  const sentence = last.split(/(?<=[.!?])\s+/).pop() || last;
  return sentence.length > 200 ? sentence.slice(-200).replace(/^\S*\s/, '') : sentence;
}

// the alert line: a phrase (config `alertPhrases`, or the built-ins) with {q} replaced by the question; the choice
// is by the question's own text, so the same question always gets the same phrase
export function alertText(question: string, phrases: string[] = ALERT_PHRASES): string { return alertParts(question, phrases).join(' '); }

// The same alert as separate pieces (lead-in, question, any tail). With a custom engine each piece is rendered and cached on
// its own, so the fixed lead-ins and any repeated question are never rendered twice.
export function alertParts(question: string, phrases: string[] = ALERT_PHRASES): string[] {
  const list = phrases.filter((p) => typeof p === 'string' && p.trim());
  const pool = list.length ? list : ALERT_PHRASES;
  let h = 0; for (const c of question) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const t = pool[h % pool.length];
  const parts = t.includes('{q}') ? [t.split('{q}')[0], question, t.split('{q}').slice(1).join(question)] : [t, question];
  return parts.map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// questions that come up all the time; `--alertPrerender` records them ahead of time so those alerts cost no render at all
export const COMMON_QUESTIONS = ['Should I continue?', 'Should I go ahead?', 'Do you want me to proceed?', 'Should I commit this?', 'Should I push it?',
  'Should I run the tests?', 'Should I apply the fix?', 'Which option do you prefer?', 'Is that okay?', 'Shall I start?', 'Should I keep going?', 'Do you want me to stop here?'];

// seconds since the last keyboard or mouse input; Infinity where it cannot be read (then the alert is always spoken)
export function idleSeconds(): number {
  if (process.platform !== 'win32') return Infinity;
  const ps = "Add-Type -Namespace N -Name I -MemberDefinition '[StructLayout(LayoutKind.Sequential)] public struct L { public uint s; public uint t; } [DllImport(\"user32.dll\")] public static extern bool GetLastInputInfo(ref L p);'; " +
    '$l = New-Object N.I+L; $l.s = [Runtime.InteropServices.Marshal]::SizeOf($l); [void][N.I]::GetLastInputInfo([ref]$l); [Math]::Floor(([Environment]::TickCount - $l.t) / 1000)';
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', windowsHide: true, timeout: 8000 });
  const n = Number(String(r.stdout || '').trim());
  return r.status === 0 && Number.isFinite(n) && n >= 0 ? n : Infinity;
}

function config(): NarrateConfigFile {
  try { return JSON.parse(fs.readFileSync(CONF, 'utf8')); } catch { return {}; }
}
const clamp = (n: number, [lo, hi]: [number, number]): number => Math.min(hi, Math.max(lo, n));

export interface Settings {
  mode: 'auto' | 'manual'; engine: string; gender: Gender; volume: number; speed: number; pitch: number;
  max: number; model: string; piper: { exe?: string; args?: string[] }; command?: string; voice?: string;
  alerts: boolean; alertCommand?: string; alertCommandSaved?: string; alertGender: Gender; alertIdle: number; alertModel: string; alertPhrases: string[];
}

// effective settings with defaults and limits applied
export function settings(cfg: NarrateConfigFile = config()): Settings {
  const num = (k: string, d: number): number => (Number.isFinite(Number(cfg[k])) && cfg[k] !== '' && cfg[k] != null ? clamp(Number(cfg[k]), LIMITS[k]) : d);
  const gender: Gender = cfg.gender === 'male' ? 'male' : 'female';
  // the alert voice is the other slot unless chosen, so it sounds like a different speaker; `voices.alert` is a file of its own
  const saved = typeof cfg.alertCommand === 'string' && cfg.alertCommand.trim() ? cfg.alertCommand.trim() : undefined; // the command stays saved while Piper is chosen
  const alertGender: Gender = cfg.alertGender === 'male' || cfg.alertGender === 'female' ? cfg.alertGender : gender === 'female' ? 'male' : 'female';
  return {
    alerts: cfg.alerts === true || cfg.alerts === 'on' || cfg.alerts === 'true', alertCommand: cfg.alertEngine === 'piper' ? undefined : saved, alertCommandSaved: saved, alertGender, alertIdle: num('alertIdle', 30),
    alertModel: (cfg.voices && (cfg.voices.alert || cfg.voices[alertGender])) || defaultVoice(alertGender), alertPhrases: Array.isArray(cfg.alertPhrases) ? cfg.alertPhrases : [],
    mode: cfg.mode === 'auto' ? 'auto' : 'manual', engine: cfg.engine || 'sapi', gender, volume: num('volume', 100), speed: num('speed', 1), pitch: num('pitch', 0),
    max: Number(cfg.max) > 0 ? Number(cfg.max) : Math.min(MAX_CHARS, Math.round(num('maxSeconds', 1110) * CHARS_PER_SECOND * num('speed', 1))), model: (cfg.voices && cfg.voices[gender]) || defaultVoice(gender),
    piper: cfg.piper || {}, command: cfg.command, voice: cfg.voice,
  };
}
function setConfig(key: string, value: unknown): void {
  const cfg = config();
  cfg[key] = value;
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(CONF, JSON.stringify(cfg, null, 2) + '\n');
}
const isOff = (): boolean => process.env.NARRATE === '0' || fs.existsSync(OFF);

// volume and pitch on a 16-bit PCM wav. Pitch raises the playback sample rate; speed is compensated at synthesis
// (piper length scale = pitch factor / speed), so pitch changes the voice and not the pace.
export function shape(buf: Buffer, volume: number, pitch: number): Buffer {
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

const alive = (pid: number): boolean => { try { process.kill(pid, 0); return true; } catch { return false; } };
const pending = (): string[] => { try { return fs.readdirSync(QUEUE).filter((f) => f.endsWith('.txt')).sort(); } catch { return []; } };
const rm = (f: string): boolean => { try { fs.unlinkSync(f); return true; } catch { return false; } };

// replies wait their turn so parallel sessions never cut each other off; only the newest few are kept
// an alert is queued as `<time>-<pid>.alert.txt`: the worker speaks it in the alert voice, after the away check.
// `.alertnow.txt` is the spoken test (--alert "text"): the alert voice with no checks.
type Kind = '' | 'alert' | 'alertnow';
const isAlertFile = (f: string): boolean => /\.alert(now)?\.txt$/.test(f);
function enqueue(text: string, kind: Kind = ''): void {
  fs.mkdirSync(QUEUE, { recursive: true });
  fs.writeFileSync(path.join(QUEUE, `${Date.now()}-${process.pid}${kind ? '.' + kind : ''}.txt`), text);
  for (const f of pending().slice(0, -MAX_PENDING)) rm(path.join(QUEUE, f));
}

const isPaused = (): boolean => fs.existsSync(PAUSE);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
// the worker holds here while paused (a stop or resume removes the file)
async function whilePaused(): Promise<void> { while (isPaused()) await sleep(150); }

// stop what is playing and drop everything waiting (mute, stop, and a spoken test); a stop also ends a pause
function stopAll(): void {
  rm(PAUSE);
  for (const f of pending()) rm(path.join(QUEUE, f));
  let pid: number; try { pid = Number(fs.readFileSync(LOCK, 'utf8')); } catch { return; }
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
  // poll the position so a pause holds the clip where it is and resume carries on from there; the counter stops a clip that never advances
  '$d = $p.NaturalDuration.TimeSpan.TotalMilliseconds; $n = 0; ' +
  'while ($p.Position.TotalMilliseconds -lt ($d - 40) -and $n -lt ($d / 50 * 3 + 200)) { ' +
  'if (Test-Path -LiteralPath $env:NARRATE_PAUSE) { $p.Pause(); while (Test-Path -LiteralPath $env:NARRATE_PAUSE) { Start-Sleep -Milliseconds 100 }; $p.Play() }; ' +
  'Start-Sleep -Milliseconds 50; $n++ }; ' +
  'Start-Sleep -Milliseconds 400; $p.Close()';

function playWav(wav: string): void {
  if (process.platform === 'win32') {
    const o = { env: { ...process.env, NARRATE_WAV: wav, NARRATE_PAUSE: PAUSE }, stdio: 'ignore' as const, windowsHide: true };
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
const has = (c: string): boolean => spawnSync(process.platform === 'win32' ? 'where' : 'which', [c], { stdio: 'ignore' }).status === 0;
const isTermux = (env: NodeJS.ProcessEnv = process.env): boolean => /com\.termux/.test(env.PREFIX || '');
export function wavSeconds(file: string): number {
  try {
    const b = fs.readFileSync(file);
    return b.length > 44 ? Math.ceil((b.length - 44) / b.readUInt32LE(28) * 1000) : 0;
  } catch { return 0; }
}

export type PlayerCmd = string[] & { wait?: number };

// the first available player; termux-media-player returns at once, so cmd.wait carries the clip length
export function otherPlayer(wav: string, hasCmd: (c: string) => boolean, platform: string = process.platform, env: NodeJS.ProcessEnv = process.env): PlayerCmd | null {
  if (platform === 'darwin') return hasCmd('afplay') ? ['afplay', wav] : null;
  if (isTermux(env)) {
    if (hasCmd('termux-media-player')) return Object.assign(['termux-media-player', 'play', wav], { wait: wavSeconds(wav) + 300 });
    return null;
  }
  const options: PlayerCmd[] = [['paplay', wav], ['pw-play', wav], ['aplay', '-q', wav], ['ffplay', '-nodisp', '-autoexit', '-loglevel', 'quiet', wav], ['play', '-q', wav]];
  return options.find((o) => hasCmd(o[0])) || null;
}
// text straight to the platform's own voice when no wav engine is set up
export function otherSpeech(text: string, hasCmd: (c: string) => boolean, platform: string = process.platform, env: NodeJS.ProcessEnv = process.env): string[] | null {
  if (platform === 'darwin') return ['say', text];
  if (isTermux(env)) return hasCmd('termux-tts-speak') ? ['termux-tts-speak', text] : null;
  const options = [['spd-say', '-w', text], ['espeak-ng', text], ['espeak', text]];
  return options.find((o) => hasCmd(o[0])) || null;
}
function shapeAndPlay(wav: string, s: Settings): void {
  fs.writeFileSync(wav, shape(fs.readFileSync(wav), s.volume, s.pitch));
  playWav(wav);
}

// sentence-aligned pieces of about `size` characters: playback starts after the first piece, and the next one is
// synthesized while the current one plays, so a long reply is read in full without a long wait
export function chunks(text: string, size = 350): string[] {
  const out: string[] = [];
  let cur = '';
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (cur && cur.length + 1 + sentence.length > size) { out.push(cur); cur = sentence; } else cur = cur ? `${cur} ${sentence}` : sentence;
  }
  if (cur) out.push(cur);
  return out;
}

// one piece to a wav file with the wav engines (piper, command); resolves true when the file was written.
// timeoutMs ends a command that hangs (a model that never loads): the whole process tree is killed and it resolves false.
function synth(text: string, s: Settings, wav: string, timeoutMs = 0): Promise<boolean> {
  return new Promise((resolve) => {
    const o: childProcess.SpawnOptions = { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true };
    let child: childProcess.ChildProcess;
    if (s.engine === 'piper') {
      const factor = 2 ** (s.pitch / 12);
      const args = [...(s.piper.args || []), '--model', s.model, '--length-scale', String(factor / s.speed), '--output_file', wav];
      child = spawn(s.piper.exe || 'piper', args, o);
    } else child = spawn(s.command!.replace(/\{wav\}/g, `"${wav}"`), { ...o, shell: true });
    let timer: NodeJS.Timeout | undefined;
    if (timeoutMs > 0) timer = setTimeout(() => {
      if (process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
      else child.kill('SIGKILL');
      resolve(false);
    }, timeoutMs);
    child.on('error', () => { if (timer) clearTimeout(timer); resolve(false); });
    child.on('close', (code) => { if (timer) clearTimeout(timer); resolve(code === 0 && fs.existsSync(wav)); });
    child.stdin!.on('error', () => {});
    child.stdin!.end(text);
  });
}

// true when at least one piece was synthesized and played
async function speakWav(text: string, s: Settings, timeoutMs = 0): Promise<boolean> {
  const parts = chunks(text);
  const file = (i: number): string => path.join(TMP, `narrate-${process.pid}-${i}.wav`);
  let next = synth(parts[0], s, file(0), timeoutMs);
  let played = false;
  for (let i = 0; i < parts.length; i++) {
    const ok = await next;
    if (i + 1 < parts.length) next = synth(parts[i + 1], s, file(i + 1), timeoutMs);
    await whilePaused(); // a pause between pieces; inside a piece the player holds the clip itself
    if (ok) { shapeAndPlay(file(i), s); played = true; }
    rm(file(i));
  }
  return played;
}

// An alert through the user's own command (`alertCommand`: text on stdin, wav at {wav}; e.g. a local cloned-voice engine).
// A slow or failing command never loses the alert: it falls back to the alert's Piper voice.
export const ALERT_COMMAND_TIMEOUT_MS = 150000;

// Rendered alert pieces are kept as wav files, keyed by the engine command and the normalised text, so a lead-in or a question
// that was spoken once is replayed from disk. The folder is the user's, outside any repo; `--alertCache clear` empties it.
const CACHE = path.join(HOME, 'narrate-cache');
const CACHE_MAX = 300;
export const cacheKey = (command: string, piece: string): string =>
  require('node:crypto').createHash('sha256').update(command + '\0' + piece.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 24);
const cacheFile = (command: string, piece: string): string => path.join(CACHE, cacheKey(command, piece) + '.wav');
function cacheFiles(): string[] { try { return fs.readdirSync(CACHE).filter((f) => f.endsWith('.wav')).map((f) => path.join(CACHE, f)); } catch { return []; } }
function pruneCache(): void { // keep the newest CACHE_MAX
  const files = cacheFiles().map((f) => ({ f, t: fs.statSync(f).mtimeMs })).sort((a, b) => b.t - a.t);
  for (const x of files.slice(CACHE_MAX)) rm(x.f);
}
const commandSettings = (s: Settings): Settings => ({ ...s, engine: 'command', command: s.alertCommand, speed: 1, pitch: 0 });

// The wav for one piece: from the cache, or rendered by the command and then cached. Returns the temp file to play, or '' on failure.
async function pieceWav(piece: string, cs: Settings, tmp: string): Promise<string> {
  const f = cacheFile(cs.command!, piece);
  try { if (fs.existsSync(f)) { fs.copyFileSync(f, tmp); return tmp; } } catch { /* re-render */ }
  if (!(await synth(piece, cs, tmp, ALERT_COMMAND_TIMEOUT_MS))) { rm(tmp); return ''; }
  try { fs.mkdirSync(CACHE, { recursive: true }); fs.copyFileSync(tmp, f); pruneCache(); } catch { /* caching is best effort */ }
  return tmp;
}

// An alert is its pieces (lead-in, question) one after the other. With a custom engine, a piece that cannot be rendered (engine
// down, or over the time limit) and everything after it is spoken in the narration voice in Piper: never a different voice, never lost.
async function speakAlertPieces(pieces: string[], s: Settings): Promise<void> {
  const cs = commandSettings(s);
  const tmp = path.join(TMP, `narrate-${process.pid}-alert.wav`);
  let i = 0;
  for (; i < pieces.length; i++) {
    const wav = await pieceWav(pieces[i], cs, tmp);
    if (!wav) break;
    await whilePaused();
    shapeAndPlay(wav, cs); rm(wav);
  }
  if (i < pieces.length) await speak(pieces.slice(i).join(' '), s);
}

async function speakAlert(text: string, s: Settings): Promise<void> {
  const pieces = text.split('\n').map((p) => p.trim()).filter(Boolean);
  if (s.alertCommand) return speakAlertPieces(pieces, s);
  await speak(pieces.join(' '), { ...s, gender: s.alertGender, model: s.alertModel });
}

// Record the fixed pieces ahead of time (the lead-in lines and the common questions) so the first alerts need no render either.
async function prerenderAlerts(): Promise<void> {
  const s = settings();
  if (!s.alertCommand) { console.log('no custom alert engine is active: set one with --alertCommand "<command with {wav}>" (and --alertEngine custom)'); return; }
  const cs = commandSettings(s);
  const pool = s.alertPhrases.length ? s.alertPhrases : ALERT_PHRASES;
  const leadIns = new Set<string>();
  for (const p of pool) for (const piece of p.split('{q}')) if (piece.trim()) leadIns.add(piece.replace(/\s+/g, ' ').trim());
  const list = [...leadIns, ...COMMON_QUESTIONS];
  const tmp = path.join(TMP, `narrate-${process.pid}-prerender.wav`);
  let made = 0, had = 0, failed = 0;
  for (const piece of list) {
    if (fs.existsSync(cacheFile(cs.command!, piece))) { had++; continue; }
    if (await pieceWav(piece, cs, tmp)) { made++; rm(tmp); console.log(`recorded (${made + had + failed}/${list.length}): ${piece}`); } else { failed++; console.log(`failed: ${piece}`); }
  }
  console.log(`alert cache: ${made} recorded, ${had} already there, ${failed} failed, ${cacheFiles().length} files in all`);
}

// runs inside the detached worker: speak one queued reply
async function speak(text: string, s: Settings): Promise<void> {
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
function acquire(): boolean {
  for (let i = 0; i < 2; i++) {
    try { fs.writeFileSync(LOCK, String(process.pid), { flag: 'wx' }); return true; } catch { /* held */ }
    let pid = 0; try { pid = Number(fs.readFileSync(LOCK, 'utf8')); } catch { /* gone */ }
    if (pid && alive(pid)) return false;
    rm(LOCK);
  }
  return false;
}

// runs inside the detached worker: play the queue in order, then release the lock and re-check for late arrivals
async function drain(): Promise<void> {
  while (acquire()) {
    for (let f; (f = pending()[0]);) {
      await whilePaused();
      const file = path.join(QUEUE, f);
      let text = ''; try { text = fs.readFileSync(file, 'utf8'); } catch { /* unreadable */ }
      if (!rm(file)) break;
      if (!text) continue;
      const s = settings();
      if (!isAlertFile(f)) { await speak(text, s); continue; }
      // an alert: only while alerts are on and unmuted, and (unless it is the spoken test) only when you are away from the keyboard
      if (!f.endsWith('.alertnow.txt') && (!s.alerts || isOff() || (s.alertIdle > 0 && idleSeconds() < s.alertIdle))) continue;
      await speakAlert(text, s);
    }
    rm(LOCK);
    if (!pending().length) return;
  }
}

// queue the text and start a detached worker so the hook returns at once. A spoken test or settings feedback
// (interrupt) cuts in front; a reply waits for what is already playing.
function launch(text: string, interrupt: boolean, kind: Kind = ''): void {
  if (interrupt) stopAll();
  enqueue(text, kind);
  spawn(process.execPath, [__filename, '--worker'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

function readStdin(): string {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function status(): string {
  const s = settings();
  const how = s.alertCommand ? 'custom engine, Piper fallback in the narration voice' : `${s.alertCommandSaved ? 'Piper (custom engine saved, off), ' : ''}${s.alertGender} voice`;
  const alerts = s.alerts ? `alerts on (${how}, when away ${s.alertIdle} s)` : 'alerts off';
  return `${isOff() ? 'muted' : isPaused() ? 'paused' : 'on'} | mode ${s.mode} | engine ${s.engine} | voice ${s.gender} | volume ${s.volume} | speed ${s.speed} | pitch ${s.pitch} | reads up to ${s.max} characters | ${alerts}`;
}

interface HookPayload { transcript_path?: string; [key: string]: unknown }

function main(argv: string[]): void | Promise<void> {
  const [a, v] = argv;
  if (a === '--unmute' || a === '--on') { try { fs.unlinkSync(OFF); } catch { /* already on */ } console.log('unmuted'); return; }
  if (a === '--mute' || a === '--off') { fs.mkdirSync(HOME, { recursive: true }); fs.writeFileSync(OFF, ''); stopAll(); console.log('muted'); return; }
  if (a === '--stop') { stopAll(); return; }
  // pause holds the speech where it is and resume carries on from there; stop (above) cuts it and clears the queue
  if (a === '--pause') { fs.mkdirSync(TMP, { recursive: true }); fs.writeFileSync(PAUSE, ''); console.log('paused'); return; }
  if (a === '--resume' || a === '--continue') { rm(PAUSE); console.log('resumed'); return; }
  if (a === '--status') { console.log(status()); return; }
  if (a === '--alerts') {
    if (v !== 'on' && v !== 'off') { console.log('use --alerts on or --alerts off'); return; }
    setConfig('alerts', v === 'on'); console.log(status()); return;
  }
  if (a === '--alertVoice') {
    if (v !== 'male' && v !== 'female') { console.log('use --alertVoice male or --alertVoice female'); return; }
    setConfig('alertGender', v); console.log(status()); return;
  }
  if (a === '--alertCommand') { // a local engine for alerts (text on stdin, wav at {wav}); 'off' goes back to the Piper alert voice
    const cmd = argv.slice(1).join(' ').trim();
    if (!cmd) { console.log('use --alertCommand "<command with {wav}>" or --alertCommand off'); return; }
    if (cmd === 'off') { const c = config(); delete c.alertCommand; fs.mkdirSync(HOME, { recursive: true }); fs.writeFileSync(CONF, JSON.stringify(c, null, 2) + '\n'); console.log(status()); return; }
    if (!cmd.includes('{wav}')) { console.log('the command must contain {wav}, where it writes the audio'); return; }
    setConfig('alertCommand', cmd); console.log(status()); return;
  }
  if (a === '--alertPrerender') return prerenderAlerts();
  if (a === '--alertCache') {
    if (v === 'clear') { const n = cacheFiles().length; for (const f of cacheFiles()) rm(f); console.log(`cleared ${n} cached alert clips`); return; }
    if (v === 'status' || v === undefined) { console.log(`${cacheFiles().length} cached alert clips in ${CACHE}`); return; }
    console.log('use --alertCache status or --alertCache clear'); return;
  }
  if (a === '--alertEngine') { // piper = alerts in the Piper voice (everything on Piper); custom = the saved --alertCommand engine for alerts only
    if (v !== 'piper' && v !== 'custom') { console.log('use --alertEngine piper or --alertEngine custom'); return; }
    if (v === 'custom' && !settings().alertCommandSaved) { console.log('no custom engine saved yet: set one with --alertCommand "<command with {wav}>"'); return; }
    setConfig('alertEngine', v); console.log(status()); return;
  }
  if (a === '--alert') { // spoken test of the alert voice, with no away check
    const q = argv.slice(1).join(' ').trim() || 'Do you want me to continue?';
    launch(alertParts(clean(q, 200), settings().alertPhrases).join('\n'), true, 'alertnow'); return;
  }
  if (a === '--voice') {
    if (v !== 'male' && v !== 'female') { console.log('use --voice male or --voice female'); return; }
    setConfig('gender', v); console.log(status()); return;
  }
  const key = a ? a.slice(2) : undefined;
  if (key && LIMITS[key]) {
    const n = Number(v);
    if (!Number.isFinite(n) || v === undefined || v === '') { console.log(`use --${key} ${LIMITS[key][0]} to ${LIMITS[key][1]}`); return; }
    setConfig(key, clamp(n, LIMITS[key])); console.log(status()); return;
  }
  if (a === '--worker') return drain();
  if (a === '--say') { launch(clean(argv.slice(1).join(' '), settings().max), true); return; }
  if (a === '--mode') {
    if (v !== 'auto' && v !== 'manual') { console.log('use --mode manual (play button, like claude.ai) or --mode auto (speak every reply)'); return; }
    setConfig('mode', v); console.log(status()); return;
  }
  if (a === '--replay' || a === '--play') {
    const st = readState();
    if (!st.text) { console.log('nothing to replay yet'); return; }
    if (isOff()) { console.log('muted; unmute first'); return; }
    st.pending = false; writeState(st);
    launch(st.text, true);
    console.log('replaying the last reply');
    return;
  }
  let hook: HookPayload;
  try { hook = JSON.parse(readStdin()); } catch { return; }
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
  // manual (the default, like the play button on claude.ai): keep the reply for --play; auto: speak it now
  const s = settings();
  const speakNow = s.mode === 'auto' && !isOff();
  st.pending = !!text && !speakNow;
  writeState(st);
  if (text && speakNow) launch(text, false);
  else if (s.alerts && !isOff()) {
    // manual mode keeps the reply silent, so a reply that ends on a question gets a short alert in the second voice
    // (the worker drops it if you are at the keyboard); in auto mode the reply itself is read and already ends on the question
    const q = trailingQuestion(entry.text);
    if (q) launch(alertParts(clean(q, 200), s.alertPhrases).join('\n'), false, 'alert');
  }
}

if (require.main === module) {
  try {
    const r = main(process.argv.slice(2));
    if (r && (r as Promise<void>).catch) (r as Promise<void>).catch(() => {}); // the worker's promise; fail open
  } catch { /* fail open */ }
  process.exitCode = 0;
}
