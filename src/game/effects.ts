import * as THREE from 'three';

interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  colour: THREE.Color;
  life: number;
  duration: number;
  size: number;
  growth: number;
  gravity: number;
  opacity: number;
  stretch: number;
}

export class Effects {
  private readonly capacity = 420;
  private readonly particles: Particle[];
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly alpha: THREE.InstancedBufferAttribute;
  private readonly stretch: THREE.InstancedBufferAttribute;
  private cursor = 0;
  private readonly material: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
    this.particles = Array.from({ length: this.capacity }, () => ({ position: new THREE.Vector3(), velocity: new THREE.Vector3(), colour: new THREE.Color(), life: 0, duration: 1, size: 1, growth: 1, gravity: 0, opacity: 1, stretch: 1 }));
    const geometry = new THREE.PlaneGeometry(1, 1);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity), 1); this.alpha.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aAlpha', this.alpha);
    this.stretch = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity), 1); this.stretch.setUsage(THREE.DynamicDrawUsage); geometry.setAttribute('aStretch', this.stretch);
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) } },
      vertexShader: `attribute float aAlpha; attribute float aStretch; varying float vAlpha; varying vec2 vUv; varying vec3 vColour; uniform vec3 uRight; uniform vec3 uUp;
        void main() { vAlpha = aAlpha; vUv = uv; vColour = instanceColor; vec3 center = instanceMatrix[3].xyz; float size = instanceMatrix[0][0];
          vec3 world = center + (uRight * position.x + uUp * position.y * aStretch) * size; gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0); }`,
      fragmentShader: `varying float vAlpha; varying vec2 vUv; varying vec3 vColour;
        void main() { float d = length(vUv - .5) * 2.0; float a = pow(max(0.0, 1.0 - d * d), 2.0) * vAlpha; if (a < .005) discard; gl_FragColor = vec4(vColour, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geometry, this.material, this.capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    for (let i = 0; i < this.capacity; i++) { this.dummy.scale.setScalar(0); this.dummy.updateMatrix(); this.mesh.setMatrixAt(i, this.dummy.matrix); this.mesh.setColorAt(i, new THREE.Color()); }
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
  }

  private emit(position: THREE.Vector3, colour: number, size: number, duration: number, speed: number, growth: number, gravity = 0, opacity = 0.8): Particle {
    const p = this.particles[this.cursor]; this.cursor = (this.cursor + 1) % this.capacity;
    p.position.copy(position); p.velocity.set((Math.random() - .5) * speed, Math.random() * speed * .8, (Math.random() - .5) * speed);
    p.colour.setHex(colour); p.life = p.duration = duration; p.size = size; p.growth = growth; p.gravity = gravity; p.opacity = opacity;
    p.stretch = 1; return p;
  }

  explosion(position: THREE.Vector3, large = false): void {
    const scale = large ? 2.2 : 1;
    for (let i = 0; i < 18; i++) this.emit(position, i % 3 ? 0xffa32a : 0xfff2b0, (2 + Math.random() * 3) * scale, .35 + Math.random() * .6, 20 * scale, 5 * scale, 5);
    for (let i = 0; i < 17; i++) this.emit(position, i % 2 ? 0x343c3c : 0x66685d, 4 * scale, 2.5 + Math.random() * 2.5, 8 * scale, 3 * scale, -1.1, .65);
  }

  hit(position: THREE.Vector3): void {
    for (let i = 0; i < 5; i++) this.emit(position, i % 2 ? 0xffdd85 : 0xff8f35, .8, .22 + Math.random() * .2, 12, 1, 9);
  }

  smoke(position: THREE.Vector3, large = false): void {
    this.emit(position, 0x555d58, large ? 4 : 1.8, 2.6, 1.5, large ? 2.4 : 1.5, -.9, .42);
  }

  splash(position: THREE.Vector3, large = false): void {
    const scale = large ? 2.5 : 1;
    for (let i = 0; i < (large ? 22 : 10); i++) {
      const p = this.emit(position, i % 2 ? 0xe9f4ea : 0xaacfd1, (.4 + Math.random() * .6) * scale, 1 + Math.random() * .65, 4 * scale, .6 * scale, 16, .75);
      p.velocity.y = (5 + Math.random() * 8) * Math.sqrt(scale); p.stretch = 2.5;
    }
    for (let i = 0; i < 4; i++) this.emit(position, 0xd7eae2, 1.5 * scale, 1.4, 2 * scale, 2 * scale, -.1, .25);
  }

  bowSpray(position: THREE.Vector3): void { const p = this.emit(position, 0xd7ebe2, .8, .7, 3, 1.1, 7, .36); p.velocity.y = 2.2; p.stretch = 1.4; }

  clear(): void { this.particles.forEach(p => { p.life = 0; }); }

  update(dt: number, camera: THREE.Camera): void {
    this.material.uniforms.uRight.value.setFromMatrixColumn(camera.matrixWorld, 0);
    this.material.uniforms.uUp.value.setFromMatrixColumn(camera.matrixWorld, 1);
    for (let i = 0; i < this.capacity; i++) {
      const p = this.particles[i];
      if (p.life > 0) {
        p.life = Math.max(0, p.life - dt); p.velocity.y -= p.gravity * dt; p.position.addScaledVector(p.velocity, dt); p.size += p.growth * dt;
        this.dummy.position.copy(p.position); this.dummy.scale.setScalar(p.size); this.alpha.setX(i, p.opacity * Math.min(1, p.life / (p.duration * .4)));
        this.mesh.setColorAt(i, p.colour);
        this.stretch.setX(i, p.stretch);
      } else { this.dummy.scale.setScalar(0); this.alpha.setX(i, 0); }
      this.dummy.updateMatrix(); this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor!.needsUpdate = true; this.alpha.needsUpdate = true;
    this.stretch.needsUpdate = true;
  }
}
