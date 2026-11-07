// The geometry of a slider-crank engine, built from code in millimetres: one cylinder, an inline row or a V. The crank
// axis is Z; each cylinder's own axis is its local +X, turned about Z by its bank angle. Triforge does the repeated and
// chamfered parts (ArrayModifier for the cooling fins, BevelModifier for the connecting rods). Returns
// {root, parts, update(theta)}. One cylinder gives four parts (crank, rod, piston, cylinder); more give the crankshaft
// and one assembly per cylinder.
import * as THREE from 'three';
import { ArrayModifier, BevelModifier, ModifierStack } from '@triforge/modifier-core';
import { BANK, BORE, D2R, L, N, R, SPACING, THROWS, bankOf, localAngle, phases, pistonX, throwOf } from './kin.js';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.45, ...extra });
const along = (g) => g.rotateZ(Math.PI / 2); // a cylinder's Y axis turned onto X

export async function buildMachine() {
  const root = new THREE.Group();
  const T = Math.max(BORE * 0.22, 10); // face thickness of the moving parts, in Z
  const V = BANK > 0 && N > 1;
  const zOfThrow = (k) => (k - (THROWS - 1) / 2) * SPACING;

  // crankshaft: a main shaft, and per throw a web, a counter-arm and the pin the rod rides on
  const crank = new THREE.Group();
  const shaftLen = (THROWS - 1) * SPACING + T * 5;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.32, R * 0.32, shaftLen, 24).rotateX(Math.PI / 2), mat('#8a919c'));
  crank.add(shaft);
  for (let k = 0; k < THROWS; k++) {
    const g = new THREE.Group();
    g.rotation.z = phases[k] * D2R;
    g.position.z = zOfThrow(k);
    const web = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.2, R * 1.2, T, 40).rotateX(Math.PI / 2), mat('#c9ced6'));
    const arm = new THREE.Mesh(new THREE.BoxGeometry(R * 1.2, R * 0.5, T), mat('#c9ced6'));
    arm.position.set(R * 0.6, 0, 0);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.28, R * 0.28, V ? T * 2.6 : T * 2.2, 24).rotateX(Math.PI / 2), mat('#e8a33d'));
    pin.position.set(R, 0, 0);
    g.add(web, arm, pin);
    crank.add(g);
  }

  // shared geometry for every cylinder
  const ph = BORE * 0.8;
  const xa = L - R - BORE * 0.55;
  const xb = L + R + ph * 0.75;
  const rodGeo = new ModifierStack(new THREE.BoxGeometry(L, R * 0.42, T * 0.7)).add(new BevelModifier({ width: R * 0.03, segments: 1, angleThreshold: 30 })).apply();
  const finStep = Math.max(BORE * 0.16, 6);
  const finCount = Math.max(2, Math.floor((xb - xa - BORE * 0.4) / finStep));
  const finGeo = new ModifierStack(along(new THREE.CylinderGeometry(BORE * 0.62, BORE * 0.62, finStep * 0.4, 40))).add(new ArrayModifier({ count: finCount, offsetX: finStep })).apply();
  const barrelGeo = along(new THREE.CylinderGeometry(BORE / 2, BORE / 2, xb - xa, 48, 1, true));
  const pistonGeo = along(new THREE.CylinderGeometry(BORE * 0.47, BORE * 0.47, ph, 40));
  const eyeGeo = new THREE.CylinderGeometry(R * 0.4, R * 0.4, T * 0.7, 24).rotateX(Math.PI / 2);

  const cyls = [];
  for (let c = 0; c < N; c++) {
    const g = new THREE.Group();
    g.rotation.z = bankOf(c) * D2R;
    const dz = V ? (c % 2 === 0 ? -1 : 1) * T * 0.55 : 0; // the two rods of a V sit side by side on one pin
    g.position.z = zOfThrow(throwOf(c));
    const rod = new THREE.Mesh(rodGeo, mat('#9fb4c7'));
    const eyes = new THREE.Group();
    for (const x of [-L / 2, L / 2]) { const e = new THREE.Mesh(eyeGeo, mat('#9fb4c7')); e.position.x = x; eyes.add(e); }
    const rodGroup = new THREE.Group();
    rodGroup.add(rod, eyes);
    rodGroup.position.z = dz;
    const piston = new THREE.Mesh(pistonGeo, mat('#e8e9ec', { metalness: 0.7, roughness: 0.35 }));
    piston.position.z = dz;
    const barrel = new THREE.Mesh(barrelGeo, mat('#b9c7d6', { transparent: true, opacity: 0.32, metalness: 0.1, roughness: 0.15 }));
    barrel.userData.noCap = true;
    barrel.position.x = (xa + xb) / 2;
    const fins = new THREE.Mesh(finGeo, mat('#8a919c'));
    fins.position.x = xa + BORE * 0.2 + finStep * 0.2;
    const cylinder = new THREE.Group();
    cylinder.add(barrel, fins);
    cylinder.position.z = dz;
    g.add(rodGroup, piston, cylinder);
    root.add(g);
    cyls.push({ g, rodGroup, piston });
  }
  root.add(crank);
  root.rotation.z = Math.PI / 2; // the cylinders' own axis is +X; stand the engine up so a V opens upward

  const parts = N === 1
    ? [
        { id: 'crank', label: 'Crankshaft', object: crank },
        { id: 'rod', label: 'Connecting rod', object: cyls[0].rodGroup },
        { id: 'piston', label: 'Piston', object: cyls[0].piston },
        { id: 'cylinder', label: 'Cylinder', object: cyls[0].g.children[2] },
      ]
    : [{ id: 'crank', label: 'Crankshaft', object: crank }, ...cyls.map((c, i) => ({ id: 'cyl' + (i + 1), label: `Cylinder ${i + 1}`, object: c.g }))];

  /** Pose everything for crankshaft angle theta (degrees). */
  function update(theta) {
    crank.rotation.z = theta * D2R;
    cyls.forEach((cy, c) => {
      const a = localAngle(theta, c) * D2R; // this cylinder's own crank angle
      const px = R * Math.cos(a);
      const py = R * Math.sin(a);
      const x = pistonX(localAngle(theta, c));
      cy.rodGroup.position.x = (px + x) / 2;
      cy.rodGroup.position.y = py / 2;
      cy.rodGroup.rotation.z = Math.atan2(-py, x - px);
      cy.piston.position.x = x + ph * 0.28;
    });
  }
  return { root, parts, update };
}
