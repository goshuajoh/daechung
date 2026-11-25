import type { Pen, Pt } from './pen';
import { BERRY, BLUSH, INK, LEAF, SHADOW, SKY, WHITE } from './palette';
import { hatById } from './hats';

/**
 * Kongi (콩이) — a little bean-sprout mochi who hosts every game.
 * Drawn entirely with the wobbly pen, so it boils along with everything else.
 */
export type Mood = 'idle' | 'happy' | 'cheer' | 'wow' | 'sad' | 'focus' | 'listen';

export interface KongiOpts {
  /** Where the eyes look, each -1..1. */
  look?: [number, number];
  /** External squash 0..1 (e.g. on a beat). */
  bop?: number;
  /** Mirror horizontally. */
  flip?: boolean;
  body?: string;
  /** Hat id from the wardrobe (see hats.ts). */
  hat?: string;
}

const TAU = Math.PI * 2;

export function drawKongi(pen: Pen, x: number, y: number, W: number, mood: Mood, t: number, o: KongiOpts = {}) {
  const ctx = pen.ctx;
  const lw = Math.max(2, Math.min(3.4, W * 0.034));
  const H = W * 0.84;
  const body = o.body ?? WHITE;

  // ——— motion ———
  let lift = 0, sx = 1, sy = 1;
  if (mood === 'happy' || mood === 'cheer') {
    const speed = mood === 'cheer' ? 2.4 : 1.6;
    const ph = (t * speed) % 1;
    lift = Math.sin(Math.min(ph / 0.6, 1) * Math.PI) * W * (mood === 'cheer' ? 0.2 : 0.1);
    if (ph > 0.6) {
      const k = Math.sin(((ph - 0.6) / 0.4) * Math.PI);
      sy = 1 - 0.12 * k;
      sx = 1 + 0.1 * k;
    }
  } else {
    const b = Math.sin(t * 2.6);
    sy = 1 + 0.025 * b;
    sx = 1 - 0.018 * b;
  }
  if (o.bop) {
    sy *= 1 - 0.16 * o.bop;
    sx *= 1 + 0.12 * o.bop;
  }
  if (mood === 'sad') sy *= 0.95;

  ctx.save();
  if (o.flip) {
    ctx.translate(x * 2, 0);
    ctx.scale(-1, 1);
  }

  // shadow
  pen.ellipse(x, y, W * 0.42 * (1 - (lift / W) * 0.9), W * 0.07, { fill: SHADOW, stroke: null, shift: [0, 0], seed: 900 });

  const bw = (W / 2) * sx;
  const ryT = H * 0.55 * sy;
  const ryB = H * 0.45 * sy;
  const bottom = y - lift - W * 0.04;
  const by = bottom - ryB;

  // ——— feet ———
  for (const side of [-1, 1]) {
    pen.ellipse(x + side * bw * 0.36, y - lift - W * 0.05, W * 0.1, W * 0.055, { fill: body, width: lw, seed: 910 + side, shift: [0, 0] });
  }

  // ——— arms (behind the body) ———
  const arm = (side: number): Pt => {
    const wave = Math.sin(t * 9 + side) * W * 0.05;
    switch (mood) {
      case 'cheer': return [x + side * bw * 1.28, by - ryT * 0.75 + wave];
      case 'wow': return [x + side * bw * 1.28, by - ryT * 0.25];
      case 'sad': return [x + side * bw * 0.98, by + ryB * 0.62];
      case 'happy': return [x + side * bw * 1.2, by + ryB * 0.2 + wave * 0.4];
      default: return [x + side * bw * 1.06, by + ryB * 0.42 + Math.sin(t * 2.6) * 1.2];
    }
  };
  for (const side of [-1, 1]) {
    const sh: Pt = [x + side * bw * 0.82, by + ryB * 0.05];
    const tip = arm(side);
    const mid: Pt = [(sh[0] + tip[0]) / 2 + side * W * 0.03, (sh[1] + tip[1]) / 2];
    pen.limb([sh, mid, tip], W * 0.085, body, 920 + side, lw * 0.85);
  }

  // ——— body ———
  const pts: Pt[] = [];
  const N = 20;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const c = Math.cos(a), s = Math.sin(a);
    const lower = s > 0;
    pts.push([x + c * bw * (lower ? 1.03 : 1), by + (lower ? Math.pow(s, 0.55) * ryB : s * ryT)]);
  }
  pen.blob(pts, { fill: body, width: lw, seed: 930, rough: W * 0.012, shift: [W * 0.025, W * 0.03] });

  // ——— hat & sprout ———
  const hatDef = hatById(o.hat);
  hatDef.draw(pen, x, by - ryT, W, t);
  const sway = Math.sin(t * 2.2) * 0.16 + (mood === 'cheer' ? Math.sin(t * 14) * 0.18 : 0) - (mood === 'sad' ? 0.5 : 0);
  const base: Pt = [x + bw * 0.06, by - ryT + lw * 0.6 - (hatDef.lift ?? 0) * W];
  const L = W * 0.2;
  const tip: Pt = [base[0] + Math.sin(sway) * L, base[1] - Math.cos(sway) * L];
  const bend: Pt = [base[0] + Math.sin(sway * 0.4) * L * 0.5 + W * 0.02, base[1] - L * 0.5];
  const leaf = (dir: number, size: number, seed: number) => {
    const ang = -Math.PI / 2 + sway + dir * 0.95;
    const c = Math.cos(ang), s = Math.sin(ang);
    const shape: Pt[] = [[0, 0], [size * 0.4, -size * 0.3], [size, 0], [size * 0.4, size * 0.3]];
    pen.blob(shape.map(([px, py]) => [tip[0] + px * c - py * s, tip[1] + px * s + py * c] as Pt), {
      fill: LEAF, width: lw * 0.85, seed, rough: 0.5, shift: [1.5, 1.5],
    });
  };
  if (hatDef.sprout === 'over') {
    pen.curve([base, bend, tip], { width: lw, seed: 940, rough: 0.4 });
    leaf(-1, W * 0.17, 941);
    leaf(1, W * 0.14, 942);
  }

  // ——— face ———
  const look = o.look ?? [Math.sin(t * 0.7) * 0.3, 0];
  const fx = x + look[0] * W * 0.07;
  const fy = by + ryT * 0.06 + look[1] * W * 0.04;
  const ex = W * 0.165, ey = fy - W * 0.02;
  const e = W * 0.045;
  const blink = t % 3.7 < 0.13;

  // blush hatch
  for (const side of [-1, 1]) {
    const cx = fx + side * W * 0.3, cy = fy + W * 0.075;
    pen.ellipse(cx, cy, W * 0.075, W * 0.042, { fill: BLUSH, stroke: null, alpha: 0.35, shift: [0, 0], seed: 950 + side });
    for (let k = -1; k <= 1; k++) {
      const hx = cx + k * W * 0.032;
      pen.line(hx - W * 0.012, cy + W * 0.022, hx + W * 0.012, cy - W * 0.022, { stroke: BLUSH, width: lw * 0.7, rough: 0.3, seed: 960 + k + side * 5 });
    }
  }

  const eyeStyle = { fill: INK, stroke: null, shift: [0, 0] as Pt, rough: 0.25 };
  for (const side of [-1, 1]) {
    const cx = fx + side * ex;
    const sd = 970 + side;
    if (mood === 'happy' || mood === 'cheer') {
      pen.curve([[cx - e, ey + e * 0.35], [cx, ey - e * 0.55], [cx + e, ey + e * 0.35]], { width: lw, rough: 0.3, seed: sd });
    } else if (mood === 'listen' || blink) {
      pen.curve([[cx - e, ey], [cx, ey + e * 0.55], [cx + e, ey]], { width: lw, rough: 0.3, seed: sd });
    } else if (mood === 'wow') {
      pen.ellipse(cx, ey, e * 0.95, e * 1.1, { ...eyeStyle, seed: sd });
      pen.ellipse(cx - e * 0.3, ey - e * 0.4, e * 0.32, e * 0.32, { fill: WHITE, stroke: null, shift: [0, 0], seed: sd + 10 });
    } else {
      pen.ellipse(cx, ey, e * 0.62, e * 0.85, { ...eyeStyle, seed: sd });
      pen.ellipse(cx - e * 0.2, ey - e * 0.35, e * 0.2, e * 0.2, { fill: WHITE, stroke: null, shift: [0, 0], seed: sd + 10 });
    }
    // brows: inner end is toward the middle of the face
    if (mood === 'focus') {
      pen.line(cx - side * e * 0.9, ey - e * 1.35, cx + side * e * 0.7, ey - e * 1.95, { width: lw, rough: 0.3, seed: sd + 20 });
    }
    if (mood === 'sad') {
      pen.line(cx - side * e * 0.9, ey - e * 2.05, cx + side * e * 0.7, ey - e * 1.45, { width: lw, rough: 0.3, seed: sd + 20 });
    }
  }

  // mouth
  const mx = fx, my = fy + W * 0.085, m = W * 0.042;
  if (mood === 'happy' || mood === 'cheer') {
    const open = mood === 'cheer' ? 1.4 : 1;
    pen.blob(
      [[mx - m * 1.2, my - m * 0.25], [mx, my - m * 0.1], [mx + m * 1.2, my - m * 0.25], [mx + m * 0.7, my + m * 0.9 * open], [mx, my + m * 1.25 * open], [mx - m * 0.7, my + m * 0.9 * open]],
      { fill: BERRY, width: lw * 0.85, rough: 0.3, seed: 980, shift: [0, 0] },
    );
  } else if (mood === 'wow') {
    pen.ellipse(mx, my + m * 0.3, m * 0.6, m * 0.8, { fill: BERRY, width: lw * 0.85, rough: 0.2, seed: 981, shift: [0, 0] });
  } else if (mood === 'sad') {
    pen.curve([[mx - m, my + m * 0.5], [mx, my - m * 0.15], [mx + m, my + m * 0.5]], { width: lw, rough: 0.3, seed: 982 });
  } else {
    pen.curve(
      [[mx - m * 1.15, my - m * 0.25], [mx - m * 0.55, my + m * 0.5], [mx, my], [mx + m * 0.55, my + m * 0.5], [mx + m * 1.15, my - m * 0.25]],
      { width: lw * 0.9, rough: 0.25, seed: 983 },
    );
  }

  // tear
  if (mood === 'sad') {
    const k = (t * 0.9) % 1;
    const tx = fx - ex - e * 0.4, ty = ey + e + k * W * 0.25;
    pen.blob([[tx, ty - e * 1.1], [tx + e * 0.55, ty], [tx, ty + e * 0.5], [tx - e * 0.55, ty]], { fill: SKY, width: lw * 0.7, rough: 0.2, seed: 990, alpha: 1 - k, shift: [0, 0] });
  }

  ctx.restore();
}
