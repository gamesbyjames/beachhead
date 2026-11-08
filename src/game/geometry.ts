import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Batch static detail into one draw call per material, retaining named moving parts.
export function batchMeshes(root: THREE.Group, preserve: THREE.Object3D[] = []): void {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const objects: THREE.Mesh[] = [];
  const visit = (object: THREE.Object3D): void => {
    if (preserve.includes(object)) return;
    if (object instanceof THREE.Mesh && !Array.isArray(object.material)) {
      let geometry = object.geometry.clone();
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld));
      if (geometry.index) { const expanded = geometry.toNonIndexed(); geometry.dispose(); geometry = expanded; }
      // Common attributes let primitive and custom geometries share a batch.
      for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
      if (!geometry.attributes.uv) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
      const group = batches.get(object.material) ?? []; group.push(geometry); batches.set(object.material, group); objects.push(object);
    }
    object.children.forEach(visit);
  };
  root.children.forEach(visit);
  for (const object of objects) object.removeFromParent();
  for (const [material, geometries] of batches) {
    const merged = mergeGeometries(geometries, false);
    geometries.forEach(geometry => geometry.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
  }
}
