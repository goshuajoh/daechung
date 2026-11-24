import type { GameDef, Shell } from '../lib/shell';
import type { Pen, Pt } from '../lib/pen';
import { sfx } from '../lib/audio';
import { BERRY, BUTTER, INK, PEACH, WHITE } from '../lib/palette';
import { clamp, easeOutBack, easeOutCubic, rand, randInt } from '../lib/rng';

const D2R = Math.PI / 180;
/** Screen direction for a math-style (counter-clockwise, y-up) angle in degrees. */
const dir = (deg: number): Pt => [Math.cos(deg * D2R), -Math.sin(deg * D2R)];

function pickTarget(): number {
  for (;;) {
    const a = randInt(9, 171);
    if ([45, 90, 135].every((k) => Math.abs(a - k) > 4)) return a;
  }
}

/** Draws the two rays + wedge. `base` = baseline direction, `open` = angle from it (deg). */
function drawAngle(pen: Pen, v: Pt, L: number, base: number, open: number, o: { handle?: number; wedge?: string; seed?: number } = {}) {
  const [bx, by] = dir(base);
  const [ax, ay] = dir(base + open);
  const r = L * 0.3;
  // wedge
  if (open > 0.5) {
    const pts: Pt[] = [[v[0], v[1]]];
    const steps = Math.max(3, Math.ceil(open / 8));
    for (let i = 0; i <= steps; i++) {
      const [dx, dy] = dir(base + (open * i) / steps);
      pts.push([v[0] + dx * r, v[1] + dy * r]);
    }
    pen.poly(pts, { fill: o.wedge ?? BUTTER, stroke: null, shift: [0, 0], seed: 11 });
    pen.curve(pts.slice(1), { width: 2.5, seed: 12 });
  }
  pen.line(v[0], v[1], v[0] + bx * L, v[1] + by * L, { width: 4, seed: 13 });
  pen.line(v[0], v[1], v[0] + ax * L, v[1] + ay * L, { width: 4, seed: 14 });
  pen.circle(v[0] + bx * L, v[1] + by * L, 6, { fill: INK, seed: 15, shift: [0, 0] });
  const hr = 13 * (o.handle ?? 1);
  pen.circle(v[0] + ax * L, v[1] + ay * L, hr, { fill: PEACH, seed: 16 });
  pen.circle(v[0], v[1], 7, { fill: WHITE, seed: 17 });
}

export const angle: GameDef = {
  id: 'angle',
  name: 'Angle Eye',
  kr: '각도',
  blurb: 'Drag the arm to the angle. No protractor allowed.',
  howto: "I'll say an angle, you <b>drag the arm</b> to make it. No peeking at numbers while you aim!",
  color: BUTTER,
  verb: 'make the angle!',
  ranks: [
    [470, 'Human Protractor'],
    [420, 'Geometry Gremlin'],
    [340, 'Pretty Pointy'],
    [240, 'Wobbly Compass'],
    [0, 'Angles? Never met them'],
  ],

  thumb(pen, w, h, t) {
    const L = Math.min(w * 0.5, h * 0.66);
    const v: Pt = [w * 0.36, h * 0.84];
    const open = 50 + Math.sin(t * 1.3) * 26;
    drawAngle(pen, v, L, 0, open, { handle: 0.8 });
    pen.text('73°', w * 0.18, h * 0.2, { size: Math.min(34, h * 0.2) });
  },

  async play(g: Shell, level: number) {
    const target = pickTarget();
    const base = level < 2 ? 0 : rand(0, 360);
    let open = level === 4 ? 180 : 0; // last round starts fully open, just to mess with you
    let touched = false;
    let dragging = false;
    let revealAt = 0;
    let guess = 0;

    const layout = (w: number, h: number) => {
      // Fit the half-disc the arm can sweep inside the stage (below the big label).
      const top = 96, pad = 30;
      const pts: Pt[] = [[0, 0]];
      for (let a = 0; a <= 180; a += 10) pts.push(dir(base + a));
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const L = Math.min((w - pad * 2) / (maxX - minX), (h - top - pad) / (maxY - minY), 300);
      const cx = w / 2 - ((minX + maxX) / 2) * L;
      const cy = top + (h - top) / 2 - ((minY + maxY) / 2) * L;
      return { v: [cx, cy] as Pt, L };
    };

    g.say(`make a <b>${target}°</b> angle — drag the arm!`, 'focus');
    const stage = g.stage;

    stage.draw = (pen, w, h, t) => {
      const { v, L } = layout(w, h);
      pen.text(`${target}°`, w / 2, 40, { size: 46 });
      if (!revealAt) {
        drawAngle(pen, v, L, base, open, { handle: dragging ? 1.35 : 1 + Math.sin(t * 5) * 0.08 });
        if (!touched) {
          const [ax, ay] = dir(base + open + 18);
          pen.text('drag me', v[0] + ax * L * 0.85, v[1] + ay * L * 0.85, { size: 20, font: 'gaegu', alpha: 0.6 + Math.sin(t * 4) * 0.3 });
        }
        return;
      }
      const k = clamp((t - revealAt) / 0.9, 0, 1);
      drawAngle(pen, v, L, base, guess, { handle: 1 });
      // the real one sweeps in
      const shown = easeOutCubic(k) * target;
      const [tx, ty] = dir(base + shown);
      pen.line(v[0], v[1], v[0] + tx * L * 1.04, v[1] + ty * L * 1.04, { stroke: BERRY, width: 4, dash: [10, 9], seed: 30 });
      if (k >= 1) {
        // gap between guess and target
        const lo = Math.min(guess, target), hi = Math.max(guess, target);
        const r = L * 0.62;
        const arc: Pt[] = [];
        for (let i = 0; i <= 12; i++) {
          const [dx, dy] = dir(base + lo + ((hi - lo) * i) / 12);
          arc.push([v[0] + dx * r, v[1] + dy * r]);
        }
        if (hi - lo >= 1) pen.curve(arc, { stroke: BERRY, width: 3, seed: 31 });
        const pop = easeOutBack(clamp((t - revealAt - 0.9) / 0.35, 0, 1));
        const lab = (deg: number, text: string, color: string) => {
          const [dx, dy] = dir(base + deg);
          pen.text(text, v[0] + dx * (L + 34), v[1] + dy * (L + 30), { size: Math.max(1, 22 * pop), color, outline: WHITE });
        };
        const apart = Math.abs(guess - target) > 9;
        lab(target + (apart ? 0 : guess > target ? -5 : 5), `${target}°`, BERRY);
        lab(guess + (apart ? 0 : guess > target ? 5 : -5), `you ${guess}°`, INK);
      }
    };

    const canvas = stage.canvas;
    const aim = (e: PointerEvent) => {
      const { v } = layout(stage.w, stage.h);
      const [px, py] = stage.local(e);
      let a = Math.atan2(-(py - v[1]), px - v[0]) / D2R - base;
      a = ((a % 360) + 540) % 360 - 180; // -180..180 relative to baseline
      if (a < 0) a = a < -90 ? 180 : 0;
      const prev = open;
      open = clamp(a, 0, 180);
      if (Math.floor(prev / 6) !== Math.floor(open / 6)) sfx.click();
      g.look = [Math.cos((base + open) * D2R) * 0.8, -Math.sin((base + open) * D2R) * 0.6];
    };
    const down = (e: PointerEvent) => {
      if (revealAt) return;
      dragging = true;
      touched = true;
      canvas.setPointerCapture(e.pointerId);
      aim(e);
      confirm.el.disabled = false;
    };
    const move = (e: PointerEvent) => dragging && aim(e);
    const up = () => (dragging = false);
    const key = (e: KeyboardEvent) => {
      const d = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? -1 : 0;
      if (!d || revealAt) return;
      e.preventDefault();
      open = clamp(Math.round(open) + d * (e.shiftKey ? 10 : 1), 0, 180);
      touched = true;
      confirm.el.disabled = false;
      sfx.click();
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    window.addEventListener('keydown', key);

    const confirm = g.confirmButton('lock it in', false);
    try {
      await g.lockIn(confirm, 8);
    } finally {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', key);
    }

    guess = Math.round(open);
    revealAt = stage.time;
    g.look = undefined;
    sfx.whoosh(0.5);
    await g.wait(1300);
    const err = Math.abs(guess - target);
    if (!touched) return { score: 0, detail: `too slow! it was ${target}°` };
    const score = 100 * Math.pow(Math.max(0, 1 - err / 30), 1.5);
    return { score, detail: err === 0 ? `exactly ${target}°!` : `you made ${guess}° — off by <b>${err}°</b>` };
  },
};
