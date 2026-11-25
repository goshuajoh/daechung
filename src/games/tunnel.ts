import type { GameDef, Shell } from '../lib/shell';
import type { Pen, Pt } from '../lib/pen';
import { sfx } from '../lib/audio';
import { BERRY, BUTTER, INK, MINT, PINK, WHITE } from '../lib/palette';
import { clamp, easeOutBack, rand } from '../lib/rng';
import { drawHand, loop, span } from '../lib/hand';

/** Tunnel — a ball rolls into a tunnel at a steady speed. Tap when it's under the flag. */

const SPEED: [number, number][] = [[0.2, 0.24], [0.22, 0.28], [0.24, 0.3], [0.26, 0.33], [0.28, 0.36]];
/** where the flag sits inside the tunnel (fraction of tunnel length) */
const DEPTH: [number, number][] = [[0.35, 0.5], [0.45, 0.6], [0.55, 0.7], [0.6, 0.78], [0.7, 0.85]];

const ballR = (w: number) => Math.max(9, Math.min(14, w * 0.03));

function drawBall(pen: Pen, x: number, y: number, r: number, spin: number, alpha = 1) {
  const ctx = pen.ctx;
  ctx.save();
  ctx.globalAlpha *= alpha;
  pen.circle(x, y, r, { fill: BUTTER, seed: 1800, width: 2.6 });
  const c = Math.cos(spin), s = Math.sin(spin);
  pen.curve([[-r * 0.8, -r * 0.2], [0, r * 0.25], [r * 0.8, -r * 0.2]].map(([px, py]) => [x + px * c - py * s, y + px * s + py * c] as Pt), { stroke: BERRY, width: 2.6, seed: 1801, rough: 0.2 });
  ctx.restore();
}

/** The hill-tunnel spanning x1..x2 on the road, with the flag at flagX. */
function drawTunnel(pen: Pen, x1: number, x2: number, roadY: number, flagX: number, hgt: number) {
  const pts: Pt[] = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    pts.push([x1 - 14 + f * (x2 - x1 + 28), roadY - Math.sin(f * Math.PI) * hgt - 6]);
  }
  pts.push([x2 + 14, roadY + 2], [x1 - 14, roadY + 2]);
  pen.blob(pts, { fill: '#bfe3a6', seed: 1810, width: 3, rough: 1.2 });
  for (const ex of [x1, x2]) {
    const arch: Pt[] = [];
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      arch.push([ex + Math.cos(a) * 17, roadY + Math.sin(a) * 30]);
    }
    pen.poly(arch, { fill: '#4b5a45', seed: 1811 + Math.round(ex), width: 2.5, shift: [0, 0], rough: 0.4 });
  }
  // grass tufts on top
  for (let i = 1; i < 5; i++) {
    const f = i / 5, x = x1 + f * (x2 - x1), y = roadY - Math.sin(f * Math.PI) * hgt - 8;
    pen.curve([[x - 5, y + 2], [x - 2, y - 5], [x, y + 1], [x + 3, y - 6], [x + 6, y + 2]], { stroke: '#6ea866', width: 2, seed: 1820 + i });
  }
  // the flag on top, with a dashed drop line showing the exact spot
  const f = (flagX - x1) / (x2 - x1);
  const top = roadY - Math.sin(f * Math.PI) * hgt - 6;
  pen.line(flagX, roadY - 4, flagX, top, { stroke: INK, width: 2, dash: [5, 6], alpha: 0.45, seed: 1830 });
  pen.line(flagX, top, flagX, top - 40, { width: 3, seed: 1831 });
  pen.poly([[flagX, top - 40], [flagX + 24, top - 32], [flagX, top - 24]], { fill: PINK, seed: 1832, rough: 0.5 });
}

export const tunnel: GameDef = {
  id: 'tunnel',
  name: 'Tunnel',
  kr: '터널',
  short: 'Tunnel',
  blurb: 'A ball rolls into a tunnel. Tap the moment it passes under the flag.',
  howto: 'The ball rolls at a steady speed into the tunnel. <b>Tap the moment it is under the flag</b>, even though you can\'t see it!',
  verb: 'tap when it reaches the flag!',
  color: MINT,
  untimed: true,
  ranks: [
    [460, 'X-Ray Vision'],
    [400, 'Train Conductor'],
    [320, 'Good Hunch'],
    [220, 'Lost in the Dark'],
    [0, 'Is It Still In There?'],
  ],

  thumb(pen, w, h, t) {
    const roadY = h * 0.78;
    pen.line(-4, roadY, w + 4, roadY, { width: 3, seed: 1840 });
    const x1 = w * 0.42, x2 = w * 0.9;
    const k = (t % 3.4) / 3.4;
    const bx = w * 0.06 + k * w * 1.0;
    if (bx < x1 + 4 || bx > x2 + 20) drawBall(pen, bx, roadY - 11, 11, t * 8);
    drawTunnel(pen, x1, x2, roadY, w * 0.68, h * 0.36);
  },

  steps: ['the ball rolls at a steady speed', 'it disappears into the tunnel', 'tap when it is <b>under the flag</b>'],

  demo(pen, w, h, t) {
    const k = loop(t, 5);
    const roadY = h * 0.8, r = 10;
    pen.line(-4, roadY, w + 4, roadY, { width: 3, seed: 1840 });
    const x1 = w * 0.4, x2 = w * 0.88, flagX = w * 0.66;
    const bx = w * 0.04 + span(k, 0, 0.9) * (w * 0.98);
    const tapK = (flagX - w * 0.04) / (w * 0.98) * 0.9;
    if (bx < x1 + 4 || bx > x2 - 4) drawBall(pen, bx, roadY - r, r, t * 8);
    drawTunnel(pen, x1, x2, roadY, flagX, h * 0.42);
    if (k > tapK - 0.12 && k < tapK + 0.14) drawHand(pen, w * 0.2, h * 0.4, { press: k > tapK - 0.01 && k < tapK + 0.05 ? 1 : 0, ripple: span(k, tapK, tapK + 0.12), scale: 0.7 });
    if (k > tapK && k < tapK + 0.3) pen.text('now!', flagX, h * 0.1, { size: 18, color: BERRY, outline: WHITE });
  },

  async play(g: Shell, level: number) {
    const stage = g.stage;
    const [vlo, vhi] = SPEED[level];
    const v = rand(vlo, vhi); // widths / second
    const x1k = rand(0.36, 0.46);
    const len = 0.32 + level * 0.04 + rand(0, 0.06);
    const x2k = Math.min(0.94, x1k + len);
    const [dlo, dhi] = DEPTH[level];
    const flagK = x1k + (x2k - x1k) * rand(dlo, dhi);
    const startK = -0.05;
    let t0 = 0, tapAt = 0, doneAt = 0;
    let rolling = false;

    const xAt = (t: number) => startK + v * (t - t0);
    const tTarget = () => t0 + (flagK - startK) / v;

    g.say(g.tutorial ? 'tap anywhere the moment the ball is <b>under the flag</b>. this time you can see a ghost of it!' : 'tap the moment the ball is <b>under the flag</b>.', 'focus');
    stage.draw = (pen, w, h, t) => {
      const roadY = h * 0.72, r = ballR(w);
      pen.line(-4, roadY, w + 4, roadY, { width: 3, seed: 1840 });
      const x1 = x1k * w, x2 = x2k * w, flagX = flagK * w;
      const bx = rolling || doneAt ? xAt(t) * w : startK * w;
      const inside = bx > x1 + r * 0.3 && bx < x2 - r * 0.3;
      if (!inside) drawBall(pen, bx, roadY - r, r, t * 9);
      drawTunnel(pen, x1, x2, roadY, flagX, Math.min(h * 0.34, 150));
      if (inside && (g.tutorial || doneAt)) drawBall(pen, bx, roadY - r, r, t * 9, 0.35);
      if (doneAt && tapAt) {
        const tx = xAt(tapAt) * w;
        const pop = easeOutBack(clamp((t - doneAt) / 0.4, 0, 1));
        pen.line(tx, roadY + 8, tx, roadY + 30, { width: 3, seed: 1850 });
        pen.line(flagX, roadY + 8, flagX, roadY + 30, { stroke: BERRY, width: 3, seed: 1851 });
        pen.line(Math.min(tx, flagX), roadY + 20, Math.max(tx, flagX), roadY + 20, { stroke: BERRY, width: 2.5, seed: 1852 });
        pen.text('you tapped here', tx, roadY + 48, { size: Math.max(1, 16 * pop), font: 'gaegu', outline: WHITE });
      }
      if (rolling && !tapAt && xAt(t) > x1k - 0.05 && t - t0 > 0.8) drawHand(pen, w * 0.18, h * 0.34, { press: Math.sin(t * 6) * 0.5 + 0.5, alpha: 0.6 });
    };

    await g.ready('roll it');
    rolling = true;
    t0 = stage.time;
    sfx.whoosh(0.4);
    const giveUp = (x2k + 0.12 - startK) / v;
    const tapped = await g.until<boolean>((done) => {
      const hit = () => done(true);
      const kd = (e: KeyboardEvent) => {
        if (e.repeat || e.key === 'Tab' || e.key === 'Escape') return;
        e.preventDefault();
        done(true);
      };
      stage.canvas.addEventListener('pointerdown', hit);
      window.addEventListener('keydown', kd);
      const id = setTimeout(() => done(false), giveUp * 1000);
      return () => {
        stage.canvas.removeEventListener('pointerdown', hit);
        window.removeEventListener('keydown', kd);
        clearTimeout(id);
      };
    });
    g.commit();
    if (tapped) {
      tapAt = stage.time;
      sfx.tick(true);
      g.bop = 1;
    }
    doneAt = stage.time;
    g.setMood('wow');
    // let the ball roll out the far end
    await g.wait(Math.max(500, ((x2k + 0.06 - xAt(stage.time)) / v) * 1000));
    if (!tapped) return { score: 0, detail: 'you never tapped! it rolled right through' };
    const err = tapAt - tTarget();
    const hidden = (flagK - x1k) / v;
    const score = 100 * Math.pow(Math.max(0, 1 - Math.abs(err) / (0.28 * hidden + 0.12)), 1.25);
    const ms = Math.round(Math.abs(err) * 1000);
    return { score, detail: ms < 30 ? 'right under the flag!' : `<b>${(Math.abs(err)).toFixed(2)}s</b> ${err < 0 ? 'early' : 'late'}` };
  },
};
