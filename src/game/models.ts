import * as THREE from 'three';
import { seededRandom } from './math';
import { batchMeshes } from './geometry';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const steel = new THREE.MeshStandardMaterial({ color: 0x343e3b, roughness: 0.5, metalness: 0.72 });
const darkSteel = new THREE.MeshStandardMaterial({ color: 0x1c292b, roughness: 0.36, metalness: 0.8 });
const edgeSteel = new THREE.MeshStandardMaterial({ color: 0x6a7166, roughness: 0.45, metalness: 0.8 });
const black = new THREE.MeshStandardMaterial({ color: 0x101a1c, roughness: 0.8 });
const ochre = new THREE.MeshStandardMaterial({ color: 0xc4a46a, roughness: 0.62, metalness: 0.35 });
const shipPaint = new THREE.MeshStandardMaterial({ color: 0x6a7776, roughness: 0.72, metalness: 0.35 });
const deckPaint = new THREE.MeshStandardMaterial({ color: 0x66685c, roughness: 0.85 });
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitSphere = new THREE.SphereGeometry(1, 16, 10);
const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 24);
let aircraftTemplate: THREE.Group | undefined;
let shipTemplate: THREE.Group | undefined;

function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, position: number[], scale = [1, 1, 1]): THREE.Mesh {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(position[0], position[1], position[2]);
  object.scale.set(scale[0], scale[1], scale[2]);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function box(parent: THREE.Object3D, material: THREE.Material, position: number[], scale: number[]): THREE.Mesh {
  return mesh(parent, unitBox, material, position, scale);
}

function cylinder(parent: THREE.Object3D, material: THREE.Material, position: number[], radius: number, length: number, forward = false): THREE.Mesh {
  const object = mesh(parent, unitCylinder, material, position, [radius, length, radius]);
  if (forward) object.rotation.x = Math.PI / 2;
  return object;
}

function plate(points: number[][], thickness: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach(([x, z]) => shape.lineTo(x, z));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.rotateX(Math.PI / 2);
  return geo;
}

function aircraftMaterial(): THREE.MeshStandardMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const random = seededRandom(87);
  ctx.fillStyle = '#677666';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 35; i++) {
    ctx.fillStyle = i % 2 ? '#526458' : '#7b8370';
    ctx.beginPath();
    ctx.ellipse(random() * 256, random() * 256, 10 + random() * 48, 5 + random() * 30, random() * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(25,35,30,.22)';
  ctx.lineWidth = 1;
  for (let x = 0; x < 256; x += 32) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke();
    for (let y = 4; y < 256; y += 8) { ctx.fillStyle = 'rgba(220,230,210,.35)'; ctx.fillRect(x + 2, y, 1, 1); }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.58, metalness: 0.38 });
}

export function createAircraft(): THREE.Group {
  if (aircraftTemplate) return aircraftTemplate.clone(true);
  const plane = new THREE.Group();
  const paint = aircraftMaterial();
  const underside = new THREE.MeshStandardMaterial({ color: 0x9aab9f, roughness: 0.67, metalness: 0.3 });
  const profile = [[0.06, -4.4], [0.22, -3.5], [0.46, -1.7], [0.65, 0.2], [0.6, 1.7], [0.52, 2.7], [0.22, 3.15], [0, 3.3]];
  const fuselage = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), 18);
  fuselage.rotateX(Math.PI / 2);
  mesh(plane, fuselage, paint, [0, 0, 0]);
  mesh(plane, plate([[-7.2, -0.5], [-7.0, 0.65], [-1, 1.5], [1, 1.5], [7, 0.65], [7.2, -0.5], [1, -0.7], [-1, -0.7]], 0.15), paint, [0, 0.05, 0]);
  mesh(plane, plate([[-2.7, -3.6], [-2.5, -2.8], [0, -2.5], [2.5, -2.8], [2.7, -3.6]], 0.09), underside, [0, 0.16, 0]);
  const finShape = new THREE.Shape();
  finShape.moveTo(-4.1, 0); finShape.lineTo(-3.8, 1.65); finShape.lineTo(-3.1, 1.85); finShape.lineTo(-2.0, 0); finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.12, bevelEnabled: false });
  finGeo.rotateY(-Math.PI / 2);
  mesh(plane, finGeo, paint, [0.06, 0.1, 0]);
  const glass = new THREE.MeshStandardMaterial({ color: 0x233e43, metalness: 0.78, roughness: 0.18 });
  mesh(plane, unitSphere, glass, [0, 0.5, -0.35], [0.44, 0.55, 1.05]);
  for (const z of [-0.85, -0.1, 0.35]) {
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.035, 4, 12, Math.PI), edgeSteel);
    frame.position.set(0, 0.5, z); plane.add(frame);
  }
  cylinder(plane, ochre, [0, 0, 2.65], 0.54, 0.22, true);
  const propeller = new THREE.Group(); propeller.name = 'propeller'; propeller.position.z = 3.32;
  for (let i = 0; i < 3; i++) {
    const blade = box(propeller, black, [0, 0, 0], [0.16, 3.1, 0.055]);
    blade.rotation.z = i * Math.PI / 3;
  }
  mesh(propeller, unitSphere, ochre, [0, 0, 0.04], [0.22, 0.22, 0.28]);
  plane.add(propeller);
  for (const x of [-4.7, 4.7]) {
    const outer = mesh(plane, new THREE.CircleGeometry(0.57, 20), ochre, [x, 0.067, 0.02]);
    outer.rotation.x = -Math.PI / 2;
    const inner = mesh(plane, new THREE.CircleGeometry(0.34, 16), new THREE.MeshStandardMaterial({ color: 0x793a31, roughness: 0.7 }), [x, 0.075, 0.02]);
    inner.rotation.x = -Math.PI / 2;
  }
  for (const x of [-2, 2]) cylinder(plane, darkSteel, [x, 0.03, 1.3], 0.065, 1.0, true);
  batchMeshes(propeller);
  batchMeshes(plane, [propeller]);
  aircraftTemplate = plane;
  return plane.clone(true);
}

export function createShip(): THREE.Group {
  if (shipTemplate) return shipTemplate.clone(true);
  const ship = new THREE.Group();
  const outline = [[0, 23], [2.4, 17], [3.2, 7], [3.2, -12], [2.5, -19], [-2.5, -19], [-3.2, -12], [-3.2, 7], [-2.4, 17]];
  mesh(ship, plate(outline, 3.2), shipPaint, [0, 2.45, 0]);
  mesh(ship, plate(outline.map(([x, z]) => [x * 0.94, z * 0.98]), 0.15), deckPaint, [0, 2.55, 0]);
  box(ship, shipPaint, [0, 3.5, 0], [4.8, 2, 17]);
  box(ship, shipPaint, [0, 5.3, 4.3], [3.9, 2, 5.4]);
  box(ship, shipPaint, [0, 6.65, 4.5], [4.5, 0.7, 3.5]);
  box(ship, darkSteel, [0, 6.3, 6.28], [3.6, 0.48, 0.08]);
  for (const z of [-3, -7]) {
    cylinder(ship, shipPaint, [0, 5.5, z], 0.95, 3.8);
    cylinder(ship, black, [0, 7.35, z], 1.02, 0.4);
  }
  cylinder(ship, edgeSteel, [0, 9, 1.7], 0.12, 10);
  box(ship, edgeSteel, [0, 11.3, 1.7], [6, 0.1, 0.1]);
  box(ship, edgeSteel, [0, 13, 1.7], [3.5, 0.1, 0.1]);
  for (const z of [13, -13]) {
    cylinder(ship, shipPaint, [0, 3.3, z], 1.6, 1.5);
    box(ship, shipPaint, [0, 4.0, z], [2.5, 1.2, 2.7]);
    cylinder(ship, darkSteel, [-0.6, 4.15, z + 2.8], 0.13, 4.8, true);
    cylinder(ship, darkSteel, [0.6, 4.15, z + 2.8], 0.13, 4.8, true);
  }
  for (const x of [-2.9, 2.9]) {
    box(ship, edgeSteel, [x, 3.35, -1], [0.035, 0.035, 34]);
    for (let z = -16; z < 17; z += 3) box(ship, edgeSteel, [x, 2.95, z], [0.05, 0.8, 0.05]);
    for (let z = -8; z < 8; z += 3) mesh(ship, unitSphere, black, [x * 1.08, 1.7, z], [0.13, 0.13, 0.07]);
  }
  batchMeshes(ship);
  shipTemplate = ship;
  return ship.clone(true);
}

export function createGun(): { group: THREE.Group; recoil: THREE.Group; flash: THREE.Group } {
  const group = new THREE.Group();
  const recoil = new THREE.Group();
  group.add(recoil);
  mesh(group, unitSphere, steel, [0, -0.52, 0.15], [0.92, 0.7, 1.05]);
  cylinder(group, darkSteel, [0, -0.85, 0.2], 0.75, 0.28);
  const gunPaint = steel.clone();
  const finish = document.createElement('canvas'); finish.width = finish.height = 256;
  const finishContext = finish.getContext('2d')!; const random = seededRandom(661);
  finishContext.fillStyle = '#c6c5bd'; finishContext.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 12000; i++) {
    const value = 120 + Math.floor(random() * 110); finishContext.fillStyle = `rgba(${value},${value},${value},.35)`;
    finishContext.fillRect(random() * 256, random() * 256, random() > .95 ? 8 : 1, 1);
  }
  const finishTexture = new THREE.CanvasTexture(finish); finishTexture.colorSpace = THREE.SRGBColorSpace; finishTexture.anisotropy = 4;
  gunPaint.map = finishTexture; gunPaint.bumpMap = finishTexture; gunPaint.bumpScale = .003; gunPaint.roughness = .58;
  mesh(recoil, new RoundedBoxGeometry(1, 1, 1, 2, .07), gunPaint, [0, -0.07, -0.6], [0.86, 0.55, 1.25]);
  box(recoil, edgeSteel, [0, 0.23, -0.35], [0.68, 0.06, 0.83]);
  box(recoil, gunPaint, [0, 0.268, -0.35], [0.62, 0.022, 0.76]);
  for (const x of [-.29, .29]) for (const z of [-.68, -.03]) cylinder(recoil, edgeSteel, [x, .287, z], .027, .012);
  for (let z = -.65; z < -.1; z += .11) box(recoil, black, [.2, .282, z], [.12, .008, .035]);
  const plateCanvas = document.createElement('canvas'); plateCanvas.width = 512; plateCanvas.height = 256;
  const plateContext = plateCanvas.getContext('2d')!;
  plateContext.fillStyle = '#172124'; plateContext.fillRect(0, 0, 512, 256);
  plateContext.strokeStyle = '#aaa283'; plateContext.lineWidth = 5; plateContext.strokeRect(12, 12, 488, 232);
  plateContext.fillStyle = '#cec6aa'; plateContext.font = 'bold 39px monospace'; plateContext.fillText('20 MM · MK. II', 38, 84);
  plateContext.font = '24px monospace'; plateContext.fillText('PACIFIC DEFENCE', 42, 142); plateContext.fillText('SERIAL 0047-1944', 42, 191);
  const plateTexture = new THREE.CanvasTexture(plateCanvas); plateTexture.colorSpace = THREE.SRGBColorSpace; plateTexture.anisotropy = 4;
  const nameplate = mesh(recoil, new THREE.PlaneGeometry(.37, .2), new THREE.MeshStandardMaterial({ map: plateTexture, roughness: .63, metalness: .35 }), [-.055, .283, -.36]);
  nameplate.rotation.x = -Math.PI / 2;
  for (const x of [-0.28, 0.28]) {
    cylinder(recoil, darkSteel, [x, 0.13, -1.95], 0.095, 2.25, true);
    cylinder(recoil, steel, [x, 0.13, -1.23], 0.14, 0.9, true);
    for (let z = -1.0; z > -1.65; z -= 0.09) cylinder(recoil, steel, [x, 0.13, z], 0.15, 0.025, true);
    cylinder(recoil, edgeSteel, [x, 0.13, -3.05], 0.14, 0.19, true);
    cylinder(recoil, black, [x, 0.13, -3.151], 0.095, 0.015, true);
    box(group, darkSteel, [x * 2.7, -0.25, 0.35], [0.16, 0.35, 0.23]);
  }
  for (const x of [-0.35, 0.35]) for (const z of [-0.9, -0.25]) mesh(recoil, unitSphere, ochre, [x, 0.12, z], [0.04, 0.04, 0.04]);
  box(group, ochre, [-0.53, -0.17, -0.35], [0.22, 0.07, 0.42]);
  for (let z = -0.5; z < 0; z += 0.08) cylinder(group, ochre, [-0.57, -0.12, z], 0.025, 0.26);
  const flash = new THREE.Group();
  const flashMaterial = new THREE.MeshBasicMaterial({ color: 0xffdb72, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const x of [-0.28, 0.28]) {
    const flare = mesh(flash, new THREE.ConeGeometry(0.19, 0.9, 7), flashMaterial, [x, 0.13, -3.5]);
    flare.rotation.x = -Math.PI / 2;
  }
  flash.visible = false;
  recoil.add(flash);
  group.scale.setScalar(.82);
  group.position.set(0.06, -1.0, -1.38);
  group.rotation.x = 0.055;
  group.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = false; object.receiveShadow = false; object.frustumCulled = false; } });
  return { group, recoil, flash };
}
