import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { seededRandom } from './math';

export const coastline = (x: number): number => Math.sin(x * .022) * 2.8 + Math.sin(x * .06) * .45;
const waves = [[.28, .96, 32, .44], [-.6, .8, 17, .19], [.8, .6, 8.5, .075]];
const smooth = (a: number, b: number, x: number): number => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function waterHeight(x: number, z: number, time: number): number {
  const fade = smooth(1, 24, coastline(x) - z);
  let height = -.12 + Math.sin(time * .55) * .1 * (1 - fade * .65);
  for (const [dx, dz, length, amplitude] of waves) {
    const k = Math.PI * 2 / length;
    height += Math.sin((x * dx + z * dz) * k - time * Math.sqrt(9.81 * k)) * amplitude * fade;
  }
  return height;
}

// Shared by the visible sky and its water reflection; all colours are linear.
export const skyRadianceGLSL = /* glsl */ `
  vec3 skyRadiance(vec3 direction) {
    float height = max(0.0, direction.y);
    vec3 colour = mix(uHorizon, uZenith, pow(height, .48));
    float solar = max(0.0, dot(direction, uSun));
    colour += vec3(1.0, .84, .57) * (pow(solar, 24.0) * .13 + pow(solar, 350.0) * .45 + smoothstep(.99975, .99995, solar) * 7.0);
    return colour;
  }
`;

const waveGLSL = /* glsl */ `
  float coastAt(float x) { return sin(x * .022) * 2.8 + sin(x * .06) * .45; }
  vec3 swell(vec2 p, float time) {
    vec3 result = vec3(0.0);
    ${waves.map(([dx, dz, length, amplitude]) => {
      const k = Math.PI * 2 / length;
      return `{ float phase = dot(p, vec2(${dx.toFixed(4)}, ${dz.toFixed(4)})) * ${k.toFixed(6)} - time * ${Math.sqrt(9.81 * k).toFixed(6)};
        result += vec3(sin(phase) * ${amplitude.toFixed(4)}, cos(phase) * ${(.0 + amplitude * k * dx).toFixed(6)}, cos(phase) * ${(amplitude * k * dz).toFixed(6)}); }`;
    }).join('\n')}
    float fade = smoothstep(1.0, 24.0, coastAt(p.x) - p.y);
    result *= fade;
    result.x += -.12 + sin(time * .55) * .1 * (1.0 - fade * .65);
    return result;
  }
`;

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform mat4 uReflectionMatrix;
  varying vec3 vWorld;
  varying vec2 vSlope;
  varying vec4 vReflection;
  ${waveGLSL}
  void main() {
    vec3 p = position;
    vec3 wave = swell(p.xz, uTime);
    p.y = wave.x;
    vSlope = wave.yz;
    vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
    vReflection = uReflectionMatrix * vec4(vWorld, 1.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSun;
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uFog;
  uniform sampler2D uNormals;
  uniform sampler2D uReflection;
  uniform float uReflect;
  uniform int uShipCount;
  uniform vec4 uShips[4];
  uniform vec4 uRipples[6];
  varying vec3 vWorld;
  varying vec2 vSlope;
  varying vec4 vReflection;
  ${skyRadianceGLSL}
  float coastAt(float x) { return sin(x * .022) * 2.8 + sin(x * .06) * .45; }
  void main() {
    vec2 p = vWorld.xz;
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float distanceToCamera = length(cameraPosition - vWorld);
    float coastDistance = coastAt(p.x) - p.y;
    float depth = max(.0, coastDistance * .085);
    vec4 detailA = texture2D(uNormals, p * .038 + vec2(uTime * .012, -uTime * .017));
    vec4 detailB = texture2D(uNormals, p.yx * .091 + vec2(-uTime * .014, uTime * .009));
    float fineFade = 1.0 - smoothstep(150.0, 900.0, distanceToCamera);
    vec2 smallSlope = (detailA.rg * 2.0 - 1.0) * .27 + (detailB.gr * 2.0 - 1.0) * .12;
    vec2 slope = vSlope + smallSlope * fineFade;
    float foam = 0.0;
    // A small pool of expanding shell-impact rings is evaluated only while alive.
    for (int i = 0; i < 6; i++) {
      vec4 ring = uRipples[i]; float age = uTime - ring.z;
      if (age > 0.0 && age < 4.5) {
        vec2 delta = p - ring.xy; float radius = length(delta);
        float band = radius - age * (3.1 + ring.w * .5);
        float envelope = exp(-abs(band) * 2.1) * (1.0 - age / 4.5) * ring.w;
        slope += delta / max(radius, .1) * sin(band * 5.0) * envelope * .14;
        foam += envelope * .28;
      }
    }
    // Bow foam, Kelvin-like V wakes and a widening, broken propeller trail.
    for (int i = 0; i < 4; i++) {
      if (i >= uShipCount) break;
      vec2 delta = p - uShips[i].xy;
      vec2 direction = uShips[i].zw;
      float along = dot(delta, direction);
      float across = abs(dot(delta, vec2(-direction.y, direction.x)));
      float behind = -along - 14.0;
      float trailFade = smoothstep(0.0, 7.0, behind) * (1.0 - smoothstep(45.0, 145.0, behind));
      float edge = across - max(0.0, behind) * .24 - 2.0;
      float wake = exp(-edge * edge / (1.7 + max(0.0, behind) * .025));
      float churn = exp(-across * across / (8.0 + max(0.0, behind) * .5));
      foam += (wake * .7 + churn * .48) * trailFade * (.35 + detailA.a * .65);
      foam += exp(-pow((along - 21.0) * .35, 2.0) - pow((across - 2.5) * .7, 2.0)) * .7;
      slope += vec2(-direction.y, direction.x) * sin(edge * 2.4) * wake * trailFade * .08;
    }
    vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));
    float facing = max(dot(normal, viewDir), .0);
    float fresnel = .02 + .98 * pow(1.0 - facing, 5.0);
    vec3 reflectedDirection = reflect(-viewDir, normal);
    vec3 reflection = skyRadiance(reflectedDirection);
    if (uReflect > .5 && vReflection.w > 0.0) {
      vec2 uv = vReflection.xy / vReflection.w + normal.xz * .018;
      if (all(greaterThan(uv, vec2(.01))) && all(lessThan(uv, vec2(.99)))) {
        reflection = mix(reflection, texture2D(uReflection, uv).rgb, .8);
      }
    }
    vec3 shallow = vec3(.035, .29, .23);
    vec3 deep = vec3(.006, .055, .095);
    vec3 water = mix(shallow, deep, 1.0 - exp(-depth * .15));
    float transmission = exp(-depth * .85) * (1.0 - fresnel);
    vec3 sand = vec3(.43, .38, .23) * (.92 + detailB.a * .08);
    water = mix(water, sand, transmission * .55);
    water += vec3(.015, .085, .055) * max(0.0, vWorld.y) * (1.0 - facing);
    vec3 colour = mix(water, reflection, clamp(fresnel * .83, .07, .87));
    vec3 halfDirection = normalize(uSun + viewDir);
    float sunGlint = pow(max(dot(normal, halfDirection), 0.0), 210.0);
    colour += vec3(1.0, .86, .57) * sunGlint * 3.5;
    // Irregular shore break, washing up and receding over the sand.
    float surge = sin(uTime * .55) * 1.7 + sin(p.x * .19 + uTime * .25) * .38;
    float shoreBand = coastDistance + surge - .4;
    float breakUp = smoothstep(.22, .66, detailA.a * .6 + detailB.a * .4);
    float wash = exp(-abs(shoreBand) * .85) * (.35 + breakUp * .65);
    float secondBreak = exp(-pow((coastDistance - 7.0 + sin(uTime * .7 + p.x * .035) * 2.0) * .65, 2.0));
    foam += wash * .9 + secondBreak * smoothstep(.3, .8, detailB.a) * .3;
    float crest = smoothstep(.25, .48, length(vSlope));
    foam += crest * smoothstep(.6, .85, detailA.a) * .18;
    colour = mix(colour, vec3(.78, .86, .79), clamp(foam, 0.0, .93));
    float fog = 1.0 - exp(-distanceToCamera * .00055);
    colour = mix(colour, uFog, fog);
    gl_FragColor = vec4(colour, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Two scrolling samples of this mipmapped, periodic normal field replace per-pixel noise octaves. */
function makeNormals(): THREE.DataTexture {
  const size = 256, data = new Uint8Array(size * size * 4), random = seededRandom(1459);
  const frequencies = [[2, 3, .55], [5, -3, .25], [13, 8, .09], [-21, 15, .04], [37, 29, .016]];
  const phases = frequencies.map(() => random() * Math.PI * 2);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let dx = 0, dz = 0, height = 0;
    frequencies.forEach(([fx, fz, amplitude], i) => {
      const angle = (x * fx + y * fz) / size * Math.PI * 2 + phases[i];
      dx += Math.cos(angle) * fx * amplitude; dz += Math.cos(angle) * fz * amplitude; height += Math.sin(angle) * amplitude;
    });
    const length = Math.hypot(dx, dz, 4), i = (y * size + x) * 4;
    data[i] = Math.round((dx / length * .5 + .5) * 255);
    data[i + 1] = Math.round((dz / length * .5 + .5) * 255);
    data[i + 2] = Math.round(4 / length * 255);
    data[i + 3] = Math.round(THREE.MathUtils.clamp(.5 + height * .48, 0, 1) * 255);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}

function oceanGeometry(columns: number, rows: number): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(2, 1, columns, rows);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const u = position.getX(i), v = .5 - position.getY(i), a = Math.abs(u);
    const x = Math.sign(u) * (a < .8 ? a / .8 * 230 : 230 + ((a - .8) / .2) ** 2 * 4770);
    position.setXYZ(i, x, -.12, 8 - 6508 * v ** 3);
  }
  const indices = geometry.index!;
  for (let i = 0; i < indices.count; i += 3) { const b = indices.getX(i + 1); indices.setX(i + 1, indices.getX(i + 2)); indices.setX(i + 2, b); }
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

export class Ocean {
  readonly time = { value: 0 };
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly highGeometry = oceanGeometry(240, 190);
  private readonly lowGeometry = oceanGeometry(140, 110);
  private readonly reflector: Reflector;
  private readonly reflectionInverse = new THREE.Matrix4();
  private readonly heading = new THREE.Vector3();
  private reflectionEnabled = false;
  private reflectionFrame = 0;
  private rippleIndex = 0;

  constructor(scene: THREE.Scene, sun: THREE.Vector3, fog: THREE.Color) {
    const normalMap = makeNormals();
    this.reflector = new Reflector(new THREE.PlaneGeometry(1, 1), { textureWidth: 512, textureHeight: 256, clipBias: .003, multisample: 0 });
    this.reflector.rotation.x = -Math.PI / 2; this.reflector.position.y = -.12; this.reflector.updateMatrixWorld(true);
    this.reflectionInverse.copy(this.reflector.matrixWorld).invert();
    this.material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: {
      uTime: this.time, uSun: { value: sun }, uHorizon: { value: new THREE.Color(0xc8d9d9) }, uZenith: { value: new THREE.Color(0x397ca5) }, uFog: { value: fog },
      uNormals: { value: normalMap }, uReflection: { value: this.reflector.getRenderTarget().texture }, uReflectionMatrix: { value: new THREE.Matrix4() }, uReflect: { value: 0 },
      uShips: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) }, uShipCount: { value: 0 }, uRipples: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, -100, 0)) },
    } });
    this.mesh = new THREE.Mesh(this.highGeometry, this.material); this.mesh.frustumCulled = false;
    const capture = this.reflector.onBeforeRender.bind(this.reflector) as (renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) => void;
    this.mesh.onBeforeRender = (renderer, renderScene, camera) => {
      if (!this.reflectionEnabled || ++this.reflectionFrame % 3 !== 0) return;
      const visibility = camera.children.map(child => child.visible);
      camera.children.forEach(child => { child.visible = false; }); this.mesh.visible = false;
      try {
        capture(renderer, renderScene, camera);
        const reflected = this.reflector.material as THREE.ShaderMaterial;
        this.material.uniforms.uReflectionMatrix.value.copy(reflected.uniforms.textureMatrix.value).multiply(this.reflectionInverse);
        this.material.uniforms.uReflect.value = 1;
      } finally { this.mesh.visible = true; camera.children.forEach((child, i) => { child.visible = visibility[i]; }); }
    };
    scene.add(this.mesh);
  }

  update(time: number): void { this.time.value = time; }
  setQuality(high: boolean, reflections: boolean): void {
    this.mesh.geometry = high ? this.highGeometry : this.lowGeometry;
    this.reflectionEnabled = high && reflections; this.reflectionFrame = 2;
    if (!this.reflectionEnabled) this.material.uniforms.uReflect.value = 0;
  }
  setShips(ships: THREE.Object3D[]): void {
    const count = Math.min(4, ships.length); this.material.uniforms.uShipCount.value = count;
    for (let i = 0; i < count; i++) {
      this.heading.set(0, 0, 1).applyQuaternion(ships[i].quaternion);
      this.material.uniforms.uShips.value[i].set(ships[i].position.x, ships[i].position.z, this.heading.x, this.heading.z);
    }
  }
  impact(position: THREE.Vector3, large = false): void {
    this.material.uniforms.uRipples.value[this.rippleIndex].set(position.x, position.z, this.time.value, large ? 2 : 1);
    this.rippleIndex = (this.rippleIndex + 1) % 6;
  }
  clear(): void { this.material.uniforms.uRipples.value.forEach((ring: THREE.Vector4) => ring.set(0, 0, -100, 0)); this.setShips([]); }
}

export function addWetSand(material: THREE.MeshStandardMaterial, time: { value: number }): void {
  material.onBeforeCompile = shader => {
    shader.uniforms.uShoreTime = time;
    shader.vertexShader = 'varying vec3 vSandPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSandPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = 'uniform float uShoreTime; varying vec3 vSandPosition;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float shore = sin(vSandPosition.x * .022) * 2.8 + sin(vSandPosition.x * .06) * .45;
      float wet = 1.0 - smoothstep(-.5, 4.5 + sin(uShoreTime * .55) * .9, vSandPosition.z - shore);
      diffuseColor.rgb *= mix(1.0, .57, wet);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, .27, wet);');
  };
  material.customProgramCacheKey = () => 'wet-shore-v1';
}
