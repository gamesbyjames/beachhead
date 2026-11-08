# Beachhead — Pacific Defence

A touch-ready Three.js coastal defence prototype inspired by the original CryEngine scene. Includes classic defence and a complete 44-phrase Hindi training course with a coastal map. Models, foliage textures, effects, and combat sound are generated locally; scanned sand and the user's existing Hindi pronunciation clips are bundled. No paid asset packs, accounts, or API keys are required.

## Run

Requires a current Node.js release (22.12+ or 24+ recommended).

```powershell
npm install
npm run dev
```

Open **http://localhost:5173** on your computer.

### Test on an iPhone or Android

1. Connect your phone and computer to the same Wi-Fi network.
2. Run `npm run dev`. Vite prints a **Network** URL such as `http://192.168.1.20:5173`.
3. Open that URL in Safari on your iPhone, or Chrome on Android. Use landscape orientation.
4. If Windows asks, allow Node.js through the firewall on your private network. Guest Wi-Fi may block connections between devices.

The GitHub Actions workflow in `.github/workflows/pages.yml` builds and deploys `dist` whenever `main` changes. In the repository's **Settings → Pages**, select **GitHub Actions** as the source. The Pages address is `https://gamesbyjames.github.io/beachhead/`. The Vite base and asset paths are relative, so the app works under the repository subpath.

Safari's **Share → Add to Home Screen** offers a standalone view with a dedicated home-screen icon. Home-screen installation is not an offline mode: the game currently needs a connection to load. No Mac is needed for browser testing or web hosting. The PNG icons can be regenerated with `python tools/make-icons.py` (requires Pillow).

## Controls and rules

| Action | Desktop | Phone / tablet |
| --- | --- | --- |
| Aim | Classic: move mouse. Hindi: drag. WASD / arrows also work. | Drag on the scene |
| Fire | Click (Hindi: directly on a word/craft), or hold Space / FIRE | Tap anywhere on the game view to fire there, or hold FIRE |
| Pause | P, Escape, or pause button | Pause button |
| Replay Hindi phrase | H or speaker button in the lesson | Lesson speaker button |
| Recenter Hindi formation | C or lesson crosshair button | Lesson crosshair button |

### Classic defence — Take Your Post

- Down aircraft before they fly over the emplacement. Aircraft that get through damage shore defence.
- Ships bombard the beach periodically until sunk.
- Aircraft take 3 hits and award 100 points; ships take 15 hits and award 500 points.
- Fire in bursts. An overheated cannon must cool before it can fire again.
- Clear every target to advance to the next wave and restore 15 defence.
- High score, audio, sensitivity, and graphics preferences are stored locally.
- Switching tabs or locking the phone pauses gameplay.

### Hindi training — Learn Hindi

1. On the map, select a destination and choose **In sequence** or **Shuffle**, then press **Play this location**. Each session includes every phrase from that topic exactly once.
2. Listen to the phrase and read the Roman-letter preview and English meaning.
3. Click or tap a word to begin immediately, or select **Ready — Build Phrase** first. The remaining sentence becomes blank slots.
4. Click or tap craft or word badges to shoot them directly in the correct order. Positions are shuffled. Dragging pans the view without shooting; small finger movements are treated as a tap.
5. Each click/tap is a fresh choice, including very quick clicks. If using held **FIRE** or **Space**, release between choices: a held burst counts once, including an incorrect choice. A correct word takes one hit.
6. A wrong word stays available, and the next correct word is shown and spoken. Training has no bombardment or time limit.
7. Each collected word is pronounced; a completed sentence is played in full. **Next Phrase** starts the next preview. Use **Skip** at any time to move on without completing the current phrase. **Finish Training** (or skipping the final phrase) opens the location summary, which distinguishes completed and skipped phrases.

The map contains all 44 phrases from the Hindi course: Basics, My Story, Numbers, Colours, Verbs, Food & Drink, Directions, and Family. The starter samples include **Phir milenge**, **Aasmaan neela hai**, **Namaste aap kaise hain**, **Aapka naam kya hai**, and **Samundar hara aur neela hai**. Word targets fly above the sea; unlabelled ships remain available offshore. Completed phrases award a 250-point bonus. Training and classic high scores are stored separately.

Word-bearing aircraft approach the shore in a staggered formation. If left unshot they turn back and make another pass, so no word becomes permanently unavailable. Long phrases use the available landscape width to keep labels separate. On phones the game prompts for landscape and pauses until rotated, with a **Continue in portrait** option. Rotating back to portrait prompts again.

The turret and reticle follow the pointer or last tap. Touch positions are measured against the actual canvas, including resized mobile browser bars and display offsets. A selected craft is acquired at the input event and tracked by the assisted projectile, so a delayed frame does not change the intended target. Hit feedback appears on the craft, with remaining HP or the next required Hindi word.

Unlabelled background ships in Hindi mode can also be damaged and sunk for combat points; they do not advance the phrase. Labelled craft still require the correct word order.

Voice playback lowers combat volume automatically. Pause, restart, mute, and returning to the menu cancel pending speech. **Back to map** is available from the pause menu and the completed-location summary; **Practise again** restarts the same topic and reshuffles if shuffle was selected. Missing audio shows a retry message and leaves the exercise playable. Landscape gives the most space for labels; rotating the device rearranges the formation.

On iPhone, available Audio Session support selects the playback route. Game touches synchronously resume/prime suspended or interrupted Web Audio. If the browser still requires interaction, the toolbar shows **Enable sound**; tapping it enables audio rather than toggling mute. Chrome-on-iPhone audio must also be checked on the actual device, since desktop Chromium and WebKit do not reproduce its native audio routing.

### Ocean and graphics

- Three superimposed rolling swells on a grid concentrated near the shore.
- Two scrolling, mipmapped normal layers for fine surface detail.
- Sky-matched Fresnel reflections, warm sun glints, turquoise shallows, and darker offshore water.
- Animated breaking foam, a wet-sand band, ship bow foam and V-shaped wakes.
- Vertical impact spray and a six-ring pool of expanding impact ripples.
- **High** adds a 512 × 256 planar reflection capture every third rendered frame, reflecting scenery and craft.
- **Adaptive** uses inexpensive sky reflections and adjusts pixel ratio, mesh detail, and shadows to the frame rate.
- **Performance** uses the lighter ocean mesh, lower resolution, and no shadows.

Pausing freezes ocean simulation and rendering until the view or settings change. Actual iPhone performance must be measured on the device; desktop emulation does not measure mobile GPU performance.

## Checks

```powershell
npm run build
npx playwright install chromium webkit
npm test
```

Tests cover continuous projectile collision, Chromium and WebKit rendering, approaching and returning formations, phrase skipping, phone orientation prompts, full-width word separation, classic combat, direct word and aircraft-body taps, retina/resized/offset mobile canvases, destruction of horizon ships, turret/muzzle direction, touch drag/cancellation, pause/resume, Hindi ordering and topic routes, and audio playback/mute/interruption recovery. Screenshots are written to `test-results`.

Playwright's Windows WebKit build omits Web Audio. Its tests check the full learning flow and bundled audio availability; the Chromium audio test verifies decoding and playback. Physical iPhone Safari testing remains important.

## Structure

- `src/game/game.ts` — waves, target lifecycle, damage, projectile simulation, scoring, adaptive renderer.
- `src/game/formation.ts` — approaching, returning word-carrying aircraft paths.
- `src/game/world.ts` — sky, coastline, palms, vegetation.
- `src/game/ocean.ts` — wave geometry, water shader, optional planar reflections, wakes, wet sand, impact rings.
- `src/game/models.ts` — procedural aircraft, destroyers, twin cannon.
- `src/game/geometry.ts` — static geometry batching.
- `src/game/effects.ts` — pooled and instanced smoke, explosions, water columns, bow spray.
- `src/game/input.ts` — mouse, keyboard, multi-touch controls.
- `src/game/audio.ts` — synthesized combat/surf, cached MP3 decoding, speech channel and volume ducking.
- `src/game/lesson.ts` — typed course loading and independent phrase-order rules.
- `src/lesson-ui.ts`, `src/lesson.css` — projected word labels, phrase previews, collection feedback.
- `src/lingo-map/map.js` — adapted Lingo Surfer procedural island, markers, paths, drifting fog and fireflies.
- `src/game/types.ts` — settings, state, and typed combat events.
- `src/main.ts`, `src/style.css` — menus, HUD, responsive layout.

### Phrase content and integration

`public/lessons/hi-course.json` contains all 44 imported Hindi phrases across eight topics, original phrase IDs, Roman spellings, English glosses, native-script audio keys, local audio paths, and the exact source commit. The required MP3s are in `public/audio/hi/`. Playback uses local files.

To refresh this selection from the source repository:

```powershell
node tools/import-hindi.mjs
```

The import script pins one repository revision, retains original wording, selects the male form for gendered entries, verifies every audio-manifest mapping, and downloads the complete course audio. No ElevenLabs API calls are made.

Targets have stable IDs, and the game emits `beachhead:combat` custom events:

```ts
window.addEventListener('beachhead:combat', event => {
  const combat = (event as CustomEvent).detail;
  // shot-fired (with burstId), target-spawned, target-hit, target-destroyed,
  // wave-started, player-hit
  // Hindi also emits word-selected and phrase-completed, with original phrase IDs.
});
```

The `HindiLesson` state machine creates a topic-scoped route in sequence or with a Fisher–Yates shuffle, validates word order before damage is applied, deduplicates already consumed craft, and owns phrase completion. The Hindi map presents all eight topics and previews their phrases before starting the chosen route. The game handles projectile collisions, target placement, and scoring. This is the integration point for expanding the course or adding further languages.

## Visual scope

The prototype uses original procedural assets to establish gameplay, composition, lighting, and mobile budgets. They can be replaced with authored GLB aircraft, ships, and vegetation for a higher-fidelity art pass. The ocean uses analytic waves and simulated shallow-water transmission; High adds live planar reflections. Combat uses arcade hit volumes and aim assistance.

## Credits

- Rendering: [Three.js](https://threejs.org/), MIT license.
- Hindi phrase text and existing ElevenLabs-generated pronunciation: the user's [lingo_run](https://github.com/gamesbyjames/lingo_run) repository. See `public/audio/hi/CREDITS.md` and the imported course's source revision.
- Procedural map adapted from [`lingo_run/js/map.js`](https://github.com/gamesbyjames/lingo_run/blob/6e4163e02eb96bf98d8c0b80002e8bb1ab70e127/js/map.js), with the original Hindi island seed and animated effects. The artwork used as a loading fallback is `public/map/isle-of-hind.svg`.
- Scanned sand diffuse and normal maps: [Sand 01](https://polyhaven.com/a/sand_01), Rob Tuytel / Poly Haven, CC0. See `public/textures/CREDITS.md`.
- Fonts: Barlow Condensed by Jeremy Tribby, and DM Sans by Colophon Foundry, distributed under the SIL Open Font License through Fontsource. Font files are bundled locally.
