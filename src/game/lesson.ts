export interface LessonWord { roman: string; gloss: string; native: string; audio: string }
export interface LessonPhrase { id: string; topic: string; topicName: string; english: string; tip: string; audio: string; words: LessonWord[] }
export interface LessonTopic { id: string; name: string; phraseCount: number }
export interface HindiCourse { version: number; language: string; source: string; commit: string; topics: LessonTopic[]; phrases: LessonPhrase[] }
export type LessonOrder = 'sequence' | 'random';
export type LessonStage = 'idle' | 'preview' | 'active' | 'complete' | 'finished';
export interface LessonState {
  stage: LessonStage;
  phrase: LessonPhrase | null;
  phraseIndex: number;
  phraseCount: number;
  topicId: string;
  topicName: string;
  order: LessonOrder;
  wordIndex: number;
  mistakes: number;
  completed: number;
  skipped: number;
  feedback: string;
  feedbackKind: 'hint' | 'correct' | 'wrong';
}

export function idleLesson(): LessonState {
  return { stage: 'idle', phrase: null, phraseIndex: 0, phraseCount: 0, topicId: '', topicName: '', order: 'sequence', wordIndex: 0, mistakes: 0, completed: 0, skipped: 0, feedback: '', feedbackKind: 'hint' };
}

let coursePromise: Promise<HindiCourse> | undefined;
export function loadHindiCourse(): Promise<HindiCourse> {
  coursePromise ??= fetch(`${import.meta.env.BASE_URL}lessons/hi-course.json`).then(async response => {
    if (!response.ok) throw new Error('Hindi lesson could not be loaded. Please try again.');
    const data = await response.json() as HindiCourse;
    if (data.language !== 'hi' || data.version < 2 || !data.topics?.length || !data.phrases?.length || data.phrases.some(p => !p.id || !p.topic || !p.topicName || !p.audio || !p.words?.length || p.words.some(w => !w.roman || !w.audio))) throw new Error('The Hindi lesson data is incomplete.');
    return data;
  }).catch(error => { coursePromise = undefined; throw error; });
  return coursePromise;
}

/** Selection rules are independent of health, frame timing, and the 3D renderer. */
export class HindiLesson {
  readonly state = idleLesson();
  private consumed = new Set<string>();
  private route: LessonPhrase[];

  constructor(readonly course: HindiCourse) { this.route = [...course.phrases]; this.state.phraseCount = this.route.length; }

  startTopic(topicId: string, order: LessonOrder, random: () => number = Math.random): void {
    const topic = this.course.topics.find(entry => entry.id === topicId);
    const phrases = this.course.phrases.filter(phrase => phrase.topic === topicId);
    if (!topic || phrases.length === 0) throw new RangeError('Unknown or empty topic.');
    if (order !== 'sequence' && order !== 'random') throw new RangeError('Unknown phrase order.');
    if (order === 'random') {
      for (let i = phrases.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [phrases[i], phrases[j]] = [phrases[j], phrases[i]];
      }
    }
    this.route = phrases;
    Object.assign(this.state, { topicId, topicName: topic.name, order, phraseCount: phrases.length, completed: 0, skipped: 0, mistakes: 0 });
    this.begin(0);
  }

  begin(index: number): void {
    if (index < 0 || index >= this.route.length) throw new RangeError('Phrase index out of range.');
    Object.assign(this.state, { stage: 'preview', phrase: this.route[index], phraseIndex: index, wordIndex: 0, feedback: 'Listen, then click or tap a word to begin.', feedbackKind: 'hint' });
    this.consumed.clear();
  }

  activate(): void {
    if (this.state.stage !== 'preview') return;
    this.state.stage = 'active'; this.state.feedback = 'Click or tap the words in order. Drag to look around.';
  }

  select(targetId: string, word: LessonWord): 'correct' | 'wrong' | 'ignored' | 'complete' {
    if (this.state.stage !== 'active' || this.consumed.has(targetId)) return 'ignored';
    const expected = this.state.phrase!.words[this.state.wordIndex];
    if (word.roman.toLocaleLowerCase('hi') !== expected.roman.toLocaleLowerCase('hi')) {
      this.state.mistakes++;
      this.state.feedback = `Try “${expected.roman}” next — ${expected.gloss}.`;
      this.state.feedbackKind = 'wrong';
      return 'wrong';
    }
    this.consumed.add(targetId); this.state.wordIndex++;
    this.state.feedback = `${word.roman} · ${word.gloss}`; this.state.feedbackKind = 'correct';
    if (this.state.wordIndex === this.state.phrase!.words.length) {
      this.state.stage = 'complete'; this.state.completed++;
      this.state.feedback = 'Phrase complete. Listen, then continue.';
      return 'complete';
    }
    return 'correct';
  }

  advance(): boolean {
    if (this.state.stage !== 'complete') return false;
    return this.next();
  }

  skip(): boolean {
    if (this.state.stage !== 'preview' && this.state.stage !== 'active') return false;
    this.state.skipped++;
    return this.next();
  }

  private next(): boolean {
    if (this.state.phraseIndex + 1 >= this.route.length) { this.state.stage = 'finished'; return false; }
    this.begin(this.state.phraseIndex + 1); return true;
  }
}
