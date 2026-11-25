import type { GameDef, Shell } from '../lib/shell';
import type { Pen, Pt } from '../lib/pen';
import { sfx } from '../lib/audio';
import { BERRY, INK, LIME, WHITE } from '../lib/palette';
import { clamp, easeInOut, easeOutBack, lerp, pick, rand } from '../lib/rng';
import { drawHand, loop, span } from '../lib/hand';

type Kind = 'circle' | 'square' | 'hexagon' | 'ellipse' | 'arc';
interface Shape { kind: Kind; rot: number; arc: number; aspect: number; cx: number; cy: number; size: number }

const LEVELS: Kind[][] = [['circle'], ['square', 'hexagon'], ['ellipse', 'hexagon'], ['arc'], ['arc']];
const ARC = [1, 1, 1, 0.55, 0.36];

function drawShape(pen: Pen, s: Shape, cx: number, cy: number, R: number) {
  const fill = { fill: LIME, seed: 1, width: 3.2 };
  switch (s.kind) {
    case 'circle':
      return pen.circle(cx, cy, R, fill);
    case 'ellipse':
      return pen.ellipse(cx, cy, R, R * s.aspect, fill, s.rot);
    case 'square':
    case 'hexagon': {
      const n = s.kind === 'square' ? 4 : 6;
      const pts: Pt[] = [];
      for (let i = 0; i < n; i++) {
        const a = s.rot + (i / n) * Math.PI * 2;
        pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
      }
      return pen.poly(pts, fill);
    }
    case 'arc': {
      const pts: Pt[] = [];
      const span = s.arc * Math.PI * 2;
      for (let i = 0; i <= 24; i++) {
        const a = s.rot + (i / 24) * span;
        pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
      }
      pen.curve(pts, { width: 9, stroke: INK, seed: 2, rough: 0.4 });
      pen.curve(pts, { width: 4, stroke: LIME, seed: 2, rough: 0.4 });
    }
  }
}

export const center: GameDef = {
  id: 'center',
  name: 'Dead Center',
  kr: '중심',
  blurb: "Tap the exact center. Easy, right? Wait till it's only half a circle.",
  howto: 'Tap the <b>exact center</b> of the shape. Later ones only show a piece of it!',
  verb: 'tap the center!',
  color: LIME,
  ranks: [
    [460, 'Bullseye Machine'],
    [400, 'Sharp Shooter'],
    [320, 'Pretty Central'],
    [220, 'Off-Center Energy'],
    [0, 'Somewhere in There'],
  ],

  thumb(pen, w, h, t) {
    const R = Math.min(w, h) * 0.34;
    const cx = w / 2, cy = h * 0.55;
    const s: Shape = { kind: 'arc', rot: 2.4 + Math.sin(t * 0.5) * 0.2, arc: 0.5, aspect: 1, cx: 0, cy: 0, size: 0 };
    drawShape(pen, s, cx, cy, R);
    const k = (t % 2.5) / 2.5;
    if (k > 0.4) {
      pen.line(cx - 9, cy - 9, cx + 9, cy + 9, { stroke: BERRY, width: 3, seed: 5 });
      pen.line(cx + 9, cy - 9, cx - 9, cy + 9, { stroke: BERRY, width: 3, seed: 6 });
    }
    pen.text('?', cx, cy, { size: R * 0.5, alpha: k > 0.4 ? 0 : 0.5 });
  },

  steps: ['look at the shape', 'tap its <b>exact middle</b>, just once', 'later only part of the circle shows!'],

  demo(pen, w, h, t) {
    const k = loop(t, 4);
    const R = Math.min(w, h) * 0.36;
    const cx = w * 0.45, cy = h * 0.52;
    drawShape(pen, { kind: 'circle', rot: 0, arc: 1, aspect: 1, cx: 0, cy: 0, size: 0 }, cx, cy, R);
    if (k > 0.5) {
      pen.star(cx, cy, 10 * easeOutBack(span(k, 0.5, 0.6)) + 1, { fill: BERRY, seed: 4, width: 2 }, 0);
      pen.text('dead center!', cx, cy - R - 14, { size: 18, color: BERRY, outline: WHITE });
    }
    if (k < 0.66) {
      const m = easeInOut(span(k, 0.08, 0.4));
      drawHand(pen, lerp(w * 1.05, cx, m), lerp(h * 1.2, cy, m), { press: k > 0.42 && k < 0.5 ? 1 : 0, ripple: span(k, 0.45, 0.62), scale: 0.75 });
    }
  },

  async play(g: Shell, level: number) {
    const kind = pick(LEVELS[level]);
    const shape: Shape = {
      kind,
      rot: rand(0, Math.PI * 2),
      arc: ARC[level],
      aspect: rand(0.55, 0.75),
      cx: rand(0.35, 0.65),
      cy: rand(0.42, 0.62),
      size: rand(0.24, 0.36),
    };
    /** Tap position relative to the shape (in radii), so a layout change can't move it. */
    let guess: Pt | null = null;
    let doneAt = 0;

    const layout = (w: number, h: number) => {
      const R = Math.min(w, h - 60) * shape.size;
      // keep full shapes on screen; arcs may have their (invisible) center anywhere sensible
      const cx = clamp(w * shape.cx, R + 16, w - R - 16);
      const cy = clamp(60 + (h - 60) * shape.cy, 60 + R + 10, h - R - 16);
      return { cx, cy, R };
    };

    const born = g.stage.time;
    if (g.tutorial) g.say('tap the <b>exact middle</b> of the circle. one tap, no take-backs!', 'focus');
    else g.say(kind === 'arc' ? 'only a piece this time. where is its <b>center</b>?' : 'tap the <b>exact center</b>!', 'focus');
    const stage = g.stage;
    stage.draw = (pen, w, h, t) => {
      const { cx, cy, R } = layout(w, h);
      drawShape(pen, shape, cx, cy, R);
      // training wheels: after a moment, show where "middle" lines cross
      if (g.tutorial && !doneAt && t - born > 2.5) {
        const a = Math.min(1, (t - born - 2.5) * 2) * 0.35;
        pen.line(cx - R, cy, cx + R, cy, { stroke: INK, width: 2, dash: [6, 7], alpha: a, seed: 8 });
        pen.line(cx, cy - R, cx, cy + R, { stroke: INK, width: 2, dash: [6, 7], alpha: a, seed: 9 });
      }
      if (!doneAt) return;
      const pop = easeOutBack(clamp((t - doneAt) / 0.4, 0, 1));
      if (kind === 'arc') pen.circle(cx, cy, R, { stroke: INK, width: 2, dash: [6, 8], alpha: 0.3, seed: 3 });
      pen.star(cx, cy, 11 * pop + 1, { fill: BERRY, seed: 4, width: 2 }, 0);
      if (guess) {
        const [gx, gy] = [cx + guess[0] * R, cy + guess[1] * R];
        pen.line(gx, gy, cx, cy, { stroke: BERRY, width: 2, dash: [4, 5], seed: 7 });
        pen.line(gx - 8, gy - 8, gx + 8, gy + 8, { width: 3.4, seed: 5 });
        pen.line(gx + 8, gy - 8, gx - 8, gy + 8, { width: 3.4, seed: 6 });
        const d = Math.hypot(gx - cx, gy - cy);
        pen.text(`${Math.round(d)}px`, (gx + cx) / 2 + 18, (gy + cy) / 2 - 16, { size: Math.max(1, 20 * pop), outline: WHITE });
      }
    };

    const canvas = stage.canvas;
    let tapped: (() => void) | null = null;
    const up = (e: PointerEvent) => {
      if (doneAt) return;
      const [px, py] = stage.local(e);
      const { cx, cy, R } = layout(stage.w, stage.h);
      guess = [(px - cx) / R, (py - cy) / R];
      sfx.click();
      tapped?.();
    };
    canvas.addEventListener('pointerup', up);
    let timedOut = false;
    try {
      timedOut = await Promise.race([
        g.until<boolean>((done) => {
          tapped = () => done(false);
        }),
        g.clock(6).then(() => true),
      ]);
    } finally {
      g.stopClock();
      canvas.removeEventListener('pointerup', up);
    }
    doneAt = stage.time;
    g.setMood('wow');
    sfx.whoosh(0.25);
    await g.wait(1100);
    if (timedOut || !guess) return { score: 0, detail: 'too slow! no tap' };
    const { R } = layout(stage.w, stage.h);
    const g0 = guess as Pt;
    const e = Math.hypot(g0[0], g0[1]);
    const d = e * R;
    const score = 100 * Math.pow(Math.max(0, 1 - e / 0.25), 1.3);
    return { score, detail: d < 2 ? 'pixel perfect!!' : `off by <b>${Math.round(d)}px</b> (${(e * 100).toFixed(1)}% of the radius)` };
  },
};
