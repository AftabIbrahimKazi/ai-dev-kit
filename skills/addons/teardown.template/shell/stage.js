// The studio: renderer, lights, soft shadows, a bright environment for metal to reflect, a shadow-only floor and, on the
// full quality tier, ambient occlusion. Nothing here knows what the machine is. `look=plain` in the page address turns
// the post-processing off; the low tier does the same, with cheaper shadows.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';

/** A pass that only runs a function: used to hide the cut caps and the floor while the AO pass reads depth. */
class Hook extends Pass {
  constructor(fn) {
    super();
    this.needsSwap = false;
    this.fn = fn;
  }
  render() {
    this.fn();
  }
}

export function createStage({ canvas, low, bg, whole, clip }) {
  const plain = low || new URLSearchParams(location.search).get('look') === 'plain';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: plain && !low, stencil: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, low ? 1 : 2));
  renderer.localClippingEnabled = true;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = low ? THREE.BasicShadowMap : THREE.VSMShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bg);
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, whole.radius * 0.01, whole.radius * 200);

  // a bright studio for metal to reflect: a big top softbox, two side strips, a low fill
  if (!low) {
    const env = new THREE.Scene();
    env.background = new THREE.Color('#9aa0a8');
    const box = (w, h, x, y, z, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    box(12, 12, 0, 14, 2, 2.6);
    box(3, 14, -12, 4, 6, 3.2);
    box(3, 14, 12, 4, -4, 2.0);
    box(18, 2, 0, 2, 14, 1.4);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.02).texture;
    scene.environmentIntensity = 0.9;
    pm.dispose();
  }
  scene.add(new THREE.HemisphereLight('#ffffff', '#aab0b8', low ? 1.6 : 0.5));
  const sun = new THREE.DirectionalLight('#ffffff', 2.4);
  const L = whole.radius * 2.5;
  sun.position.set(whole.center[0] - L, whole.center[1] + L * 1.6, whole.center[2] + L);
  sun.target.position.set(...whole.center);
  sun.castShadow = true;
  const r = whole.radius * 1.6;
  Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: L * 0.2, far: L * 6 });
  sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
  sun.shadow.radius = low ? 1 : 8;
  sun.shadow.blurSamples = 16;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = whole.radius * 0.002;
  scene.add(sun, sun.target);

  // the floor: shadow only, just under the machine. polygonOffset keeps it from losing the depth test in a post target
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(whole.radius * 12, whole.radius * 12),
    new THREE.ShadowMaterial({ color: '#2a2f36', opacity: 0.3, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(whole.center[0], whole.box.min.y - whole.radius * 0.02, whole.center[2]);
  floor.receiveShadow = true;
  scene.add(floor);

  let composer = null;
  const aux = []; // objects the AO pass must not see: the cut caps and the stencil helpers
  if (!plain) {
    const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4, stencilBuffer: true });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    const gtao = new GTAOPass(scene, camera, 4, 4);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.7;
    gtao.updateGtaoMaterial({ radius: whole.radius * 0.06, distanceExponent: 1.4, thickness: whole.radius * 0.05, scale: 1, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    // the AO pass draws the scene with its own normal material: it needs the cut too, or the cut half returns as a ghost
    gtao.normalMaterial.clippingPlanes = [clip];
    const show = (on) => { floor.visible = on; aux.forEach((o) => { o.visible = on && o.userData.want !== false; }); };
    composer.addPass(new Hook(() => show(false)));
    composer.addPass(gtao);
    composer.addPass(new Hook(() => show(true)));
    composer.addPass(new OutputPass());
  }

  const stage = {
    THREE, renderer, scene, camera, sun, composer, aux,
    resize(w, h) {
      renderer.setSize(w, h, false);
      if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
    },
    render() { composer ? composer.render() : renderer.render(scene, camera); },
  };
  return stage;
}
