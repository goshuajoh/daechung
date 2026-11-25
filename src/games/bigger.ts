import type { GameDef, Shell } from '../lib/shell';
import type { Pen, Pt } from '../lib/pen';
import { sfx } from '../lib/audio';
import { BERRY, BUTTER, INK, LILAC, MINT, PEACH, PINK, SKY, WHITE } from '../lib/palette';
import { clamp, easeOutBack, rand, random, shuffle } from '../lib/rng';
import { drawHand, drawPrompt, loop, span } from '../lib/hand';

/** Bigger? — quick-fire: which shape has more area? Different shapes make it sneaky. */

type Kind = 'circle' | 'square' | 'triangle' | 'star' | 'blob';
const KINDS: Kind[] = ['circle', 'square', 'triangle', 'star', 'blob'];
/** Area ratio between the two shapes, by level. */
const RATIO = [1.32, 1.24, 1.17, 1.12, 1.08];
const PAIRS = 6;
const COLORS = [PEACH, SKY, MINT, LILAC, PINK, BUTTER];

/** Unit polygon (area 1) for each kind, plus its farthest point from the centre. */
function unit(kind: Kind, seed: number): { pts: Pt[]; reach: number } {
  let pts: Pt[] = [];
  if (kind === 'circle') for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; pts.push([Math.cos(a), Math.sin(a)]); }
  else if (kind === 'square') pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  else if (kind === 'triangle') for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + (i / 3) * Math.PI * 2; pts.push([Math.cos(a), Math.sin(a) + 0.2]); }
  else if (kind === 'star') for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 0.48 : 1; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
  else for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2, r = 0.75 + (((seed * 7 + i * 13) % 10) / 10) * 0.45; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
  // shoelace area → normalise to 1
  let A = 0;
  for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; A += x1 * y2 - x2 * y1; }
  const k = 1 / Math.sqrt(Math.abs(A) / 2);
  pts = pts.map(([x, y]) => [x * k, y * k]);
  return { pts, reach: Math.max(...pts.map(([x, y]) => Math.hypot(x, y))) };
}

interface Side { kind: Kind; color: string; area: number; rot: number; shape: { pts: Pt[]; reach: number } }
interface Pair { a: Side; b: Side; bigger: 0 | 1 }

function makePair(ratio: number, seed: number): Pair {
  const kinds = shuffle([...KINDS]).slice(0, 2) as [Kind, Kind];
  const cols = shuffle([...COLORS]);
  const bigger: 0 | 1 = random() < 0.5 ? 0 : 1;
  const side = (i: 0 | 1): Side => {
    const kind = kinds[i];
    return { kind, color: cols[i], area: i === bigger ? ratio : 1, rot: kind === 'circle' ? 0 : rand(-0.5, 0.5), shape: unit(kind, seed + i) };
  };
  return { a: side(0), b: side(1), bigger };
}

function drawSide(pen: Pen, s: Side, cx: number, cy: number, scale: number, seed: number, pop = 1) {
  const k = Math.sqrt(s.area) * scale * pop;
  const c = Math.cos(s.rot), sn = Math.sin(s.rot);
  if (s.kind === 'circle') pen.circle(cx, cy, k, { fill: s.color, seed, width: 3 });
  else {
    const pts = s.shape.pts.map(([x, y]) => [cx + (x * c - y * sn) * k, cy + (x * sn + y * c) * k] as Pt);
    if (s.kind === 'blob') pen.blob(pts, { fill: s.color, seed, width: 3 });
    else pen.poly(pts, { fill: s.color, seed, width: 3, rough: 0.8 });
  }
}

function drawCheck(pen: Pen, x: number, y: number, ok: boolean, size = 18) {
  if (ok) pen.curve([[x - size, y], [x - size * 0.3, y + size * 0.7], [x + size, y - size * 0.8]], { stroke: INK, width: 5, seed: 1700 });
  else {
    pen.line(x - size * 0.8, y - size * 0.8, x + size * 0.8, y + size * 0.8, { stroke: BERRY, width: 5, seed: 1701 });
    pen.line(x + size * 0.8, y - size * 0.8, x - size * 0.8, y + size * 0.8, { stroke: BERRY, width: 5, seed: 1702 });
  }
}

const DEMO_PAIR: Pair = {
  a: { kind: 'star', color: PEACH, area: 1, rot: 0, shape: unit('star', 1) },
  b: { kind: 'square', color: SKY, area: 1.3, rot: 0.3, shape: unit('square', 2) },
  bigger: 1,
};

export const bigger: GameDef = {
  id: 'bigger',
  name: 'Bigger?',
  kr: '더 큰 거',
  blurb: 'Six quick ones: which shape has more area? Stars are liars.',
  howto: 'Two shapes pop up. <b>Tap the one with more area</b> (more paint to colour it in). Six in a row, quick!',
  verb: 'tap the bigger one!',
  color: PINK,
  ranks: [
    [470, 'Area Oracle'],
    [400, 'Pizza Slice Expert'],
    [320, 'Decent Judge'],
    [220, 'Fooled by Stars'],
    [0, 'Everything Looks Same'],
  ],

  thumb(pen, w, h, t) {
    const s = Math.min(w, h) * 0.2;
    const k = (t % 2) / 2;
    drawSide(pen, DEMO_PAIR.a, w * 0.3, h * 0.55, s, 1);
    drawSide(pen, DEMO_PAIR.b, w * 0.7, h * 0.55, s, 2, k > 0.5 ? 1 + Math.sin((k - 0.5) * Math.PI * 4) * 0.04 : 1);
    pen.text('?', w / 2, h * 0.55, { size: Math.min(34, h * 0.2), alpha: 0.6 });
  },

  steps: ['two shapes pop up', 'tap the one with <b>more area</b>', 'six in a row, as fast as you can'],

  demo(pen, w, h, t) {
    const k = loop(t, 3.6);
    const s = Math.min(w * 0.13, h * 0.24);
    const ax = w * 0.3, bx = w * 0.7, y = h * 0.55;
    drawSide(pen, DEMO_PAIR.a, ax, y, s, 1);
    drawSide(pen, DEMO_PAIR.b, bx, y, s, 2, k > 0.5 && k < 0.7 ? 1.08 : 1);
    pen.text('which has more area?', w / 2, h * 0.12, { size: 17, font: 'gaegu' });
    if (k > 0.52) {
      drawCheck(pen, bx, y - s * 1.5, true, 12);
      pen.text('30% bigger!', bx, y + s * 1.6, { size: 15, color: BERRY });
    }
    if (k < 0.7) {
      const m = span(k, 0.1, 0.42);
      drawHand(pen, w * (1 - m * 0.3), h * (1.1 - m * 0.55), { press: k > 0.42 && k < 0.52 ? 1 : 0, ripple: span(k, 0.45, 0.6), scale: 0.7 });
    }
  },

  async play(g: Shell, level: number) {
    const count = g.tutorial ? 3 : PAIRS;
    const ratio = g.tutorial ? 1.5 : RATIO[level];
    const pairs = Array.from({ length: count }, (_, i) => makePair(ratio, i * 31 + level));
    const stage = g.stage;
    let i = 0;
    let shownAt = stage.time;
    const results: boolean[] = [];
    let feedback: { at: number; ok: boolean; picked: 0 | 1 } | null = null;

    const layout = (w: number, h: number) => {
      const scale = Math.min(w * 0.13, (h - 150) * 0.2);
      return { ax: w * 0.27, bx: w * 0.73, y: 110 + (h - 130) / 2, scale };
    };

    g.say(g.tutorial ? 'tap the shape that would need <b>more paint</b> to colour in. these ones are easy!' : 'tap the <b>bigger</b> one (more area). go go go!', 'focus');
    stage.draw = (pen, w, h, t) => {
      const { ax, bx, y, scale } = layout(w, h);
      drawPrompt(pen, w, 'bigger?', 'tap the one with more area');
      // progress dots
      for (let k = 0; k < count; k++) {
        const x = w / 2 + (k - (count - 1) / 2) * 22;
        const r = results[k];
        pen.circle(x, 102, 6, { fill: r == null ? null : r ? MINT : BERRY, width: 2, seed: 1710 + k });
      }
      const p = pairs[Math.min(i, count - 1)];
      if (!p) return;
      const pop = easeOutBack(clamp((t - shownAt) / 0.25, 0, 1));
      const fb = feedback && t - feedback.at < 0.55 ? feedback : null;
      const reach = Math.max(p.a.shape.reach * Math.sqrt(p.a.area), p.b.shape.reach * Math.sqrt(p.b.area));
      const sc = Math.min(scale, (w * 0.22) / reach, ((h - 150) * 0.34) / reach);
      drawSide(pen, p.a, ax, y, sc, 1720 + i * 2, pop * (fb && fb.picked === 0 ? 1.06 : 1));
      drawSide(pen, p.b, bx, y, sc, 1721 + i * 2, pop * (fb && fb.picked === 1 ? 1.06 : 1));
      if (fb) {
        drawCheck(pen, fb.picked === 0 ? ax : bx, y - sc * 1.7, fb.ok);
        const big = p.bigger === 0 ? ax : bx;
        pen.text(`${Math.round((ratio - 1) * 100)}% bigger`, big, y + sc * 1.8, { size: 18, color: BERRY, outline: WHITE });
      }
      if (!results.length && !feedback && t - shownAt > 2.2) drawHand(pen, (ax + bx) / 2 + Math.sin(t * 2) * w * 0.2, y + sc * 1.4, { press: 1, alpha: 0.7 });
    };

    const canvas = stage.canvas;
    let busy = false;
    const choose = (side: 0 | 1) => {
      if (busy || i >= count) return;
      const p = pairs[i];
      const ok = side === p.bigger;
      results.push(ok);
      feedback = { at: stage.time, ok, picked: side };
      if (ok) sfx.tone(700 + results.filter(Boolean).length * 60, 0.12, { type: 'triangle', vol: 0.18 });
      else sfx.boop();
      g.bop = 1;
      busy = true;
      setTimeout(() => {
        busy = false;
        i++;
        shownAt = stage.time;
        feedback = null;
        if (i >= count) finish?.();
      }, 560);
    };
    let finish: (() => void) | null = null;
    const down = (e: PointerEvent) => {
      const [x] = stage.local(e);
      choose(x < stage.w / 2 ? 0 : 1);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') choose(0);
      else if (e.key === 'ArrowRight') choose(1);
      else return;
      e.preventDefault();
    };
    canvas.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key);
    let timedOut = false;
    try {
      timedOut = await Promise.race([
        g.until<boolean>((done) => {
          finish = () => done(false);
        }),
        g.clock(count * 2.2).then(() => true),
      ]);
    } finally {
      g.stopClock();
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key);
    }
    await g.wait(300);
    const right = results.filter(Boolean).length;
    g.setMood(right >= count - 1 ? 'cheer' : right >= count / 2 ? 'happy' : 'sad');
    const score = (right / count) * 100;
    return {
      score,
      detail: timedOut && results.length < count ? `time's up! <b>${right}/${count}</b> right` : right === count ? `<b>all ${count}</b> right!` : `<b>${right}/${count}</b> right (they were only ${Math.round((ratio - 1) * 100)}% apart!)`,
    };
  },
};

