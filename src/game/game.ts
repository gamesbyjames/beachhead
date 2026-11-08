import * as THREE from 'three';
import { createWorld } from './world';
import { createAircraft, createGun, createShip } from './models';
import { Effects } from './effects';
import { Input } from './input';
import type { FirePress } from './input';
import { GameAudio } from './audio';
import { segmentSphereHit, seededRandom } from './math';
import { loadPreferences, savePreferences } from './types';
import { HindiLesson, idleLesson, loadHindiCourse } from './lesson';
import type { HindiCourse, LessonOrder, LessonWord } from './lesson';
import { waterHeight } from './ocean';
import { sampleFormationFlight } from './formation';
import type { CombatEvent, GameMode, GameState, Preferences, Quality, TargetKind } from './types';

interface Target {
  id: string;
  kind: TargetKind;
  mesh: THREE.Group;
  propeller?: THREE.Object3D;
  velocity: THREE.Vector3;
  health: number;
  maxHealth: number;
  age: number;
  dead: boolean;
  attacked: boolean;
  timer: number;
  seed: number;
  word?: LessonWord;
  anchor?: THREE.Vector3;
  rejectedUntil?: number;
}

interface Bullet { position: THREE.Vector3; previous: THREE.Vector3; velocity: THREE.Vector3; life: number; trigger: number; targetId?: string }

export interface HitFeedback { x: number; y: number; message: string }

export interface GameCallbacks {
  state: (state: GameState) => void;
  hit: (destroyed: boolean, points?: number, feedback?: HitFeedback) => void;
  damage: () => void;
  event?: (event: CombatEvent) => void;
  labels?: (labels: TargetLabel[]) => void;
  pickLabel?: (clientX: number, clientY: number) => string | undefined;
  aim?: (x: number, y: number) => void;
  map?: (course: HindiCourse) => void;
}

export interface TargetLabel { id: string; roman: string; x: number; y: number; range: number; visible: boolean; wrong: boolean; aimed: boolean }

export class BeachheadGame {
  readonly state: GameState;
  readonly preferences: Preferences;
  readonly input: Input;
  readonly audio = new GameAudio();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 16000);
  private readonly firingCamera = new THREE.PerspectiveCamera(58, 1, .1, 16000);
  private readonly world;
  private readonly effects: Effects;
  private readonly gun = createGun();
  private readonly targets: Target[] = [];
  private readonly bullets: Bullet[];
  private readonly tracerMesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly direction = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();
  private readonly center = new THREE.Vector3();
  private readonly ray = new THREE.Ray();
  private readonly bounds = new THREE.Box3();
  private readonly gunAim = new THREE.Vector3();
  private readonly measureWords = document.createElement('canvas').getContext('2d')!;
  private formationWords: string[] = [];
  private view = { width: 1, height: 1, left: 0, top: 0 };
  private readonly random = seededRandom(372);
  private lastTime = 0;
  private elapsed = 0;
  private gameTime = 0;
  private lastShot = -1;
  private bulletCursor = 0;
  private recoil = 0;
  private uiTimer = 0;
  private effectTimer = 0;
  private spawnTimer = 0;
  private waveRemaining = 0;
  private waveBreak = -1;
  private sequence = 0;
  private bannerUntil = 0;
  private frameCount = 0;
  private frameTime = 0;
  private qualityTimer = 0;
  private resolutionScale = 1.5;
  private running = true;
  private needsRender = true;
  private orientationHold = false;
  private lesson?: HindiLesson;
  private readonly resolvedTriggers = new Set<number>();
  private startRequest = 0;
  private labels: TargetLabel[] = [];

  constructor(canvas: HTMLCanvasElement, fireButton: HTMLButtonElement, private callbacks: GameCallbacks) {
    this.preferences = loadPreferences();
    this.state = { phase: 'menu', mode: 'classic', lesson: idleLesson(), voiceStatus: 'idle', audioStatus: 'locked', score: 0, best: this.preferences.best, wave: 1, health: 100, heat: 0, overheated: false, kills: 0, targets: 0, fps: 60, quality: this.preferences.quality, muted: this.preferences.muted, message: '' };
    this.audio.onVoiceStatus = status => { if (this.state.voiceStatus !== status) { this.state.voiceStatus = status; this.callbacks.state(this.state); } };
    this.audio.onAudioStatus = status => { this.state.audioStatus = status; this.callbacks.state(this.state); };
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.camera.position.set(0, 4.6, 27);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.camera.add(this.gun.group);
    this.world = createWorld(this.scene, this.renderer);
    this.effects = new Effects(this.scene);
    this.input = new Input(canvas, fireButton);
    this.input.sensitivity = this.preferences.sensitivity;
    this.input.onPause = () => this.togglePause();
    this.input.onReplay = () => this.replayPhrase();
    this.input.onRecenter = () => this.recenter();
    this.input.onShot = press => { press.targetId = this.pickTarget(press)?.id; };
    this.audio.setMuted(this.preferences.muted);
    this.bullets = Array.from({ length: 96 }, () => ({ position: new THREE.Vector3(), previous: new THREE.Vector3(), velocity: new THREE.Vector3(), life: 0, trigger: 0 }));
    this.tracerMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.07, .07, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.8, .7), toneMapped: false }), this.bullets.length);
    this.tracerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.tracerMesh.frustumCulled = false;
    this.scene.add(this.tracerMesh);
    this.setQuality(this.preferences.quality);
    this.createAttractScene();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    new ResizeObserver(() => this.resize()).observe(canvas);
    // iPhone browsers can require a fresh *synchronous* gesture to recover audio.
    const unlockAudio = (event: Event): void => {
      if (event.target instanceof Element && event.target.closest('#sound, #audio-toggle, #replay-phrase, #orientation-prompt')) return;
      if (this.state.phase === 'playing' && !this.state.muted) void this.audio.unlock();
    };
    for (const event of ['pointerdown', 'pointerup', 'touchend', 'keydown']) document.addEventListener(event, unlockAudio, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (this.state.phase === 'playing') this.pause(); this.audio.suspend(); this.lastTime = 0; }
    });
    window.addEventListener('blur', () => { if (this.state.phase === 'playing') this.pause(); });
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.pause(); this.state.message = 'Graphics interrupted. Reload to restore the scene.'; this.callbacks.state(this.state); this.running = false; });
    requestAnimationFrame(time => this.frame(time));
  }

  private createAttractScene(): void {
    for (let i = 0; i < 13; i++) {
      const target = this.spawn('aircraft');
      target.mesh.position.set((i % 5 - 2) * 32 + Math.floor(i / 5) * 6, 52 + Math.floor(i / 5) * 15, -310 - Math.floor(i / 5) * 75);
      target.velocity.set(1, 0, 9);
    }
    for (let i = 0; i < 3; i++) {
      const ship = this.spawn('ship'); ship.mesh.position.set(-160 + i * 155, 0, -330 - i * 65); ship.velocity.x = i % 2 ? -2 : 2;
    }
  }

  start(): void {
    this.startRequest++; this.lesson = undefined; this.beginSession('classic');
  }

  async startHindi(): Promise<void> {
    const request = ++this.startRequest;
    void this.audio.unlock();
    const course = await loadHindiCourse();
    if (request !== this.startRequest) return;
    this.lesson = new HindiLesson(course); this.showHindiMap(course);
  }

  private showHindiMap(course: HindiCourse): void {
    this.startRequest++;
    this.clearCombat(); this.input.active = false; this.input.pointAndShoot = false;
    this.state.mode = 'hindi'; this.state.phase = 'map'; this.state.lesson = this.lesson!.state; this.state.lesson.phraseCount = course.phrases.length;
    this.state.best = this.preferences.hindiBest; this.callbacks.map?.(course); this.callbacks.state(this.state);
  }

  startHindiTopic(topicId: string, order: LessonOrder): void {
    if (this.state.phase !== 'map' || !this.lesson) return;
    this.lesson.startTopic(topicId, order); this.beginSession('hindi');
  }

  returnToHindiMap(): void {
    if (!this.lesson) return;
    this.showHindiMap(this.lesson.course);
  }

  restartHindiTopic(): void {
    if (!this.lesson?.state.topicId) return;
    this.lesson.startTopic(this.lesson.state.topicId, this.lesson.state.order); this.beginSession('hindi');
  }

  private beginSession(mode: GameMode): void {
    this.clearCombat();
    Object.assign(this.state, { phase: 'playing', mode, lesson: this.lesson?.state ?? idleLesson(), best: mode === 'hindi' ? this.preferences.hindiBest : this.preferences.best, score: 0, wave: 1, health: 100, heat: 0, overheated: false, kills: 0, message: '' });
    this.gameTime = 0; this.lastShot = -1; this.sequence = 0; this.waveBreak = -1;
    this.waveRemaining = 0; this.input.pointAndShoot = mode === 'hindi'; this.recenter(); this.input.active = true;
    void this.audio.unlock();
    if (mode === 'hindi') this.startPhrase();
    else this.startWave();
    this.callbacks.state(this.state);
  }

  private clearCombat(): void {
    this.targets.forEach(target => target.mesh.removeFromParent()); this.targets.length = 0;
    this.bullets.forEach(bullet => { bullet.life = 0; }); this.effects.clear(); this.gun.flash.visible = false; this.recoil = 0;
    this.world.ocean.clear(); this.audio.stopVoice(); this.labels = []; this.callbacks.labels?.([]);
    this.resolvedTriggers.clear(); this.input.clearShots();
    this.gun.group.rotation.set(.055, 0, 0, 'YXZ');
  }

  private startPhrase(): void {
    this.clearCombat(); this.recenter(); this.state.heat = 0; this.state.overheated = false;
    const phrase = this.lesson!.state.phrase!;
    const order = phrase.words.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    if (order.every((value, index) => value === index)) order.reverse();
    this.formationWords = order.map(index => phrase.words[index].roman);
    order.forEach((wordIndex, slot) => {
      const target = this.spawn('aircraft');
      target.word = phrase.words[wordIndex]; target.health = target.maxHealth = 1;
      target.anchor = new THREE.Vector3();
      // The slot is retained so rotation can relayout a formation for portrait or landscape.
      target.seed = slot; this.positionLessonTarget(target, order.length);
      this.labels.push({ id: target.id, roman: target.word.roman, x: 0, y: 0, range: 0, visible: false, wrong: false, aimed: false });
    });
    for (const x of [-165, 175]) { const ship = this.spawn('ship'); ship.mesh.position.set(x, 0, -370); ship.velocity.x = 0; ship.mesh.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; }
    this.state.targets = phrase.words.length;
    this.audio.preloadVoice([phrase.audio, ...phrase.words.map(word => word.audio)]);
    this.replayPhrase(); this.callbacks.state(this.state);
  }

  private positionLessonTarget(target: Target, count: number): void {
    const wide = this.view.width / this.view.height >= 1.2;
    this.measureWords.font = `500 ${this.view.height <= 600 ? 15 : 17}px 'DM Sans', Arial, sans-serif`;
    const widths = this.formationWords.map(word => Math.max(45, this.measureWords.measureText(word).width + 24));
    const totalWidth = widths.reduce((total, width) => total + width, 0);
    const usable = this.view.width - 100;
    const singleRow = wide && count > 5 && widths.length === count && totalWidth + (count - 1) * 16 <= usable;
    if (singleRow) {
      const gap = Math.min(90, (usable - totalWidth) / (count - 1));
      const start = (this.view.width - totalWidth - gap * (count - 1)) / 2;
      const center = start + widths.slice(0, target.seed).reduce((sum, width) => sum + width + gap, 0) + widths[target.seed] / 2;
      const y = 36;
      const focal = this.view.height / (2 * Math.tan(THREE.MathUtils.degToRad(58 / 2)));
      const depth = Math.cos(.28) * (this.camera.position.z + 185) + Math.sin(.28) * (y - this.camera.position.y);
      target.anchor!.set((center - this.view.width / 2) / focal * depth, y, -185);
      sampleFormationFlight(target.anchor!, target.seed, target.age, this.camera.position, target.mesh.position, target.velocity);
      return;
    }
    const columns = wide ? Math.min(count, 5) : Math.min(2, count);
    const column = target.seed % columns, row = Math.floor(target.seed / columns);
    const rows = Math.ceil(count / columns);
    const y = wide ? (rows > 1 ? 46 - row * 22 : (this.view.height < 390 ? 14 : 21) + (column % 2) * 3) : (rows > 1 ? 82 - row * (54 / (rows - 1)) : 55);
    target.anchor!.set((column - (columns - 1) / 2) * (wide ? 55 : 42), y, -185);
    sampleFormationFlight(target.anchor!, target.seed, target.age, this.camera.position, target.mesh.position, target.velocity);
    if (target.kind === 'ship') target.mesh.rotation.y = Math.PI / 2;
  }

  activatePhrase(): void { if (this.state.phase === 'playing' && this.lesson) { this.lesson.activate(); this.input.reset(); this.callbacks.state(this.state); } }

  nextPhrase(): void {
    if (this.state.phase !== 'playing' || this.lesson?.state.stage !== 'complete') return;
    if (this.lesson.advance()) this.startPhrase(); else this.finishHindi();
  }

  skipPhrase(): void {
    if (this.orientationHold || this.state.phase !== 'playing' || !this.lesson || !['preview', 'active'].includes(this.lesson.state.stage)) return;
    const phraseId = this.lesson.state.phrase!.id;
    const hasNext = this.lesson.skip();
    this.emit({ type: 'phrase-skipped', phraseId });
    if (hasNext) this.startPhrase(); else this.finishHindi();
  }

  private finishHindi(): void {
    this.audio.stopVoice(); this.input.clearShots(); this.bullets.forEach(bullet => { bullet.life = 0; });
    this.state.phase = 'complete'; this.input.active = false; this.input.reset(); this.labels = []; this.callbacks.labels?.([]); this.callbacks.state(this.state);
  }

  setOrientationHold(hold: boolean): void {
    if (this.orientationHold === hold) return;
    this.orientationHold = hold; this.needsRender = true;
    if (hold) { this.input.active = false; this.input.reset(); this.audio.suspend(); this.gun.flash.visible = false; }
    else if (this.state.phase === 'playing') {
      this.input.reset(); this.input.active = true;
      void this.audio.unlock().then(() => { if (!this.orientationHold && this.state.phase === 'playing' && this.lesson?.state.stage === 'preview') this.replayPhrase(); });
    }
  }

  replayPhrase(): void {
    if (this.orientationHold || this.state.mode !== 'hindi' || this.state.phase !== 'playing' || !this.lesson?.state.phrase) return;
    const phrase = this.lesson.state.phrase, request = this.startRequest;
    void this.audio.unlock().then(() => { if (this.state.phase === 'playing' && this.startRequest === request && this.lesson?.state.phrase === phrase) void this.audio.speak(phrase.audio); });
  }

  recenter(): void {
    this.input.center();
    if (this.state.mode === 'hindi') {
      const wide = this.view.width / this.view.height >= 1.2;
      this.input.pitch = !wide ? .4 : (this.lesson?.state.phrase?.words.length ?? 0) > 5 ? .28 : .14;
    }
  }

  private startWave(): void {
    const count = Math.min(8 + this.state.wave * 2, 20);
    this.waveRemaining = count - 5;
    for (let i = 0; i < 5; i++) {
      const target = this.spawn('aircraft');
      target.mesh.position.set((i - 2) * 32, 44 + Math.abs(i - 2) * 8, -300 - Math.abs(i - 2) * 35);
      target.velocity.set(-target.mesh.position.x * .015, -.15, 20 + this.state.wave * 1.5);
    }
    for (let i = 0; i < Math.min(2 + Math.floor(this.state.wave / 3), 4); i++) {
      const ship = this.spawn('ship'); ship.mesh.position.set(i === 0 ? -120 : 145 + i * 25, 0, -290 - i * 100);
    }
    this.spawnTimer = 4;
    this.state.message = `WAVE ${String(this.state.wave).padStart(2, '0')}  /  INCOMING FORMATION`;
    this.bannerUntil = this.gameTime + 4;
    this.emit({ type: 'wave-started', wave: this.state.wave });
  }

  private spawn(kind: TargetKind): Target {
    const mesh = kind === 'aircraft' ? createAircraft() : createShip();
    const x = (this.random() - .5) * 290;
    const health = kind === 'aircraft' ? 3 : 15;
    const target: Target = {
      id: `w${this.state.wave}-${kind}-${++this.sequence}`, kind, mesh, propeller: mesh.getObjectByName('propeller'),
      velocity: new THREE.Vector3(kind === 'aircraft' ? -x * .025 : (x > 0 ? -3 : 3), kind === 'aircraft' ? -.3 : 0, kind === 'aircraft' ? 22 + this.state.wave * 1.5 : 0),
      health, maxHealth: health, age: 0, dead: false, attacked: false, timer: 13 + this.random() * 8, seed: this.random() * 10,
    };
    mesh.position.set(x, kind === 'aircraft' ? 48 + this.random() * 45 : 0, kind === 'aircraft' ? -530 - this.random() * 90 : -330);
    if (kind === 'ship') mesh.rotation.y = target.velocity.x > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.scene.add(mesh); this.targets.push(target);
    if (this.state.phase === 'playing') this.emit({ type: 'target-spawned', targetId: target.id, kind });
    return target;
  }

  pause(): void {
    if (this.state.phase !== 'playing') return;
    this.state.phase = 'paused'; this.needsRender = true; this.input.active = false; this.input.reset(); this.gun.flash.visible = false; this.audio.suspend();
    this.callbacks.state(this.state);
  }

  resume(): void {
    if (this.state.phase !== 'paused' || !this.running) return;
    this.state.phase = 'playing'; this.input.reset(); this.input.active = true; void this.audio.unlock(); this.callbacks.state(this.state);
  }

  togglePause(): void { if (this.state.phase === 'playing') this.pause(); else if (this.state.phase === 'paused') this.resume(); }

  returnToMenu(): void {
    this.startRequest++; this.clearCombat(); this.state.phase = 'menu'; this.state.message = ''; this.state.lesson = idleLesson(); this.lesson = undefined; this.input.active = false; this.input.center(); this.createAttractScene(); this.callbacks.state(this.state);
  }

  setQuality(quality: Quality): void {
    this.preferences.quality = this.state.quality = quality;
    this.resolutionScale = quality === 'low' ? 1 : Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1.5);
    this.world.setQuality(quality !== 'low', quality === 'high'); this.resize(); savePreferences(this.preferences);
  }

  setMuted(muted: boolean): void { this.preferences.muted = this.state.muted = muted; this.audio.setMuted(muted); savePreferences(this.preferences); this.callbacks.state(this.state); }
  setSensitivity(value: number): void { this.preferences.sensitivity = this.input.sensitivity = value; savePreferences(this.preferences); }

  private resize(): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const changed = rect.width !== this.view.width || rect.height !== this.view.height;
    const wasWide = this.view.width / this.view.height >= 1.2;
    this.view = { width: rect.width, height: rect.height, left: rect.left, top: rect.top };
    this.needsRender = true;
    this.camera.aspect = rect.width / rect.height;
    this.camera.fov = rect.width < rect.height ? 72 : 58;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.resolutionScale);
    this.renderer.setSize(rect.width, rect.height, false);
    if (changed && this.state.mode === 'hindi' && this.lesson?.state.phrase) {
      this.targets.filter(t => t.word && !t.dead).forEach(t => this.positionLessonTarget(t, this.lesson!.state.phrase!.words.length));
      if (this.state.phase === 'playing' && wasWide !== (rect.width / rect.height >= 1.2)) this.recenter();
    }
  }

  private emit(event: CombatEvent): void { this.callbacks.event?.(event); }

  private frame(time: number): void {
    if (!this.running) return;
    requestAnimationFrame(next => this.frame(next));
    if (document.hidden) { this.lastTime = 0; return; }
    const rawDt = this.lastTime ? (time - this.lastTime) / 1000 : 1 / 60;
    const dt = Math.min(rawDt, .05); this.lastTime = time;
    if (this.state.phase !== 'paused' && !this.orientationHold) this.elapsed += dt;
    this.frameCount++; this.frameTime += rawDt;
    if (this.frameTime >= 1) { this.state.fps = Math.round(this.frameCount / this.frameTime); this.frameCount = 0; this.frameTime = 0; }
    this.qualityTimer += dt;
    if (this.preferences.quality === 'auto' && this.state.phase !== 'paused' && this.qualityTimer > 5) {
      this.qualityTimer = 0;
      if (this.state.fps < 44 && this.resolutionScale > .85) { this.resolutionScale = Math.max(.85, this.resolutionScale - .15); if (this.resolutionScale < 1.05) this.world.setQuality(false); this.resize(); }
      else if (this.state.fps > 57 && this.resolutionScale < Math.min(window.devicePixelRatio, 1.5)) { this.resolutionScale = Math.min(1.5, window.devicePixelRatio, this.resolutionScale + .1); if (this.resolutionScale > 1.2) this.world.setQuality(true); this.resize(); }
    }
    const playing = this.state.phase === 'playing' && !this.orientationHold;
    if (playing) {
      this.gameTime += dt; this.input.update(dt);
      this.camera.rotation.set(this.input.pitch, this.input.yaw, 0, 'YXZ'); this.camera.updateMatrixWorld();
      this.updateGunAim(dt);
      this.state.heat = Math.max(0, this.state.heat - dt * (this.input.firing && !this.state.overheated ? 4 : 24));
      if (this.state.overheated && this.state.heat < 30) this.state.overheated = false;
      if (this.lesson?.state.stage === 'preview' && this.input.peekShot()) { this.lesson.activate(); this.callbacks.state(this.state); }
      const canChoose = this.state.mode !== 'hindi' || this.lesson?.state.stage === 'active';
      if (!canChoose || this.state.overheated) this.input.clearShots();
      else if (this.gameTime - this.lastShot >= .105) {
        const press = this.input.takeShot();
        const trigger = press?.id ?? this.input.heldTrigger;
        if ((press || this.input.firing) && !this.resolvedTriggers.has(trigger)) this.fire(trigger, press);
      }
      this.updateTargets(dt, true); this.updateBullets(dt);
      if (this.state.mode === 'classic') {
      this.spawnTimer -= dt;
      if (this.waveRemaining > 0 && this.spawnTimer <= 0) { this.spawn('aircraft'); this.waveRemaining--; this.spawnTimer = 3.6; }
      if (this.waveRemaining === 0 && !this.targets.some(t => !t.dead)) {
        if (this.waveBreak < 0) { this.waveBreak = 5; this.state.message = 'SECTOR CLEAR  /  +15 DEFENCE'; this.state.health = Math.min(100, this.state.health + 15); this.bannerUntil = this.gameTime + 5; }
        this.waveBreak -= dt;
        if (this.waveBreak <= 0) { this.waveBreak = -1; this.state.wave++; this.startWave(); }
      }
      if (this.gameTime > this.bannerUntil && this.waveBreak < 0) this.state.message = '';
      }
    } else if (this.state.phase === 'menu') this.updateTargets(dt, false);

    this.camera.rotation.y = this.input.yaw;
    this.camera.rotation.x = this.input.pitch + (playing ? Math.sin(this.elapsed * 45) * this.recoil * .003 : 0);
    this.camera.updateMatrixWorld();
    this.recoil = Math.max(0, this.recoil - dt * 9);
    this.gun.recoil.position.z = this.recoil * .16;
    this.gun.group.rotation.z = Math.sin(this.elapsed * .75) * .004;
    this.callbacks.aim?.(this.input.aimPoint.x * .5 + .5, -this.input.aimPoint.y * .5 + .5);
    if (this.gameTime - this.lastShot > .045 || !playing) this.gun.flash.visible = false;
    if (this.state.phase !== 'paused' && this.state.phase !== 'map' && !this.orientationHold) { this.world.ocean.setShips(this.targets.filter(t => t.kind === 'ship' && !t.dead).map(t => t.mesh)); this.world.update(this.elapsed); this.effects.update(dt, this.camera); }
    this.updateLabels();
    if ((this.state.phase !== 'paused' && this.state.phase !== 'map' && !this.orientationHold) || this.needsRender) {
      this.updateTracers(); this.renderer.render(this.scene, this.camera); this.needsRender = false;
    }
    this.uiTimer += dt;
    if (this.uiTimer >= .1) { this.uiTimer = 0; this.state.targets = this.targets.filter(t => !t.dead && (this.state.mode === 'classic' || t.word)).length + this.waveRemaining; this.callbacks.state(this.state); }
  }

  private updateTargets(dt: number, playing: boolean): void {
    this.effectTimer += dt;
    const emitEffects = this.effectTimer > .13;
    if (emitEffects) this.effectTimer = 0;
    for (let i = this.targets.length - 1; i >= 0; i--) {
      const target = this.targets[i]; target.age += dt;
      if (target.propeller) target.propeller.rotation.z += dt * 55;
      if (target.dead) {
        target.timer -= dt;
        if (target.kind === 'aircraft') {
          target.velocity.y -= dt * 12; target.mesh.position.addScaledVector(target.velocity, dt); target.mesh.rotation.z += dt * 1.3; target.mesh.rotation.x -= dt * .3;
          if (emitEffects) this.effects.smoke(target.mesh.position);
          if (target.mesh.position.y < waterHeight(target.mesh.position.x, target.mesh.position.z, this.elapsed) + .3) { this.scratch.copy(target.mesh.position); this.scratch.y = .1; this.effects.splash(this.scratch, true); this.world.ocean.impact(this.scratch, true); this.removeTarget(i); }
          else if (target.timer < 0) this.removeTarget(i);
        } else {
          target.mesh.position.y -= dt * .9; target.mesh.rotation.z += dt * .025;
          if (emitEffects) { this.scratch.copy(target.mesh.position); this.scratch.y += 5; this.effects.smoke(this.scratch, true); }
          if (target.timer < 0) this.removeTarget(i);
        }
        continue;
      }
      if (playing && target.word && target.anchor) {
        sampleFormationFlight(target.anchor, target.seed, target.age, this.camera.position, target.mesh.position, target.velocity);
      } else target.mesh.position.addScaledVector(target.velocity, dt);
      if (target.kind === 'aircraft') {
        const heading = Math.atan2(target.velocity.x, target.velocity.z);
        if (target.word) {
          const turn = Math.atan2(Math.sin(heading - target.mesh.rotation.y), Math.cos(heading - target.mesh.rotation.y));
          target.mesh.rotation.y += turn * Math.min(1, dt * 1.5);
          target.mesh.rotation.z = Math.sin(target.age * .65 + target.seed) * .045 - Math.sin(turn) * .22;
        } else {
          target.mesh.rotation.y = heading;
          target.mesh.rotation.z = Math.sin(target.age * .65 + target.seed) * .07;
        }
        if (playing && this.state.mode === 'classic' && !target.attacked && target.mesh.position.z > -15) { target.attacked = true; this.damagePlayer(7); this.effects.explosion(new THREE.Vector3(10 * Math.sin(target.seed), 1.5, 5)); }
        if (target.health < target.maxHealth && emitEffects) this.effects.smoke(target.mesh.position);
        if (target.mesh.position.z > 110) {
          if (playing) this.removeTarget(i);
          else { target.mesh.position.z = -650; target.mesh.position.y = 55 + target.seed * 3; }
        }
      } else {
        target.mesh.position.y = waterHeight(target.mesh.position.x, target.mesh.position.z, this.elapsed) * .65;
        target.mesh.rotation.z = Math.sin(target.age * .8) * .012;
        if (emitEffects) {
          this.scratch.set(0, 7, -5).applyQuaternion(target.mesh.quaternion).add(target.mesh.position); this.effects.smoke(this.scratch);
          this.scratch.set(0, .5, 22).applyQuaternion(target.mesh.quaternion).add(target.mesh.position); this.effects.bowSpray(this.scratch);
        }
        if (Math.abs(target.mesh.position.x) > 240) { target.velocity.x *= -1; target.mesh.rotation.y += Math.PI; }
        if (playing && this.state.mode === 'classic') {
          target.timer -= dt;
          if (target.timer < 0) { target.timer = Math.max(8, 18 - this.state.wave); this.damagePlayer(5); this.effects.explosion(new THREE.Vector3(-8, 2, 6)); }
        }
      }
    }
  }

  private removeTarget(index: number): void { this.targets[index].mesh.removeFromParent(); this.targets.splice(index, 1); }

  private updateLabels(): void {
    if (this.state.mode !== 'hindi' || this.state.phase === 'menu') return;
    this.camera.getWorldDirection(this.direction);
    for (const label of this.labels) {
      const target = this.targets.find(t => t.id === label.id);
      label.visible = Boolean(target && !target.dead && this.state.phase === 'playing');
      if (!label.visible || !target) continue;
      label.range = target.mesh.position.distanceTo(this.camera.position);
      this.center.copy(target.mesh.position); if (target.kind === 'ship') this.center.y += 4;
      label.aimed = false;
      this.center.project(this.camera);
      label.visible = this.center.z > -1 && this.center.z < 1 && Math.abs(this.center.x) < .97 && this.center.y > -.85 && this.center.y < .85;
      label.x = (this.center.x * .5 + .5) * this.view.width; label.y = (-this.center.y * .5 + .5) * this.view.height;
      const aimX = (this.input.aimPoint.x * .5 + .5) * this.view.width, aimY = (-this.input.aimPoint.y * .5 + .5) * this.view.height;
      label.aimed = Math.hypot(label.x - aimX, label.y - aimY) < 18 || this.badgeAtPoint(label.roman, label.x, label.y, aimX, aimY);
      label.wrong = (target.rejectedUntil ?? 0) > this.gameTime;
    }
    this.callbacks.labels?.(this.labels);
  }

  private badgeAtPoint(roman: string, x: number, y: number, pointX: number, pointY: number): boolean {
    const dx = x - pointX, dy = y - pointY;
    return Math.abs(dx) < Math.max(30, roman.length * 4.7 + 14) && dy > 22 && dy < 59;
  }

  private prepareAim(press?: FirePress): void {
    const width = press?.width ?? this.view.width, height = press?.height ?? this.view.height;
    const point = press?.point ?? { x: 0, y: 0 };
    const aim = this.firingCamera;
    aim.position.copy(this.camera.position); aim.rotation.set(press?.pitch ?? this.input.pitch, press?.yaw ?? this.input.yaw, 0, 'YXZ');
    aim.fov = width < height ? 72 : 58; aim.aspect = width / height; aim.updateProjectionMatrix(); aim.updateMatrixWorld();
    const tangent = Math.tan(THREE.MathUtils.degToRad(aim.fov / 2));
    this.direction.set(point.x * tangent * aim.aspect, point.y * tangent, -1).normalize().applyQuaternion(aim.quaternion);
    this.ray.set(this.camera.position, this.direction);
  }

  private pickTarget(press?: FirePress): Target | undefined {
    this.prepareAim(press);
    const width = press?.width ?? this.view.width, height = press?.height ?? this.view.height;
    const point = press?.point ?? { x: 0, y: 0 };
    const pointX = (point.x * .5 + .5) * width, pointY = (-point.y * .5 + .5) * height;
    if (this.state.mode === 'hindi') {
      const id = this.callbacks.pickLabel?.(pointX + (press?.left ?? this.view.left), pointY + (press?.top ?? this.view.top));
      const labelled = this.targets.find(target => target.id === id && !target.dead);
      if (labelled) return labelled;
    }
    let direct: Target | undefined, assisted: Target | undefined;
    let nearest = Infinity, bestPixels = press?.point ? 24 : 16;
    for (const target of this.targets) {
      if (target.dead) continue;
      // Include the whole visible silhouette, including wings, stern and mast.
      target.mesh.updateWorldMatrix(true, true);
      this.bounds.setFromObject(target.mesh).expandByScalar(.9);
      if (this.ray.intersectBox(this.bounds, this.scratch)) {
        const distance = this.scratch.distanceToSquared(this.camera.position);
        if (distance < nearest) { nearest = distance; direct = target; }
      }
      this.center.copy(target.mesh.position); if (target.kind === 'ship') this.center.y += 4;
      this.center.project(this.firingCamera);
      if (this.center.z <= -1 || this.center.z >= 1) continue;
      const pixels = Math.hypot((this.center.x * .5 + .5) * width - pointX, (-this.center.y * .5 + .5) * height - pointY);
      if (pixels < bestPixels) { bestPixels = pixels; assisted = target; }
    }
    return direct ?? assisted;
  }

  private updateGunAim(dt: number): void {
    const tangent = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.gunAim.set(this.input.aimPoint.x * tangent * this.camera.aspect * 150, this.input.aimPoint.y * tangent * 150, -150).sub(this.gun.group.position);
    this.turnGun(1 - Math.exp(-dt * 20));
  }

  private turnGun(amount: number): void {
    const yaw = Math.atan2(-this.gunAim.x, -this.gunAim.z);
    const pitch = Math.atan2(this.gunAim.y, Math.hypot(this.gunAim.x, this.gunAim.z));
    this.gun.group.rotation.order = 'YXZ';
    this.gun.group.rotation.y = THREE.MathUtils.lerp(this.gun.group.rotation.y, yaw, amount);
    this.gun.group.rotation.x = THREE.MathUtils.lerp(this.gun.group.rotation.x, pitch, amount);
  }

  private fire(trigger: number, press?: FirePress): void {
    this.lastShot = this.gameTime; this.recoil = 1; this.gun.flash.visible = true;
    this.state.heat = Math.min(100, this.state.heat + 2.7);
    if (this.state.heat >= 100) { this.state.overheated = true; this.audio.warning(); }
    this.audio.shot();
    const bullet = this.bullets[this.bulletCursor]; this.bulletCursor = (this.bulletCursor + 1) % this.bullets.length;
    bullet.trigger = trigger;
    const assisted = press?.targetId ? this.targets.find(target => target.id === press.targetId && !target.dead) : this.pickTarget(press);
    this.prepareAim(press);
    bullet.targetId = assisted?.id;
    if (assisted) {
      this.center.copy(assisted.mesh.position); if (assisted.kind === 'ship') this.center.y += 4;
      this.center.addScaledVector(assisted.velocity, this.center.distanceTo(this.camera.position) / 620);
    } else this.center.copy(this.camera.position).addScaledVector(this.direction, 900);
    this.gunAim.copy(this.center); this.camera.worldToLocal(this.gunAim); this.gunAim.sub(this.gun.group.position); this.turnGun(1);
    this.gun.group.updateWorldMatrix(true, true);
    this.scratch.set(this.bulletCursor % 2 ? -.28 : .28, .13, -3.2); this.gun.recoil.localToWorld(this.scratch); bullet.position.copy(this.scratch);
    bullet.velocity.copy(this.center).sub(bullet.position).normalize().multiplyScalar(620);
    bullet.previous.copy(bullet.position); bullet.life = 2.5;
    this.emit({ type: 'shot-fired', burstId: trigger, targetId: bullet.targetId, origin: { x: bullet.position.x, y: bullet.position.y, z: bullet.position.z } });
  }

  private updateBullets(dt: number): void {
    for (const bullet of this.bullets) {
      if (bullet.life <= 0) continue;
      const locked = bullet.targetId ? this.targets.find(target => target.id === bullet.targetId && !target.dead) : undefined;
      if (locked) {
        this.center.copy(locked.mesh.position); if (locked.kind === 'ship') this.center.y += 4;
        bullet.velocity.copy(this.center).sub(bullet.position).normalize().multiplyScalar(620);
      }
      bullet.life -= dt; bullet.previous.copy(bullet.position); bullet.position.addScaledVector(bullet.velocity, dt);
      let nearest = 2; let hit: Target | undefined;
      for (const target of this.targets) {
        if (target.dead) continue;
        if (target.kind === 'aircraft') {
          const intersection = segmentSphereHit(bullet.previous, bullet.position, target.mesh.position, 4.4);
          if (intersection !== null && intersection < nearest) { nearest = intersection; hit = target; }
        } else {
          for (const offset of [-13, 0, 13]) {
            this.center.set(0, 3, offset).applyQuaternion(target.mesh.quaternion).add(target.mesh.position);
            const intersection = segmentSphereHit(bullet.previous, bullet.position, this.center, 6.7);
            if (intersection !== null && intersection < nearest) { nearest = intersection; hit = target; }
          }
        }
      }
      if (hit) {
        bullet.position.lerpVectors(bullet.previous, bullet.position, nearest); bullet.life = 0;
        if (this.state.mode === 'hindi' && hit.word && this.lesson) {
          if (this.resolvedTriggers.has(bullet.trigger)) continue;
          const result = this.lesson.select(hit.id, hit.word);
          if (result === 'ignored') continue;
          this.resolvedTriggers.add(bullet.trigger); this.bullets.forEach(b => { if (b.trigger === bullet.trigger) b.life = 0; });
          this.emit({ type: 'word-selected', phraseId: this.lesson.state.phrase!.id, targetId: hit.id, roman: hit.word.roman, correct: result !== 'wrong' });
          if (result === 'wrong') {
            hit.rejectedUntil = this.gameTime + 1.1; this.audio.warning();
            this.effects.hit(bullet.position); this.hitFeedback(hit, false, undefined, `NEXT: ${this.lesson.state.phrase!.words[this.lesson.state.wordIndex].roman}`);
            void this.audio.speak(this.lesson.state.phrase!.words[this.lesson.state.wordIndex].audio);
            this.callbacks.state(this.state); continue;
          }
          const speech = result === 'complete' ? [hit.word.audio, this.lesson.state.phrase!.audio] : hit.word.audio;
          void this.audio.speak(speech);
          if (result === 'complete') { this.awardPoints(250); this.emit({ type: 'phrase-completed', phraseId: this.lesson.state.phrase!.id }); }
        }
        this.effects.hit(bullet.position); this.audio.hit(); hit.health--;
        this.emit({ type: 'target-hit', targetId: hit.id, kind: hit.kind, remainingHealth: hit.health });
        if (hit.health <= 0) this.destroyTarget(hit);
        else this.hitFeedback(hit, false);
      } else if (bullet.position.y < waterHeight(bullet.position.x, bullet.position.z, this.elapsed) && bullet.position.z < 1) {
        const surface = waterHeight(bullet.position.x, bullet.position.z, this.elapsed);
        const t = (bullet.previous.y - surface) / (bullet.previous.y - bullet.position.y);
        bullet.position.lerpVectors(bullet.previous, bullet.position, Math.max(0, Math.min(1, t))); bullet.position.y = surface + .1;
        this.effects.splash(bullet.position); this.world.ocean.impact(bullet.position); bullet.life = 0;
      } else if (bullet.position.z > 1 && bullet.position.y < 1) { this.effects.hit(bullet.position); bullet.life = 0; }
    }
  }

  private updateTracers(): void {
    for (let i = 0; i < this.bullets.length; i++) {
      const bullet = this.bullets[i];
      if (bullet.life > 0) { this.dummy.position.copy(bullet.position); this.scratch.copy(bullet.position).add(bullet.velocity); this.dummy.lookAt(this.scratch); this.dummy.scale.set(1, 1, 11); }
      else this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix(); this.tracerMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.tracerMesh.instanceMatrix.needsUpdate = true;
  }

  private destroyTarget(target: Target): void {
    target.dead = true; target.timer = target.kind === 'aircraft' ? 7 : 12;
    const points = target.kind === 'aircraft' ? 100 : 500;
    this.awardPoints(points); this.state.kills++;
    this.effects.explosion(target.mesh.position, target.kind === 'ship'); this.audio.explosion(target.kind === 'ship'); this.hitFeedback(target, true, points);
    this.emit({ type: 'target-destroyed', targetId: target.id, kind: target.kind, points });
  }

  private hitFeedback(target: Target, destroyed: boolean, points?: number, message?: string): void {
    this.center.copy(target.mesh.position); if (target.kind === 'ship') this.center.y += 4;
    this.center.project(this.camera);
    this.callbacks.hit(destroyed, points, { x: this.center.x * .5 + .5, y: -this.center.y * .5 + .5, message: message ?? (destroyed ? `+${points}` : `HIT · ${target.health} HP`) });
  }

  private awardPoints(points: number): void {
    this.state.score += points;
    if (this.state.score > this.state.best) {
      this.state.best = this.state.score;
      if (this.state.mode === 'hindi') this.preferences.hindiBest = this.state.score; else this.preferences.best = this.state.score;
      savePreferences(this.preferences);
    }
  }

  private damagePlayer(damage: number): void {
    if (this.state.phase !== 'playing') return;
    this.state.health = Math.max(0, this.state.health - damage); this.callbacks.damage(); this.audio.explosion(); this.emit({ type: 'player-hit', damage });
    if (this.state.health <= 0) {
      this.state.phase = 'over'; this.input.active = false; this.input.reset(); this.state.message = ''; this.gun.flash.visible = false; savePreferences(this.preferences); this.callbacks.state(this.state);
    }
  }
}
