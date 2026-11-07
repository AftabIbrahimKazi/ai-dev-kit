// The geometry for any other machine or object. Two ways in:
//  1. spec.model is a .glb or .gltf file next to this one: the parts are its named nodes (spec.parts names them) or,
//     with no parts listed, its top-level children. Real models need nothing else to be cut, isolated and toured.
//  2. no model: spec.parts become labelled placeholder blocks so the page runs at once.
// TEARDOWN-PLACEHOLDER: `check` warns while this marker is here and no model is set. Replace the placeholder
// geometry with the real machine, built from a reference, then delete this line.
// Returns {root, parts, update(theta), info}: info rows appear in the panel after kin.js's readouts.
import * as THREE from 'three';
import { SPEC } from './params.js';

const COLORS = ['#c9ced6', '#e8a33d', '#9fb4c7', '#b7c4a8', '#d3b7c9', '#c2b59b'];
const nice = (s) => String(s).replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase());
const MAX_PARTS = 40;

async function fromModel() {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync('./' + SPEC.model);
  const scene = gltf.scene;
  let nodes;
  if (SPEC.parts && SPEC.parts.length) {
    nodes = SPEC.parts.map((p) => ({ id: p.id, label: p.label, object: scene.getObjectByName(p.id) })).filter((p) => p.object);
  } else {
    let top = scene.children;
    while (top.length === 1 && top[0].children.length) top = top[0].children; // skip a lone wrapper node
    nodes = top.map((o, i) => ({ id: o.name || 'part' + i, label: nice(o.name || 'Part ' + (i + 1)), object: o }));
  }
  return { root: scene, parts: nodes.slice(0, MAX_PARTS) };
}

function placeholders() {
  const root = new THREE.Group();
  const names = SPEC.parts && SPEC.parts.length ? SPEC.parts : [{ id: 'a', label: 'Part 1' }, { id: 'b', label: 'Part 2' }, { id: 'c', label: 'Part 3' }];
  const parts = names.slice(0, MAX_PARTS).map((p, i) => {
    const g = new THREE.Mesh(new THREE.BoxGeometry(60, 40 + (i % 3) * 20, 30), new THREE.MeshStandardMaterial({ color: COLORS[i % COLORS.length], metalness: 0.4, roughness: 0.55 }));
    g.position.x = i * 80;
    root.add(g);
    return { id: p.id, label: p.label, object: g };
  });
  return { root, parts };
}

export async function buildMachine() {
  const { root, parts } = SPEC.model ? await fromModel() : placeholders();
  const rest = SPEC.model ? [] : parts;
  const info = [{ label: 'Parts', value: String(parts.length) }];
  const box = new THREE.Box3().setFromObject(root);
  if (!box.isEmpty()) { const s = box.getSize(new THREE.Vector3()); info.push({ label: 'Size', value: `${s.x.toFixed(1)} × ${s.y.toFixed(1)} × ${s.z.toFixed(1)} ${SPEC.units || ''}`.trim() }); }
  /** Placeholder blocks turn slowly so the page is never still; a loaded model stays as it was made. */
  function update(theta) {
    rest.forEach((p, i) => { p.object.rotation.z = ((i % 2 ? -1 : 1) * theta * Math.PI) / 1800; });
  }
  return { root, parts, update, info };
}
