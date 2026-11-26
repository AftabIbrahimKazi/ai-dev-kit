// Arrow-key menus: key parsing, one menu on a fake terminal, then back / redo / summary through the installer's step runner.
const assert = require('node:assert');
const { parseKeys, runMenu, QuitSignal } = require('../skills/meta/install-kit.select.js');
const cli = require('../skills/meta/install-kit.cli.js');

let failed = 0;
// A menu that never resolves would end the process with exit code 0 and look like a pass: fail unless the run reached its end.
let finished = false;
process.on('exit', () => { if (!finished) { console.log('FAIL the test run never finished (a menu or step is waiting forever)'); process.exitCode = 1; } });
const t = async (name, fn) => { try { await fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message); } };

const UP = '\x1b[A', DOWN = '\x1b[B', RIGHT = '\x1b[C', LEFT = '\x1b[D', ENTER = '\r';

// A fake terminal. `script` holds one list of key chunks per menu that opens; each is sent once the menu is listening.
function fakeTerm(script) {
  const menus = [];
  const raw = [];
  let listener = null;
  const io = {
    color: false,
    output: { write: (s) => { if (menus.length) menus[menus.length - 1].out += s; } },
    input: {
      setRawMode(v) { raw.push(v); }, resume() {}, pause() {}, setEncoding() {},
      on(_ev, fn) {
        listener = fn;
        const keys = script[menus.length] || [];
        menus.push({ out: '' });
        setImmediate(() => { for (const k of keys) { if (listener !== fn) return; fn(k); } });
      },
      off(_ev, fn) { if (listener === fn) listener = null; },
    },
  };
  return { io, menus, raw };
}

(async () => {
  await t('parseKeys: arrows, enter, space, backspace, q, ctrl-c; unknown escape ignored', () => {
    assert.deepStrictEqual(parseKeys(UP + DOWN + LEFT + RIGHT), ['up', 'down', 'left', 'right']);
    assert.deepStrictEqual(parseKeys('\r \x7fq\x03'), ['enter', 'space', 'back', 'quit', 'quit']);
    assert.deepStrictEqual(parseKeys('\x1b'), ['back']);
    assert.deepStrictEqual(parseKeys('\x1b[Z'), []);
  });

  const spec = (o) => ({ header: 'Step 1 of 3', question: 'Pick', items: [{ title: 'one' }, { title: 'two' }, { title: 'three' }], canBack: true, ...o });

  await t('single menu: Down then Enter picks the second; the footer lists the keys', async () => {
    const { io, menus } = fakeTerm([[DOWN, ENTER]]);
    const r = await runMenu(io, spec());
    assert.deepStrictEqual(r, { kind: 'pick', picked: [1] });
    assert.ok(/Step 1 of 3/.test(menus[0].out) && /Left undo/.test(menus[0].out) && /Enter confirm/.test(menus[0].out));
  });

  await t('Up from the first item wraps to the last', async () => {
    const { io } = fakeTerm([[UP, ENTER]]);
    assert.deepStrictEqual(await runMenu(io, spec()), { kind: 'pick', picked: [2] });
  });

  await t('Left, Backspace and Esc go back; with no earlier step they do nothing', async () => {
    for (const k of [LEFT, '\x7f', '\x1b']) assert.deepStrictEqual(await runMenu(fakeTerm([[k]]).io, spec()), { kind: 'back' });
    const first = fakeTerm([[LEFT, ENTER]]);
    assert.deepStrictEqual(await runMenu(first.io, spec({ canBack: false })), { kind: 'pick', picked: [0] });
    assert.ok(!/Left undo/.test(first.menus[0].out));
  });

  await t('Right replays only when an earlier answer is remembered', async () => {
    assert.deepStrictEqual(await runMenu(fakeTerm([[RIGHT]]).io, spec({ canRedo: true, initial: [2] })), { kind: 'pick', picked: [2] });
    assert.deepStrictEqual(await runMenu(fakeTerm([[RIGHT, ENTER]]).io, spec({ canRedo: false })), { kind: 'pick', picked: [0] });
  });

  await t('multi menu: Space ticks, a ticks all, n clears, initial ticks are kept', async () => {
    assert.deepStrictEqual(await runMenu(fakeTerm([[' ', DOWN, DOWN, ' ', ENTER]]).io, spec({ multi: true })), { kind: 'pick', picked: [0, 2] });
    assert.deepStrictEqual(await runMenu(fakeTerm([['a', ENTER]]).io, spec({ multi: true })), { kind: 'pick', picked: [0, 1, 2] });
    assert.deepStrictEqual(await runMenu(fakeTerm([['n', ENTER]]).io, spec({ multi: true, initial: [0, 1] })), { kind: 'pick', picked: [] });
    assert.deepStrictEqual(await runMenu(fakeTerm([[ENTER]]).io, spec({ multi: true, initial: [1] })), { kind: 'pick', picked: [1] });
  });

  await t('q and Ctrl-C quit with QuitSignal', async () => {
    for (const k of ['q', '\x03']) await assert.rejects(runMenu(fakeTerm([[k]]).io, spec()), QuitSignal);
  });

  // The step runner with menus: three questions, so back, redo and the summary screen can be walked.
  const flow = (log) => (args) => [
    async () => { args.a = await cli.__testApi.askSelect('Pick A', [{ title: 'a0', value: 'a0' }, { title: 'a1', value: 'a1' }], 0); log.push('A=' + args.a); },
    async () => { args.b = await cli.__testApi.askYesNo('Do B?', false); log.push('B=' + args.b); },
    async () => { args.c = await cli.__testApi.askSelect('Pick C', [{ title: 'c0', value: 'c0' }, { title: 'c1', value: 'c1' }], 0); log.push('C=' + args.c); },
  ];

  await t('back from step 2 returns to step 1 with its answer pre-selected, and Right redoes it', async () => {
    const { io, menus } = fakeTerm([
      [DOWN, ENTER],      // A: a1
      [LEFT],             // B: go back
      [RIGHT],            // A again: remembered a1, replay it
      [ENTER],            // B: No
      [ENTER],            // C: c0
      [ENTER],            // summary: Install
    ]);
    cli.setMenuIO(io);
    const args = { skills: [] }, log = [];
    try { await cli.__testApi.runSteps(args, flow(log)(args)); } finally { cli.setMenuIO(null); }
    assert.strictEqual(args.a, 'a1');
    assert.strictEqual(args.b, false);
    assert.strictEqual(args.c, 'c0');
    assert.ok(/Right redo/.test(menus[2].out), 'the second visit to step 1 offers redo');
    assert.ok(!/Right redo/.test(menus[3].out), 'step 2 was never answered, so no redo there');
    assert.ok(menus.length === 6);
  });

  await t('summary lists the answers; Change an answer re-asks that step; changing it forgets the later redo', async () => {
    const { io, menus } = fakeTerm([
      [ENTER],            // A: a0
      [ENTER],            // B: No
      [ENTER],            // C: c0
      [DOWN, ENTER],      // summary: Change an answer
      [DOWN, ENTER],      // which: the second (B)
      [UP, ENTER],        // B again (remembered No, redo offered): change to Yes
      [ENTER],            // C again: no redo, because an earlier answer changed
      [ENTER],            // summary: Install
    ]);
    cli.setMenuIO(io);
    const args = { skills: [] }, log = [];
    try { await cli.__testApi.runSteps(args, flow(log)(args)); } finally { cli.setMenuIO(null); }
    assert.strictEqual(args.b, true);
    assert.ok(/Ready to write the files/.test(menus[3].out));
    assert.ok(/Right redo/.test(menus[5].out), 'B offers redo of its remembered answer');
    assert.ok(!/Right redo/.test(menus[6].out), 'C redo was cleared by the changed answer');
  });

  await t('Cancel on the summary writes nothing and signals quit', async () => {
    const { io } = fakeTerm([[ENTER], [ENTER], [ENTER], [DOWN, DOWN, ENTER]]);
    cli.setMenuIO(io);
    const args = { skills: [] };
    try { await assert.rejects(cli.__testApi.runSteps(args, flow([])(args)), QuitSignal); } finally { cli.setMenuIO(null); }
  });

  await t('--yes installs with every default and asks nothing, even with no terminal', () => {
    const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
    const { spawnSync } = require('node:child_process');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yes-'));
    fs.writeFileSync(path.join(root, 'package.json'), '{}');
    const lib = path.join(__dirname, '..');
    const r = spawnSync(process.execPath, [path.join(lib, 'skills', 'meta', 'install-kit.cli.js'), 'install', '--yes', '--library', lib, '--root', root, '--tool', 'claude'], { input: '', encoding: 'utf8', timeout: 120000 });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(fs.existsSync(path.join(root, '.claude', 'skills-archive', 'code-audit')), 'default skills installed (archivable ones start archived)');
    assert.ok(fs.existsSync(path.join(root, '.ai-dev-kit.json')));
  });

  await t('ai backends: --yes writes nothing, --reviewer ollama and --ai write the file, and bad values exit 2', () => {
    const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
    const { spawnSync } = require('node:child_process');
    const lib = path.join(__dirname, '..');
    const bin = path.join(lib, 'skills', 'meta', 'install-kit.cli.js');
    const run = (root, ...extra) => spawnSync(process.execPath, [bin, 'install', '--library', lib, '--root', root, '--tool', 'claude', '--skills', 'implicit-state-audit', ...extra], { input: '', encoding: 'utf8', timeout: 120000 });
    const cfg = (root) => JSON.parse(fs.readFileSync(path.join(root, '.claude', 'ai-backends.json'), 'utf8'));
    const a = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-'));
    fs.writeFileSync(path.join(a, 'package.json'), '{}');
    assert.strictEqual(run(a, '--yes').status, 0);
    assert.ok(!fs.existsSync(path.join(a, '.claude', 'ai-backends.json')), '--yes ticks nothing: no file, nothing leaves the machine');
    const b = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-'));
    fs.writeFileSync(path.join(b, 'package.json'), '{}');
    assert.strictEqual(run(b, '--yes', '--reviewer', 'ollama').status, 0);
    assert.deepStrictEqual(cfg(b).review, ['code', 'ollama']);
    assert.strictEqual(run(a, '--reviewer', 'bogus').status, 2);
    assert.strictEqual(run(a, '--ai', 'review=gemini').status, 2);
    assert.strictEqual(run(a, '--ai', 'nonsense').status, 2);
    assert.ok(fs.existsSync(path.join(a, '.claude', 'skills-archive', 'implicit-state-audit', 'scan.js')) && fs.existsSync(path.join(a, '.claude', 'skills-archive', 'implicit-state-audit', 'ask.txt')));
  });

  await t('vim keys and capitals: k up, j down, A all, N none, Q quit; an unknown letter is dropped; Home and End', async () => {
    assert.deepStrictEqual(parseKeys('kj'), ['up', 'down']);
    assert.deepStrictEqual(parseKeys('AN'), ['all', 'none']);
    assert.deepStrictEqual(parseKeys('Q'), ['quit']);
    assert.deepStrictEqual(parseKeys('x'), []);
    assert.deepStrictEqual(parseKeys('\x1b[H\x1b[F'), ['home', 'end']);
  });

  await t('Home and End jump to the first and last item, and the last frame marks only the cursor row', async () => {
    assert.deepStrictEqual(await runMenu(fakeTerm([[DOWN, '\x1b[H', ENTER]]).io, spec()), { kind: 'pick', picked: [0] });
    assert.deepStrictEqual(await runMenu(fakeTerm([['\x1b[F', ENTER]]).io, spec()), { kind: 'pick', picked: [2] });
    const c = fakeTerm([[DOWN, ENTER]]); await runMenu(c.io, spec());
    const last = c.menus[0].out.split('\x1b[0J').pop();
    assert.ok(last.includes('(*) two') && last.includes('( ) one') && !last.includes('(*) one'), last);
  });

  await t('input may arrive as Buffers, and raw mode is switched on for the menu and off afterwards', async () => {
    const term = fakeTerm([[Buffer.from(DOWN), Buffer.from(ENTER)]]);
    assert.deepStrictEqual(await runMenu(term.io, spec()), { kind: 'pick', picked: [1] });
    assert.deepStrictEqual(term.raw, [true, false]);
  });

  await t('multi picks come back in item order, whatever order they were ticked in', async () => {
    assert.deepStrictEqual(await runMenu(fakeTerm([[DOWN, DOWN, ' ', UP, UP, ' ', ENTER]]).io, spec({ multi: true })), { kind: 'pick', picked: [0, 2] });
  });

  await t('changing the first answer forgets every later redo', async () => {
    const { io, menus } = fakeTerm([
      [ENTER],            // A: a0
      [ENTER],            // B: No
      [ENTER],            // C: c0
      [DOWN, ENTER],      // summary: Change an answer
      [ENTER],            // which: the first (A)
      [DOWN, ENTER],      // A again (remembered a0, redo offered): change to a1
      [ENTER],            // B again: no redo, because the first answer changed
      [ENTER],            // C again
      [ENTER],            // summary: Install
    ]);
    cli.setMenuIO(io);
    const args = { skills: [] }, log = [];
    try { await cli.__testApi.runSteps(args, flow(log)(args)); } finally { cli.setMenuIO(null); }
    assert.strictEqual(args.a, 'a1');
    assert.ok(/Right redo/.test(menus[5].out), 'A offers redo of its remembered answer');
    assert.ok(!/Right redo/.test(menus[6].out), 'B redo was cleared by the changed first answer');
    assert.strictEqual(menus.length, 9);
  });

  finished = true;
  if (failed) { console.log('install-kit.select.test: FAILED'); process.exit(1); }
  console.log('install-kit.select.test: ok');
})();
