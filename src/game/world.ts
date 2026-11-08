import * as THREE from 'three';
import { seededRandom } from './math';
import { batchMeshes } from './geometry';
import { Ocean, addWetSand, coastline, skyRadianceGLSL } from './ocean';

export interface World {
  update: (time: number) => void;
  setQuality: (high: boolean, reflections?: boolean) => void;
  ocean: Ocean;
}

export function createWorld(scene: THREE.Scene, renderer: THREE.WebGLRenderer): World {
  const random = seededRandom(124);
  const sun = new THREE.Vector3(0.44, 0.36, -0.82).normalize();
  const fogColour = new THREE.Color(0xc6dad7);
  scene.fog = new THREE.FogExp2(fogColour, 0.00075);
  scene.background = fogColour;
  const sky = createSky(sun);
  scene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  skyScene.add(sky.clone());
  const environment = pmrem.fromScene(skyScene, 0.04, 0.1, 20000);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.85;
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xc3e6ee, 0xb29e70, 1.15));
  const light = new THREE.DirectionalLight(0xffe7ba, 2.5);
  light.position.copy(sun).multiplyScalar(140);
  light.target.position.set(0, 0, 8);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  Object.assign(light.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 5, far: 270 });
  light.shadow.bias = -0.001;
  light.shadow.normalBias = 0.15;
  scene.add(light, light.target);

  const sandTexture = createSandTexture(random);
  const sand = new THREE.MeshStandardMaterial({ color: 0xfff4df, map: sandTexture, roughness: 0.97, metalness: 0 });
  const ocean = new Ocean(scene, sun, fogColour);
  addWetSand(sand, ocean.time);
  const loader = new THREE.TextureLoader();
  loader.load(`${import.meta.env.BASE_URL}textures/sand-colour.jpg`, texture => {
    texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(1400 / 12, 360 / 12); texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    sand.map = texture; sand.needsUpdate = true; sandTexture.dispose();
  });
  loader.load(`${import.meta.env.BASE_URL}textures/sand-normal.jpg`, texture => {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(1400 / 12, 360 / 12); texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    sand.normalMap = texture; sand.normalScale.set(.65, .65); sand.needsUpdate = true;
  });
  const groundGeo = new THREE.PlaneGeometry(1400, 360, 110, 40);
  groundGeo.rotateX(-Math.PI / 2);
  const positions = groundGeo.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i) + 177;
    positions.setXYZ(i, x, sandHeight(x, z), z);
  }
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, sand); ground.receiveShadow = true; scene.add(ground);

  const palms: THREE.Group[] = [];
  for (const [x, z, height, lean] of [[17, 7, 17, -0.2], [24, 12, 21, -0.16], [-23, 5, 16, 0.14], [39, 2, 17, -0.16], [-45, 8, 15, 0.12], [70, 12, 14, -0.1]]) {
    const palm = createPalm(random, height, lean);
    palm.position.set(x, sandHeight(x, z), z);
    scene.add(palm); palms.push(palm);
  }
  addGrass(scene, random);
  addRocks(scene, random);
  addIslands(scene);
  addClouds(scene, random);

  return {
    ocean,
    update(time) {
      ocean.update(time);
      palms.forEach((palm, index) => { const crown = palm.getObjectByName('crown')!; crown.rotation.z = Math.sin(time * 0.65 + index) * 0.018; crown.rotation.x = Math.sin(time * 0.45 + index) * 0.013; });
    },
    setQuality(high, reflections = false) { light.castShadow = high; renderer.shadowMap.enabled = high; ocean.setQuality(high, reflections); },
  };
}

function sandHeight(x: number, z: number): number {
  const coast = coastline(x);
  const distance = Math.max(0, z - coast);
  return -.15 + distance * .055 + Math.sin(x * .043) * Math.min(.65, distance * .04) + Math.sin(x * .12 + z * .13) * Math.min(.2, distance * .012);
}

function createSky(sun: THREE.Vector3): THREE.Mesh {
  // A bounded-radiance atmosphere is inexpensive on mobile and gives predictable metal reflections.
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uSun: { value: sun }, uHorizon: { value: new THREE.Color(0xc8d9d9) }, uZenith: { value: new THREE.Color(0x397ca5) } },
    vertexShader: `varying vec3 vWorld; void main() { vWorld = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0); }`,
    fragmentShader: `uniform vec3 uSun; uniform vec3 uHorizon; uniform vec3 uZenith; varying vec3 vWorld;
      ${skyRadianceGLSL}
      void main() { vec3 direction = normalize(vWorld - cameraPosition);
        vec3 colour = skyRadiance(direction);
        if (direction.y < 0.0) colour = mix(uHorizon, vec3(.13, .13, .095), min(1.0, -direction.y * 4.0));
        gl_FragColor = vec4(colour, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(8000, 24, 16), material);
}

function createSandTexture(random: () => number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#c3b28a'; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 44000; i++) {
    const value = 145 + Math.floor(random() * 95);
    ctx.fillStyle = `rgba(${value + 12},${value + 4},${value - 17},${0.1 + random() * 0.3})`;
    ctx.fillRect(random() * 512, random() * 512, 1 + random(), 1 + random());
  }
  for (let y = 0; y < 512; y += 12) {
    ctx.strokeStyle = 'rgba(255,245,210,.07)'; ctx.beginPath();
    for (let x = 0; x < 513; x += 4) { const z = y + Math.sin(x * .045 + y) * 2; if (x === 0) ctx.moveTo(x, z); else ctx.lineTo(x, z); }
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(130, 36); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

function createBarkTexture(random: () => number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 512;
  const ctx = canvas.getContext('2d')!; const image = ctx.createImageData(256, 512);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 256; x++) {
    const ring = Math.pow(Math.max(0, Math.cos(y * Math.PI / 16 + Math.sin(x * .04) * .15)), 22);
    const fibre = Math.sin(x * 2.4 + Math.sin(y * .012)) * 8;
    const value = 134 + random() * 46 + fibre - ring * 48;
    const i = (y * 256 + x) * 4;
    image.data[i] = value; image.data[i + 1] = value * .9; image.data[i + 2] = value * .73; image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  for (let i = 0; i < 900; i++) {
    ctx.strokeStyle = random() > .5 ? 'rgba(35,32,23,.2)' : 'rgba(230,216,179,.18)';
    const x = random() * 256, y = random() * 512;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + random() * 2, y + 5 + random() * 24); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 4;
  return texture;
}

function createPalm(random: () => number, height: number, lean: number): THREE.Group {
  const palm = new THREE.Group();
  const points = Array.from({ length: 9 }, (_, i) => new THREE.Vector3(lean * height * (i / 8) ** 2, height * i / 8, Math.sin(i / 8 * 2) * 0.5));
  const curve = new THREE.CatmullRomCurve3(points);
  const bark = createBarkTexture(random); bark.repeat.set(2, height / 2.5);
  const trunkGeo = new THREE.TubeGeometry(curve, 24, 0.32, 10, false);
  const trunkPositions = trunkGeo.attributes.position;
  for (let i = 0; i < trunkPositions.count; i++) {
    const t = Math.floor(i / 11) / 24; const center = curve.getPointAt(t); const taper = 1.35 - t * .7;
    trunkPositions.setXYZ(i, center.x + (trunkPositions.getX(i) - center.x) * taper, trunkPositions.getY(i), center.z + (trunkPositions.getZ(i) - center.z) * taper);
  }
  trunkGeo.computeVertexNormals();
  const trunk = new THREE.Mesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0xc7bbaa, map: bark, bumpMap: bark, bumpScale: .065, roughness: 1 }));
  trunk.castShadow = true; palm.add(trunk);
  const crown = new THREE.Group(); crown.name = 'crown'; crown.position.copy(points[8]); palm.add(crown);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x526f2b, roughness: 0.84, side: THREE.DoubleSide });
  const leafLight = new THREE.MeshStandardMaterial({ color: 0x82934a, roughness: 0.85, side: THREE.DoubleSide });
  for (let i = 0; i < 13; i++) {
    const angle = i * Math.PI * 2 / 13 + random() * 0.3;
    const length = 5 + random() * 2.2;
    const frond = new THREE.Group(); frond.rotation.y = angle;
    const vertices: number[] = []; const indices: number[] = [];
    for (let j = 1; j < 36; j++) {
      const t = j / 36;
      const x = t * length, y = Math.sin(t * Math.PI) * 1.1 - t * t * (2 + i % 3 * 0.3);
      const width = Math.sin(t * Math.PI) * (1.25 + random() * .25);
      for (const side of [-1, 1]) {
        const base = vertices.length / 3;
        for (let k = 0; k < 4; k++) {
          const fraction = k / 3; const centerX = x + fraction * .7; const centerY = y - fraction * fraction * (.4 + t * .3); const z = side * width * fraction;
          const half = Math.sin(fraction * Math.PI) * .075 + (k === 0 ? .025 : .002);
          vertices.push(centerX - half, centerY, z, centerX + half, centerY + .015, z);
          if (k > 0) { const a = base + (k - 1) * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        }
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.setIndex(indices); geo.computeVertexNormals();
    const leaves = new THREE.Mesh(geo, i % 3 === 0 ? leafLight : leafMat); leaves.castShadow = true; frond.add(leaves);
    const spineCurve = new THREE.CatmullRomCurve3(Array.from({ length: 6 }, (_, j) => { const t = j / 5; return new THREE.Vector3(t * length, Math.sin(t * Math.PI) * 1.1 - t * t * (2 + i % 3 * .3), 0); }));
    frond.add(new THREE.Mesh(new THREE.TubeGeometry(spineCurve, 8, 0.035, 3, false), leafLight));
    crown.add(frond);
  }
  batchMeshes(crown);
  batchMeshes(palm, [crown]);
  return palm;
}

function addGrass(scene: THREE.Scene, random: () => number): void {
  const geo = new THREE.BufferGeometry();
  const vertices: number[] = [], indices: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = i / 4, width = .028 * (1 - t) + .001, bend = t * t * .22;
    vertices.push(bend - width, t, t * t * .15, bend + width, t, t * t * .15);
    if (i > 0) { const a = (i - 1) * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.setIndex(indices); geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xc5c091, roughness: 1, side: THREE.DoubleSide });
  const grass = new THREE.InstancedMesh(geo, mat, 3600);
  const dummy = new THREE.Object3D(); const colour = new THREE.Color();
  const clusters = Array.from({ length: 75 }, () => { let x = (random() - .5) * 110; if (Math.abs(x) < 5) x += x < 0 ? -7 : 7; return { x, z: 5 + random() * 40 }; });
  for (let i = 0; i < 3600; i++) {
    const cluster = clusters[i % clusters.length];
    const x = cluster.x + (random() - .5) * 2.8, z = cluster.z + (random() - .5) * 2.8;
    dummy.position.set(x, sandHeight(x, z), z);
    dummy.rotation.set(0, random() * 6.28, (random() - .5) * .5);
    dummy.scale.setScalar(.25 + random() * .6); dummy.updateMatrix(); grass.setMatrixAt(i, dummy.matrix);
    colour.setHSL(.13 + random() * .09, .18 + random() * .25, .3 + random() * .23); grass.setColorAt(i, colour);
  }
  grass.receiveShadow = true; scene.add(grass);
}

function addRocks(scene: THREE.Scene, random: () => number): void {
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xaaa28c, roughness: 1 });
  const rocks = new THREE.InstancedMesh(geo, mat, 80); const dummy = new THREE.Object3D();
  for (let i = 0; i < 80; i++) {
    const x = (random() - .5) * 150, z = 6 + random() * 40;
    dummy.position.set(x, sandHeight(x, z), z); dummy.rotation.set(random(), random() * 6, random()); dummy.scale.set(.15 + random() * .5, .1 + random() * .3, .15 + random() * .45); dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
  }
  rocks.castShadow = rocks.receiveShadow = true; scene.add(rocks);
}

function addIslands(scene: THREE.Scene): void {
  const mat = new THREE.MeshStandardMaterial({ color: 0x6d8e86, roughness: 1, flatShading: true });
  for (const [x, z, sx, sy] of [[-900, -1150, 270, 75], [-1150, -1350, 340, 110], [1350, -1800, 400, 65]]) {
    const island = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mat); island.position.set(x, -20, z); island.scale.set(sx, sy, sx * .45); scene.add(island);
  }
}

function addClouds(scene: THREE.Scene, random: () => number): void {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  for (let i = 0; i < 24; i++) {
    const x = 35 + random() * 185, y = 45 + random() * 40, radius = 20 + random() * 32;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(255,250,230,.25)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 256, 128);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: .4, fog: true, depthWrite: false });
  for (let i = 0; i < 14; i++) {
    const cloud = new THREE.Sprite(material); cloud.position.set((random() - .5) * 6000, 400 + random() * 340, -1800 - random() * 2500); cloud.scale.set(700 + random() * 900, 190 + random() * 230, 1); scene.add(cloud);
  }
}
