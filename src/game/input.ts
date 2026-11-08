export interface FirePress {
  id: number;
  yaw: number;
  pitch: number;
  width: number;
  height: number;
  left: number;
  top: number;
  targetId?: string;
  /** Normalized screen coordinates; omitted for the crosshair/FIRE/Space controls. */
  point?: { x: number; y: number };
}

interface Gesture {
  x: number;
  y: number;
  startX: number;
  startY: number;
  dragged: boolean;
  tap: boolean;
}

export class Input {
  firing = false;
  heldTrigger = 0;
  yaw = 0;
  pitch = 0.065;
  sensitivity = 1;
  active = false;
  pointAndShoot = false;
  readonly aimPoint = { x: 0, y: 0 };
  private pointer: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private keys = new Set<string>();
  private gestures = new Map<number, Gesture>();
  private heldPointers = new Map<number, number>();
  private spaceTrigger = 0;
  private nextTrigger = 0;
  private presses: FirePress[] = [];
  private pointerLocked = false;
  onPause = (): void => {};
  onReplay = (): void => {};
  onRecenter = (): void => {};
  onShot = (_press: FirePress): void => {};

  constructor(private canvas: HTMLCanvasElement, fireButton: HTMLButtonElement) {
    canvas.addEventListener('pointerdown', e => {
      if (!this.active || (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2)) return;
      e.preventDefault();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      if (e.pointerType === 'mouse' && e.button === 0 && !this.pointAndShoot) {
        this.holdPointer(e.pointerId); canvas.setPointerCapture(e.pointerId);
      } else {
        if (e.button === 2) this.centerAim();
        else this.updateAim(e.clientX, e.clientY);
        this.gestures.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, dragged: false, tap: e.button !== 2 });
        if (this.pointer === null) this.pointer = e.pointerId;
        canvas.setPointerCapture(e.pointerId);
      }
    });
    canvas.addEventListener('pointermove', e => {
      if (!this.active) return;
      const gesture = this.gestures.get(e.pointerId);
      if (gesture) {
        const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
        if (!gesture.dragged && Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) > 9) {
          gesture.dragged = true;
          if (this.pointer === e.pointerId) this.rotate(e.clientX - gesture.startX, e.clientY - gesture.startY);
        } else if (gesture.dragged && this.pointer === e.pointerId) this.rotate(dx, dy);
        gesture.x = e.clientX; gesture.y = e.clientY;
      } else if (e.pointerType === 'mouse' && this.pointAndShoot) {
        this.updateAim(e.clientX, e.clientY);
      } else if (e.pointerType === 'mouse') {
        if (this.pointerLocked) this.rotate(e.movementX, e.movementY);
        else {
          if (this.lastX || this.lastY) this.rotate(e.clientX - this.lastX, e.clientY - this.lastY);
          this.lastX = e.clientX; this.lastY = e.clientY;
        }
      }
    });
    const release = (e: PointerEvent): void => {
      const gesture = this.gestures.get(e.pointerId);
      // A completed tap is queued, even when down/up both occur between animation frames.
      if (e.type === 'pointerup' && this.active && gesture?.tap && !gesture.dragged && Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) <= 9) {
        this.updateAim(e.clientX, e.clientY);
        this.enqueue({ ...this.aimPoint });
      }
      const held = this.heldPointers.get(e.pointerId);
      if (e.type !== 'pointerup' && held !== undefined) this.presses = this.presses.filter(press => press.id !== held);
      this.gestures.delete(e.pointerId); this.heldPointers.delete(e.pointerId);
      if (this.pointer === e.pointerId) this.pointer = null;
      this.lastX = this.lastY = 0; this.syncFire();
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    canvas.addEventListener('lostpointercapture', release);
    canvas.addEventListener('pointerleave', () => { this.lastX = this.lastY = 0; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.pointerLocked = document.pointerLockElement === canvas; this.lastX = this.lastY = 0; });
    fireButton.addEventListener('pointerdown', e => {
      if (!this.active || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault(); e.stopPropagation(); this.holdPointer(e.pointerId); fireButton.setPointerCapture(e.pointerId);
    });
    fireButton.addEventListener('lostpointercapture', release);
    window.addEventListener('keydown', e => {
      if ((e.target as HTMLElement).matches('input, select, button')) return;
      if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (e.code === 'Escape' || e.code === 'KeyP') { if (!e.repeat) this.onPause(); return; }
      if (e.code === 'KeyH') { if (!e.repeat) this.onReplay(); return; }
      if (e.code === 'KeyC') { if (!e.repeat) this.onRecenter(); return; }
      if (this.active) {
        if (e.code === 'Space' && !this.keys.has('Space')) this.spaceTrigger = this.enqueue();
        this.keys.add(e.code);
      }
      this.syncFire();
    });
    window.addEventListener('keyup', e => { this.keys.delete(e.code); this.syncFire(); });
    window.addEventListener('blur', () => this.reset());
  }

  private enqueue(point?: FirePress['point']): number {
    const id = ++this.nextTrigger;
    const view = this.canvas.getBoundingClientRect();
    if (!point) this.centerAim();
    // Bound input accumulated during a stalled render without dropping ordinary quick taps.
    if (this.presses.length >= 16) this.presses.shift();
    const press = { id, point, yaw: this.yaw, pitch: this.pitch, width: view.width, height: view.height, left: view.left, top: view.top };
    this.onShot(press); this.presses.push(press);
    return id;
  }

  private holdPointer(pointerId: number): void {
    if (!this.heldPointers.has(pointerId)) this.heldPointers.set(pointerId, this.enqueue());
    this.syncFire();
  }

  peekShot(): FirePress | undefined { return this.presses[0]; }
  takeShot(): FirePress | undefined { return this.presses.shift(); }
  clearShots(): void { this.presses.length = 0; }

  private rotate(dx: number, dy: number): void {
    this.centerAim();
    const scale = (1.55 / Math.min(this.canvas.clientWidth, 1000)) * this.sensitivity;
    this.yaw -= dx * scale; this.pitch -= dy * scale; this.clamp();
  }

  private updateAim(clientX: number, clientY: number): void {
    const view = this.canvas.getBoundingClientRect();
    this.aimPoint.x = Math.max(-1, Math.min(1, (clientX - view.left) / view.width * 2 - 1));
    this.aimPoint.y = Math.max(-1, Math.min(1, 1 - (clientY - view.top) / view.height * 2));
  }

  private centerAim(): void { this.aimPoint.x = this.aimPoint.y = 0; }

  private clamp(): void { this.yaw = Math.max(-1.16, Math.min(1.16, this.yaw)); this.pitch = Math.max(-.22, Math.min(1.28, this.pitch)); }

  private syncFire(): void {
    this.firing = this.active && (this.heldPointers.size > 0 || this.keys.has('Space'));
    this.heldTrigger = Math.max(this.keys.has('Space') ? this.spaceTrigger : 0, ...this.heldPointers.values());
  }

  update(dt: number): void {
    if (!this.active) return;
    const speed = dt * .7 * this.sensitivity;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].some(key => this.keys.has(key))) this.centerAim();
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) this.yaw += speed;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) this.yaw -= speed;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) this.pitch += speed;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) this.pitch -= speed;
    this.clamp();
  }

  reset(): void {
    this.keys.clear(); this.gestures.clear(); this.heldPointers.clear(); this.clearShots();
    this.pointer = null; this.firing = false; this.heldTrigger = this.spaceTrigger = 0; this.lastX = this.lastY = 0;
    this.centerAim();
  }
  center(): void { this.yaw = 0; this.pitch = .065; this.reset(); }
}
