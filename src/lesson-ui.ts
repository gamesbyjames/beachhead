import type { GameState } from './game/types';
import type { TargetLabel } from './game/game';
import type { HindiCourse, LessonOrder } from './game/lesson';
import { IslandMap } from './lingo-map/map.js';

const get = (id: string): HTMLElement => document.getElementById(id)!;

export class LessonUI {
  private phraseId = '';
  private chips: HTMLElement[] = [];
  private nodes = new Map<string, HTMLElement>();
  private layer = get('target-labels');
  private mapOrder: LessonOrder = 'sequence';
  private island = new IslandMap(get('map-art'));
  private mapVisible = false;
  private mapTopic = '';
  private onMapPick: (id: string) => void = () => {};

  constructor() {
    new ResizeObserver(() => { if (this.mapVisible) this.island.layout(); }).observe(get('map-art'));
  }

  setMapVisible(visible: boolean): void {
    if (visible === this.mapVisible) return;
    this.mapVisible = visible;
    if (!visible) { this.island.hide(); return; }
    // The original Lingo Surfer map supplies the terrain, animated fog and journey path.
    this.island.show({ id: 'hi', mapSeed: 7 }, {}, id => this.onMapPick(id));
    this.island.setSelected(this.mapTopic);
  }

  renderMap(course: HindiCourse, play: (topic: string, order: LessonOrder) => void, previousTopic = ''): void {
    const topicList = get('map-topics');
    const phraseList = get('map-phrases');
    topicList.replaceChildren(); phraseList.replaceChildren();
    const topics = course.topics;
    let selectedTopic = topics.some(topic => topic.id === previousTopic) ? previousTopic : topics[0]?.id;
    const places: Record<string, { location: string; description: string; icon: string; x: number; y: number }> = {
      basics: { location: 'Gate of Greetings', description: 'Start with hellos, names and friendly farewells.', icon: '✦', x: 23, y: 45 },
      story: { location: 'Storyteller’s Cove', description: 'Tell the story of your language journey.', icon: '✎', x: 40, y: 32 },
      numbers: { location: 'Counting Falls', description: 'Count, order a chai and ask the price.', icon: '✧', x: 55, y: 22 },
      colors: { location: 'Painted Bazaar', description: 'Find the colours of the sky, sea and sun.', icon: '☼', x: 72, y: 30 },
      verbs: { location: 'Temple of Deeds', description: 'Learn to speak about everyday actions.', icon: '⚑', x: 81, y: 46 },
      food: { location: 'Spice Harbour', description: 'Order food and drink, and share what you like.', icon: '✿', x: 69, y: 61 },
      travel: { location: 'Wanderer’s Crossroads', description: 'Find your way around and ask for directions.', icon: '➤', x: 51, y: 67 },
      family: { location: 'Hearth of Kin', description: 'Meet the words for family and loved ones.', icon: '⌂', x: 31, y: 61 },
    };
    const radios = document.querySelectorAll<HTMLInputElement>('input[name="phrase-order"]');
    radios.forEach(radio => { radio.checked = radio.value === this.mapOrder; radio.onchange = () => { if (radio.checked) this.mapOrder = radio.value as LessonOrder; }; });
    (get('map-play') as HTMLButtonElement).onclick = () => { if (selectedTopic) play(selectedTopic, this.mapOrder); };
    const paint = (): void => {
      const topic = topics.find(entry => entry.id === selectedTopic);
      if (!topic) return;
      this.mapTopic = topic.id;
      if (this.mapVisible) this.island.setSelected(topic.id);
      const place = places[topic.id];
      const index = topics.indexOf(topic);
      get('map-detail-index').textContent = `0${index + 1} / 08`;
      get('map-location-name').textContent = place?.location ?? topic.name;
      get('map-topic-name').textContent = `${topic.name.toUpperCase()}  /  HINDI`;
      get('map-topic-description').textContent = place?.description ?? 'Discover this collection of Hindi phrases.';
      const phrases = course.phrases.filter(phrase => phrase.topic === selectedTopic);
      get('map-count').textContent = `${phrases.length} PHRASES`;
      get('map-play').setAttribute('aria-label', `Play ${topic.name}`);
      topicList.querySelectorAll<HTMLButtonElement>('button').forEach(button => { const selected = button.dataset.topic === selectedTopic; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
      phraseList.replaceChildren();
      phrases.forEach((phrase, phraseIndex) => {
        const row = document.createElement('div'); row.className = 'map-phrase';
        const number = document.createElement('span'); number.className = 'map-phrase-number'; number.textContent = String(phraseIndex + 1).padStart(2, '0');
        const text = document.createElement('div'); const english = document.createElement('strong'); english.textContent = phrase.english;
        const roman = document.createElement('small'); roman.textContent = phrase.words.map(word => word.roman).join(' · ');
        text.append(english, roman); row.append(number, text); phraseList.append(row);
      });
    };
    topics.forEach((topic, index) => {
      const place = places[topic.id];
      const button = document.createElement('button'); button.className = 'map-topic'; button.type = 'button'; button.dataset.topic = topic.id;
      button.innerHTML = `<span class="topic-icon" aria-hidden="true"></span><span class="topic-text"><strong></strong><small></small></span><span class="topic-arrow" aria-hidden="true">›</span>`;
      button.querySelector('.topic-icon')!.textContent = place?.icon ?? '✦'; button.querySelector('strong')!.textContent = topic.name; button.querySelector('small')!.textContent = `${topic.phraseCount} PHRASES`;
      button.addEventListener('click', () => { selectedTopic = topic.id; paint(); }); topicList.append(button);
    });
    this.onMapPick = id => { selectedTopic = id; paint(); };
    paint();
  }

  pickLabel(clientX: number, clientY: number): string | undefined {
    if (this.layer.hidden) return;
    for (const [id, node] of this.nodes) {
      if (node.hidden) continue;
      const rect = node.querySelector('.target-tag')!.getBoundingClientRect();
      if (clientX >= rect.left - 6 && clientX <= rect.right + 6 && clientY >= rect.top - 6 && clientY <= rect.bottom + 6) return id;
    }
  }

  update(state: GameState): void {
    const lesson = state.lesson, phrase = lesson.phrase;
    const visible = state.mode === 'hindi' && state.phase === 'playing' && Boolean(phrase);
    get('lesson-panel').hidden = !visible;
    get('training-stats').hidden = state.mode !== 'hindi';
    this.layer.hidden = !visible;
    if (!phrase) { this.phraseId = ''; return; }
    if (this.phraseId !== phrase.id) {
      this.phraseId = phrase.id;
      get('lesson-english').textContent = phrase.english;
      get('lesson-tip').textContent = phrase.tip;
      this.chips = phrase.words.map(word => { const chip = document.createElement('span'); chip.dataset.word = word.roman; return chip; });
      get('lesson-phrase').replaceChildren(...this.chips);
    }
    get('lesson-number').textContent = `${lesson.topicName.toUpperCase()} / ${String(lesson.phraseIndex + 1).padStart(2, '0')} OF ${String(lesson.phraseCount).padStart(2, '0')}`;
    this.chips.forEach((chip, index) => {
      const revealed = lesson.stage !== 'active' || index < lesson.wordIndex;
      const text = revealed ? phrase.words[index].roman : '···';
      if (chip.textContent !== text) chip.textContent = text;
      chip.classList.toggle('collected', index < lesson.wordIndex);
      chip.classList.toggle('next-word', lesson.stage === 'active' && index === lesson.wordIndex);
    });
    const feedback = get('lesson-feedback');
    if (feedback.textContent !== lesson.feedback) feedback.textContent = lesson.feedback;
    feedback.dataset.kind = lesson.feedbackKind;
    const advance = get('lesson-advance') as HTMLButtonElement;
    get('lesson-skip').hidden = lesson.stage !== 'preview' && lesson.stage !== 'active';
    get('lesson-skip').setAttribute('aria-label', lesson.phraseIndex + 1 === lesson.phraseCount ? 'Skip final phrase' : 'Skip phrase');
    advance.hidden = lesson.stage === 'active';
    const advanceLabel = lesson.stage === 'preview' ? 'READY — BUILD PHRASE' : lesson.phraseIndex + 1 === lesson.phraseCount ? 'FINISH TRAINING' : 'NEXT PHRASE →';
    if (advance.textContent !== advanceLabel) advance.textContent = advanceLabel;
    get('lesson-tip').hidden = lesson.stage !== 'complete';
    get('lesson-panel').dataset.stage = lesson.stage;
    if (get('lesson-panel').dataset.voice !== state.voiceStatus) get('lesson-panel').dataset.voice = state.voiceStatus;
    const replay = get('replay-phrase') as HTMLButtonElement;
    replay.disabled = state.muted;
    replay.setAttribute('aria-label', state.muted ? 'Unmute sound to hear the phrase' : 'Replay Hindi phrase');
    replay.classList.toggle('speaking', state.voiceStatus === 'playing');
    get('lesson-audio-status').textContent = state.muted ? 'SOUND MUTED' : state.audioStatus === 'locked' ? 'TAP SPEAKER TO ENABLE AUDIO' : state.voiceStatus === 'loading' ? 'LOADING PRONUNCIATION…' : state.voiceStatus === 'playing' ? 'LISTENING · HINDI AUDIO' : state.voiceStatus === 'unavailable' ? 'AUDIO UNAVAILABLE · TAP REPLAY TO RETRY' : 'CLICK / TAP TO FIRE · DRAG TO AIM';
    get('phrases-completed').textContent = `${lesson.completed} / ${lesson.phraseCount}`;
    get('lesson-mistakes').textContent = String(lesson.mistakes);
    get('phrases-skipped').textContent = String(lesson.skipped);
  }

  labels(labels: TargetLabel[]): void {
    const current = new Set(labels.map(label => label.id));
    for (const [id, node] of this.nodes) if (!current.has(id)) { node.remove(); this.nodes.delete(id); }
    for (const label of labels) {
      let node = this.nodes.get(label.id);
      if (!node) {
        node = document.createElement('div'); node.className = 'word-target'; node.dataset.targetId = label.id; node.dataset.roman = label.roman;
        const tag = document.createElement('span'); tag.className = 'target-tag'; tag.textContent = label.roman;
        const stem = document.createElement('span'); stem.className = 'target-stem';
        const anchor = document.createElement('span'); anchor.className = 'target-anchor'; anchor.setAttribute('aria-hidden', 'true');
        node.append(tag, stem, anchor); this.nodes.set(label.id, node); this.layer.append(node);
      }
      node.hidden = !label.visible;
      if (label.visible) {
        node.dataset.range = String(Math.round(label.range));
        node.style.transform = `translate3d(${label.x.toFixed(1)}px,${label.y.toFixed(1)}px,0)`;
        node.classList.toggle('rejected', label.wrong); node.classList.toggle('aimed', label.aimed);
      }
    }
  }
}
