import type { GameDef, Shell } from '../lib/shell';
import type { Pen, Pt } from '../lib/pen';
import { sfx } from '../lib/audio';
import { BERRY, BUTTER, INK, PEACH, WHITE } from '../lib/palette';
import { clamp, easeInOut, easeOutBack, easeOutCubic, lerp, rand, randInt } from '../lib/rng';
import { drawHand, drawPill, drawPrompt, loop, span } from '../lib/hand';

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
function drawAngle(pen: Pen, v: Pt, L: number, base: number, open: number, o: { handle?: number; wedge?: string; seed?: number; arrow?: boolean } = {}) {
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
  if (o.arrow) {
    // a curved two-way arrow along the path the ball travels: "drag me round this way"
    const R = L + 26;
    const a0 = Math.max(base, base + open - 26), a1 = Math.min(base + 180, base + open + 26);
    const pts: Pt[] = [];
    for (let k = 0; k <= 10; k++) {
      const [dx, dy] = dir(a0 + ((a1 - a0) * k) / 10);
      pts.push([v[0] + dx * R, v[1] + dy * R]);
    }
    pen.curve(pts, { stroke: BERRY, width: 3, seed: 18, rough: 0.4 });
    const wing = (deg: number, back: number) => {
      const [dx, dy] = dir(deg);
      const p: Pt = [v[0] + dx * R, v[1] + dy * R];
      for (const s of [-28, 28]) {
        const [wx, wy] = dir(deg + back + s);
        pen.line(p[0], p[1], p[0] + wx * 11, p[1] + wy * 11, { stroke: BERRY, width: 3, seed: 19 + s, rough: 0.2 });
      }
    };
    if (a1 > base + open + 4) wing(a1, 270);
    if (a0 < base + open - 4) wing(a0, 90);
  }
}

export const angle: GameDef = {
  id: 'angle',
  name: 'Angle Eye',
  kr: '각도',
  short: 'Angle',
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

  steps: ['look at the number', 'drag the <b>orange ball</b> to make that angle', 'press <b>lock it in</b>'],

  demo(pen, w, h, t) {
    const k = loop(t, 4.6);
    const L = Math.min(w * 0.38, h * 0.66);
    const v: Pt = [w * 0.16, h * 0.62];
    const open = 12 + easeInOut(span(k, 0.18, 0.58)) * 48;
    drawAngle(pen, v, L, 0, open, { handle: k > 0.14 && k < 0.62 ? 1.3 : 1 });
    pen.text('60°', w * 0.8, h * 0.2, { size: Math.min(32, h * 0.2) });
    const [ax, ay] = dir(open);
    const hx = v[0] + ax * L, hy = v[1] + ay * L;
    const pill: Pt = [w * 0.78, h * 0.84];
    const press = k > 0.72 && k < 0.8 ? 1 : 0;
    drawPill(pen, pill[0], pill[1], 'lock it in', BUTTER, press);
    if (k < 0.14) {
      const m = easeInOut(span(k, 0, 0.14));
      drawHand(pen, lerp(w * 1.05, hx, m), lerp(h * 1.15, hy, m), { scale: 0.8 });
    } else if (k < 0.62) drawHand(pen, hx, hy, { press: 1, scale: 0.8 });
    else {
      const m = easeInOut(span(k, 0.62, 0.72));
      drawHand(pen, lerp(hx, pill[0], m), lerp(hy, pill[1], m), { press, scale: 0.8, ripple: span(k, 0.72, 0.86) });
    }
  },

  async play(g: Shell, level: number) {
    const born = g.stage.time;
    const target = pickTarget();
    const base = level < 2 ? 0 : rand(0, 360);
    let open = level === 4 ? 160 : 25; // start a little open so the two sticks are clearly separate
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

    if (g.tutorial) g.say(`drag the <b>orange ball</b> until the angle is <b>${target}°</b>. this time a number helps you!`, 'focus');
    else g.say(`make a <b>${target}°</b> angle — drag the arm!`, 'focus');
    const stage = g.stage;

    stage.draw = (pen, w, h, t) => {
      const { v, L } = layout(w, h);
      drawPrompt(pen, w, `${target}°`, 'make an angle of');
      if (!revealAt) {
        drawAngle(pen, v, L, base, open, { handle: dragging ? 1.35 : 1 + Math.sin(t * 5) * 0.08, arrow: !touched });
        if (!touched) {
          const [ax, ay] = dir(base + open + 18);
          pen.text('drag me', v[0] + ax * L * 0.85, v[1] + ay * L * 0.85, { size: 20, font: 'gaegu', alpha: 0.6 + Math.sin(t * 4) * 0.3 });
        }
        const [hx, hy] = dir(base + open);
        // nudge: a hand on the ball if they haven't touched it yet
        if (!touched && t - born > 1.2) drawHand(pen, v[0] + hx * L, v[1] + hy * L, { press: Math.sin(t * 4) * 0.5 + 0.5, alpha: 0.9 });
        // training wheels: show the live angle
        if (g.tutorial && touched) pen.text(`${Math.round(open)}°`, v[0] + hx * (L + 36), v[1] + hy * (L + 32), { size: 26, color: BERRY, outline: WHITE });
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
