import type { GameDef, Shell } from '../lib/shell';
import type { Pen, Pt } from '../lib/pen';
import { sfx } from '../lib/audio';
import { BUTTER, LEAF, WHITE } from '../lib/palette';
import { BODIES } from '../lib/hats';
import { drawKongi, type Mood } from '../lib/kongi';
import { clamp, easeInOut, easeOutBack, lerp, rand, random } from '../lib/rng';
import { drawHand, drawPill, drawPrompt, loop, span } from '../lib/hand';

/**
 * Seesaw — Kongis of different sizes sit on a plank. Slide the pivot to where it would balance.
 * A Kongi's weight goes with its area, so "twice as wide" is four times as heavy.
 */

interface Rider {
  /** position along the plank, 0 = left end, 1 = right end */
  x: number;
  /** weight (∝ area) */
  m: number;
  body: string;
}

const PLANK_COLOR = '#e8b77a';

/** Balance point along the plank (the plank itself weighs nothing). */
const balance = (rs: Rider[]) => rs.reduce((a, r) => a + r.m * r.x, 0) / rs.reduce((a, r) => a + r.m, 0);

/** Width of the biggest Kongi as a fraction of the plank (smaller when it's crowded). */
const sizeFor = (n: number) => (n >= 4 ? 0.19 : n === 3 ? 0.22 : 0.26);

function makeRiders(level: number): Rider[] {
  const colours = BODIES.map((b) => b.color);
  const n = level < 2 ? 2 : level < 4 ? 3 : 4;
  const S = sizeFor(n);
  for (let tries = 0; ; tries++) {
    const ms = level === 0 ? [1, rand(2, 3.2)] : level === 1 ? [1, rand(1.6, 3.4)] : Array.from({ length: n }, () => rand(0.5, 3));
    const big = Math.max(...ms);
    // a Kongi's width (arms included), as a fraction of the plank
    const wide = (m: number) => 1.16 * S * Math.sqrt(m / big);
    let rs: Rider[];
    if (level < 2) {
      const seat = (m: number, k: number) => lerp(0.5 * S * Math.sqrt(m / big), 1 - 0.5 * S * Math.sqrt(m / big), k);
      rs = [{ x: seat(ms[0], 0), m: ms[0], body: '' }, { x: seat(ms[1], level === 0 ? 1 : rand(0.62, 0.86)), m: ms[1], body: '' }];
    } else {
      // share the free plank out as random gaps between them: nobody can sit on anybody
      const ws = ms.map(wide);
      const free = Math.max(0, 1 - ws.reduce((a, b) => a + b, 0));
      const gaps = Array.from({ length: n + 1 }, (_, k) => rand(0.3, 1) * (k === 0 || k === n ? 0.5 : 1));
      const total = gaps.reduce((a, b) => a + b, 0);
      let x = 0;
      rs = ms.map((m, k) => {
        x += (gaps[k] / total) * free + ws[k] / 2;
        const r = { x, m, body: '' };
        x += ws[k] / 2;
        return r;
      });
    }
    if (random() < 0.5) rs.forEach((r) => (r.x = 1 - r.x));
    rs.sort((a, b) => a.x - b.x);
    const b = balance(rs);
    // the answer must be on the plank, and not just "the middle"
    if ((b > 0.14 && b < 0.86 && Math.abs(b - 0.5) > 0.07) || tries > 400) {
      rs.forEach((r, i) => (r.body = colours[(i * 2 + Math.floor(random() * 6)) % colours.length]));
      return rs;
    }
  }
}

interface Layout { x0: number; x1: number; y: number; ground: number; Wmax: number }
const layout = (w: number, h: number, n: number, top = 100): Layout => {
  const x0 = w * 0.07, x1 = w * 0.93;
  const ground = Math.min(h - 26, top + (h - top) * 0.82);
  const y = ground - Math.min(64, h * 0.16);
  const Wmax = Math.min((x1 - x0) * sizeFor(n), (y - top) * 0.95);
  return { x0, x1, y, ground, Wmax };
};

/** The seesaw, tilted by `ang` around the pivot at plank fraction `p`. */
function drawSeesaw(pen: Pen, L: Layout, rs: Rider[], p: number, ang: number, t: number, moods: (i: number) => Mood) {
  const ctx = pen.ctx;
  const px = lerp(L.x0, L.x1, p);
  // ground + pivot (the pivot doesn't tilt)
  pen.line(L.x0 - 20, L.ground, L.x1 + 20, L.ground, { width: 2.5, seed: 1700, alpha: 0.6 });
  pen.poly([[px, L.y + 6], [px + 26, L.ground], [px - 26, L.ground]], { fill: BUTTER, width: 3, seed: 1701 });
  const big = Math.max(...rs.map((r) => r.m));
  // the low end stops on the ground
  const arm = (ang > 0 ? 1 - p : p) * (L.x1 - L.x0);
  const maxA = Math.asin(Math.min(1, (L.ground - L.y - 4) / Math.max(1, arm)));
  ang = clamp(ang, -maxA, maxA);
  ctx.save();
  ctx.translate(px, L.y);
  ctx.rotate(ang);
  const len = L.x1 - L.x0;
  const lx = L.x0 - px;
  pen.rrect(lx, -8, len, 14, 6, { fill: PLANK_COLOR, width: 3, seed: 1702 });
  rs.forEach((r, i) => {
    const W = L.Wmax * Math.sqrt(r.m / big);
    drawKongi(pen, lx + r.x * len, -8, W, moods(i), t + i * 0.37, { body: r.body, hat: 'none', flip: r.x > p });
  });
  ctx.restore();
}

/** Wooden blocks holding the plank level until you lock in; k: 0 = in place, 1 = pulled away. */
function drawBlocks(pen: Pen, L: Layout, k: number) {
  if (k >= 1) return;
  const top = L.y + 7, hgt = L.ground - top;
  for (const dir of [-1, 1]) {
    const x = (dir < 0 ? L.x0 + 20 : L.x1 - 20) + dir * k * 50;
    pen.rrect(x - 11, top, 22, hgt, 3, { fill: '#c98f55', width: 2.5, seed: 1720 + dir, alpha: 1 - k });
    pen.line(x - 6, top + hgt * 0.4, x + 6, top + hgt * 0.4, { width: 1.8, seed: 1724 + dir, alpha: 0.5 * (1 - k) });
  }
}

/** How far the plank tips for a pivot at p (radians, + = right side down). */
function tiltFor(rs: Rider[], p: number) {
  const torque = rs.reduce((a, r) => a + r.m * (r.x - p), 0) / rs.reduce((a, r) => a + r.m, 0);
  return clamp(torque * 1.6, -0.3, 0.3);
}

const DEMO: Rider[] = [
  { x: 0.08, m: 1, body: '#fffdf7' },
  { x: 0.9, m: 2.6, body: '#d6f1df' },
];

export const seesaw: GameDef = {
  id: 'seesaw',
  name: 'Seesaw',
  kr: '시소',
  short: 'Seesaw',
  blurb: 'Slide the pivot so the Kongis balance. Bigger Kongis are heavier than they look.',
  howto: 'Slide the <b>triangle</b> under the plank to the spot where the seesaw would <b>balance</b>, then lock it in. A Kongi twice as wide weighs <b>four times</b> as much.',
  verb: 'balance the seesaw!',
  color: '#f6c48f',
  since: 3, // added during daily #2
  ranks: [
    [460, 'Perfectly Balanced'],
    [400, 'Physics Teacher'],
    [320, 'Playground Pro'],
    [220, 'A Bit Wobbly'],
    [0, 'Bonk!'],
  ],

  thumb(pen, w, h, t) {
    const L = layout(w, h, 2, 10);
    const b = balance(DEMO);
    const p = b + Math.sin(t * 1.3) * 0.06;
    drawSeesaw(pen, L, DEMO, p, tiltFor(DEMO, p) * 0.6, t, () => 'happy');
  },

  steps: ['bigger Kongis are <b>heavier</b>', 'drag the <b>triangle</b> to where it would balance', 'press <b>balance!</b> and watch'],

  demo(pen, w, h, t) {
    const k = loop(t, 5);
    const L = layout(w * 0.84, h * 0.86, 2, 30);
    const b = balance(DEMO);
    const p = k < 0.12 ? 0.5 : lerp(0.5, b, easeInOut(span(k, 0.12, 0.55)));
    const settled = k > 0.74;
    // the plank tips while the pivot is off, and levels out as it reaches the balance point
    drawSeesaw(pen, L, DEMO, p, k < 0.12 ? 0 : tiltFor(DEMO, p) * 0.7, t, () => (settled ? 'cheer' : 'idle'));
    const hx = lerp(L.x0, L.x1, p), hy = L.ground - 10;
    const pill: Pt = [w * 0.86, h * 0.88];
    const press = k > 0.66 && k < 0.72 ? 1 : 0;
    drawPill(pen, pill[0], pill[1], 'balance!', '#f6c48f', press);
    if (k < 0.58) drawHand(pen, hx, hy, { press: k > 0.1 ? 1 : 0, scale: 0.7 });
    else if (k < 0.78) {
      const mm = easeInOut(span(k, 0.58, 0.66));
      drawHand(pen, lerp(hx, pill[0], mm), lerp(hy, pill[1], mm), { press, ripple: span(k, 0.66, 0.78), scale: 0.7 });
    }
  },

  async play(g: Shell, level: number) {
    const rs = makeRiders(level);
    const answer = balance(rs);
    const stage = g.stage;
    let p = 0.5;
    let moved = false;
    let doneAt = 0;
    let finalAng = 0;
    const born = stage.time;

    g.say(
      g.tutorial
        ? 'drag the <b>triangle</b>. in this free try the plank tips as you go: make it <b>level</b>!'
        : 'drag the <b>triangle</b> to where it would balance (bigger = heavier). <b>balance!</b> pulls the blocks away.',
      'focus',
    );
    stage.draw = (pen, w, h, t) => {
      const L = layout(w, h, rs.length);
      drawPrompt(pen, w, 'balance?', 'where would it');
      let ang = 0;
      // blocks out first, then it tips
      if (doneAt) ang = finalAng * easeOutBack(clamp((t - doneAt - 0.3) / 0.7, 0, 1));
      else if (g.tutorial && moved) ang = tiltFor(rs, p) * 0.8;
      if (!g.tutorial) drawBlocks(pen, L, doneAt ? clamp((t - doneAt) / 0.3, 0, 1) : 0);
      const level = Math.abs(finalAng) < 0.02;
      drawSeesaw(pen, L, rs, p, ang, t, (i) => {
        if (!doneAt) return 'idle';
        if (level) return 'cheer';
        const low = (rs[i].x > p) === finalAng > 0;
        return low ? 'sad' : 'wow';
      });
      if (!moved && !doneAt && t - born > 1.2) {
        const hx = lerp(L.x0, L.x1, p) + Math.sin((t - born) * 2.2) * 30;
        drawHand(pen, hx, L.ground - 8, { press: 1, alpha: 0.8 });
      }
      if (doneAt) {
        // where it would have balanced
        const pop = easeOutBack(clamp((t - doneAt - 0.8) / 0.4, 0, 1));
        if (pop > 0 && !level) {
          const bx = lerp(L.x0, L.x1, answer);
          const right = bx > w * 0.7;
          pen.line(bx, L.ground + 2, bx, L.ground + 14, { width: 3, seed: 1710, stroke: LEAF });
          pen.star(bx, L.ground + 14, 8 * pop + 1, { fill: LEAF, width: 2, seed: 1711 }, 0);
          pen.text('balances here', bx + (right ? -14 : 14), L.ground + 15, { size: Math.max(1, 15 * pop), font: 'gaegu', align: right ? 'right' : 'left', outline: WHITE });
        }
      }
    };

    const canvas = stage.canvas;
    let dragging = false;
    let grab = 0;
    const toP = (e: PointerEvent) => {
      const L = layout(stage.w, stage.h, rs.length);
      return (stage.local(e)[0] - L.x0) / (L.x1 - L.x0);
    };
    const set = (np: number) => {
      const prev = p;
      p = clamp(np, 0.04, 0.96);
      if (Math.floor(prev * 40) !== Math.floor(p * 40)) sfx.click();
      moved = true;
      confirm.el.disabled = false;
    };
    const down = (e: PointerEvent) => {
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      // grab the triangle wherever you touch: it slides relative to the finger if you touch near it,
      // or jumps to the finger if you touch somewhere else
      const q = toP(e);
      grab = Math.abs(q - p) < 0.08 ? p - q : 0;
      set(q + grab);
    };
    const move = (e: PointerEvent) => dragging && set(toP(e) + grab);
    const up = () => (dragging = false);
    const key = (e: KeyboardEvent) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      set(p + d * (e.shiftKey ? 0.05 : 0.005));
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    window.addEventListener('keydown', key);
    const confirm = g.confirmButton('balance!', false);
    let timedOut = false;
    try {
      timedOut = await g.lockIn(confirm, 9);
    } finally {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', key);
    }
    const e = Math.abs(p - answer);
    finalAng = e < 0.012 ? 0 : tiltFor(rs, p);
    if (Math.abs(finalAng) < 0.09 && e >= 0.012) finalAng = Math.sign(finalAng || 1) * 0.09; // always visibly tip when off
    doneAt = stage.time;
    stage.boost(1400);
    if (finalAng === 0) sfx.ding();
    else window.setTimeout(() => sfx.thud(), 680);
    g.setMood(finalAng === 0 ? 'cheer' : 'wow');
    await g.wait(1500);
    if (timedOut && !moved) return { score: 0, detail: "time's up! the triangle never moved" };
    // shown level = full marks; from there it falls off smoothly
    const score = e < 0.012 ? 100 : 100 * Math.pow(Math.max(0, 1 - (e - 0.012) / 0.108), 1.2);
    const amount = e < 0.03 ? 'just a touch' : e < 0.07 ? 'a bit' : 'way';
    return {
      score,
      detail: e < 0.012 ? '<b>perfectly balanced!</b>' : `<b>${amount} too far ${p < answer ? 'left' : 'right'}</b> · the ${p < answer ? 'right' : 'left'} end went down. it balances at the star`,
    };
  },
};
