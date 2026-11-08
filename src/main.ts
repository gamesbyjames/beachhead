import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import './style.css';
import './lesson.css';
import './map.css';
import { BeachheadGame } from './game/game';
import { LessonUI } from './lesson-ui';
import type { HindiCourse } from './game/lesson';
import type { GameState, Quality } from './game/types';

const icons = {
  crosshair: '<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="9"/><path d="M16 2v8m0 12v8M2 16h8m12 0h8"/><circle cx="16" cy="16" r="2"/></svg>',
  sound: '<svg viewBox="0 0 24 24" fill="none"><path d="M11 5 6 9H3v6h3l5 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>',
  mute: '<svg viewBox="0 0 24 24" fill="none"><path d="M11 5 6 9H3v6h3l5 4V5Zm5 4 5 6m0-6-5 6"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="none"><path d="M8 5v14M16 5v14" stroke-width="3"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>',
  expand: '<svg viewBox="0 0 24 24" fill="none"><path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/></svg>',
  plane: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m11 2 2 0 1 8 8 5v2l-8-2-.5 5 3 2h-9l3-2-.5-5-8 2v-2l8-5z"/></svg>',
  ship: '<svg viewBox="0 0 24 24" fill="none"><path d="m2 15 3 5h14l3-5H2Zm6 0V9h8v6m-4-6V3m-4 4h8"/></svg>',
};

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <canvas id="scene" aria-label="Beachhead 3D coastal defence game"></canvas>
  <div class="screen-grain" aria-hidden="true"></div>
  <div id="damage-vignette" aria-hidden="true"></div>
  <header class="topbar">
    <a class="brand" href="#" aria-label="Beachhead home"><span class="brand-mark">${icons.crosshair}</span><span>BEACHHEAD<small>PACIFIC DEFENCE</small></span></a>
    <div class="coordinates"><span class="status-dot"></span> SECTOR 07 <span class="divider">/</span> 08° 24′ N &nbsp; 167° 32′ E</div>
    <nav class="toolbar" aria-label="Game controls">
      <button id="sound" class="icon-button" aria-label="Mute sound" title="Sound">${icons.sound}</button>
      <button id="fullscreen" class="icon-button" aria-label="Enter fullscreen" title="Fullscreen">${icons.expand}</button>
      <button id="settings-button" class="icon-button" aria-label="Open settings" title="Settings">${icons.settings}</button>
      <button id="pause-button" class="icon-button" aria-label="Pause game" title="Pause (P)">${icons.pause}</button>
    </nav>
  </header>

  <section id="menu" class="menu">
    <div class="menu-content">
      <div class="eyebrow"><span></span> THE PACIFIC THEATRE <span class="edition">VOL. 01</span></div>
      <h1>HOLD THE<br><em>HORIZON.</em></h1>
      <p class="intro">An open sea. An incoming fleet.<br>One gun between them and the shore.</p>
      <div class="mission-tags"><span>${icons.plane} AIR & SEA COMBAT</span><span class="tag-divider"></span><span>ENDLESS DEFENCE</span></div>
      <button id="start-button" class="primary-button"><span>TAKE YOUR POST</span>${icons.arrow}</button>
       <button id="hindi-button" class="secondary-button"><span>LEARN HINDI <small>44 PHRASES · 8 TOPICS · SPOKEN AUDIO</small></span>${icons.arrow}</button>
      <p id="lesson-load-error" class="lesson-load-error" role="alert" hidden></p>
      <p id="menu-controls" class="menu-controls">MOVE MOUSE TO AIM <span>·</span> HOLD CLICK TO FIRE</p>
    </div>
    <div class="scene-caption"><span class="caption-rule"></span><span>THE SHORELINE<small>Somewhere in the Pacific, 1944</small></span></div>
    <footer class="menu-footer"><span><b>01</b> &nbsp; COASTAL DEFENCE</span><span class="headphone-note">BEST EXPERIENCED WITH HEADPHONES</span><span class="prototype">PLAYABLE PROTOTYPE <i></i></span></footer>
  </section>

  <section id="hindi-map" class="hindi-map" hidden aria-labelledby="map-title">
    <div class="map-shell">
      <div class="map-header"><div><span class="eyebrow"><span></span> YOUR LANGUAGE JOURNEY</span><h2 id="map-title">THE ISLE <em>OF HIND.</em></h2><p>Eight destinations. A whole new language to discover.</p></div><button id="map-back" class="map-back-button">← &nbsp; RETURN TO SHORE</button></div>
      <div class="map-layout">
        <nav class="map-topics" id="map-topics" aria-label="Hindi topics"></nav>
        <div class="map-visual"><div class="map-art" id="map-art"><img src="./map/isle-of-hind.svg" alt="" draggable="false"><canvas id="map-base" aria-hidden="true"></canvas><canvas id="map-fx" aria-hidden="true"></canvas><div id="map-markers" aria-label="Island locations"></div><div class="map-art-caption"><span>FIELD MAP / 01</span><strong>THE ISLE OF HIND</strong><small>Explore the coast, one phrase at a time</small></div></div></div>
        <section class="map-detail" aria-label="Selected Hindi topic"><div class="map-detail-head"><span class="eyebrow">YOUR NEXT DESTINATION</span><span class="map-detail-index" id="map-detail-index"></span></div><h3 id="map-location-name"></h3><div class="map-subtitle" id="map-topic-name"></div><p id="map-topic-description" class="map-description"></p><div class="map-section-line"><span>THE PHRASES</span><span id="map-count"></span></div><div id="map-phrases" class="map-phrases" aria-label="Phrases in this topic"></div><fieldset class="map-order"><legend>PHRASE ORDER</legend><label><input type="radio" name="phrase-order" value="sequence" checked><span>In sequence</span></label><label><input type="radio" name="phrase-order" value="random"><span>Shuffle</span></label></fieldset><button id="map-play" class="map-play">PLAY THIS LOCATION <span>→</span></button></section>
      </div>
      <div class="map-footer"><span><b>08</b> DESTINATIONS</span><span>ROMAN LETTERS · ENGLISH MEANING · SPOKEN HINDI</span><span><b>44</b> PHRASES TO DISCOVER</span></div>
    </div>
  </section>

  <main id="hud" class="hud" hidden>
    <div class="score-block"><span class="small-label">SCORE</span><strong id="score">000000</strong><span class="best-label">BEST <b id="best">000000</b></span></div>
    <div class="wave-block"><span id="mission-heading" class="small-label">DEFEND THE SHORE</span><strong><span id="wave-heading">WAVE</span> <span id="wave">01</span></strong><span id="target-count">12 HOSTILES</span></div>
    <div class="compass" aria-hidden="true"><span>NW</span><i></i><span>N</span><i></i><span>NE</span><b>▾</b></div>
    <div id="wave-message" class="wave-message" role="status"></div>
    <div class="reticle" aria-hidden="true"><i></i><i></i><i></i><i></i><span></span></div>
    <div id="hitmarker" class="hitmarker" aria-hidden="true">×</div>
    <div id="points" class="points"></div>
    <div class="defence-block"><div class="meter-label"><span>SHORE DEFENCE</span><b><span id="health">100</span><small>%</small></b></div><div class="defence-track"><div id="health-fill"></div></div><span class="station-label">EMPLACEMENT 01 <span>●</span> ACTIVE</span></div>
    <div class="weapon-block"><span id="weapon-status">TWIN 20 MM <i> / </i> AUTOCANNON</span><div class="heat-track"><div id="heat-fill"></div></div><span id="heat-label">BARREL TEMPERATURE</span></div>
    <div class="fire-control"><span class="fire-hint">HOLD TO FIRE</span><button id="fire-button" aria-label="Fire cannon">${icons.crosshair}<span>FIRE</span></button></div>
    <div id="aim-hint" class="aim-hint"><span>↔</span> DRAG TO AIM</div>
    <div id="target-labels" class="target-labels"></div>
    <section id="lesson-panel" class="lesson-panel" aria-label="Hindi phrase exercise" hidden>
      <div class="lesson-topline"><span id="lesson-number">HINDI / 01 OF 05</span><div class="lesson-actions"><button id="lesson-skip" class="skip-phrase" title="Skip this phrase">SKIP →</button><button id="recenter-lesson" class="icon-button" aria-label="Recenter formation" title="Recenter (C)">${icons.crosshair}</button><button id="replay-phrase" class="icon-button" aria-label="Replay Hindi phrase" title="Replay phrase (H)">${icons.sound}</button></div></div>
      <h2 id="lesson-english"></h2>
      <div id="lesson-phrase" class="phrase-chips" aria-label="Phrase progress" aria-live="polite"></div>
      <div class="lesson-bottomline"><span id="lesson-feedback" role="status"></span><button id="lesson-advance">READY — BUILD PHRASE</button></div>
      <p id="lesson-tip" hidden></p>
      <span id="lesson-audio-status"></span>
    </section>
    <div id="training-stats" class="training-stats" hidden><span>PHRASES DEFENDED</span><strong id="phrases-completed">0 / 5</strong><small>RETRIES <b id="lesson-mistakes">0</b> <i> / </i> SKIPPED <b id="phrases-skipped">0</b></small></div>
  </main>

  <section id="pause-screen" class="overlay-panel" hidden aria-labelledby="pause-title">
    <div class="panel"><span class="eyebrow">EMPLACEMENT ON STANDBY</span><h2 id="pause-title">HOLDING FIRE.</h2><p>The horizon can wait a moment.</p><button id="resume-button" class="primary-button">RESUME DEFENCE ${icons.arrow}</button><button id="restart-paused" class="text-button">RESTART MISSION</button><button id="pause-map" class="text-button muted-button" hidden>BACK TO MAP</button><button id="quit-button" class="text-button muted-button">RETURN TO SHORE</button></div>
  </section>

  <section id="gameover-screen" class="overlay-panel" hidden aria-labelledby="gameover-title">
    <div class="panel"><span id="result-eyebrow" class="eyebrow">EMPLACEMENT OVERRUN</span><h2 id="gameover-title">UNTIL THE<br>NEXT TIDE.</h2><p id="result-description">You held your ground. Take your post again.</p><div class="result-grid"><div><span>SCORE</span><strong id="final-score">0</strong></div><div><span id="result-wave-label">WAVE</span><strong id="final-wave">1</strong></div><div><span id="result-kills-label">DESTROYED</span><strong id="final-kills">0</strong></div></div><button id="restart-button" class="primary-button">DEFEND AGAIN ${icons.arrow}</button><button id="home-button" class="text-button">RETURN TO SHORE</button></div>
  </section>

  <dialog id="settings-dialog" aria-labelledby="settings-title">
    <div class="settings-heading"><span class="eyebrow">FIELD PREFERENCES</span><button id="close-settings" class="icon-button" aria-label="Close settings">×</button></div>
    <h2 id="settings-title">YOUR STATION.</h2>
    <label class="setting-row" for="quality"><span>Graphics quality<small>High adds live ocean reflections.<br>Adaptive balances detail and frame rate.</small></span><select id="quality"><option value="auto">Adaptive</option><option value="high">High</option><option value="low">Performance</option></select></label>
    <label class="setting-row" for="sensitivity"><span>Aim sensitivity<small id="sensitivity-value">1.0 ×</small></span><input id="sensitivity" type="range" min="0.4" max="2" step="0.1" value="1"></label>
    <label class="setting-row" for="audio-toggle"><span>Sound<small>Cannon, surf, and combat effects.</small></span><input id="audio-toggle" type="checkbox" checked></label>
    <div class="controls-note"><strong>FIELD MANUAL</strong><p class="desktop-instructions">Classic: move mouse or use WASD / arrows to aim.<br>Click or hold left click / Space to fire. P / Esc pauses.<br>Hindi: click words to shoot; drag to look around.</p><p class="touch-instructions">Tap anywhere on the game view to fire there.<br>Drag to aim, or hold FIRE with your other thumb.<br>In Hindi, tap the words in the correct order.</p><p>Down aircraft before they pass overhead. Sink ships to stop their bombardment. Clear a wave to restore 15% defence.</p></div>
    <p class="hindi-manual">HINDI TRAINING: listen, then click or tap a word to begin. Use SKIP to move on without completing a phrase. If using held FIRE or Space, release between choices. H replays; C recenters. Speech lowers combat volume automatically.</p>
    <div class="settings-footer"><span>LOCAL HIGH SCORES & PREFERENCES</span><span id="fps">60 FPS</span></div>
  </dialog>

  <div class="rotate-tip">↻ &nbsp; Turn your phone sideways for the full horizon.</div>
  <section id="orientation-prompt" class="orientation-prompt" role="dialog" aria-modal="true" aria-labelledby="orientation-title" hidden><div><div class="orientation-icon" aria-hidden="true">↻ <span>▯</span></div><span class="eyebrow">A WIDER VIEW</span><h2 id="orientation-title">TURN YOUR PHONE SIDEWAYS.</h2><p>Landscape gives the aircraft and words more room. The game will continue when you rotate.</p><button id="continue-portrait" class="text-button">CONTINUE IN PORTRAIT</button></div></section>
  <div id="loading" class="loading"><div class="loading-mark">${icons.crosshair}</div><span>ESTABLISHING THE SHORELINE</span><div class="loading-line"></div></div>
  <div id="error-screen" class="error-screen" hidden><h2>THE SHORE IS OUT OF REACH.</h2><p id="error-message"></p><button onclick="location.reload()" class="primary-button">TRY AGAIN</button></div>
`;

const element = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const touch = matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('touch', touch);
document.body.dataset.phase = 'menu';
if (touch) element('menu-controls').innerHTML = 'TAP TO FIRE <span>·</span> DRAG TO AIM';

let game: BeachheadGame;
let hitTimeout: ReturnType<typeof setTimeout>;
let damageTimeout: ReturnType<typeof setTimeout>;
let previousPhase = '';
let resumeAfterSettings = false;
const dialog = element<HTMLDialogElement>('settings-dialog');
const lessonUI = new LessonUI();
let previousMuted: boolean | undefined;
let portraitOverride = false;
const portraitPhone = matchMedia('(orientation: portrait) and (pointer: coarse)');

function syncOrientation(): void {
  if (!game) return;
  if (!portraitPhone.matches) portraitOverride = false;
  const show = game.state.phase === 'playing' && portraitPhone.matches && !portraitOverride;
  const prompt = element('orientation-prompt');
  const changed = prompt.hidden === show;
  prompt.hidden = !show;
  game.setOrientationHold(show);
  if (show && changed) element('continue-portrait').focus();
}
portraitPhone.addEventListener('change', syncOrientation);
window.addEventListener('resize', syncOrientation);

function updateUI(state: GameState): void {
  document.body.dataset.phase = state.phase;
  document.body.dataset.mode = state.mode;
  lessonUI.update(state);
  element('menu').hidden = state.phase !== 'menu';
  element('hud').hidden = state.phase === 'menu' || state.phase === 'map';
  element('hindi-map').hidden = state.phase !== 'map';
  lessonUI.setMapVisible(state.phase === 'map');
  element('pause-screen').hidden = state.phase !== 'paused';
  element('pause-map').hidden = state.mode !== 'hindi';
  element('gameover-screen').hidden = state.phase !== 'over' && state.phase !== 'complete';
  element('score').textContent = String(state.score).padStart(6, '0');
  element('best').textContent = String(state.best).padStart(6, '0');
  element('wave').textContent = String(state.mode === 'hindi' ? state.lesson.phraseIndex + 1 : state.wave).padStart(2, '0');
  element('wave-heading').textContent = state.mode === 'hindi' ? 'PHRASE' : 'WAVE';
  element('mission-heading').textContent = state.mode === 'hindi' ? 'LISTEN · AIM · LEARN' : 'DEFEND THE SHORE';
  element('target-count').textContent = `${state.targets} ${state.mode === 'hindi' ? 'WORDS REMAIN' : 'HOSTILES'}`;
  element('health').textContent = String(Math.ceil(state.health));
  element('health-fill').style.width = `${state.health}%`;
  element('health-fill').classList.toggle('critical', state.health < 30);
  element('heat-fill').style.width = `${state.heat}%`;
  element('heat-fill').classList.toggle('hot', state.heat > 70);
  element('heat-label').textContent = state.overheated ? 'OVERHEATED — COOLING' : 'BARREL TEMPERATURE';
  element('heat-label').classList.toggle('hot-text', state.overheated);
  element('fire-button').classList.toggle('overheated', state.overheated);
  element('fire-button').setAttribute('aria-label', state.overheated ? 'Cannon cooling' : 'Fire cannon');
  if (element('wave-message').textContent !== state.message) element('wave-message').textContent = state.message;
  element('wave-message').classList.toggle('visible', Boolean(state.message));
  element('fps').textContent = `${state.fps} FPS`;
  if (state.muted !== previousMuted) { element('sound').innerHTML = state.muted ? icons.mute : icons.sound; previousMuted = state.muted; }
  const soundLabel = state.muted ? 'Unmute sound' : state.audioStatus === 'ready' ? 'Mute sound' : 'Enable sound';
  element('sound').setAttribute('aria-label', soundLabel);
  element('sound').setAttribute('title', soundLabel);
  element('sound').classList.toggle('audio-locked', !state.muted && state.audioStatus === 'locked');
  element('sound').dataset.audio = state.audioStatus;
  element('sound').setAttribute('aria-pressed', String(state.muted));
  element<HTMLInputElement>('audio-toggle').checked = !state.muted;
  if (state.phase === 'over' || state.phase === 'complete') {
    const trained = state.phase === 'complete';
    element('result-eyebrow').textContent = trained ? 'HINDI TRAINING COMPLETE' : 'EMPLACEMENT OVERRUN';
    element('gameover-title').textContent = trained ? 'WORDS WELL DEFENDED.' : 'UNTIL THE NEXT TIDE.';
    element('result-description').textContent = trained ? `${state.lesson.topicName}: ${state.lesson.completed} of ${state.lesson.phraseCount} phrases completed${state.lesson.skipped ? `, ${state.lesson.skipped} skipped` : ''}. ${state.lesson.mistakes} ${state.lesson.mistakes === 1 ? 'retry' : 'retries'}.` : 'You held your ground. Take your post again.';
    element('result-wave-label').textContent = trained ? 'PHRASES' : 'WAVE';
    element('result-kills-label').textContent = trained ? 'WORDS' : 'DESTROYED';
    element('final-score').textContent = state.score.toLocaleString(); element('final-wave').textContent = String(trained ? state.lesson.completed : state.wave); element('final-kills').textContent = String(state.kills);
    const restartLabel = trained ? 'PRACTISE AGAIN →' : 'DEFEND AGAIN →';
    if (element('restart-button').textContent !== restartLabel) element('restart-button').textContent = restartLabel;
    element('home-button').textContent = trained ? 'BACK TO MAP' : 'RETURN TO SHORE';
  }
  if (state.phase !== previousPhase) {
    if (state.phase === 'playing' && previousPhase !== 'paused') portraitOverride = false;
    if (state.phase === 'paused' && !resumeAfterSettings) element('resume-button').focus();
    else if (state.phase === 'over' || state.phase === 'complete') element('restart-button').focus();
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    previousPhase = state.phase;
  }
  syncOrientation();
}

function start(): void { game.start(); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); }

async function startHindi(): Promise<void> {
  const button = element<HTMLButtonElement>('hindi-button'); button.disabled = true;
  element('lesson-load-error').hidden = true;
  try { await game.startHindi(); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); }
  catch (error) { element('lesson-load-error').textContent = error instanceof Error ? error.message : 'Could not load Hindi. Please try again.'; element('lesson-load-error').hidden = false; }
  finally { button.disabled = false; }
}

function restart(): void { if (game.state.mode === 'hindi') game.restartHindiTopic(); else start(); }

// Let the loading screen paint before creating shaders and procedural assets.
requestAnimationFrame(() => requestAnimationFrame(() => {
  try {
    game = new BeachheadGame(element<HTMLCanvasElement>('scene'), element<HTMLButtonElement>('fire-button'), {
      state: updateUI,
      hit(destroyed, points, feedback) {
        clearTimeout(hitTimeout); element('hitmarker').classList.add('visible'); element('hitmarker').classList.toggle('destroyed', destroyed);
        element('hitmarker').style.left = `${(feedback?.x ?? .5) * 100}%`; element('hitmarker').style.top = `${(feedback?.y ?? .5) * 100}%`;
        element('points').style.left = `${(feedback?.x ?? .5) * 100}%`; element('points').style.top = `calc(${(feedback?.y ?? .5) * 100}% + 24px)`;
        element('points').textContent = feedback?.message ?? (destroyed ? `+${points}` : 'HIT'); element('points').classList.add('visible');
        hitTimeout = setTimeout(() => { element('hitmarker').classList.remove('visible'); element('points').classList.remove('visible'); }, destroyed ? 850 : 650);
      },
      damage() { clearTimeout(damageTimeout); element('damage-vignette').classList.add('visible'); damageTimeout = setTimeout(() => element('damage-vignette').classList.remove('visible'), 550); },
      event(event) { window.dispatchEvent(new CustomEvent('beachhead:combat', { detail: event })); },
      labels(labels) { lessonUI.labels(labels); },
      map(course: HindiCourse) { lessonUI.renderMap(course, (topic, order) => game.startHindiTopic(topic, order), game.state.lesson.topicId); },
      pickLabel(x, y) { return lessonUI.pickLabel(x, y); },
      aim(x, y) { const reticle = document.querySelector<HTMLElement>('.reticle')!; reticle.style.left = `${x * 100}%`; reticle.style.top = `${y * 100}%`; },
    });
    element<HTMLSelectElement>('quality').value = game.preferences.quality;
    element<HTMLInputElement>('sensitivity').value = String(game.preferences.sensitivity);
    element('sensitivity-value').textContent = `${game.preferences.sensitivity.toFixed(1)} ×`;
    updateUI(game.state);
    element('loading').classList.add('loaded');
    setTimeout(() => element('loading').remove(), 700);
  } catch (error) {
    console.error(error);
    element('loading').remove(); element('error-screen').hidden = false;
    element('error-message').textContent = 'This scene needs WebGL 2. Try an up-to-date Safari, Chrome, or Edge browser with hardware acceleration enabled.';
  }
}));

element('start-button').addEventListener('click', start);
element('hindi-button').addEventListener('click', () => { void startHindi(); });
element('restart-button').addEventListener('click', restart);
element('restart-paused').addEventListener('click', restart);
element('replay-phrase').addEventListener('click', () => { game.replayPhrase(); element('replay-phrase').blur(); });
element('recenter-lesson').addEventListener('click', () => { game.recenter(); element('recenter-lesson').blur(); });
element('lesson-advance').addEventListener('click', () => { if (game.state.lesson.stage === 'preview') game.activatePhrase(); else game.nextPhrase(); element('lesson-advance').blur(); });
element('lesson-skip').addEventListener('click', () => { game.skipPhrase(); element('lesson-skip').blur(); });
element('continue-portrait').addEventListener('click', () => { portraitOverride = true; syncOrientation(); element('continue-portrait').blur(); });
element('resume-button').addEventListener('click', () => game.resume());
element('pause-button').addEventListener('click', () => game.togglePause());
element('quit-button').addEventListener('click', () => game.returnToMenu());
element('pause-map').addEventListener('click', () => game.returnToHindiMap());
element('home-button').addEventListener('click', () => { if (game.state.mode === 'hindi') game.returnToHindiMap(); else game.returnToMenu(); });
element('map-back').addEventListener('click', () => game.returnToMenu());
document.querySelector('.brand')!.addEventListener('click', event => { event.preventDefault(); if (game.state.phase === 'playing') game.pause(); });
element('sound').addEventListener('click', () => {
  if (game.state.muted) { game.setMuted(false); void game.audio.unlock(); }
  else if (game.state.audioStatus !== 'ready') void game.audio.unlock();
  else game.setMuted(true);
});
element('settings-button').addEventListener('click', () => {
  resumeAfterSettings = game.state.phase === 'playing'; if (resumeAfterSettings) game.pause(); dialog.showModal();
});
element('close-settings').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { if (resumeAfterSettings) game.resume(); resumeAfterSettings = false; });
dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
element('quality').addEventListener('change', event => game.setQuality((event.target as HTMLSelectElement).value as Quality));
element('sensitivity').addEventListener('input', event => { const value = Number((event.target as HTMLInputElement).value); game.setSensitivity(value); element('sensitivity-value').textContent = `${value.toFixed(1)} ×`; });
element('audio-toggle').addEventListener('change', event => { game.setMuted(!(event.target as HTMLInputElement).checked); if (!game.state.muted) void game.audio.unlock(); });
element('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { /* Safari can use Add to Home Screen instead. */ }
});
if (!document.fullscreenEnabled) element('fullscreen').hidden = true;
