const assert = require('node:assert');
const { parse, gates, render, median } = require('../skills/addons/media-harness/bench/parse.js');
const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };

const L = (o) => JSON.stringify(o);
const sample = [
  L({ test: 'env', gpus: ['Tesla T4', 'Tesla T4'], ok: true }),
  L({ test: 'model_load', model: 'flux-schnell', seconds: 40, ok: true, source: 'dataset' }),
  ...[10, 12, 14].map((s) => L({ test: 'image_1024', model: 'flux-schnell', seconds: s, ok: true, vram_gb: 11 })),
  L({ test: 'model_load', model: 'flux-dev', seconds: 300, ok: true, source: 'huggingface' }),
  ...[90, 100, 110].map((s) => L({ test: 'image_1024', model: 'flux-dev', seconds: s, ok: true })),
  L({ test: 'model_load', model: 'wan22-5b', seconds: 120, ok: true, source: 'dataset' }),
  L({ test: 'video_81f_480p', model: 'wan22-5b', seconds: 900, ok: false, error: 'CUDA out of memory' }),
  L({ test: 'four_images_one_gpu', model: 'flux-schnell', seconds: 60, ok: true }),
  L({ test: 'four_images_two_gpus', model: 'flux-schnell', seconds: 35, ok: true }),
  'not json',
  L({ test: 'done', ok: true }),
].join('\n');

t('median', () => assert.strictEqual(median([3, 1, 2]), 2));
t('parses medians, load source and failures', () => {
  const r = parse(sample);
  assert.strictEqual(r.models['flux-dev'].imageMedianSeconds, 100);
  assert.strictEqual(r.models['flux-schnell'].loadSource, 'dataset');
  assert.deepStrictEqual(r.models['wan22-5b'].failures, ['video_81f_480p: CUDA out of memory']);
  assert.strictEqual(r.models['wan22-5b'].videoSeconds, null);
  assert.ok(r.complete);
});
t('two-worker speedup', () => assert.strictEqual(parse(sample).twoWorkers.speedup, 1.71));
t('video gate: failed clip is not a pass', () => assert.ok(/no 5 s clip/.test(gates(parse(sample)).video)));
t('video gate passes under 20 min and fails over', () => {
  const mk = (s) => parse(L({ test: 'video_81f_480p', model: 'wan22-5b', seconds: s, ok: true }));
  assert.ok(gates(mk(1100)).video.startsWith('PASS'));
  assert.ok(gates(mk(1300)).video.startsWith('FAIL'));
});
t('image gate waits for the rating', () => {
  const r = parse(sample);
  assert.ok(/waiting/.test(gates(r).image));
  assert.ok(gates(r, 'clearly-better').image.startsWith('PASS'));
  assert.ok(gates(r, 'not-better').image.startsWith('FAIL'));
});
t('plan claim line reports the measured Flux Dev median', () => assert.ok(/measured median 100 s/.test(gates(parse(sample)).planClaim)));
t('33-frame timing is scaled to an ESTIMATE when 81 frames did not finish', () => {
  const r = parse([L({ test: 'video_33f_480p', model: 'wan22-5b', seconds: 300, ok: true })].join(String.fromCharCode(10)));
  assert.strictEqual(r.models['wan22-5b'].videoEstimate81, 736);
  assert.ok(/ESTIMATE only/.test(gates(r).video) && /under the 20 min/.test(gates(r).video));
});
t('empty input does not throw and renders', () => assert.ok(/Media harness/.test(render(parse(''), gates(parse(''))))));
