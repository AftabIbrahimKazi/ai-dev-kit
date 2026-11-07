// The geometry, built from code. Triforge does the repeated and chamfered parts (ArrayModifier for the bolt row,
// BevelModifier for the base plate); the gears are extruded profiles because no Triforge package makes a radial
// tooth pattern yet (logged as a known gap in teardown.md). Returns {root, parts, update(theta)}; the plate and bolts
// belong to no part, so the shell treats them as static.
import * as THREE from 'three';
import { ArrayModifier, BevelModifier, ModifierStack } from '@triforge/modifier-core';
import { M, X, Z, angles, pitchDia } from './kin.js';
import { SPEC } from './params.js';

const WIDTH = SPEC.width_mm;
const PALETTE = ['#c9ced6', '#e8a33d', '#9fb4c7', '#b7c4a8', '#d3b7c9', '#c2b59b'];

function gearShape(z) {
  const rp = (M * z) / 2;
  const ra = rp + M;
  const rf = rp - 1.25 * M;
  const pitch = (Math.PI * 2) / z;
  const sh = new THREE.Shape();
  for (let i = 0; i < z; i++) {
    const a = i * pitch;
    const pts = [[rf, a - pitch * 0.27], [ra, a - pitch * 0.14], [ra, a + pitch * 0.14], [rf, a + pitch * 0.27]];
    pts.forEach(([r, ang], k) => {
      const x = r * Math.cos(ang);
      const y = r * Math.sin(ang);
      if (i === 0 && k === 0) sh.moveTo(x, y);
      else sh.lineTo(x, y);
    });
  }
  sh.closePath();
  const bore = new THREE.Path();
  bore.absarc(0, 0, Math.max(M * 1.5, rf * 0.3), 0, Math.PI * 2, true);
  sh.holes.push(bore);
  return sh;
}

export async function buildMachine() {
  const root = new THREE.Group();
  const gears = [];
  Z.forEach((z, i) => {
    const mat = new THREE.MeshStandardMaterial({ color: PALETTE[i % PALETTE.length], metalness: 0.55, roughness: 0.5, side: THREE.DoubleSide });
    const geo = new THREE.ExtrudeGeometry(gearShape(z), { depth: WIDTH, bevelEnabled: false, curveSegments: 6 });
    geo.translate(0, 0, -WIDTH / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.x = X[i];
    mesh.castShadow = true;
    mesh.userData = { id: SPEC.parts[i].id, label: SPEC.parts[i].label, teeth: z };
    root.add(mesh);
    gears.push(mesh);
  });

  const span = X[X.length - 1] + pitchDia(Z.length - 1);
  const CX = (X[Z.length - 1] + pitchDia(Z.length - 1) / 2 - pitchDia(0) / 2) / 2;
  const plateGeo = new ModifierStack(new THREE.BoxGeometry(span + 60, 8, WIDTH + 40)).add(new BevelModifier({ width: 1.2, segments: 1, angleThreshold: 30 })).apply();
  const plateMat = new THREE.MeshStandardMaterial({ color: '#8a919c', metalness: 0.3, roughness: 0.7 });
  const plate = new THREE.Mesh(plateGeo, plateMat);
  plate.position.set(CX, -(Math.max(...Z) * M) / 2 - 14, 0);
  plate.receiveShadow = true;
  root.add(plate);

  const boltCount = 6;
  const boltBase = new THREE.CylinderGeometry(3.2, 3.2, 6, 12);
  boltBase.translate(0, 0, 0);
  const bolts = new ModifierStack(boltBase).add(new ArrayModifier({ count: boltCount, offsetX: (span + 20) / (boltCount - 1) })).apply();
  const boltMesh = new THREE.Mesh(bolts, new THREE.MeshStandardMaterial({ color: '#4b5058', metalness: 0.8, roughness: 0.4 }));
  boltMesh.position.set(CX - (span + 20) / 2, plate.position.y + 7, WIDTH / 2 + 12);
  root.add(boltMesh);

  const parts = gears.map((g) => ({ id: g.userData.id, label: g.userData.label, object: g }));
  /** Pose everything for input angle theta (degrees). Cut, isolate and the camera belong to the shell. */
  function update(theta) {
    const a = angles(theta);
    gears.forEach((g, i) => { g.rotation.z = a[i]; });
  }
  return { root, parts, update };
}
