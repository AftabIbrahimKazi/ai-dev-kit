const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const script = path.join(__dirname, '..', 'skills', 'meta', 'skill-scope.device.js');
const t = (name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };

const base = {
  platform: 'win32', arch: 'x64', cores: 8, ramGB: 16, freeDiskGB: 100, gpus: [],
  tools: { node: '22.1.0', python: '3.12', ffmpeg: true, git: true, cloudflared: false },
  state: { laya: false, vision: false, ollama: false, llamacpp: false, kaggleCli: false, kaggleCreds: false, hfCacheGB: null },
};
const merge = (o) => ({ ...base, ...o, tools: { ...base.tools, ...(o.tools || {}) }, state: { ...base.state, ...(o.state || {}) } });
const run = (hw, args = []) => {
  const r = spawnSync(process.execPath, [script, '--json', ...args], { encoding: 'utf8', env: { ...process.env, DEVICE_FAKE_HW: JSON.stringify(hw) } });
  assert.strictEqual(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};
const status = (rep, item) => rep.rows.find((x) => x.item === item).status;

t('no GPU, 8 GB RAM: lite or standard, no cuda size', () => {
  const r = run(merge({ ramGB: 8 }));
  assert.ok(r.presets.standard.fits);
  assert.strictEqual(r.presets.standard.downloadGB, 3.8);
});
t('NVIDIA 6 GB, 16 GB RAM: standard sized for CUDA', () => {
  const r = run(merge({ gpus: [{ name: 'RTX 3060', vendor: 'nvidia', vramGB: 6, discrete: true }] }));
  assert.strictEqual(r.presets.standard.downloadGB, 8.7);
  assert.ok(r.presets.standard.fits);
});
t('nothing installed: laya and vision rows are missing, next lists both setups', () => {
  const r = run(merge({}));
  assert.strictEqual(status(r, 'Laya (prefilter ranking)'), 'missing');
  assert.ok(r.next.some((l) => /laya-ctl\.js.* setup/.test(l)));
  assert.ok(r.next.some((l) => /local-vision\.js.* setup/.test(l)));
});
t('everything installed: full fits, nothing to download', () => {
  const r = run(merge({ tools: { cloudflared: true }, state: { laya: true, vision: true, ollama: true, llamacpp: true, kaggleCli: true, kaggleCreds: true, hfCacheGB: 12 } }));
  assert.strictEqual(r.preset, 'full');
  assert.strictEqual(r.presets.full.downloadGB, 0);
  assert.ok(r.next.some((l) => /already installed/.test(l)));
});
t('Python missing: standard not ready, names Python', () => {
  const r = run(merge({ tools: { python: null } }));
  assert.strictEqual(r.presets.standard.fits, false);
  assert.ok(r.presets.standard.missing.some((m) => /Python/.test(m)));
  assert.strictEqual(r.preset, 'lite');
});
t('Python missing but Laya already installed: standard still fits', () => {
  const r = run(merge({ tools: { python: null }, state: { laya: true } }));
  assert.ok(r.presets.standard.fits);
});
t('nvidia-smi missing (integrated GPU only): treated as CPU, noted', () => {
  const r = run(merge({ gpus: [{ name: 'Intel(R) UHD Graphics', vendor: 'intel', vramGB: null, discrete: false }] }));
  assert.ok(/integrated, treated as CPU/.test(r.rows.find((x) => x.item === 'GPU').note));
  assert.strictEqual(r.presets.standard.downloadGB, 3.8);
});
t('low disk blocks standard', () => {
  const r = run(merge({ freeDiskGB: 2 }));
  assert.strictEqual(r.presets.standard.fits, false);
  assert.ok(r.presets.standard.missing.some((m) => /free disk/.test(m)));
});
t('3 GB RAM blocks standard', () => assert.strictEqual(run(merge({ ramGB: 3 })).presets.standard.fits, false));
t('blocked preflight verdict blocks standard', () => {
  const r = run(merge({ verdicts: { laya: 'blocked', vision: 'ok' } }));
  assert.ok(r.presets.standard.missing.some((m) => /Laya preflight/.test(m)));
});
t('lite always fits and downloads nothing', () => {
  const r = run(merge({ ramGB: 1, freeDiskGB: 0.5, tools: { python: null } }));
  assert.ok(r.presets.lite.fits);
  assert.strictEqual(r.presets.lite.downloadGB, 0);
});
t('full needs Kaggle CLI, credentials and ffmpeg', () => {
  const r = run(merge({ tools: { ffmpeg: false } }));
  assert.deepStrictEqual(r.presets.full.missing.slice(-3), ['ffmpeg', 'Kaggle CLI', 'Kaggle credentials']);
});
t('--preset forces the recommendation', () => assert.strictEqual(run(merge({}), ['--preset', 'full']).preset, 'full'));
t('bad --preset exits 2', () => {
  const r = spawnSync(process.execPath, [script, '--preset', 'huge'], { encoding: 'utf8', env: { ...process.env, DEVICE_FAKE_HW: JSON.stringify(base) } });
  assert.strictEqual(r.status, 2);
});
t('text output has the three sections and prints no credential values', () => {
  const r = spawnSync(process.execPath, [script], { encoding: 'utf8', env: { ...process.env, DEVICE_FAKE_HW: JSON.stringify(merge({ state: { kaggleCreds: true } })) } });
  assert.ok(/Device check/.test(r.stdout) && /Presets/.test(r.stdout) && /Next/.test(r.stdout));
  assert.ok(/contents not read/.test(r.stdout));
});
