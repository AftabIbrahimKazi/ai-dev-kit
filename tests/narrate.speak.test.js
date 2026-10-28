const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { lastReply, clean, shape, settings } = require('../skills/addons/narrate.speak.js');
const SCRIPT = path.join(__dirname, '../skills/addons/narrate.speak.js');

const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const asst = (...blocks) => JSON.stringify({ message: { role: 'assistant', content: blocks } });
const text = (s) => ({ type: 'text', text: s });

t('lastReply takes the final assistant text, skipping tool-only entries', () => {
  const j = [asst(text('first')), asst(text('final answer')), asst({ type: 'tool_use', name: 'Bash' }),
    JSON.stringify({ message: { role: 'user', content: [{ type: 'tool_result' }] } })].join('\n');
  assert.strictEqual(lastReply(j), 'final answer');
});
t('lastReply survives bad lines and empty transcripts', () => {
  assert.strictEqual(lastReply('not json\n' + asst(text('ok')) + '\n{broken'), 'ok');
  assert.strictEqual(lastReply(''), '');
});
t('clean drops code fences, tables, urls and markdown marks', () => {
  const md = '# Title\n\nUse **bold** and `code`.\n\n```js\nconst x = 1;\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- [link](http://x.io) item\nSee https://x.io now';
  assert.strictEqual(clean(md), 'Title. Use bold and code. link item. See now. Code and tables are on screen.');
});
t('clean keeps snake_case identifiers intact', () => {
  assert.strictEqual(clean('call my_func_name now'), 'call my_func_name now.');
});
t('clean cuts at a sentence end under the limit', () => {
  const s = clean('One two three. Four five six. Seven eight nine ten eleven.', 30);
  assert.strictEqual(s, 'One two three. Four five six. The rest is on screen.');
});
t('hook mode exits 0 and stays silent when off or given junk', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nar-'));
  const env = { ...process.env, NARRATE: '0', HOME: home, USERPROFILE: home };
  for (const input of ['', 'junk', JSON.stringify({ transcript_path: path.join(home, 'none.jsonl') })]) {
    const r = spawnSync(process.execPath, [SCRIPT], { input, env, encoding: 'utf8' });
    assert.strictEqual(r.status, 0); assert.strictEqual(r.stdout, '');
  }
});
const homeEnv = () => { const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nar-')); return { home, env: { ...process.env, HOME: home, USERPROFILE: home } }; };
const cli = (env, ...a) => spawnSync(process.execPath, [SCRIPT, ...a], { env, encoding: 'utf8' }).stdout.trim();
const wav = (rate, samples) => {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) => b.writeInt16LE(v, 44 + i * 2));
  return b;
};

t('--mute and --unmute toggle the switch file', () => {
  const { home, env } = homeEnv();
  assert.strictEqual(cli(env, '--mute'), 'muted');
  assert.ok(fs.existsSync(path.join(home, '.claude', 'narrate.off')));
  assert.ok(cli(env, '--status').startsWith('muted'));
  assert.strictEqual(cli(env, '--unmute'), 'unmuted');
  assert.ok(cli(env, '--status').startsWith('on'));
});
t('voice, volume, speed and pitch are saved and clamped', () => {
  const { home, env } = homeEnv();
  cli(env, '--voice', 'male'); cli(env, '--volume', '150'); cli(env, '--speed', '1.5'); cli(env, '--pitch', '-20');
  const c = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'narrate.json'), 'utf8'));
  assert.deepStrictEqual([c.gender, c.volume, c.speed, c.pitch], ['male', 100, 1.5, -12]);
});
t('bad values are refused and change nothing', () => {
  const { home, env } = homeEnv();
  assert.ok(cli(env, '--voice', 'robot').startsWith('use --voice'));
  assert.ok(cli(env, '--speed', 'fast').startsWith('use --speed'));
  assert.ok(!fs.existsSync(path.join(home, '.claude', 'narrate.json')));
});
t('default voices are British; an install that only has the older American voices keeps using them', () => {
  const pick = (files) => {
    const { home, env } = homeEnv();
    const dir = path.join(home, '.claude', 'voices'); fs.mkdirSync(dir, { recursive: true });
    for (const f of files) fs.writeFileSync(path.join(dir, f), '');
    const r = spawnSync(process.execPath, ['-e', `const s=require(${JSON.stringify(SCRIPT)});console.log(path=require('path').basename(s.defaultVoice('female'))+' '+require('path').basename(s.defaultVoice('male')))`], { env, encoding: 'utf8' });
    return r.stdout.trim();
  };
  assert.strictEqual(pick([]), 'en_GB-jenny_dioco-medium.onnx en_GB-northern_english_male-medium.onnx');
  assert.strictEqual(pick(['en_US-ljspeech-medium.onnx', 'en_US-joe-medium.onnx']), 'en_US-ljspeech-medium.onnx en_US-joe-medium.onnx');
  assert.strictEqual(pick(['en_US-ljspeech-medium.onnx', 'en_GB-jenny_dioco-medium.onnx']), 'en_GB-jenny_dioco-medium.onnx en_GB-northern_english_male-medium.onnx');
});
t('settings defaults to the female voice file and picks the male one on request', () => {
  assert.ok(/en_(GB-jenny_dioco|US-ljspeech)-medium\.onnx$/.test(settings({}).model));
  assert.ok(/en_(GB-northern_english_male|US-joe)-medium\.onnx$/.test(settings({ gender: 'male' }).model));
  assert.strictEqual(settings({ volume: 'x', speed: 9 }).speed, 2);
});
t('shape scales volume and raises the sample rate by the pitch', () => {
  const out = shape(wav(22050, [1000, -2000, 32000]), 50, 12);
  assert.strictEqual(out.readUInt32LE(24), 44100);
  assert.deepStrictEqual([44, 46, 48].map((o) => out.readInt16LE(o)), [500, -1000, 16000]);
  assert.strictEqual(shape(wav(22050, [1]), 100, 0).readUInt32LE(24), 22050);
});
t('shape leaves a non-wav buffer alone', () => {
  const junk = Buffer.from('not a wav file at all, just bytes that are long enough to pass the size check....');
  assert.strictEqual(shape(junk, 10, 5), junk);
});

const SETUP = path.join(__dirname, '../skills/addons/narrate.setup.js');
const { addVoice, parseArgs, installCommand, launcherText, voiceUrls } = require(SETUP);
t('setup accepts commands, hotkeys or both and refuses anything else', () => {
  for (const c of ['commands', 'hotkeys', 'both']) assert.strictEqual(parseArgs(['--controls', c]).controls, c);
  assert.throws(() => parseArgs(['--controls', 'voice']));
  assert.throws(() => parseArgs([]));
});
t('setup installs the command with the skill root filled in and never overwrites', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nar-'));
  assert.ok(installCommand(d, 'skills').startsWith('commands: installed'));
  const f = path.join(d, '.claude', 'commands', 'narration.md');
  const body = fs.readFileSync(f, 'utf8');
  assert.ok(body.includes('node skills/narrate/speak.js') && !body.includes('{{skill-root}}'));
  fs.writeFileSync(f, 'mine');
  assert.ok(installCommand(d, 'skills').includes('already exists'));
  assert.strictEqual(fs.readFileSync(f, 'utf8'), 'mine');
});
t('setup commands-only run touches no python and exits 0', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nar-'));
  const r = spawnSync(process.execPath, [SETUP, '--controls', 'commands', '--project', d], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0); assert.ok(r.stdout.startsWith('commands: installed'));
  assert.strictEqual(spawnSync(process.execPath, [SETUP, '--controls', 'x'], { encoding: 'utf8' }).status, 1);
});
t('launcher runs hotkeys only unless dictation is chosen', () => {
  assert.ok(launcherText('python', false).includes('--no-dictate'));
  assert.ok(!launcherText('python', true).includes('--no-dictate'));
});
t('setup --voices stands alone and builds the model and config urls', () => {
  assert.strictEqual(parseArgs(['--voices']).voices, true);
  assert.deepStrictEqual(voiceUrls('jenny_dioco').map((u) => u.split('/').pop()), ['en_GB-jenny_dioco-medium.onnx', 'en_GB-jenny_dioco-medium.onnx.json']);
  assert.ok(voiceUrls('joe')[0].startsWith('https://huggingface.co/rhasspy/piper-voices/'));
});
t('add-voice validates its arguments', () => {
  assert.deepStrictEqual(parseArgs(['--add-voice', 'male', 'v.onnx']).addVoice, { gender: 'male', src: 'v.onnx' });
  assert.throws(() => parseArgs(['--add-voice', 'robot', 'v.onnx']));
  assert.throws(() => parseArgs(['--add-voice', 'male']));
});
t('add-voice registers a local model in the right slot and refuses a missing .json', async () => {
  const { home } = homeEnv();
  const saved = [process.env.HOME, process.env.USERPROFILE];
  process.env.HOME = process.env.USERPROFILE = home;
  try {
    const m = path.join(home, 'my.onnx'); fs.writeFileSync(m, 'x');
    assert.ok((await addVoice({ gender: 'male', src: m })).includes('.json is missing'));
    fs.writeFileSync(m + '.json', '{}');
    assert.ok((await addVoice({ gender: 'male', src: m })).startsWith('add-voice: male voice is now'));
    assert.ok((await addVoice({ gender: 'female', src: path.join(home, 'x.txt') })).includes('not a Piper'));
    const c = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'narrate.json'), 'utf8'));
    assert.strictEqual(c.voices.male, m.split(path.sep).join('/'));
    assert.strictEqual(c.voices.female, undefined);
  } finally { [process.env.HOME, process.env.USERPROFILE] = saved; }
});
const { otherPlayer, otherSpeech, wavSeconds, chunks } = require('../skills/addons/narrate.speak.js');
const only = (...names) => (c) => names.includes(c);
t('linux picks the first available player, in sound-server order', () => {
  assert.deepStrictEqual(otherPlayer('a.wav', only('aplay', 'paplay'), 'linux', {}), ['paplay', 'a.wav']);
  assert.deepStrictEqual(otherPlayer('a.wav', only('pw-play', 'aplay'), 'linux', {}), ['pw-play', 'a.wav']);
  assert.deepStrictEqual(otherPlayer('a.wav', only('aplay'), 'linux', {}), ['aplay', '-q', 'a.wav']);
  assert.strictEqual(otherPlayer('a.wav', only(), 'linux', {}), null);
});
t('mac uses afplay and its own say voice', () => {
  assert.deepStrictEqual(otherPlayer('a.wav', only('afplay'), 'darwin', {}), ['afplay', 'a.wav']);
  assert.deepStrictEqual(otherSpeech('hi', only(), 'darwin', {}), ['say', 'hi']);
});
t('termux (android) uses termux-media-player and termux-tts-speak', () => {
  const env = { PREFIX: '/data/data/com.termux/files/usr' };
  const p = otherPlayer('a.wav', only('termux-media-player'), 'linux', env);
  assert.deepStrictEqual([...p], ['termux-media-player', 'play', 'a.wav']);
  assert.ok(p.wait >= 300);
  assert.deepStrictEqual(otherSpeech('hi', only('termux-tts-speak'), 'linux', env), ['termux-tts-speak', 'hi']);
  assert.strictEqual(otherPlayer('a.wav', only('aplay'), 'linux', env), null);
});
t('linux speech falls back through spd-say, espeak-ng, espeak', () => {
  assert.strictEqual(otherSpeech('hi', only('espeak'), 'linux', {})[0], 'espeak');
  assert.strictEqual(otherSpeech('hi', only('espeak-ng', 'espeak'), 'linux', {})[0], 'espeak-ng');
  assert.strictEqual(otherSpeech('hi', only(), 'linux', {}), null);
});
t('wavSeconds reads the clip length from the header', () => {
  const f = path.join(os.tmpdir(), 'nar-len.wav');
  fs.writeFileSync(f, wav(22050, new Array(22050).fill(1)));
  assert.strictEqual(wavSeconds(f), 1000);
});
t('launcher is a shell script off Windows', () => {
  assert.ok(launcherText('python3', false, 'linux').startsWith('#!/bin/sh'));
  assert.ok(launcherText('python', false, 'win32').startsWith('@echo off'));
});
t('a code-only reply is announced instead of going silent', () => {
  assert.strictEqual(clean('```js\nconst x = 1;\n```'), 'Code and tables are on screen.');
  assert.strictEqual(clean('Plain text only.'), 'Plain text only.');
});
t('a long reply is spoken in full: the default cap is high and the rest is announced only past it', () => {
  const long = 'This is one sentence of ordinary length. '.repeat(100);
  assert.ok(clean(long).length > 3500 && !clean(long).includes('The rest is on screen'));
  assert.ok(clean('word. '.repeat(3000)).endsWith('The rest is on screen.'));
});
t('chunks split at sentence ends, keep every word and stay near the size', () => {
  const text = 'First sentence here. Second one follows! Is this the third? Yes it is. And a fourth to finish.';
  const parts = chunks(text, 40);
  assert.strictEqual(parts.join(' '), text);
  assert.ok(parts.length > 1 && parts.every((p) => p.length <= 60));
  assert.deepStrictEqual(chunks('Short.'), ['Short.']);
  assert.deepStrictEqual(chunks(''), []);
});
t('the reading limit is set in seconds and scales with speed', () => {
  assert.strictEqual(settings({}).max, 300 * 16);
  assert.strictEqual(settings({ speed: 2 }).max, 300 * 16 * 2);
  assert.strictEqual(settings({ maxSeconds: 60, speed: 1.5 }).max, 60 * 16 * 1.5);
  assert.strictEqual(settings({ maxSeconds: 1800, speed: 2 }).max, 12000);
});
t('a fixed character limit overrides the time limit, and bad values fall back', () => {
  assert.strictEqual(settings({ max: 500, maxSeconds: 900 }).max, 500);
  assert.strictEqual(settings({ maxSeconds: 5 }).max, 30 * 16);
  assert.strictEqual(settings({ maxSeconds: 'x' }).max, 300 * 16);
});
t('--maxSeconds is saved, clamped and shown in the status', () => {
  const { home, env } = homeEnv();
  assert.ok(cli(env, '--maxSeconds', '120').includes('reads up to 1920 characters'));
  cli(env, '--maxSeconds', '99999');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(home, '.claude', 'narrate.json'), 'utf8')).maxSeconds, 1800);
});

// hook runs against a sandbox home and temp folder, with a command engine that fails at once: nothing is ever played
const quiet = () => {
  const { home, env } = homeEnv();
  const tmp = path.join(home, 'tmp'); fs.mkdirSync(tmp, { recursive: true });
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'narrate.json'), JSON.stringify({ engine: 'command', command: 'exit 1' }));
  return { home, tmp, env: { ...env, NARRATE_TMP: tmp } };
};
const hookRun = (env, tr) => spawnSync(process.execPath, [SCRIPT], { env, input: JSON.stringify({ transcript_path: tr }), encoding: 'utf8' });
const entry = (uuid, txt) => JSON.stringify({ uuid, message: { role: 'assistant', content: [{ type: 'text', text: txt }] } }) + '\n';
const spoken = (home) => JSON.parse(fs.readFileSync(path.join(home, '.claude', 'narrate-last.json'), 'utf8'));
t('a reply is spoken once: the same reply found again by a later Stop is skipped', () => {
  const { home, env } = quiet();
  const tr = path.join(home, 'tr.jsonl'); fs.writeFileSync(tr, entry('u1', 'First reply.'));
  hookRun(env, tr);
  const first = spoken(home);
  assert.strictEqual(first.seen[tr], 'u1'); assert.strictEqual(first.text, 'First reply.');
  // a later Stop whose turn added no text: the transcript still ends on the same reply
  fs.appendFileSync(tr, JSON.stringify({ message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash' }] } }) + '\n');
  const before = fs.statSync(path.join(home, '.claude', 'narrate-last.json')).mtimeMs;
  hookRun(env, tr);
  assert.strictEqual(fs.statSync(path.join(home, '.claude', 'narrate-last.json')).mtimeMs, before);
});
t('a new reply with identical text is still spoken, because its id differs', () => {
  const { home, env } = quiet();
  const tr = path.join(home, 'tr.jsonl'); fs.writeFileSync(tr, entry('u1', 'Done.'));
  hookRun(env, tr);
  fs.appendFileSync(tr, entry('u2', 'Done.'));
  hookRun(env, tr);
  assert.strictEqual(spoken(home).seen[tr], 'u2');
});
t('a muted reply is recorded but not queued, so unmuting does not replay it', () => {
  const { home, tmp, env } = quiet();
  cli(env, '--mute');
  const tr = path.join(home, 'tr.jsonl'); fs.writeFileSync(tr, entry('u1', 'Muted reply.'));
  hookRun(env, tr);
  assert.strictEqual(spoken(home).seen[tr], 'u1');
  assert.ok(!fs.existsSync(path.join(tmp, 'narrate-queue')) || fs.readdirSync(path.join(tmp, 'narrate-queue')).length === 0);
  cli(env, '--unmute'); hookRun(env, tr);
  assert.ok(!fs.existsSync(path.join(tmp, 'narrate-queue')) || fs.readdirSync(path.join(tmp, 'narrate-queue')).length === 0);
});
t('--replay repeats the last reply on command, and refuses when muted or empty', () => {
  const { home, env } = quiet();
  assert.strictEqual(cli(env, '--replay'), 'nothing to replay yet');
  const tr = path.join(home, 'tr.jsonl'); fs.writeFileSync(tr, entry('u1', 'Say this again.'));
  hookRun(env, tr);
  assert.strictEqual(cli(env, '--replay'), 'replaying the last reply');
  cli(env, '--mute');
  assert.strictEqual(cli(env, '--replay'), 'muted; unmute first');
});

t('default mode is manual (play button): the hook keeps the reply as pending and queues nothing', () => {
  const { home, tmp, env } = quiet();
  assert.ok(cli(env, '--status').includes('mode manual'));
  const tr = path.join(home, 'tr.jsonl'); fs.writeFileSync(tr, entry('u1', 'Read me on request.'));
  hookRun(env, tr);
  const st = spoken(home);
  assert.strictEqual(st.text, 'Read me on request.'); assert.strictEqual(st.pending, true);
  assert.ok(!fs.existsSync(path.join(tmp, 'narrate-queue')) || fs.readdirSync(path.join(tmp, 'narrate-queue')).length === 0);
});
t('--play speaks the pending reply and clears pending', () => {
  const { home, env } = quiet();
  const tr = path.join(home, 'tr.jsonl'); fs.writeFileSync(tr, entry('u1', 'Play me.'));
  hookRun(env, tr);
  assert.strictEqual(cli(env, '--play'), 'replaying the last reply');
  assert.strictEqual(spoken(home).pending, false);
});
t('--mode auto speaks each reply by itself; bad modes are refused; the mode is saved', () => {
  const { home, env } = quiet();
  assert.ok(cli(env, '--mode', 'auto').includes('mode auto'));
  assert.ok(cli(env, '--mode', 'loud').startsWith('use --mode'));
  const tr = path.join(home, 'tr.jsonl'); fs.writeFileSync(tr, entry('u1', 'Spoken at once.'));
  hookRun(env, tr);
  assert.strictEqual(spoken(home).pending, false);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(home, '.claude', 'narrate.json'), 'utf8')).mode, 'auto');
  cli(env, '--mode', 'manual');
  assert.ok(cli(env, '--status').includes('mode manual'));
});
