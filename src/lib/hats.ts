import type { Pen, Pt } from './pen';
import { BERRY, BUTTER, INK, LEAF, LILAC, MINT, PEACH, PINK, SKY, WHITE } from './palette';

/**
 * Kongi's wardrobe. Unlocked by levelling up.
 * `x, y` is the top of Kongi's head, `W` its body width.
 */
export interface Hat {
  id: string;
  name: string;
  level: number;
  /** Unlocked by a daily streak of this many days instead of by level. */
  streak?: number;
  /** Unlocked by earning this stamp (seasonal), with this label while locked. */
  stamp?: { id: string; label: string };
  /** Drawn in front of the face (glasses) instead of on the head. */
  front?: boolean;
  /** Draw the sprout on top of the hat (it pokes through), or hide it. */
  sprout: 'over' | 'hidden';
  /** Raise the sprout base by this fraction of W (e.g. it sticks out of a beanie). */
  lift?: number;
  draw(pen: Pen, x: number, y: number, W: number, t: number): void;
}

const lw = (W: number) => Math.max(2, Math.min(3.2, W * 0.032));

export const HATS: Hat[] = [
  { id: 'none', name: 'just me', level: 1, sprout: 'over', draw() {} },
  {
    id: 'bow',
    name: 'ribbon',
    level: 2,
    sprout: 'over',
    draw(pen, x, y, W) {
      const cx = x - W * 0.2, cy = y + W * 0.07, s = W * 0.13;
      const st = { fill: PINK, width: lw(W), rough: 0.4, shift: [1.5, 1.5] as Pt };
      pen.blob([[cx, cy], [cx - s * 1.3, cy - s * 0.8], [cx - s * 1.4, cy + s * 0.7]], { ...st, seed: 1001 });
      pen.blob([[cx, cy], [cx + s * 1.3, cy - s * 0.8], [cx + s * 1.4, cy + s * 0.7]], { ...st, seed: 1002 });
      pen.circle(cx, cy, s * 0.38, { ...st, fill: BERRY, seed: 1003 });
    },
  },
  {
    id: 'beanie',
    name: 'beanie',
    level: 3,
    sprout: 'over',
    lift: 0.1,
    draw(pen, x, y, W) {
      const r = W * 0.43;
      const pts: Pt[] = [];
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI + (i / 10) * Math.PI;
        pts.push([x + Math.cos(a) * r, y + W * 0.26 + Math.sin(a) * W * 0.36]);
      }
      pen.blob(pts, { fill: SKY, width: lw(W), seed: 1010, rough: 0.6 });
      for (let i = 1; i < 4; i++) {
        const k = i / 4;
        pen.line(x - r * 0.9 + k * r * 1.8, y + W * 0.26, x - r * 0.6 + k * r * 1.2, y - W * 0.02, { stroke: WHITE, width: lw(W) * 1.2, seed: 1011 + i, alpha: 0.8 });
      }
      pen.rrect(x - r * 1.02, y + W * 0.18, r * 2.04, W * 0.13, W * 0.05, { fill: '#8cbde6', width: lw(W), seed: 1015 });
    },
  },
  {
    id: 'party',
    name: 'party hat',
    level: 4,
    sprout: 'over',
    draw(pen, x, y, W, t) {
      const ctx = pen.ctx;
      ctx.save();
      ctx.translate(x - W * 0.2, y + W * 0.06);
      ctx.rotate(-0.38);
      const h = W * 0.42, b = W * 0.17;
      pen.poly([[-b, 0], [b, 0], [0, -h]], { fill: BUTTER, width: lw(W), seed: 1020, rough: 0.5 });
      for (let i = 1; i <= 2; i++) pen.circle((i % 2 ? -1 : 1) * b * 0.25, -h * (i * 0.3), W * 0.025, { fill: BERRY, stroke: null, shift: [0, 0], seed: 1021 + i });
      pen.circle(0, -h - W * 0.03, W * 0.05 + Math.sin(t * 6) * 0.6, { fill: PINK, width: lw(W) * 0.8, seed: 1024 });
      ctx.restore();
    },
  },
  {
    id: 'phones',
    name: 'headphones',
    level: 5,
    sprout: 'over',
    draw(pen, x, y, W) {
      const pts: Pt[] = [];
      for (let i = 0; i <= 12; i++) {
        const a = Math.PI + (i / 12) * Math.PI;
        pts.push([x + Math.cos(a) * W * 0.5, y + W * 0.3 + Math.sin(a) * W * 0.42]);
      }
      pen.curve(pts, { width: lw(W) * 3.2, stroke: INK, seed: 1030, rough: 0.3 });
      pen.curve(pts, { width: lw(W) * 1.6, stroke: LILAC, seed: 1030, rough: 0.3 });
      for (const s of [-1, 1]) pen.ellipse(x + s * W * 0.5, y + W * 0.32, W * 0.09, W * 0.14, { fill: LILAC, width: lw(W), seed: 1031 + s });
    },
  },
  {
    id: 'chef',
    name: 'chef hat',
    level: 6,
    sprout: 'hidden',
    draw(pen, x, y, W) {
      const st = { fill: WHITE, width: lw(W), rough: 0.5 };
      const d = W * 0.09;
      pen.circle(x - W * 0.17, y - W * 0.16 + d, W * 0.17, { ...st, seed: 1040 });
      pen.circle(x + W * 0.17, y - W * 0.16 + d, W * 0.17, { ...st, seed: 1041 });
      pen.circle(x, y - W * 0.26 + d, W * 0.19, { ...st, seed: 1042 });
      pen.rrect(x - W * 0.3, y - W * 0.12 + d, W * 0.6, W * 0.22, W * 0.05, { ...st, seed: 1043 });
    },
  },
  {
    id: 'flowers',
    name: 'flower crown',
    level: 7,
    sprout: 'over',
    draw(pen, x, y, W, t) {
      const cols = [PINK, BUTTER, LILAC, PEACH, SKY];
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * (1.12 + (i / 4) * 0.76);
        const fx = x + Math.cos(a) * W * 0.44, fy = y + W * 0.3 + Math.sin(a) * W * 0.4;
        for (let k = 0; k < 5; k++) {
          const pa = (k / 5) * Math.PI * 2 + t * 0.3;
          pen.circle(fx + Math.cos(pa) * W * 0.045, fy + Math.sin(pa) * W * 0.045, W * 0.04, { fill: cols[i], width: 1.4, seed: 1050 + i * 5 + k, rough: 0.2 });
        }
        pen.circle(fx, fy, W * 0.028, { fill: BUTTER, stroke: null, shift: [0, 0], seed: 1080 + i });
      }
      pen.ellipse(x - W * 0.36, y + W * 0.08, W * 0.05, W * 0.025, { fill: LEAF, width: 1.4, seed: 1090 }, -0.6);
    },
  },
  {
    id: 'cap',
    name: 'cap',
    level: 8,
    sprout: 'hidden',
    draw(pen, x, y, W) {
      const pts: Pt[] = [];
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI + (i / 10) * Math.PI;
        pts.push([x + Math.cos(a) * W * 0.4, y + W * 0.14 + Math.sin(a) * W * 0.3]);
      }
      pen.ellipse(x + W * 0.36, y + W * 0.13, W * 0.24, W * 0.06, { fill: '#7fc39a', width: lw(W), seed: 1101 }, 0.08);
      pen.blob(pts, { fill: MINT, width: lw(W), seed: 1100, rough: 0.5 });
      pen.circle(x, y - W * 0.16, W * 0.035, { fill: '#7fc39a', width: 1.6, seed: 1102 });
    },
  },
  {
    id: 'crown',
    name: 'crown',
    level: 9,
    sprout: 'over',
    lift: 0.08,
    draw(pen, x, y, W, t) {
      const cw = W * 0.5, ch = W * 0.24, by = y + W * 0.08;
      pen.poly([[x - cw / 2, by], [x - cw / 2, by - ch], [x - cw / 4, by - ch * 0.5], [x, by - ch * 1.15], [x + cw / 4, by - ch * 0.5], [x + cw / 2, by - ch], [x + cw / 2, by]], {
        fill: BUTTER, width: lw(W), seed: 1110, rough: 0.5,
      });
      pen.circle(x - cw / 4, by - ch * 0.15, W * 0.03, { fill: PINK, width: 1.4, seed: 1111 });
      pen.circle(x + cw / 4, by - ch * 0.15, W * 0.03, { fill: SKY, width: 1.4, seed: 1112 });
      const tw = (Math.sin(t * 3) + 1) / 2;
      pen.star(x + cw * 0.62, by - ch * 1.1, W * 0.05 * (0.6 + tw * 0.6), { fill: WHITE, width: 1.4, seed: 1113 }, t);
    },
  },
  {
    id: 'halo',
    name: 'halo',
    level: 10,
    sprout: 'over',
    draw(pen, x, y, W, t) {
      const hy = y - W * 0.3 + Math.sin(t * 2.4) * W * 0.02;
      pen.ellipse(x, hy, W * 0.28, W * 0.07, { stroke: INK, width: lw(W) * 2.4, seed: 1120, rough: 0.4 });
      pen.ellipse(x, hy, W * 0.28, W * 0.07, { stroke: BUTTER, width: lw(W) * 1.2, seed: 1120, rough: 0.4 });
      for (let i = 0; i < 3; i++) {
        const a = t * 1.5 + i * 2.1;
        pen.star(x + Math.cos(a) * W * 0.4, hy + Math.sin(a) * W * 0.1, W * 0.035, { fill: BUTTER, width: 1.2, seed: 1121 + i }, a);
      }
    },
  },
  {
    id: 'shades',
    name: 'sunglasses',
    level: 99,
    streak: 3,
    sprout: 'over',
    front: true,
    draw(pen, x, y, W) {
      const ey = y + W * 0.47, dx = W * 0.165;
      for (const s of [-1, 1]) {
        pen.rrect(x + s * dx - W * 0.085, ey - W * 0.06, W * 0.17, W * 0.12, W * 0.05, { fill: INK, width: lw(W), seed: 1130 + s, rough: 0.3, shift: [0, 0] });
        pen.line(x + s * dx - W * 0.05, ey - W * 0.03, x + s * dx - W * 0.01, ey - W * 0.045, { stroke: WHITE, width: lw(W) * 0.9, seed: 1133 + s });
      }
      pen.curve([[x - dx + W * 0.085, ey - W * 0.03], [x, ey - W * 0.05], [x + dx - W * 0.085, ey - W * 0.03]], { width: lw(W), seed: 1135, rough: 0.2 });
    },
  },
  {
    id: 'golden',
    name: 'golden sprout',
    level: 99,
    streak: 7,
    sprout: 'hidden',
    draw(pen, x, y, W, t) {
      const sway = Math.sin(t * 2.2) * 0.16;
      const base: Pt = [x + W * 0.03, y + 2];
      const L = W * 0.22;
      const tip: Pt = [base[0] + Math.sin(sway) * L, base[1] - Math.cos(sway) * L];
      pen.curve([base, [base[0] + W * 0.02, base[1] - L * 0.5], tip], { width: lw(W), seed: 1140, rough: 0.4 });
      for (const [dir, size, seed] of [[-1, 0.19, 1141], [1, 0.16, 1142]] as const) {
        const a = -Math.PI / 2 + sway + dir * 0.95, c = Math.cos(a), s = Math.sin(a), z = W * size;
        const pts: Pt[] = [[0, 0], [z * 0.4, -z * 0.3], [z, 0], [z * 0.4, z * 0.3]];
        pen.blob(pts.map(([px, py]) => [tip[0] + px * c - py * s, tip[1] + px * s + py * c] as Pt), { fill: '#ffd24d', width: lw(W) * 0.85, seed, rough: 0.5 });
      }
      const tw = (Math.sin(t * 3) + 1) / 2;
      pen.star(tip[0] + W * 0.18, tip[1] - W * 0.05, W * (0.03 + tw * 0.03), { fill: WHITE, width: 1.4, seed: 1143 }, t);
      pen.star(tip[0] - W * 0.2, tip[1] + W * 0.02, W * (0.025 + (1 - tw) * 0.025), { fill: '#ffd24d', width: 1.4, seed: 1144 }, -t);
    },
  },
  {
    // seasonal: play a Daily in December
    id: 'winter',
    name: 'winter hat',
    level: 99,
    stamp: { id: 'winter', label: 'December Daily' },
    sprout: 'hidden',
    draw(pen, x, y, W, t) {
      const r = W * 0.44;
      // a slouchy knit hat flopping to one side, pompom swinging
      const sway = Math.sin(t * 2.2) * 0.04;
      const tipX = x + W * (0.42 + sway), tipY = y - W * 0.02;
      pen.blob([[x - r, y + W * 0.24], [x - r * 0.8, y - W * 0.16], [x - r * 0.1, y - W * 0.3], [x + r * 0.6, y - W * 0.22], [tipX, tipY], [x + r * 0.7, y + W * 0.06], [x + r, y + W * 0.24]], {
        fill: BERRY, width: lw(W), seed: 1200, rough: 0.5,
      });
      // knit dots
      for (let i = 0; i < 5; i++) pen.circle(x - r * 0.6 + i * r * 0.32, y + W * 0.02 - Math.sin((i / 4) * Math.PI) * W * 0.12, W * 0.018, { fill: WHITE, stroke: null, seed: 1201 + i, shift: [0, 0] });
      // fluffy brim
      const brim: Pt[] = [];
      for (let i = 0; i <= 10; i++) brim.push([x - r * 1.05 + (i / 10) * r * 2.1, y + W * 0.21 + (i % 2 ? -W * 0.014 : W * 0.01)]);
      for (let i = 10; i >= 0; i--) brim.push([x - r * 1.05 + (i / 10) * r * 2.1, y + W * 0.33 + (i % 2 ? W * 0.012 : -W * 0.006)]);
      pen.blob(brim, { fill: WHITE, width: lw(W), seed: 1210, rough: 0.4 });
      // pompom
      pen.circle(tipX + W * 0.04, tipY + W * 0.06, W * 0.09, { fill: WHITE, width: lw(W), seed: 1211 });
    },
  },
];

export const hatById = (id: string | undefined) => HATS.find((h) => h.id === id) ?? HATS[0];
/** The hat (if any) unlocked by reaching exactly this level. */
export const hatForLevel = (level: number) => HATS.find((h) => h.level === level && h.id !== 'none') ?? null;
export const hatForStreak = (days: number) => HATS.find((h) => h.streak === days) ?? null;
export const hatUnlocked = (h: Hat, level: number, bestStreak: number, hasStamp: (id: string) => boolean = () => false) =>
  h.stamp ? hasStamp(h.stamp.id) : h.streak ? bestStreak >= h.streak : level >= h.level;
export const lockLabel = (h: Hat) => (h.stamp ? h.stamp.label : h.streak ? `${h.streak}-day streak` : `Lv ${h.level}`);

/** Kongi body colours, unlocked after the last hat (levels 11+). */
export const BODIES = [
  { id: 'white', name: 'mochi', color: '#fffdf7', level: 1 },
  { id: 'peach', name: 'peach', color: '#ffe0cf', level: 11 },
  { id: 'mint', name: 'mint', color: '#d6f1df', level: 12 },
  { id: 'sky', name: 'sky', color: '#d6e8fa', level: 13 },
  { id: 'lilac', name: 'lilac', color: '#e7dcfa', level: 14 },
  { id: 'butter', name: 'banana', color: '#fff0bd', level: 15 },
];
export const bodyById = (id: string | undefined) => BODIES.find((b) => b.id === id) ?? BODIES[0];
export const bodyForLevel = (level: number) => BODIES.find((b) => b.level === level && b.id !== 'white') ?? null;
