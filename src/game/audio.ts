export class GameAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private sfx?: GainNode;
  private voiceSource?: AudioBufferSourceNode;
  private voiceToken = 0;
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private noise?: AudioBuffer;
  private ambience?: AudioBufferSourceNode;
  private muted = false;
  private audioStatus: 'locked' | 'ready' | 'unavailable' = 'locked';
  onVoiceStatus: (status: 'idle' | 'loading' | 'playing' | 'unavailable') => void = () => {};
  onAudioStatus: (status: 'locked' | 'ready' | 'unavailable') => void = () => {};

  private reportAudio(status: 'locked' | 'ready' | 'unavailable'): void {
    if (status !== this.audioStatus) { this.audioStatus = status; this.onAudioStatus(status); }
  }

  async unlock(): Promise<void> {
    try {
      // Prefer the playback audio session on iOS, rather than the silent-switch-sensitive ambient route.
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session && session.type !== 'playback') { try { session.type = 'playback'; } catch { /* Older WebKit versions may expose a read-only session. */ } }
      if (!this.context || this.context.state === 'closed') {
        const AudioContextClass = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) { this.reportAudio('unavailable'); this.onVoiceStatus('unavailable'); return; }
        this.buffers.clear();
        this.context = new AudioContextClass();
        const context = this.context;
        context.addEventListener('statechange', () => {
          if (this.context === context) this.reportAudio(context.state === 'running' ? 'ready' : 'locked');
        });
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : 0.5;
        this.master.connect(this.context.destination);
        this.sfx = this.context.createGain(); this.sfx.connect(this.master);
        const count = this.context.sampleRate * 3;
        this.noise = this.context.createBuffer(1, count, this.context.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < count; i++) data[i] = Math.random() * 2 - 1;
        this.startAmbience();
      }
      if (this.context.state !== 'running') {
        // Invoke resume and prime the output *before* awaiting: iOS requires the gesture stack.
        const resumed = this.context.resume();
        const primer = this.context.createBufferSource();
        primer.buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
        primer.connect(this.master!); primer.onended = () => primer.disconnect(); primer.start();
        await resumed;
      }
      this.reportAudio(this.context.state === 'running' ? 'ready' : 'locked');
    } catch { this.reportAudio('locked'); this.onVoiceStatus('unavailable'); }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.stopVoice();
    if (this.context && this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.context.currentTime, 0.08);
  }

  suspend(): void { this.stopVoice(); if (this.context) this.reportAudio('locked'); void this.context?.suspend().catch(() => {}); }

  private loadVoice(file: string): Promise<AudioBuffer> {
    if (!this.context) return Promise.reject(new Error('Audio is unavailable.'));
    let loading = this.buffers.get(file);
    if (!loading) {
      const context = this.context;
      loading = fetch(`${import.meta.env.BASE_URL}${file}`, { signal: AbortSignal.timeout(12000) }).then(async response => {
        if (!response.ok) throw new Error(`Audio could not be loaded: ${file}`);
        return context.decodeAudioData(await response.arrayBuffer());
      }).catch(error => { this.buffers.delete(file); throw error; });
      this.buffers.set(file, loading);
    }
    return loading;
  }

  preloadVoice(files: string[]): void {
    if (!this.context) return;
    for (const file of new Set(files)) void this.loadVoice(file).catch(() => {});
  }

  stopVoice(): void {
    this.voiceToken++;
    if (this.voiceSource) { try { this.voiceSource.stop(); } catch { /* The device may already have closed the audio output. */ } this.voiceSource = undefined; }
    if (this.context && this.sfx) this.sfx.gain.setTargetAtTime(1, this.context.currentTime, .15);
    this.onVoiceStatus('idle');
  }

  async speak(files: string | string[]): Promise<boolean> {
    this.stopVoice();
    if (this.muted) return false;
    if (!this.context || !this.master || this.context.state !== 'running') { this.onVoiceStatus('unavailable'); return false; }
    const token = this.voiceToken;
    const context = this.context;
    this.onVoiceStatus('loading');
    try {
      const buffers = await Promise.all((Array.isArray(files) ? files : [files]).map(file => this.loadVoice(file)));
      if (token !== this.voiceToken) return false;
      this.sfx!.gain.setTargetAtTime(.16, context.currentTime, .035);
      for (const buffer of buffers) {
        if (token !== this.voiceToken || context.state !== 'running') return false;
        this.onVoiceStatus('playing');
        await new Promise<void>(resolve => {
          const source = context.createBufferSource(); source.buffer = buffer;
          const volume = context.createGain(); volume.gain.value = 1.45;
          source.connect(volume).connect(this.master!); this.voiceSource = source;
          source.onended = () => { if (this.voiceSource === source) this.voiceSource = undefined; source.disconnect(); volume.disconnect(); resolve(); };
          source.start();
        });
      }
      if (token !== this.voiceToken) return false;
      this.sfx!.gain.setTargetAtTime(1, context.currentTime, .2);
      this.onVoiceStatus('idle'); return true;
    } catch {
      if (token === this.voiceToken) { this.sfx?.gain.setTargetAtTime(1, context.currentTime, .2); this.onVoiceStatus('unavailable'); }
      return false;
    }
  }

  private startAmbience(): void {
    const ctx = this.context!;
    const source = ctx.createBufferSource();
    source.buffer = this.noise!;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0.1;
    source.connect(filter).connect(gain).connect(this.sfx!);
    source.start();
    this.ambience = source;
    const swell = ctx.createOscillator();
    const swellGain = ctx.createGain();
    swell.frequency.value = 0.12;
    swellGain.gain.value = 0.045;
    swell.connect(swellGain).connect(gain.gain);
    swell.start();
  }

  private burst(duration: number, volume: number, frequency: number): void {
    const ctx = this.context;
    if (!ctx || !this.master || !this.noise || ctx.state !== 'running') return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(frequency, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(filter).connect(gain).connect(this.sfx!);
    source.start(0, Math.random());
    source.stop(ctx.currentTime + duration);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  shot(): void {
    this.burst(0.13, 0.48, 4200);
    this.tone(95, 36, 0.12, 0.4);
  }

  hit(): void { this.burst(0.12, 0.16, 2600); }
  explosion(large = false): void { this.burst(large ? 1.5 : 0.85, large ? 0.8 : 0.48, 1100); this.tone(70, 20, 0.65, 0.45); }
  warning(): void { this.tone(560, 420, 0.16, 0.1); }

  private tone(from: number, to: number, duration: number, volume: number): void {
    const ctx = this.context;
    if (!ctx || !this.master || ctx.state !== 'running') return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(from, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + duration);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(this.sfx!);
    osc.start();
    osc.stop(ctx.currentTime + duration);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
}
