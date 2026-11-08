import type { LessonState } from './lesson';

export type Phase = 'menu' | 'map' | 'playing' | 'paused' | 'over' | 'complete';
export type GameMode = 'classic' | 'hindi';
export type Quality = 'auto' | 'high' | 'low';
export type TargetKind = 'aircraft' | 'ship';

export interface GameState {
  phase: Phase;
  mode: GameMode;
  lesson: LessonState;
  voiceStatus: 'idle' | 'loading' | 'playing' | 'unavailable';
  audioStatus: 'locked' | 'ready' | 'unavailable';
  score: number;
  best: number;
  wave: number;
  health: number;
  heat: number;
  overheated: boolean;
  kills: number;
  targets: number;
  fps: number;
  quality: Quality;
  muted: boolean;
  message: string;
}

// Phrase gameplay can subscribe to these events without changing the renderer.
export type CombatEvent =
  | { type: 'shot-fired'; burstId: number; targetId?: string; origin: { x: number; y: number; z: number } }
  | { type: 'target-spawned'; targetId: string; kind: TargetKind }
  | { type: 'target-hit'; targetId: string; kind: TargetKind; remainingHealth: number }
  | { type: 'target-destroyed'; targetId: string; kind: TargetKind; points: number }
  | { type: 'wave-started'; wave: number }
  | { type: 'player-hit'; damage: number }
  | { type: 'word-selected'; phraseId: string; targetId: string; roman: string; correct: boolean }
  | { type: 'phrase-completed'; phraseId: string }
  | { type: 'phrase-skipped'; phraseId: string };

export interface Preferences {
  quality: Quality;
  muted: boolean;
  sensitivity: number;
  best: number;
  hindiBest: number;
}

const defaults: Preferences = { quality: 'auto', muted: false, sensitivity: 1, best: 0, hindiBest: 0 };

export function loadPreferences(): Preferences {
  try {
    const data = JSON.parse(localStorage.getItem('beachhead.preferences') || '{}');
    return {
      quality: ['auto', 'high', 'low'].includes(data.quality) ? data.quality : 'auto',
      muted: typeof data.muted === 'boolean' ? data.muted : false,
      sensitivity: Number.isFinite(data.sensitivity) ? Math.max(0.4, Math.min(2, data.sensitivity)) : 1,
      best: Number.isFinite(data.best) ? Math.max(0, data.best) : 0,
      hindiBest: Number.isFinite(data.hindiBest) ? Math.max(0, data.hindiBest) : 0,
    };
  } catch { return { ...defaults }; }
}

export function savePreferences(preferences: Preferences): void {
  try { localStorage.setItem('beachhead.preferences', JSON.stringify(preferences)); } catch { /* Storage is optional. */ }
}
