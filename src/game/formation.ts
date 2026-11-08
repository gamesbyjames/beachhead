import { Vector3 } from 'three';

/**
 * Fly each word-bearing aircraft in toward shore, then turn back for another pass.
 * Scaling the formation with distance keeps words separated and above the horizon
 * on both orientations, while the aircraft visibly grows as it approaches.
 */
export function sampleFormationFlight(anchor: Vector3, slot: number, age: number, camera: Vector3, position: Vector3, velocity: Vector3): void {
  const frequency = Math.PI * 2 / 36;
  const phase = (age + slot * 1.6 + 3) * frequency;
  const z = -175 - 130 * Math.cos(phase);
  const dz = 130 * frequency * Math.sin(phase);
  const baseDistance = camera.z - anchor.z;
  const scale = (camera.z - z) / baseDistance;
  const dScale = -dz / baseDistance;
  const swayPhase = age * .38 + slot * 1.7;
  const sway = Math.sin(swayPhase) * 2;
  const bobPhase = age * .4 + slot;
  position.set((anchor.x + sway) * scale, camera.y + (anchor.y - camera.y) * scale + Math.sin(bobPhase) * .6, z);
  velocity.set((anchor.x + sway) * dScale + Math.cos(swayPhase) * .76 * scale, (anchor.y - camera.y) * dScale + Math.cos(bobPhase) * .24, dz);
}
