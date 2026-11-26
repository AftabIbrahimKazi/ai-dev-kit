// Shared backend cascade: fixed order, fallthrough on every failure, Claude handoff when nothing answers, secrets masked.
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const b = require('../skills/workflow/plan-first.backends.js');

let failed = 0;
const check = (name, ok, extra) => { if (ok) console.log('ok   ' + name); else { failed++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); } };

function server(handler) {
  return new Promise((resolve) => {
    const calls = [];
    const s = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => { calls.push({ url: req.url, auth: req.headers.authorization, body }); handler(req, res, body); });
    });
    s.listen(0, '127.0.0.1', () => resolve({ s, calls, base: `http://127.0.0.1:${s.address().port}` }));
  });
}
const json = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };

(async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-home-'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-root-'));
  fs.mkdirSync(path.join(root, '.claude'));
  const cfg = (o) => fs.writeFileSync(path.join(root, '.claude', 'ai-backends.json'), JSON.stringify(o));

  // config: order is fixed, unknown names dropped, missing or empty means Claude
  check('no config file means no backends', b.readBackends(root, 'review').length === 0);
  cfg({ review: ['unified', 'bogus', 'code', 'ollama'], tests: [] });
  check('order is fixed whatever the file says', JSON.stringify(b.readBackends(root, 'review')) === JSON.stringify(['code', 'ollama', 'unified']));
  check('empty list means Claude', b.readBackends(root, 'tests').length === 0);
  check('unlisted feature means Claude', b.readBackends(root, 'image').length === 0);
  fs.writeFileSync(path.join(root, '.claude', 'ai-backends.json'), '{not json');
  check('broken config means Claude, no throw', b.readBackends(root, 'review').length === 0);
  check('hasModel ignores the code step', !b.hasModel(['code']) && b.hasModel(['code', 'unified']));

  // nothing allowed -> handoff, nothing contacted
  let r = await b.ask('p', 't', [], {}, { AI_DEV_KIT_HOME: home });
  check('no backends hands over to Claude', r.handoff === true && r.notes.length === 0);
  r = await b.ask('p', 't', ['code'], {}, { AI_DEV_KIT_HOME: home });
  check('code alone is not a model: handoff', r.handoff === true);

  // ollama (loopback) via models.json
  const oll = await server((req, res) => json(res, 200, { response: 'from-ollama' }));
  fs.writeFileSync(path.join(home, 'models.json'), JSON.stringify({ system2: { baseUrl: oll.base, model: 'm1' } }));
  const kag = await server((req, res) => json(res, 200, { response: 'from-kaggle' }));
  const uni = await server((req, res) => json(res, 200, { choices: [{ message: { content: 'from-unified' } }] }));
  const env = { AI_DEV_KIT_HOME: home, LOCAL_LLM_URL: kag.base, UNIFIED_API_BASE: uni.base, UNIFIED_API_KEY: 'k-123456' };

  r = await b.ask('p', 't', ['unified', 'kaggle', 'ollama'], {}, env);
  check('ollama answers first when allowed', r.backend === 'ollama' && r.text === 'from-ollama' && kag.calls.length === 0 && uni.calls.length === 0);
  r = await b.ask('p', 't', ['unified', 'kaggle'], {}, env);
  check('kaggle before unified', r.backend === 'kaggle' && uni.calls.length === 0);
  r = await b.ask('p', 't', ['unified'], {}, env);
  check('unified alone answers', r.backend === 'unified' && r.text === 'from-unified');
  const sent = JSON.parse(uni.calls[0].body);
  check('unified sends model auto, bearer key, chat path', sent.model === 'auto' && uni.calls[0].auth === 'Bearer k-123456' && uni.calls[0].url === '/v1/chat/completions');

  // fallthrough on failure and on unusable replies
  const bad = await server((req, res) => json(res, 500, {}));
  fs.writeFileSync(path.join(home, 'models.json'), JSON.stringify({ system2: { baseUrl: bad.base } }));
  r = await b.ask('p', 't', ['ollama', 'unified'], {}, env);
  check('failed ollama falls through to unified, note kept', r.backend === 'unified' && r.notes.some((n) => /ollama HTTP 500/.test(n)));
  r = await b.ask('p', 't', ['ollama', 'unified'], { accept: (t) => t.startsWith('PASS') }, env);
  check('unusable replies end in handoff with a note per backend', r.handoff === true && r.notes.length === 2);
  r = await b.ask('p', 't', ['kaggle'], {}, { AI_DEV_KIT_HOME: home });
  check('kaggle without LOCAL_LLM_URL is a quiet note', r.handoff === true && /LOCAL_LLM_URL/.test(r.notes[0]));
  r = await b.ask('p', 't', ['unified'], {}, { AI_DEV_KIT_HOME: home });
  check('unified without a key is a quiet note', r.handoff === true && /UNIFIED_API_KEY/.test(r.notes[0]));

  // key from ~/.ai-dev-kit/.env
  fs.writeFileSync(path.join(home, '.env'), 'OTHER=1\nUNIFIED_API_KEY= " from-env-9 "\r\n');
  uni.calls.length = 0;
  r = await b.ask('p', 't', ['unified'], {}, { AI_DEV_KIT_HOME: home, UNIFIED_API_BASE: uni.base });
  check('key is read from .env and trimmed', r.backend === 'unified' && uni.calls[0].auth === 'Bearer from-env-9');

  // unreachable and non-loopback ollama
  const dead = await server((req, res) => res.end());
  const deadBase = dead.base; dead.s.close();
  r = await b.ask('p', 't', ['kaggle'], { timeoutMs: 800 }, { AI_DEV_KIT_HOME: home, LOCAL_LLM_URL: deadBase });
  check('unreachable kaggle is a note', r.handoff === true && /unreachable/.test(r.notes[0]));
  fs.writeFileSync(path.join(home, 'models.json'), JSON.stringify({ system2: { baseUrl: 'http://203.0.113.5:11434' } }));
  r = await b.ask('p', 't', ['ollama'], {}, { AI_DEV_KIT_HOME: home });
  check('non-loopback ollama is refused', r.handoff === true && /not loopback/.test(r.notes[0]));

  // masking: secrets never reach kaggle or unified
  uni.calls.length = 0; kag.calls.length = 0;
  const secret = 'token = abcdef123456 and sk-ABCDEFGHIJKLMNOPQRSTUV';
  await b.ask('p', secret, ['kaggle'], {}, env);
  await b.ask('p', secret, ['unified'], {}, env);
  check('secrets are masked before kaggle and unified', !/abcdef123456|sk-ABCDEF/.test(kag.calls[0].body + uni.calls[0].body) && /masked/.test(uni.calls[0].body));

  // size cap and secret-looking files
  uni.calls.length = 0;
  await b.ask('p', 'x'.repeat(200000), ['unified'], {}, env);
  check('long input is cut to the cap', JSON.parse(uni.calls[0].body).messages[0].content.length < 61000);
  check('secret-looking files are never sent', b.neverSend('.env') && b.neverSend('a/id_rsa') && b.neverSend('x/secret.txt') && !b.neverSend('src/app.js'));

  // reachable: a quick probe per backend
  fs.writeFileSync(path.join(home, 'models.json'), JSON.stringify({ system2: { baseUrl: oll.base } }));
  check('code is always reachable', await b.reachable('code', {}));
  check('ollama reachable on loopback', await b.reachable('ollama', { AI_DEV_KIT_HOME: home }));
  fs.writeFileSync(path.join(home, 'models.json'), JSON.stringify({ system2: { baseUrl: 'http://203.0.113.5:11434' } }));
  check('non-loopback ollama is never probed as reachable', !(await b.reachable('ollama', { AI_DEV_KIT_HOME: home })));
  check('kaggle reachable with LOCAL_LLM_URL, not without', (await b.reachable('kaggle', { LOCAL_LLM_URL: kag.base })) && !(await b.reachable('kaggle', {})));
  check('unified reachable with a key, not without', (await b.reachable('unified', env)) && !(await b.reachable('unified', { AI_DEV_KIT_HOME: path.join(home, 'none'), UNIFIED_API_BASE: uni.base })));
  const gone = await server((req, res) => res.end()); const goneBase = gone.base; gone.s.close();
  check('a dead endpoint is not reachable, fast', !(await b.reachable('unified', { UNIFIED_API_BASE: goneBase, UNIFIED_API_KEY: 'k' }, 500)));

  // every consumer carries a byte-identical copy (scripts/sync-backends.js, run by npm run build)
  for (const c of ['workflow/test-run.backends.js', 'mcp/mcp-manager.backends.js']) check('copy ' + c + ' matches the source', fs.readFileSync(path.join(__dirname, '..', 'skills', c)).equals(fs.readFileSync(path.join(__dirname, '..', 'skills', 'workflow', 'plan-first.backends.js'))));
  for (const x of [oll, kag, uni, bad]) x.s.close();
  if (failed) process.exit(1);
})();
