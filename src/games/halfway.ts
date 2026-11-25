import type { GameDef, Shell } from '../lib/shell';
import type { Pen, Pt } from '../lib/pen';
import { sfx } from '../lib/audio';
import { BERRY, BUTTER, INK, LIME, MINT, PEACH, WHITE } from '../lib/palette';
import { clamp, easeInOut, easeOutBack, lerp, rand, randInt, random } from '../lib/rng';
import { drawHand, drawPill, drawPrompt, loop, span } from '../lib/hand';

/** Halfway — tap the point exactly halfway along a squiggly road. Wiggles make one half look shorter. */

interface Road {
  /** dense polyline in normalised [0,1]² */
  pts: Pt[];
}

function catmull(ctrl: Pt[], per = 24): Pt[] {
  const out: Pt[] = [];
  const n = ctrl.length;
  const get = (i: number) => ctrl[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n - 1; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(ctrl[n - 1]);
  return out;
}

function makeRoad(level: number): Road {
  const n = 4 + Math.min(level, 3);
  const ctrl: Pt[] = [];
  // alternate high/low so even the easiest road is properly wavy
  const flip = random() < 0.5;
  for (let i = 0; i < n; i++) ctrl.push([i / (n - 1), (i % 2 === 0) !== flip ? rand(0.12, 0.38) : rand(0.62, 0.88)]);
  if (level >= 2) {
    // cram a tight squiggle into one stretch so that half is much longer than it looks
    const seg = randInt(0, n - 2);
    const a = ctrl[seg], b = ctrl[seg + 1];
    const extra: Pt[] = [];
    const k = level >= 3 ? 4 : 3;
    for (let j = 1; j < k; j++) {
      const f = j / k;
      extra.push([lerp(a[0], b[0], f), lerp(a[1], b[1], f) + (j % 2 ? 1 : -1) * (0.12 + level * 0.02)]);
    }
    ctrl.splice(seg + 1, 0, ...extra);
  }
  if (random() < 0.5) ctrl.forEach((p) => (p[0] = 1 - p[0]));
  return { pts: catmull(ctrl) };
}

/** Pixel polyline + cumulative lengths for the current layout. */
function measure(road: Road, box: { x: number; y: number; w: number; h: number }) {
  const px = road.pts.map(([x, y]) => [box.x + x * box.w, box.y + y * box.h] as Pt);
  const cum = [0];
  for (let i = 1; i < px.length; i++) cum.push(cum[i - 1] + Math.hypot(px[i][0] - px[i - 1][0], px[i][1] - px[i - 1][1]));
  return { px, cum, L: cum[cum.length - 1] };
}

/** Point at fraction s (by length) along the road. */
function at(m: ReturnType<typeof measure>, s: number): Pt {
  const target = s * m.L;
  let i = 1;
  while (i < m.cum.length - 1 && m.cum[i] < target) i++;
  const seg = m.cum[i] - m.cum[i - 1] || 1;
  const f = (target - m.cum[i - 1]) / seg;
  return [lerp(m.px[i - 1][0], m.px[i][0], f), lerp(m.px[i - 1][1], m.px[i][1], f)];
}

function drawRoad(pen: Pen, px: Pt[], from = 0, to = 1, color = WHITE) {
  const n = px.length;
  const a = Math.floor(from * (n - 1)), b = Math.ceil(to * (n - 1));
  const sub: Pt[] = [];
  for (let i = a; i <= b; i += 3) sub.push(px[i]);
  if (sub[sub.length - 1] !== px[b]) sub.push(px[b]);
  pen.curve(sub, { stroke: INK, width: 13, seed: 1600, rough: 0.5 });
  pen.curve(sub, { stroke: color, width: 7, seed: 1600, rough: 0.5 });
}

function drawPin(pen: Pen, p: Pt, color = BERRY) {
  pen.line(p[0], p[1], p[0], p[1] - 26, { width: 3, seed: 1610 });
  pen.circle(p[0], p[1] - 30, 9, { fill: color, seed: 1611, width: 2.5 });
}

function ends(pen: Pen, px: Pt[]) {
  const s = px[0], e = px[px.length - 1];
  pen.circle(s[0], s[1], 9, { fill: MINT, seed: 1620, width: 2.5 });
  pen.text('start', s[0], s[1] + 22, { size: 15, font: 'gaegu', outline: WHITE });
  pen.star(e[0], e[1], 11, { fill: PEACH, seed: 1621, width: 2.5 }, 0);
  pen.text('end', e[0], e[1] + 22, { size: 15, font: 'gaegu', outline: WHITE });
}

const DEMO: Road = { pts: catmull([[0, 0.7], [0.3, 0.2], [0.55, 0.8], [0.8, 0.25], [1, 0.55]]) };

export const halfway: GameDef = {
  id: 'halfway',
  name: 'Halfway',
  kr: '반',
  short: 'Halfway',
  blurb: 'Tap the exact middle of a squiggly road. The wiggles lie.',
  howto: 'Tap the spot that is <b>exactly halfway</b> along the road, from start to end. Drag to adjust, then lock it in.',
  verb: 'find the halfway point!',
  color: LIME,
  ranks: [
    [460, 'Human Odometer'],
    [400, 'Map Reader'],
    [320, 'Roughly Middle'],
    [220, '"Are We There Yet?"'],
    [0, 'Took the Scenic Route'],
  ],

  thumb(pen, w, h, t) {
    const m = measure(DEMO, { x: w * 0.1, y: h * 0.15, w: w * 0.8, h: h * 0.7 });
    drawRoad(pen, m.px);
    const k = (t % 3) / 3;
    if (k > 0.5) {
      drawRoad(pen, m.px, 0, 0.5, MINT);
      drawRoad(pen, m.px, 0.5, 1, PEACH);
    }
    ends(pen, m.px);
    drawPin(pen, at(m, 0.5));
  },

  steps: ['follow the road from <b>start</b> to <b>end</b>', 'tap the spot <b>halfway</b> along it', "drag to adjust, then press <b>that's halfway!</b>"],

  demo(pen, w, h, t) {
    const k = loop(t, 5);
    const m = measure(DEMO, { x: w * 0.08, y: h * 0.18, w: w * 0.68, h: h * 0.64 });
    drawRoad(pen, m.px);
    if (k > 0.78) {
      drawRoad(pen, m.px, 0, 0.5, MINT);
      drawRoad(pen, m.px, 0.5, 1, PEACH);
    }
    ends(pen, m.px);
    const s = k < 0.15 ? 0.2 : lerp(0.2, 0.5, easeInOut(span(k, 0.15, 0.55)));
    const p = at(m, s);
    if (k > 0.1) drawPin(pen, p);
    const pill: Pt = [w * 0.86, h * 0.84];
    const press = k > 0.68 && k < 0.74 ? 1 : 0;
    drawPill(pen, pill[0], pill[1], 'halfway!', LIME, press);
    if (k < 0.58) drawHand(pen, p[0], p[1], { press: k > 0.12 ? 1 : 0, scale: 0.7 });
    else if (k < 0.8) {
      const mm = easeInOut(span(k, 0.58, 0.68));
      drawHand(pen, lerp(p[0], pill[0], mm), lerp(p[1], pill[1], mm), { press, ripple: span(k, 0.68, 0.8), scale: 0.7 });
    }
  },

  async play(g: Shell, level: number) {
    const road = makeRoad(level);
    const stage = g.stage;
    let s: number | null = null; // fraction along the road the player picked
    let doneAt = 0;
    const born = stage.time;
    const box = (w: number, h: number) => ({ x: 34, y: 112, w: w - 68, h: Math.max(80, h - 170) });

    g.say(g.tutorial ? 'tap the road, then <b>drag</b> the pin. the % tells you how far along you are. aim for 50%!' : 'tap the spot <b>halfway</b> along the road, then lock it in.', 'focus');
    stage.draw = (pen, w, h, t) => {
      const m = measure(road, box(w, h));
      drawPrompt(pen, w, 'halfway?', 'tap the middle of the road');
      if (doneAt) {
        drawRoad(pen, m.px, 0, 0.5, MINT);
        drawRoad(pen, m.px, 0.5, 1, PEACH);
      } else drawRoad(pen, m.px);
      ends(pen, m.px);
      if (s != null) {
        const p = at(m, s);
        drawPin(pen, p);
        if (g.tutorial && !doneAt) pen.text(`${Math.round(s * 100)}%`, p[0] + 16, p[1] - 30, { size: 22, color: BERRY, align: 'left', outline: WHITE });
      } else if (t - born > 1.4) {
        const p = at(m, 0.03 + Math.abs(Math.sin((t - born) * 1.5)) * 0.04); // near the start, not near the answer
        drawHand(pen, p[0], p[1], { press: 1, alpha: 0.8 });
      }
      if (doneAt) {
        const pop = easeOutBack(clamp((t - doneAt) / 0.4, 0, 1));
        const mid = at(m, 0.5);
        pen.star(mid[0], mid[1], 12 * pop + 1, { fill: BUTTER, seed: 1630, width: 2.5 }, 0);
        if (s != null) {
          const p = at(m, s);
          pen.text(`you: ${Math.round(s * 100)}%`, p[0], p[1] - 52, { size: Math.max(1, 20 * pop), outline: WHITE });
        }
      }
    };

    const canvas = stage.canvas;
    let dragging = false;
    const pick = (e: PointerEvent) => {
      const m = measure(road, box(stage.w, stage.h));
      const [qx, qy] = stage.local(e);
      let best = 0, bd = Infinity;
      for (let i = 0; i < m.px.length; i++) {
        const d = (m.px[i][0] - qx) ** 2 + (m.px[i][1] - qy) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      const prev = s;
      s = m.cum[best] / m.L;
      if (prev == null || Math.floor(prev * 40) !== Math.floor(s * 40)) sfx.click();
      confirm.el.disabled = false;
    };
    const down = (e: PointerEvent) => {
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      pick(e);
    };
    const move = (e: PointerEvent) => dragging && pick(e);
    const up = () => (dragging = false);
    const key = (e: KeyboardEvent) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      s = clamp((s ?? 0) + d * (e.shiftKey ? 0.05 : 0.005), 0, 1);
      confirm.el.disabled = false;
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    window.addEventListener('keydown', key);
    const confirm = g.confirmButton("that's halfway!", false);
    try {
      await g.lockIn(confirm, 9);
    } finally {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', key);
    }
    doneAt = stage.time;
    g.setMood('wow');
    sfx.whoosh(0.3);
    await g.wait(1200);
    if (s == null) return { score: 0, detail: 'too slow! no pin on the road' };
    const e = Math.abs(s - 0.5);
    const score = 100 * Math.pow(Math.max(0, 1 - e / 0.15), 1.2);
    return { score, detail: e < 0.005 ? 'dead in the middle!' : `your pin was at <b>${Math.round(s * 100)}%</b> of the way` };
  },
};

