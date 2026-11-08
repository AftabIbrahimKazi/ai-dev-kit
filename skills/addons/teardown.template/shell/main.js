// Boots the page for any machine. machine.js builds the parts and poses them; kin.js holds the numbers; this file does
// the rest: material prep, capped cutaway, isolate, glass mode, camera fit from the real bounds, the tour, the live
// controls, charts and callouts. One render(t) draws a frame from the tour's timeline (the review sheets call it at
// any t); the live loop plays the same timeline as an auto tour and hands control to the visitor on the first click,
// drag, wheel or key. After 25 s of quiet (?idle=ms changes it) the tour takes over again.
import * as THREE from 'three';
import { initRenderBudget } from '@triforge/render-budget-core';
import * as KIN from './kin.js';
import { buildMachine } from './machine.js';
import { createConsole } from './console.js';
import { createTour } from './film.js';
import { createStage } from './stage.js';
import { SPEC } from './params.js';

const q = new URLSearchParams(location.search);
const IDLE_MS = Number(q.get('idle')) || 25000;
const FADED = 0.16;
const GLASS = 0.3;
const canvas = document.getElementById('gl');
const capture = q.has('capture');

// the project's own look: spec.theme sets the page variables (font, radius, radiusBtn, cap and the six colour roles),
// with light and dark blocks chosen by ?theme=light|dark or else the system scheme. No theme: the defaults in index.html.
const THEME = SPEC.theme || {};
const MODE = q.get('theme') === 'light' || q.get('theme') === 'dark' ? q.get('theme') : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
for (const [key, value] of Object.entries({ ...THEME, ...(THEME[MODE] || {}) })) {
  if (typeof value === 'string' && /^[a-zA-Z]+$/.test(key)) document.documentElement.style.setProperty('--' + key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), value);
}

// quality tier from real runtime probes (Triforge render-budget); the page still works if the probe fails
let tier = 'full';
try { tier = (await initRenderBudget({ allowDevOverride: true })).shaderComplexity; } catch { /* keep full */ }
const low = tier !== 'full';

// ---- the machine and its parts
const machine = await buildMachine();
const parts = machine.parts;
const owned = new Map(); // mesh -> index of the part it belongs to (-1 = static)
parts.forEach((p, i) => p.object.traverse((o) => { if (o.isMesh) owned.set(o, i); }));

// ---- real bounds: the camera frames the machine, not a guess (posed at input zero)
machine.update(0);
const boundsOf = (obj) => {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  return { box, size: [size.x, size.y, size.z], center: [c.x, c.y, c.z], radius: Math.max(size.length() / 2, 1e-6) };
};
const whole = boundsOf(machine.root);
const info = parts.map((p) => ({ label: p.label, note: p.note, ...boundsOf(p.object) }));
const bySize = info.map((p, i) => [p, i]).sort((a, b) => b[0].radius - a[0].radius);
const tourIdx = bySize.slice(0, 12).map(([, i]) => i).sort((a, b) => a - b); // tour parts keep the machine's own order
const tour = createTour(whole, tourIdx.map((i) => ({ ...info[i], index: i })));
const zMax = whole.box.max.z;
const zMid = whole.center[2];

// ---- the stage; the ground follows the page's colour scheme so the panels and the picture always agree
const clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), zMax + 1);
const BG = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#eef0f3';
const stage = createStage({ canvas, low, bg: BG, whole, clip });
const { renderer, scene, camera } = stage;
scene.add(machine.root);

// ---- materials, and the capped cut: every closed mesh writes the stencil (back faces up, front faces down), and one
// plane drawn at the cut fills wherever the count is odd. Meshes marked userData.noCap (open shells, glass) are skipped.
const stencil = (side, op) => new THREE.MeshBasicMaterial({ side, colorWrite: false, depthWrite: false, depthTest: false, clippingPlanes: [clip], stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: op, stencilZFail: op, stencilZPass: op });
const backMat = stencil(THREE.BackSide, THREE.IncrementWrapStencilOp);
const frontMat = stencil(THREE.FrontSide, THREE.DecrementWrapStencilOp);
const meshes = [];
machine.root.traverse((o) => {
  if (!o.isMesh || o.userData.isCapHelper) return;
  const list = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => m.clone());
  o.material = Array.isArray(o.material) ? list : list[0];
  list.forEach((m) => { m.clippingPlanes = [clip]; m.side = THREE.DoubleSide; m.userData.base = m.opacity; });
  o.castShadow = true;
  o.receiveShadow = true;
  o.renderOrder = 6;
  meshes.push({ mesh: o, mats: list, kids: [], owner: owned.has(o) ? owned.get(o) : -1 });
});
// add the stencil helpers after the walk, so the walk never visits them
for (const m of meshes) {
  if (m.mesh.userData.noCap || m.mats[0].userData.base < 1) continue;
  for (const mat of [backMat, frontMat]) {
    const k = new THREE.Mesh(m.mesh.geometry, mat);
    k.renderOrder = 1;
    k.userData = { want: false, isCapHelper: true };
    k.visible = false;
    m.mesh.add(k);
    m.kids.push(k);
    stage.aux.push(k);
  }
}
const capSize = whole.radius * 6;
const CAP = getComputedStyle(document.documentElement).getPropertyValue('--cap').trim() || '#d2693f';
const capMat = new THREE.MeshBasicMaterial({ color: CAP, side: THREE.DoubleSide, stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp });
const cap = new THREE.Mesh(new THREE.PlaneGeometry(capSize, capSize), capMat);
cap.renderOrder = 1.1;
cap.userData.want = false;
cap.visible = false;
cap.onAfterRender = (r) => r.clearStencil();
scene.add(cap);
stage.aux.push(cap);

// ---- live state: while `manual` is true the visitor's values drive the pose; otherwise the tour does
const live = { manual: false, last: 0, glass: false, ...tour.P };
const ui = createConsole(document.getElementById('console'), parts, KIN.charts || [], {
  onFocus: (i) => { grab(); live.focus = i; const t = i < 0 ? whole : info[i]; Object.assign(live, { lookX: t.center[0], lookY: t.center[1], lookZ: t.center[2], radius: t.radius }); },
  onCut: (v) => { grab(); live.cut = v; },
  onGlass: (on) => { grab(); live.glass = on; },
  onTour: () => { live.manual = false; },
});
function grab() {
  if (!live.manual) Object.assign(live, tour.P);
  live.manual = true;
  live.last = performance.now();
}

function resize() {
  const w = canvas.clientWidth || innerWidth;
  const h = canvas.clientHeight || innerHeight;
  stage.resize(w, h);
  camera.aspect = w / h;
  // shift the picture right by half the panel's width so the machine sits in the free area, not behind the panel
  const panel = w > 640 ? 340 : 0;
  camera.setViewOffset(w, h, -panel / 2, 0, w, h);
  camera.updateProjectionMatrix();
  ui.resize(w, h);
}
addEventListener('resize', resize);
resize();

/** Camera distance that frames a sphere of this radius at the current aspect ratio. */
function fit(radius) {
  const v = (camera.fov * Math.PI) / 360;
  const half = Math.min(v, Math.atan(Math.tan(v) * camera.aspect));
  return (radius * 1.2) / Math.sin(half);
}

const v3 = new THREE.Vector3();
function frame(t) {
  const pose = live.manual ? live : tour.sample(t);
  const theta = KIN.thetaAt(t);
  machine.update(theta);
  const cutting = pose.cut > 0.01 && !pose.glass;
  meshes.forEach(({ mats, kids, owner }) => {
    const k = pose.glass ? GLASS : pose.focus < 0 || owner === pose.focus ? 1 : FADED;
    mats.forEach((m) => { m.opacity = m.userData.base * k; m.transparent = m.opacity < 0.99; m.depthWrite = m.opacity > 0.99; });
    const on = cutting && k === 1;
    kids.forEach((o) => { o.userData.want = on; o.visible = on; });
  });
  clip.constant = pose.glass ? zMax + 1 : zMax + 1 - pose.cut * (zMax + 1 - zMid);
  cap.userData.want = cutting;
  cap.visible = cutting;
  cap.position.set(whole.center[0], whole.center[1], clip.constant);
  const az = (pose.azimuth * Math.PI) / 180;
  const el = (pose.elevation * Math.PI) / 180;
  const r = fit(pose.radius);
  camera.position.set(pose.lookX + r * Math.sin(az) * Math.cos(el), pose.lookY + r * Math.sin(el), pose.lookZ + r * Math.cos(az) * Math.cos(el));
  camera.lookAt(pose.lookX, pose.lookY, pose.lookZ);
  camera.updateMatrixWorld();
  stage.render();
  // callout: the isolated part's name and size, with a leader line to the part
  let callout = null;
  if (pose.focus >= 0 && info[pose.focus]) {
    const f = info[pose.focus];
    v3.set(...f.center).project(camera);
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    const dim = f.size.map((n) => n.toFixed(n < 10 ? 1 : 0)).join(' × ') + (SPEC.units ? ' ' + SPEC.units : '');
    callout = { x: (v3.x * 0.5 + 0.5) * w, y: (-v3.y * 0.5 + 0.5) * h, title: f.label, lines: [f.note, dim].filter(Boolean) };
  }
  ui.update([...KIN.readouts(theta), ...(machine.info || [])], { focus: pose.focus, cut: pose.cut, glass: !!pose.glass, touring: !live.manual, theta, callout });
}

// fraction of pixels that differ from the background: the review sheet flags an empty frame
function coverage() {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(canvas, 0, 0, s, s);
  const d = g.getImageData(0, 0, s, s).data;
  let diff = 0;
  for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 24) diff++;
  return diff / (s * s);
}

// compile every shader before the first frame so the page never freezes on first draw
try { await renderer.compileAsync(scene, camera); } catch { /* the first frame compiles instead */ }

window.SIM = {
  duration: tour.duration,
  beats: tour.beats.map(([t, name]) => ({ t, name })),
  ready: true,
  render: (t) => { live.manual = false; frame(t); },
  coverage,
  state: () => ({ manual: live.manual, azimuth: live.azimuth, elevation: live.elevation, radius: live.radius, focus: live.focus, cut: live.cut, glass: live.glass, tourFocus: tour.P.focus }),
  renderer: () => { const gl = renderer.getContext(); const x = gl.getExtension('WEBGL_debug_renderer_info'); return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : 'unknown'; },
};

if (capture) {
  frame(0);
} else {
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { grab(); drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    live.azimuth -= (e.clientX - drag[0]) * 0.4;
    live.elevation = Math.max(-80, Math.min(85, live.elevation + (e.clientY - drag[1]) * 0.3));
    drag = [e.clientX, e.clientY];
    live.last = performance.now();
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('wheel', (e) => { grab(); live.radius = Math.max(whole.radius * 0.05, Math.min(whole.radius * 3, live.radius * (1 + Math.sign(e.deltaY) * 0.08))); e.preventDefault(); }, { passive: false });
  addEventListener('keydown', () => grab());
  const t0 = performance.now();
  const loop = (now) => {
    if (live.manual && now - live.last > IDLE_MS) live.manual = false;
    frame((now - t0) / 1000);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
