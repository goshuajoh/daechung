import type { GameDef, Shell } from '../lib/shell';
import type { Pen, Pt } from '../lib/pen';
import { sfx } from '../lib/audio';
import { BERRY, BUTTER, INK, MINT, PEACH, PINK, WHITE } from '../lib/palette';
import { clamp, easeOutBack, rand, random } from '../lib/rng';

const VISIBLE = [0.55, 0.5, 0.44, 0.38, 0.32];

interface Path { x0: number; y0: number; xL: number; gy: number; ya: number; xa: number; a: number; T: number }

function makePath(x0: number, y0: number, xL: number, gy: number, apexH: number, T: number): Path {
  const ya = Math.min(y0, gy) - apexH;
  const k = Math.sqrt((y0 - ya) / (gy - ya));
  const xa = (x0 + k * xL) / (1 + k);
  const a = (gy - ya) / Math.pow(xL - xa, 2);
  return { x0, y0, xL, gy, ya, xa, a, T };
}
const posAt = (p: Path, u: number): Pt => {
  const x = p.x0 + (p.xL - p.x0) * u;
  return [x, p.ya + p.a * Math.pow(x - p.xa, 2)];
};

function drawBall(pen: Pen, x: number, y: number, r: number, spin: number, sx = 1, sy = 1, alpha = 1) {
  const ctx = pen.ctx;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.scale(sx, sy);
  pen.circle(0, 0, r, { fill: BUTTER, seed: 600 });
  const c = Math.cos(spin), s = Math.sin(spin);
  const pts: Pt[] = [[-r * 0.85, -r * 0.2], [0, r * 0.25], [r * 0.85, -r * 0.2]];
  pen.curve(pts.map(([px, py]) => [px * c - py * s, px * s + py * c] as Pt), { stroke: BERRY, width: 3, seed: 601, rough: 0.3 });
  pen.circle(-r * 0.35, -r * 0.4, r * 0.16, { fill: WHITE, stroke: null, shift: [0, 0], seed: 602 });
  ctx.restore();
}

/** Where the catapult cup is; `fling` 0 = cocked back, 1 = fully thrown forward. */
function armTip(cx: number, gy: number, dirX: number, fling: number): Pt {
  const th = 0.35 + fling * 2.15;
  const len = 46;
  return [cx - Math.cos(th) * len * dirX, gy - 24 - Math.sin(th) * len];
}

function drawCatapult(pen: Pen, cx: number, gy: number, dirX: number, fling: number) {
  pen.poly([[cx - 26, gy], [cx + 26, gy], [cx + 16, gy - 22], [cx - 16, gy - 22]], { fill: PEACH, seed: 610 });
  const tip = armTip(cx, gy, dirX, fling);
  pen.limb([[cx, gy - 24], tip], 6, '#c98f63', 612, 2.5);
  pen.circle(cx, gy - 24, 5, { fill: WHITE, seed: 611 });
  pen.ellipse(tip[0], tip[1] - 2, 12, 6, { fill: '#c98f63', seed: 613 });
}

function drawGround(pen: Pen, w: number, h: number, gy: number) {
  pen.poly([[-10, gy], [w + 10, gy], [w + 10, h + 10], [-10, h + 10]], { fill: '#e3f1d5', stroke: null, shift: [0, 0], seed: 620 });
  pen.line(-4, gy, w + 4, gy, { width: 3, seed: 621 });
  for (let i = 0; i < 9; i++) {
    const x = ((i * 0.618 * w) % w) + 10;
    const y = gy + 14 + ((i * 7) % 3) * 9;
    pen.curve([[x - 6, y - 7], [x - 2, y], [x, y - 9], [x + 3, y], [x + 7, y - 6]], { stroke: '#7fb879', width: 2.2, seed: 622 + i });
  }
}

/** Union-of-circles cloud: ink silhouette, then white on top, so only the outer edge is outlined. */
function drawCloud(pen: Pen, x: number, y: number, s: number, seed: number) {
  const bumps = [[-0.72, 0.12, 0.42], [-0.28, -0.18, 0.55], [0.28, -0.26, 0.58], [0.76, 0.06, 0.42]];
  const pass = (grow: number, fill: string, dx = 0, dy = 0) => {
    bumps.forEach(([bx, by, br], i) =>
      pen.circle(x + bx * s + dx, y + by * s + dy, br * s + grow, { fill, stroke: null, shift: [0, 0], seed: seed + i, rough: 0.6 }));
    pen.rrect(x - 1.0 * s - grow + dx, y - 0.05 * s - grow + dy, 2 * s + grow * 2, 0.5 * s + grow * 2, 0.25 * s + grow, { fill, stroke: null, shift: [0, 0], seed: seed + 9, rough: 0.6 });
  };
  pass(0, '#dcebf7', 4, 4);
  pass(2.6, INK);
  pass(0, WHITE);
}

function drawFlag(pen: Pen, x: number, gy: number, color: string, pop = 1) {
  const hgt = 40 * pop;
  pen.line(x, gy, x, gy - hgt, { width: 3, seed: 630 });
  pen.poly([[x, gy - hgt], [x + 22 * pop, gy - hgt + 7 * pop], [x, gy - hgt + 15 * pop]], { fill: color, seed: 631, rough: 0.5 });
}

export const trajectory: GameDef = {
  id: 'trajectory',
  name: "Where'd it Land?",
  kr: '궤도',
  blurb: 'The ball turns invisible mid-air. Call the landing spot.',
  howto: "I'll fling a ball. Halfway through it goes <b>invisible</b> — tap the ground where you think it'll land!",
  color: MINT,
  verb: 'where will it land?',
  ranks: [
    [470, 'Physics Engine'],
    [410, 'Outfield Legend'],
    [330, 'Decent Catcher'],
    [230, 'Duck!!'],
    [0, 'Ball? What ball?'],
  ],

  thumb(pen, w, h, t) {
    const gy = h * 0.82;
    drawGround(pen, w, h, gy);
    drawCloud(pen, w * 0.72, h * 0.25, Math.min(w, h) * 0.12, 640);
    const tip0 = armTip(w * 0.14, gy, 1, 1);
    const p = makePath(tip0[0], tip0[1] - 12, w * 0.84, gy, h * 0.48, 1.6);
    const u = (t % 2.4) / 1.6;
    for (let i = 1; i <= 8; i++) {
      const [x, y] = posAt(p, (i / 8) * Math.min(u, 0.5));
      pen.circle(x, y, 1.6, { fill: INK, stroke: null, shift: [0, 0], seed: 650 + i, alpha: 0.4 });
    }
    drawCatapult(pen, w * 0.14, gy, 1, clamp(u * 4, 0, 1));
    if (u < 0.5) {
      const [x, y] = posAt(p, u);
      drawBall(pen, x, y, 10, t * 8);
    } else pen.text('?', w * 0.78, h * 0.56, { size: h * 0.25, alpha: 0.6 });
    drawFlag(pen, w * 0.8, gy, PINK);
  },

  async play(g: Shell, level: number) {
    const dirX = random() < 0.5 ? -1 : 1;
    const visible = VISIBLE[level];
    const rnd = { land: rand(0.45, 0.92), apex: rand(0.45, 0.85), T: rand(1.3, 1.8) };
    let phase: 'ready' | 'fling' | 'fly' | 'guess' | 'reveal' = 'ready';
    let phaseAt = 0;
    let guessX: number | null = null;
    let hover: number | null = null;
    const clouds = [0.2, 0.55, 0.85].map((k, i) => ({ k, y: rand(0.12, 0.35), s: rand(0.8, 1.2), seed: 660 + i }));

    const layout = (w: number, h: number) => {
      const gy = h - 46;
      const margin = 58;
      const cx = dirX > 0 ? margin : w - margin;
      const [tx, ty] = armTip(cx, gy, dirX, 1);
      const span = w - margin * 2;
      const xL = cx + dirX * span * rnd.land;
      const apexH = (gy - 70) * rnd.apex;
      return { gy, cx, path: makePath(tx, ty - 12, xL, gy, apexH, rnd.T) };
    };

    g.say(`it stays visible for about ${Math.round(visible * 100)}% of the flight.`, 'idle');
    const stage = g.stage;

    stage.draw = (pen, w, h, t) => {
      const { gy, cx, path } = layout(w, h);
      const k = t - phaseAt;
      clouds.forEach((c) => drawCloud(pen, ((c.k * w + t * 8 * c.s) % (w + 120)) - 60, c.y * h, 26 * c.s, c.seed));
      drawGround(pen, w, h, gy);

      const fling = phase === 'ready' ? 0 : phase === 'fling' ? clamp(k / 0.25, 0, 1) : 1;
      const armK = phase === 'ready' ? Math.abs(Math.sin(t * 3)) * 0.03 : phase === 'fling' ? fling : Math.max(0, 1 - k * 1.5);
      drawCatapult(pen, cx, gy, dirX, armK);

      // how far along the flight is the ball?
      let u = 0;
      if (phase === 'fly') u = Math.min(visible, k / path.T);
      else if (phase === 'guess') u = visible;
      else if (phase === 'reveal') u = Math.min(1, visible + k / path.T);

      // dotted trail of what you saw
      if (phase !== 'ready' && phase !== 'fling') {
        const shownU = Math.min(u, visible);
        const steps = Math.floor(shownU * 26);
        for (let i = 1; i <= steps; i++) {
          const [x, y] = posAt(path, i / 26);
          pen.circle(x, y, 2, { fill: INK, stroke: null, shift: [0, 0], seed: 700 + i, alpha: 0.35 });
        }
      }
      if (phase === 'reveal') {
        const steps = Math.floor(u * 26);
        for (let i = Math.floor(visible * 26) + 1; i <= steps; i++) {
          const [x, y] = posAt(path, i / 26);
          pen.circle(x, y, 2.4, { fill: BERRY, stroke: null, shift: [0, 0], seed: 700 + i, alpha: 0.7 });
        }
      }

      // guess flag (or hover ghost)
      if (guessX != null) drawFlag(pen, guessX, gy, PINK);
      else if (hover != null && phase === 'guess') {
        pen.ctx.save();
        pen.ctx.globalAlpha = 0.4;
        drawFlag(pen, hover, gy, PINK);
        pen.ctx.restore();
      }

      // the ball
      if (phase === 'ready' || phase === 'fling') {
        const [bx, by] = armTip(cx, gy, dirX, armK);
        drawBall(pen, bx, by - 12, 11, 0);
      } else if (phase === 'fly') {
        const [x, y] = posAt(path, u);
        const fade = clamp((visible - k / path.T) / 0.04, 0, 1);
        drawBall(pen, x, y, 11, t * 9 * dirX, 1, 1, fade);
        if (fade < 1) for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + t;
          pen.star(x + Math.cos(a) * 20 * (1 - fade), y + Math.sin(a) * 20 * (1 - fade), 5, { fill: BUTTER, width: 1.6, seed: 720 + i, alpha: fade + 0.2 }, a);
        }
      } else if (phase === 'guess') {
        const [x, y] = posAt(path, visible);
        pen.text('?', x + dirX * 20, y - 10, { size: 30, alpha: 0.35 + Math.sin(t * 5) * 0.15 });
      } else if (phase === 'reveal') {
        const landed = u >= 1;
        const [x, y] = posAt(path, u);
        const sinceLand = k - (1 - visible) * path.T;
        const squash = landed ? Math.exp(-sinceLand * 6) * Math.sin(sinceLand * 20) * 0.25 : 0;
        drawBall(pen, x, landed ? gy - 11 * (1 - squash) : y, 11, landed ? 0 : t * 9 * dirX, 1 + squash, 1 - squash);
        if (landed) {
          // dust puffs
          const d = clamp(sinceLand / 0.6, 0, 1);
          for (const side of [-1, 1]) {
            pen.circle(x + side * (16 + d * 26), gy - 6 - d * 8, 7 * (1 - d) + 0.5, { fill: WHITE, width: 2, seed: 730 + side, alpha: 1 - d });
          }
          if (guessX != null && sinceLand > 0.3) {
            const pop = easeOutBack(clamp((sinceLand - 0.3) / 0.35, 0, 1));
            const yy = gy + 26;
            pen.line(Math.min(x, guessX), yy, Math.min(x, guessX) + Math.abs(x - guessX) * pop, yy, { stroke: BERRY, width: 3, seed: 740 });
            pen.line(x, yy - 7, x, yy + 7, { stroke: BERRY, width: 3, seed: 741 });
            pen.line(guessX, yy - 7, guessX, yy + 7, { stroke: BERRY, width: 3, seed: 742 });
          }
        }
      }
      if (phase === 'guess' && guessX == null) pen.text('tap the ground!', w / 2, gy + 26, { size: 22, color: INK, alpha: 0.75 });
    };

    await g.ready('fling it!');
    phase = 'fling';
    phaseAt = stage.time;
    g.setMood('wow');
    await g.wait(250);
    sfx.whoosh(0.5);
    phase = 'fly';
    phaseAt = stage.time;
    const { path: p0 } = layout(stage.w, stage.h);
    await g.wait(visible * p0.T * 1000 + 120);
    sfx.shh();
    phase = 'guess';
    g.setMood('focus');
    g.say('where will it land? <b>tap the ground</b>, then lock it in.');

    const canvas = stage.canvas;
    let dragging = false;
    const place = (e: PointerEvent) => {
      const [px] = stage.local(e);
      return clamp(px, 8, stage.w - 8);
    };
    const move = (e: PointerEvent) => {
      if (dragging) guessX = place(e);
      else if (e.pointerType === 'mouse') hover = place(e);
      g.look = [clamp((place(e) / stage.w) * 2 - 1, -1, 1), 0.5];
    };
    const down = (e: PointerEvent) => {
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      guessX = place(e);
      sfx.click();
      confirm.el.disabled = false;
    };
    const up = () => (dragging = false);
    const key = (e: KeyboardEvent) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      guessX = clamp((guessX ?? stage.w / 2) + d * stage.w * (e.shiftKey ? 0.05 : 0.005), 8, stage.w - 8);
      confirm.el.disabled = false;
      sfx.click();
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointerup', up);
    window.addEventListener('keydown', key);
    const confirm = g.confirmButton('it lands here', false);
    try {
      await g.lockIn(confirm, 7);
    } finally {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', key);
    }
    hover = null;
    g.look = undefined;
    phase = 'reveal';
    phaseAt = stage.time;
    g.setMood('wow');
    const rest = (1 - visible) * p0.T;
    await g.wait(rest * 1000);
    sfx.thud();
    await g.wait(900);

    const { path } = layout(stage.w, stage.h);
    if (guessX == null) return { score: 0, detail: 'too slow! no flag planted' };
    const err = Math.abs(guessX - path.xL) / Math.abs(path.xL - path.x0);
    const score = 100 * Math.pow(Math.max(0, 1 - err / 0.3), 1.3);
    const pct = (err * 100).toFixed(1);
    return { score, detail: err < 0.01 ? 'right on the flag!!' : `off by <b>${pct}%</b> of the throw` };
  },
};

