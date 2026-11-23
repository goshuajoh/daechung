import type { GameDef, Shell } from '../lib/shell';
import type { Pen } from '../lib/pen';
import { sfx } from '../lib/audio';
import { BERRY, BUTTER, INK, LILAC, MINT, PEACH, PINK, SKY, WHITE } from '../lib/palette';
import { clamp, easeOutBack, pick, rand, randInt } from '../lib/rng';

interface Bean { x: number; y: number; r: number; c: string; seed: number; tilt: number; face: boolean }

const RANGES: [number, number, boolean][] = [
  [11, 22, false],
  [24, 42, false],
  [40, 66, true],
  [62, 98, false],
  [95, 150, true],
];
const FLASH = 5;
const COLORS = [PEACH, BUTTER, MINT, SKY, LILAC, PINK];
let thumbBeans: Bean[] | undefined;

/** Scatter n non-overlapping beans in normalised [0,1]² space (aspect-corrected later). */
function scatter(n: number, aspect: number, clumpy: boolean): Bean[] {
  const area = aspect; // width = aspect, height = 1
  const base = clamp(Math.sqrt((0.32 * area) / (n * Math.PI)) - 0.008, 0.012, 0.06);
  const centers = clumpy ? Array.from({ length: randInt(3, 5) }, () => [rand(0.15, aspect - 0.15), rand(0.15, 0.85)]) : [];
  const out: Bean[] = [];
  let tries = 0;
  let shrink = 1;
  while (out.length < n) {
    if (++tries % 4000 === 0) shrink *= 0.9;
    const r = base * rand(0.75, 1.2) * shrink;
    let x: number, y: number;
    if (clumpy && Math.random() < 0.7) {
      const [cx, cy] = pick(centers);
      x = cx + (Math.random() + Math.random() + Math.random() - 1.5) * 0.25;
      y = cy + (Math.random() + Math.random() + Math.random() - 1.5) * 0.3;
    } else {
      x = rand(r, aspect - r);
      y = rand(r, 1 - r);
    }
    if (x < r || x > aspect - r || y < r || y > 1 - r) continue;
    if (out.some((b) => Math.hypot(b.x - x, b.y - y) < b.r + r + 0.012)) continue;
    out.push({ x, y, r, c: pick(COLORS), seed: 500 + out.length, tilt: rand(-0.4, 0.4), face: Math.random() < 0.35 });
  }
  return out;
}

function drawBean(pen: Pen, b: Bean, x: number, y: number, r: number, alpha = 1) {
  pen.ellipse(x, y, r * 1.08, r * 0.92, { fill: b.c, width: Math.max(1.6, Math.min(2.6, r * 0.2)), seed: b.seed, alpha, rough: r * 0.06, shift: [r * 0.12, r * 0.12] }, b.tilt);
  if (b.face && r > 8) {
    const e = r * 0.12;
    pen.ellipse(x - r * 0.32, y - r * 0.05, e, e * 1.3, { fill: INK, stroke: null, shift: [0, 0], seed: b.seed + 1, alpha, rough: 0.1 });
    pen.ellipse(x + r * 0.32, y - r * 0.05, e, e * 1.3, { fill: INK, stroke: null, shift: [0, 0], seed: b.seed + 2, alpha, rough: 0.1 });
  }
}

export const dots: GameDef = {
  id: 'dots',
  name: 'Quick Count',
  kr: '몇 개?',
  blurb: 'A pile of beans flashes for 5 seconds. How many?',
  howto: "Beans will show up for <b>5 seconds</b>. Don't count one by one — just guess how many!",
  color: SKY,
  rounds: 5,
  ranks: [
    [460, 'Bean Counter (Pro)'],
    [400, 'Jellybean Jar Champion'],
    [320, 'Decent Ballpark'],
    [220, '“Like, a lot?”'],
    [0, 'Counted Two, Gave Up'],
  ],

  thumb(pen, w, h, t) {
    const beans = thumbBeans ??= scatter(16, 4 / 3, false);
    const pad = 12, s = Math.min((w - pad * 2) / (4 / 3), h - pad * 2);
    const ox = (w - s * (4 / 3)) / 2, oy = (h - s) / 2;
    const vis = (t % 4) / 4;
    beans.forEach((b, i) => {
      const k = clamp(vis * 3 - i * 0.05, 0, 1);
      const out = clamp((vis - 0.75) * 8, 0, 1);
      const r = b.r * s * easeOutBack(k) * (1 - out);
      if (r > 0.5) drawBean(pen, b, ox + b.x * s, oy + b.y * s, r);
    });
    if (vis > 0.82) pen.text('?', w / 2, h / 2, { size: h * 0.4, alpha: clamp((vis - 0.82) * 10, 0, 1) });
  },

  async play(g: Shell, round: number) {
    const [lo, hi, clumpy] = RANGES[round];
    const n = randInt(lo, hi);
    const stage = g.stage;
    const top = 62;
    const aspect = clamp((stage.w - 30) / Math.max(120, stage.h - top - 20), 0.5, 2.2);
    const beans = scatter(n, aspect, clumpy);
    let phase: 'ready' | 'show' | 'hide' | 'guess' | 'count' = 'ready';
    let phaseAt = 0;
    let counted = 0;

    const view = (w: number, h: number) => {
      const s = Math.min((w - 30) / aspect, h - top - 20);
      return { s, ox: (w - s * aspect) / 2, oy: top + (h - top - 20 - s) / 2 };
    };

    stage.draw = (pen, w, h, t) => {
      const { s, ox, oy } = view(w, h);
      const k = t - phaseAt;
      if (phase === 'ready') {
        pen.text('ready?', w / 2, h / 2, { size: 40, alpha: 0.5 + Math.sin(t * 4) * 0.2 });
        return;
      }
      if (phase === 'show') {
        const left = Math.max(0, FLASH - k);
        // timer ring
        const cx = w / 2, cy = 32, r = 18;
        pen.circle(cx, cy, r, { fill: WHITE, width: 2.5, seed: 400 });
        const frac = left / FLASH;
        const ctx = pen.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r - 4, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
        ctx.closePath();
        ctx.fillStyle = BERRY;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.restore();
        pen.text(String(Math.ceil(left)), cx + 34, cy + 1, { size: 26, align: 'left' });
        beans.forEach((b, i) => {
          const pop = easeOutBack(clamp((k - i * (0.35 / n)) / 0.25, 0, 1));
          drawBean(pen, b, ox + b.x * s, oy + b.y * s, b.r * s * pop);
        });
        return;
      }
      if (phase === 'hide') {
        const out = clamp(k / 0.3, 0, 1);
        beans.forEach((b) => drawBean(pen, b, ox + b.x * s, oy + b.y * s, b.r * s * (1 - out)));
        return;
      }
      if (phase === 'guess') return;
      // count-up reveal
      beans.forEach((b, i) => {
        if (i >= counted) return;
        drawBean(pen, b, ox + b.x * s, oy + b.y * s, b.r * s);
      });
      pen.text(String(counted), w / 2, 34, { size: 40, outline: WHITE });
    };

    g.say(`round ${round + 1}: somewhere between a few and a lot.`, 'idle');
    await g.button('show me');
    phase = 'show';
    phaseAt = stage.time;
    g.setMood('wow');
    sfx.pop();
    await g.wait(FLASH * 1000);
    phase = 'hide';
    phaseAt = stage.time;
    sfx.shh();
    g.setMood('focus');
    await g.wait(320);
    phase = 'guess';

    // ——— input ———
    const panel = document.createElement('div');
    panel.className = 'count-panel';
    panel.innerHTML = `
      <button class="btn" data-d="-1" aria-label="one less"><span>–</span></button>
      <label class="count-input"><input type="number" inputmode="numeric" min="0" max="999" placeholder="?" aria-label="how many beans" /></label>
      <button class="btn" data-d="1" aria-label="one more"><span>+</span></button>`;
    g.overlay.appendChild(panel);
    const input = panel.querySelector('input')!;
    g.say('how many beans were there?', 'focus');
    const confirm = g.confirmButton('that many!', false);
    const sync = () => (confirm.el.disabled = !(input.value.trim() !== '' && Number(input.value) >= 0));
    input.addEventListener('input', sync);
    panel.querySelectorAll<HTMLButtonElement>('[data-d]').forEach((b) =>
      b.addEventListener('click', () => {
        const base = input.value === '' ? Math.round((lo + hi) / 2) : Number(input.value);
        input.value = String(clamp(base + Number(b.dataset.d), 0, 999));
        sfx.click();
        sync();
      }),
    );
    if (matchMedia('(pointer: fine)').matches) setTimeout(() => input.focus(), 50);
    await confirm.pressed;
    const guess = Math.round(Number(input.value));
    panel.remove();

    // ——— reveal: count them back in ———
    phase = 'count';
    g.setMood('wow');
    g.say(`you said <b>${guess}</b>… let's count!`);
    const step = clamp(2200 / n, 14, 90);
    await g.until<void>((done) => {
      const id = setInterval(() => {
        counted++;
        sfx.blip(Math.floor((counted / n) * 30));
        if (counted >= n) {
          clearInterval(id);
          done();
        }
      }, step);
      return () => clearInterval(id);
    });
    await g.wait(400);
    const rel = Math.abs(guess - n) / n;
    const score = 100 * Math.pow(Math.max(0, 1 - rel / 0.5), 1.2);
    return {
      score,
      detail: guess === n ? `exactly <b>${n}</b>! did you count?!` : `there were <b>${n}</b> — you said ${guess} (${Math.round(rel * 100)}% off)`,
    };
  },
};

