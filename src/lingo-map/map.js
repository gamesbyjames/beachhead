// Adapted from gamesbyjames/lingo_run (6e4163e02eb96bf98d8c0b80002e8bb1ab70e127), js/map.js.
// The mysterious island map: a procedurally generated island per language with a winding
// path between topic locations. Terrain is painted once into an offscreen canvas; fog,
// fireflies and the animated path are drawn every frame on a second canvas.

import { TOPICS } from './lessons.js';

// ------------------------------------------------------------ noise
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(rng) {
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  for (let i = 0; i < 256; i++) vals[i] = rng();
  const v = (i, j) => vals[perm[(perm[i & 255] + j) & 255]];
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
    const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
  return (x, y, oct = 5) => {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) { s += amp * noise(x * f, y * f); norm += amp; amp *= 0.5; f *= 2.03; }
    return s / norm;
  };
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mixC = (c1, c2, t) => [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)];

// ------------------------------------------------------------ island generation
function generateIsland(seed, R = 420) {
  const rng = mulberry32(seed * 9973 + 17);
  const fbm = makeNoise(rng);
  const ox = rng() * 100, oy = rng() * 100;
  const H = new Float32Array(R * R);
  for (let y = 0; y < R; y++) {
    for (let x = 0; x < R; x++) {
      const u = x / R, v = y / R;
      const wx = fbm(u * 3 + ox, v * 3 + oy, 4) - 0.5;
      const wy = fbm(u * 3 + oy + 5.2, v * 3 + ox + 1.3, 4) - 0.5;
      const cx = (u - 0.5 + wx * 0.32) * 2.05, cy = (v - 0.52 + wy * 0.32) * 2.25;
      const d = Math.sqrt(cx * cx + cy * cy);
      const n = fbm(u * 4.2 + ox, v * 4.2 + oy, 6);
      const ridge = 1 - Math.abs(fbm(u * 2.6 + oy, v * 2.6 + ox, 4) * 2 - 1);
      H[y * R + x] = n * 0.75 + ridge * 0.42 - d * d * 1.5;
    }
  }
  // choose sea level so ~44% of the square is land, then normalise land heights to 0..1
  const sorted = Float32Array.from(H).sort();
  const level = sorted[Math.floor(sorted.length * 0.56)];
  let max = 0;
  for (let i = 0; i < H.length; i++) { H[i] -= level; if (H[i] > max) max = H[i]; }
  let min = 0;
  for (let i = 0; i < H.length; i++) if (H[i] < min) min = H[i];
  for (let i = 0; i < H.length; i++) H[i] = H[i] > 0 ? H[i] / max : (H[i] / -min) * 0.6;
  // keep a margin of sea around the edges
  for (let y = 0; y < R; y++) {
    for (let x = 0; x < R; x++) {
      const e = Math.min(x, y, R - 1 - x, R - 1 - y) / R;
      if (e < 0.07 && H[y * R + x] > -0.03) H[y * R + x] = -0.03;
    }
  }
  return { H, R, rng };
}

function paintIsland({ H, R }) {
  const c = document.createElement('canvas');
  c.width = c.height = R;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(R, R);
  const d = img.data;
  const at = (x, y) => H[Math.min(R - 1, Math.max(0, y)) * R + Math.min(R - 1, Math.max(0, x))];
  const SAND = [201, 182, 136], LOW = [104, 132, 82], FOREST = [52, 88, 62], ROCK = [112, 100, 86], PEAK = [168, 160, 146];
  for (let y = 0; y < R; y++) {
    for (let x = 0; x < R; x++) {
      const h = at(x, y);
      const i = (y * R + x) * 4;
      const grain = (Math.random() - 0.5) * 10;
      if (h < 0) {
        // sea: transparent, with glowing shallows and old-map depth rings
        const shallow = smooth(-0.2, 0, h);
        const ring = h > -0.35 && (((-h * 14) % 1) < 0.08) ? 0.22 : 0;
        const coastFoam = (at(x + 1, y) >= 0 || at(x - 1, y) >= 0 || at(x, y + 1) >= 0 || at(x, y - 1) >= 0) ? 0.9 : 0;
        const edge = smooth(0, 0.1, Math.min(x, y, R - 1 - x, R - 1 - y) / R);
        const a = Math.max(shallow * 0.55, ring, coastFoam) * edge;
        const col = coastFoam ? [214, 236, 230] : ring > shallow * 0.55 ? [140, 210, 215] : [40, 150, 160];
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = a * 255;
        continue;
      }
      let col;
      if (h < 0.05) col = SAND;
      else if (h < 0.4) col = mixC(LOW, FOREST, smooth(0.06, 0.4, h));
      else if (h < 0.75) col = mixC(FOREST, ROCK, smooth(0.45, 0.75, h));
      else col = mixC(ROCK, PEAK, smooth(0.88, 1.0, h));
      // hillshade (light from the north-west)
      const gx = at(x + 1, y) - at(x - 1, y), gy = at(x, y + 1) - at(x, y - 1);
      const shade = Math.min(1.18, Math.max(0.55, 0.95 + (-gx - gy) * 8));
      // contour lines
      const k = 9;
      const contour = Math.floor(h * k) !== Math.floor(at(x + 1, y) * k) || Math.floor(h * k) !== Math.floor(at(x, y + 1) * k);
      const coast = at(x + 1, y) < 0 || at(x - 1, y) < 0 || at(x, y + 1) < 0 || at(x, y - 1) < 0;
      let f = shade * (contour ? 0.72 : 1);
      // twilight tint
      let r = col[0] * f * 0.86 + grain, g = col[1] * f * 0.9 + grain, b = col[2] * f * 1.04 + grain;
      if (coast) { r = 38; g = 34; b = 44; }
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function placeLocations({ H, R, rng }, n) {
  const cands = [];
  for (let k = 0; k < 4000; k++) {
    const x = 0.1 + rng() * 0.8, y = 0.1 + rng() * 0.8;
    const h = H[Math.floor(y * R) * R + Math.floor(x * R)];
    if (h > 0.08 && h < 0.7) cands.push({ x, y, h });
  }
  if (cands.length < n) {
    // tiny island fallback: spread on a circle
    return Array.from({ length: n }, (_, i) => ({ x: 0.5 + Math.cos(i / n * 6.28) * 0.25, y: 0.5 + Math.sin(i / n * 6.28) * 0.25 }));
  }
  // farthest-point sampling for an even spread
  const pts = [cands.reduce((a, b) => (b.y > a.y ? b : a))];
  while (pts.length < n) {
    let best = null, bd = -1;
    for (const c of cands) {
      let md = Infinity;
      for (const p of pts) md = Math.min(md, (c.x - p.x) ** 2 + (c.y - p.y) ** 2);
      if (md > bd) { bd = md; best = c; }
    }
    pts.push(best);
  }
  // order as a journey: start at the southern shore, then nearest neighbour
  const order = [pts[0]];
  const left = pts.slice(1);
  while (left.length) {
    const last = order[order.length - 1];
    let bi = 0, bd = Infinity;
    left.forEach((p, i) => { const dd = (p.x - last.x) ** 2 + (p.y - last.y) ** 2; if (dd < bd) { bd = dd; bi = i; } });
    order.push(left.splice(bi, 1)[0]);
  }
  return order;
}

// ------------------------------------------------------------ icons
const ICONS = {
  basics: '<path d="M4 6h16v9H9l-5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="9" cy="10.5" r="1.2"/><circle cx="12.5" cy="10.5" r="1.2"/><circle cx="16" cy="10.5" r="1.2"/>',
  story: '<path d="M3 5c3-1 6-1 9 1 3-2 6-2 9-1v13c-3-1-6-1-9 1-3-2-6-2-9-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 6v13" stroke="currentColor" stroke-width="2"/>',
  numbers: '<text x="12" y="16.5" text-anchor="middle" font-size="11" font-weight="800" fill="currentColor" font-family="Baloo 2, sans-serif">123</text>',
  colors: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.5-4-8-9-8z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="7.5" cy="11" r="1.4"/><circle cx="10" cy="7" r="1.4"/><circle cx="15" cy="7" r="1.4"/>',
  verbs: '<path d="M13 2 5 13h6l-1 9 8-11h-6z" fill="currentColor"/>',
  food: '<path d="M3 11h18a9 9 0 0 1-18 0z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 8c0-2 2-2 2-4M12 8c0-2 2-2 2-4M16 8c0-2 2-2 2-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  travel: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="m15.5 8.5-2 5-5 2 2-5z" fill="currentColor"/>',
  family: '<path d="M3 11 12 4l9 7v9H3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 20v-5h4v5" fill="none" stroke="currentColor" stroke-width="2"/>',
};
export const iconSvg = (id) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[id] || ''}</svg>`;

// ------------------------------------------------------------ map view
export class IslandMap {
  constructor(root) {
    this.root = root;
    this.base = root.querySelector('#map-base');
    this.fx = root.querySelector('#map-fx');
    this.layer = root.querySelector('#map-markers');
    this.cache = {};
    this.visible = false;
    this.hover = -1;
    this.t = 0;
    addEventListener('resize', () => { if (this.visible) this.layout(); });
  }

  /**
   * @param course   loaded course json
   * @param progress { [topicId]: {done:number, total:number} }
   * @param onPick   (topicId) => void
   */
  show(course, progress, onPick) {
    this.course = course;
    this.progress = progress;
    this.onPick = onPick;
    if (!this.cache[course.id]) {
      const isl = generateIsland(course.mapSeed || 1);
      this.cache[course.id] = {
        img: paintIsland(isl),
        locs: placeLocations(isl, TOPICS.length),
        decor: { serpent: isl.rng() < 0.5 ? 0 : 1, wave: Array.from({ length: 140 }, () => [isl.rng(), isl.rng(), isl.rng()]) },
      };
    }
    this.data = this.cache[course.id];
    this.fogBlobs = Array.from({ length: 16 }, (_, i) => ({ x: Math.random(), y: Math.random(), r: 0.12 + Math.random() * 0.18, s: 0.004 + Math.random() * 0.01, a: 0.1 + Math.random() * 0.12, p: i }));
    this.flies = Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random(), p: Math.random() * 6.28, s: 0.3 + Math.random() }));
    this.reveal = TOPICS.map((t) => ((progress[t.id]?.done || 0) > 0 ? 1 : 0));
    this.visible = true;
    this.root.classList.remove('hidden');
    this.buildMarkers();
    this.layout();
    cancelAnimationFrame(this.raf);
    let last = performance.now();
    const loop = (now) => {
      if (!this.visible) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.t += dt;
      this.drawFx(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  hide() {
    this.visible = false;
    cancelAnimationFrame(this.raf);
    this.root.classList.add('hidden');
  }

  setSelected(topicId) {
    [...this.layer.children].forEach((el) => { const selected = el.dataset.topic === topicId; el.classList.toggle('sel', selected); el.setAttribute('aria-pressed', String(selected)); });
  }

  /** The next location to visit: first one that's not fully mastered. */
  nextIndex() {
    const i = TOPICS.findIndex((t) => { const p = this.progress[t.id]; return !p || p.done < p.total; });
    return i < 0 ? -1 : i;
  }

  buildMarkers() {
    const next = this.nextIndex();
    this.layer.innerHTML = TOPICS.map((t, i) => {
      const p = this.progress[t.id] || { done: 0, total: 0 };
      const pct = p.total ? p.done / p.total : 0;
      const state = pct >= 1 ? 'mastered' : p.done > 0 ? 'visited' : 'unknown';
      const pips = Array.from({ length: p.total }, (_, k) => `<i class="${k < p.done ? 'on' : ''}"></i>`).join('');
      return `<button class="loc ${state}${i === next ? ' next' : ''}" aria-label="Select ${t.name}" aria-pressed="false" data-topic="${t.id}" data-i="${i}" style="--pct:${pct}">
        <span class="loc-ring"></span>
        <span class="loc-core">${iconSvg(t.id)}</span>
        <span class="loc-label"><b>${t.place}</b><small>${t.name}</small><span class="pips">${pips}</span></span>
      </button>`;
    }).join('');
    [...this.layer.children].forEach((el) => {
      const i = +el.dataset.i;
      el.addEventListener('pointerenter', () => { this.hover = i; });
      el.addEventListener('pointerleave', () => { if (this.hover === i) this.hover = -1; });
      el.addEventListener('click', (e) => { e.stopPropagation(); this.onPick?.(el.dataset.topic); });
    });
  }

  layout() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.root.clientWidth, h = this.root.clientHeight;
    this.w = w; this.h = h; this.dpr = dpr;
    for (const c of [this.base, this.fx]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = w + 'px';
      c.style.height = h + 'px';
    }
    const portrait = h > w;
    // The map is embedded in Beachhead's panel, so use its whole available area.
    this.S = Math.min(w * (portrait ? 0.98 : 0.95), h * 0.96);
    this.ox = (w - this.S) / 2;
    this.oy = (h - this.S) / 2;
    this.drawBase();
    this.data.locs.forEach((p, i) => {
      const el = this.layer.children[i];
      if (!el) return;
      const [x, y] = this.toScreen(p);
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.classList.toggle('label-left', x > w - 110);
      el.classList.toggle('label-right', x < 110);
    });
  }

  toScreen(p) { return [this.ox + p.x * this.S, this.oy + p.y * this.S]; }

  drawBase() {
    const ctx = this.base.getContext('2d');
    const { w, h, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // deep twilight sea
    const g = ctx.createRadialGradient(w / 2, h * 0.55, 0, w / 2, h * 0.55, Math.max(w, h) * 0.75);
    g.addColorStop(0, '#12385a');
    g.addColorStop(0.55, '#0a2340');
    g.addColorStop(1, '#040b17');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // faint lat/long grid like an old chart
    ctx.strokeStyle = 'rgba(160, 200, 230, 0.06)';
    ctx.lineWidth = 1;
    for (let x = (w % 90) / 2; x < w; x += 90) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = (h % 90) / 2; y < h; y += 90) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    // little wave glyphs
    ctx.strokeStyle = 'rgba(150, 210, 230, 0.16)';
    ctx.lineWidth = 1.3;
    for (const [a, b, c] of this.data.decor.wave) {
      const x = a * w, y = b * h, s = 6 + c * 8;
      ctx.beginPath();
      ctx.arc(x, y, s, Math.PI * 1.15, Math.PI * 1.85);
      ctx.arc(x + s * 1.6, y, s, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
    // island shadow + island
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.shadowColor = 'rgba(80, 220, 230, 0.35)';
    ctx.shadowBlur = 40;
    ctx.drawImage(this.data.img, this.ox, this.oy, this.S, this.S);
    ctx.restore();
    this.drawCompass(ctx, w - 70, h - 80, 46);
    this.drawSerpent(ctx);
    // vignette
    const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(2,4,12,0.75)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }

  drawCompass(ctx, x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = '#d9b45a';
    ctx.fillStyle = '#d9b45a';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const len = i % 2 ? r * 0.55 : r * 0.95;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * len, Math.sin(a) * len);
      ctx.lineTo(Math.cos(a + 0.35) * r * 0.16, Math.sin(a + 0.35) * r * 0.16);
      ctx.lineTo(Math.cos(a - 0.35) * r * 0.16, Math.sin(a - 0.35) * r * 0.16);
      ctx.closePath();
      i === 6 ? ctx.fill() : ctx.stroke();
    }
    ctx.font = '700 13px "Baloo 2", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', 0, -r - 6);
    ctx.restore();
  }

  drawSerpent(ctx) {
    // a mysterious sea creature lurking in the corner
    const { w, h } = this;
    const flip = this.data.decor.serpent;
    const x0 = flip ? w * 0.08 : w * 0.78, y0 = h * 0.82;
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = '#8fd3d9';
    ctx.fillStyle = '#8fd3d9';
    ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      const x = x0 + k * 26, y = y0;
      ctx.beginPath();
      ctx.arc(x, y, 10, Math.PI, 0);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x0 - 18, y0);
    ctx.quadraticCurveTo(x0 - 26, y0 - 22, x0 - 10, y0 - 26);
    ctx.quadraticCurveTo(x0 - 2, y0 - 22, x0 - 8, y0 - 18);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(x0 - 13, y0 - 22, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x0 + 70, y0);
    ctx.quadraticCurveTo(x0 + 82, y0 - 10, x0 + 90, y0 - 4);
    ctx.stroke();
    ctx.restore();
  }

  drawFx(dt) {
    const ctx = this.fx.getContext('2d');
    const { w, h, dpr, S, ox, oy } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const locs = this.data.locs.map((p) => this.toScreen(p));
    for (let i = 0; i < this.reveal.length; i++) {
      const target = (this.progress[TOPICS[i].id]?.done || 0) > 0 || this.hover === i ? 1 : 0;
      this.reveal[i] += (target - this.reveal[i]) * Math.min(1, dt * 3);
    }

    // journey path: dashed gold line, animated, brighter up to the next location
    const next = this.nextIndex();
    ctx.lineCap = 'round';
    for (let i = 0; i < locs.length - 1; i++) {
      const [x1, y1] = locs[i], [x2, y2] = locs[i + 1];
      const mx = (x1 + x2) / 2 + (y2 - y1) * 0.18, my = (y1 + y2) / 2 - (x2 - x1) * 0.18;
      const done = next < 0 || i < next;
      ctx.setLineDash([2, 9]);
      ctx.lineDashOffset = -this.t * 14;
      ctx.lineWidth = done ? 3.2 : 2.2;
      ctx.strokeStyle = done ? 'rgba(255, 210, 110, 0.95)' : 'rgba(255, 220, 160, 0.35)';
      ctx.shadowColor = done ? 'rgba(255, 190, 80, 0.8)' : 'transparent';
      ctx.shadowBlur = done ? 8 : 0;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(mx, my, x2, y2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // drifting fog banks over the island
    ctx.save();
    for (const b of this.fogBlobs) {
      b.x += b.s * dt * (b.p % 2 ? 1 : -1);
      if (b.x > 1.25) b.x = -0.25;
      if (b.x < -0.25) b.x = 1.25;
      const x = ox + b.x * S, y = oy + b.y * S + Math.sin(this.t * 0.2 + b.p) * 10, r = b.r * S;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(200, 215, 240, ${b.a})`);
      g.addColorStop(1, 'rgba(200, 215, 240, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // the unknown is veiled: extra mist on places you haven't visited
    locs.forEach(([x, y], i) => {
      const veil = (1 - this.reveal[i]) * 0.55;
      if (veil < 0.02) return;
      const r = S * 0.09;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(190, 205, 235, ${veil})`);
      g.addColorStop(1, 'rgba(190, 205, 235, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    });
    ctx.restore();

    // fireflies / drifting sparks
    for (const f of this.flies) {
      f.p += dt * f.s;
      const x = ox + ((f.x + Math.sin(f.p * 0.3) * 0.03) % 1) * S;
      const y = oy + ((f.y + Math.cos(f.p * 0.23) * 0.03 + 1) % 1) * S;
      const a = Math.max(0, Math.sin(f.p * 1.7)) * 0.9;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 6);
      g.addColorStop(0, `rgba(255, 230, 150, ${a})`);
      g.addColorStop(1, 'rgba(255, 230, 150, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 6, y - 6, 12, 12);
    }
  }
}
