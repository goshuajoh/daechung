import { Pen, type Pt } from './pen';
import { BERRY, BUTTER, INK, LILAC, MINT, PEACH, PINK, SKY, WHITE } from './palette';
import { addStamp, hasStamp } from './progress';
import { sfx } from './audio';

/**
 * 칭찬 도장: the praise stamps a Korean teacher puts in your notebook.
 * Collectibles for things worth celebrating; each one is a little ink stamp.
 */
export interface Stamp {
  id: string;
  name: string;
  /** how to get it (shown on locked stamps too, so there's always a next goal) */
  hint: string;
  ink: string;
  bg: string;
  icon: (pen: Pen, x: number, y: number, r: number, ink: string) => void;
}

const flame = (pen: Pen, x: number, y: number, r: number, ink: string, label?: string) => {
  const pts: Pt[] = [
    [0, -1], [0.38, -0.42], [0.62, 0.1], [0.5, 0.62], [0, 0.86], [-0.5, 0.62], [-0.62, 0.12], [-0.34, -0.2], [-0.12, 0.02],
  ];
  pen.blob(pts.map(([a, b]) => [x + a * r, y + b * r] as Pt), { stroke: ink, fill: PEACH, width: 2.6, seed: 31 });
  if (label) pen.text(label, x, y + r * 0.34, { size: r * (label.length > 1 ? 0.8 : 1), color: ink, outline: WHITE });
};

const STAMPS_: Stamp[] = [
  {
    id: 'first', name: 'first daily', hint: 'finish a Daily', ink: BERRY, bg: PINK,
    icon: (p, x, y, r, ink) => p.star(x, y, r * 0.85, { stroke: ink, fill: BUTTER, width: 2.6, seed: 11 }),
  },
  {
    id: 'bullseye', name: 'bullseye', hint: 'score 100 on any round', ink: BERRY, bg: WHITE,
    icon: (p, x, y, r, ink) => {
      p.circle(x, y, r * 0.86, { stroke: ink, fill: PEACH, width: 2.4, seed: 12 });
      p.circle(x, y, r * 0.52, { stroke: ink, fill: WHITE, width: 2.2, seed: 13 });
      p.circle(x, y, r * 0.18, { stroke: ink, fill: ink, width: 2, seed: 14, shift: [0, 0] });
    },
  },
  {
    id: 'speedy', name: 'speedy', hint: 'answer super fast (a +18 speed bonus)', ink: '#5b8fc4', bg: SKY,
    icon: (p, x, y, r, ink) => p.poly([[x + 0.15 * r, y - r], [x - 0.5 * r, y + 0.12 * r], [x - 0.02 * r, y + 0.12 * r], [x - 0.2 * r, y + r], [x + 0.52 * r, y - 0.18 * r], [x + 0.04 * r, y - 0.18 * r]].map(([a, b]) => [a, b] as Pt), { stroke: ink, fill: BUTTER, width: 2.6, seed: 15, rough: 0.5 }),
  },
  {
    id: 'combo', name: 'on fire', hint: 'score 70+ four rounds in a row', ink: '#d9603f', bg: PEACH,
    icon: (p, x, y, r, ink) => flame(p, x, y + r * 0.05, r, ink),
  },
  {
    id: 'great', name: 'sharp eyes', hint: 'score 900+ in a Daily or Quick Run', ink: '#4f9a6a', bg: MINT,
    icon: (p, x, y, r, ink) => {
      p.ellipse(x, y, r * 0.95, r * 0.55, { stroke: ink, fill: WHITE, width: 2.6, seed: 16 });
      p.circle(x, y, r * 0.36, { stroke: ink, fill: '#7cc495', width: 2.2, seed: 17 });
      p.circle(x, y, r * 0.13, { stroke: null, fill: ink, seed: 18, shift: [0, 0] });
    },
  },
  {
    id: 'legend', name: 'human ruler', hint: 'score 1020+ in a Daily or Quick Run', ink: '#9a6a2a', bg: BUTTER,
    icon: (p, x, y, r, ink) => {
      p.rrect(x - r * 0.95, y - r * 0.32, r * 1.9, r * 0.64, 5, { stroke: ink, fill: '#ffd36b', width: 2.6, seed: 19 });
      for (let i = 1; i < 8; i++) p.line(x - r * 0.95 + (i * r * 1.9) / 8, y - r * 0.32, x - r * 0.95 + (i * r * 1.9) / 8, y - r * 0.32 + (i % 2 ? r * 0.22 : r * 0.34), { stroke: ink, width: 2, seed: 20 + i });
    },
  },
  {
    id: 'streak3', name: '3 days', hint: 'play the Daily 3 days in a row', ink: '#d9603f', bg: PEACH,
    icon: (p, x, y, r, ink) => flame(p, x, y, r, ink, '3'),
  },
  {
    id: 'streak7', name: 'a whole week', hint: 'play the Daily 7 days in a row', ink: '#d9603f', bg: BUTTER,
    icon: (p, x, y, r, ink) => flame(p, x, y, r, ink, '7'),
  },
  {
    id: 'streak30', name: 'a whole month', hint: 'play the Daily 30 days in a row', ink: BERRY, bg: PINK,
    icon: (p, x, y, r, ink) => flame(p, x, y, r, ink, '30'),
  },
  {
    id: 'rival', name: 'winner', hint: "beat a friend's challenge link", ink: '#9a6a2a', bg: BUTTER,
    icon: (p, x, y, r, ink) => {
      p.poly([[x - r * 0.62, y - r * 0.8], [x + r * 0.62, y - r * 0.8], [x + r * 0.5, y - r * 0.1], [x, y + r * 0.25], [x - r * 0.5, y - r * 0.1]], { stroke: ink, fill: '#ffd36b', width: 2.6, seed: 30 });
      p.line(x, y + r * 0.25, x, y + r * 0.62, { stroke: ink, width: 3, seed: 31 });
      p.rrect(x - r * 0.4, y + r * 0.6, r * 0.8, r * 0.26, 4, { stroke: ink, fill: WHITE, width: 2.4, seed: 32 });
    },
  },
  {
    id: 'gift', name: 'pen pal', hint: 'send a challenge to a friend', ink: '#5b8fc4', bg: SKY,
    icon: (p, x, y, r, ink) => {
      p.rrect(x - r * 0.9, y - r * 0.58, r * 1.8, r * 1.16, 6, { stroke: ink, fill: WHITE, width: 2.6, seed: 33 });
      p.poly([[x - r * 0.86, y - r * 0.52], [x, y + r * 0.12], [x + r * 0.86, y - r * 0.52]], { stroke: ink, width: 2.4, seed: 34 }, false);
      p.circle(x, y + r * 0.12, r * 0.16, { stroke: ink, fill: BERRY, width: 2, seed: 35 });
    },
  },
  {
    id: 'party', name: 'party host', hint: 'finish a Party with friends', ink: '#8a68c0', bg: LILAC,
    icon: (p, x, y, r, ink) => {
      p.poly([[x, y - r], [x + r * 0.62, y + r * 0.78], [x - r * 0.62, y + r * 0.78]], { stroke: ink, fill: PINK, width: 2.6, seed: 36 });
      p.circle(x - r * 0.15, y + r * 0.2, r * 0.1, { stroke: null, fill: ink, seed: 37, shift: [0, 0] });
      p.circle(x + r * 0.22, y + r * 0.5, r * 0.1, { stroke: null, fill: ink, seed: 38, shift: [0, 0] });
      p.circle(x, y - r, r * 0.18, { stroke: ink, fill: BUTTER, width: 2, seed: 39 });
    },
  },
  {
    id: 'owl', name: 'night owl', hint: 'finish a Daily after midnight', ink: '#5a4f9a', bg: LILAC,
    icon: (p, x, y, r, ink) => {
      p.blob([[x + r * 0.2, y - r * 0.9], [x - r * 0.55, y - r * 0.55], [x - r * 0.8, y + r * 0.1], [x - r * 0.4, y + r * 0.78], [x + r * 0.35, y + r * 0.85], [x + r * 0.85, y + r * 0.35], [x + r * 0.2, y + r * 0.4], [x - r * 0.15, y], [x - r * 0.05, y - r * 0.5]], { stroke: ink, fill: BUTTER, width: 2.6, seed: 40 });
      p.star(x + r * 0.55, y - r * 0.5, r * 0.22, { stroke: ink, fill: WHITE, width: 2, seed: 41 });
    },
  },
  {
    id: 'bird', name: 'early bird', hint: 'finish a Daily before 8am', ink: '#c98a1e', bg: BUTTER,
    icon: (p, x, y, r, ink) => {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        p.line(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95, { stroke: ink, width: 2.4, seed: 42 + i });
      }
      p.circle(x, y, r * 0.45, { stroke: ink, fill: '#ffd36b', width: 2.6, seed: 50 });
    },
  },
  {
    id: 'tour', name: 'tourist', hint: 'play every mini-game', ink: '#4f9a6a', bg: MINT,
    icon: (p, x, y, r, ink) => {
      p.circle(x, y, r * 0.86, { stroke: ink, fill: '#bfe7f5', width: 2.6, seed: 51 });
      p.blob([[x - r * 0.5, y - r * 0.4], [x - r * 0.1, y - r * 0.55], [x + r * 0.05, y - r * 0.15], [x - r * 0.25, y + r * 0.2], [x - r * 0.6, y]], { stroke: ink, fill: '#8fd19e', width: 2, seed: 52 });
      p.blob([[x + r * 0.25, y + r * 0.15], [x + r * 0.62, y + r * 0.05], [x + r * 0.55, y + r * 0.5], [x + r * 0.25, y + r * 0.55]], { stroke: ink, fill: '#8fd19e', width: 2, seed: 53 });
    },
  },
  {
    id: 'ace', name: 'all-rounder', hint: 'score 90+ in every mini-game', ink: '#9a6a2a', bg: BUTTER,
    icon: (p, x, y, r, ink) => p.poly([[x - r * 0.85, y + r * 0.6], [x - r * 0.95, y - r * 0.5], [x - r * 0.42, y - r * 0.05], [x, y - r * 0.8], [x + r * 0.42, y - r * 0.05], [x + r * 0.95, y - r * 0.5], [x + r * 0.85, y + r * 0.6]], { stroke: ink, fill: '#ffd36b', width: 2.6, seed: 54 }),
  },
  {
    id: 'back', name: 'welcome back', hint: 'come back after a few days away', ink: BERRY, bg: PINK,
    icon: (p, x, y, r, ink) => p.blob([[x, y + r * 0.82], [x - r * 0.85, y - r * 0.05], [x - r * 0.6, y - r * 0.72], [x - r * 0.05, y - r * 0.55], [x, y - r * 0.4], [x + r * 0.05, y - r * 0.55], [x + r * 0.6, y - r * 0.72], [x + r * 0.85, y - r * 0.05]], { stroke: ink, fill: BERRY, width: 2.6, seed: 55, rough: 0.5 }),
  },
  {
    id: 'survivor', name: 'survivor', hint: 'last 10 rounds in Survival', ink: BERRY, bg: MINT,
    icon: (p, x, y, r, ink) => {
      p.blob([[x, y + r * 0.85], [x - r * 0.85, y], [x - r * 0.85, y - r * 0.5], [x - r * 0.45, y - r * 0.85], [x, y - r * 0.45], [x + r * 0.45, y - r * 0.85], [x + r * 0.85, y - r * 0.5], [x + r * 0.85, y]], { stroke: ink, fill: PINK, width: 2.6, seed: 57, rough: 0.5 });
      // a little plaster across it
      p.rrect(x - r * 0.55, y - r * 0.18, r * 1.1, r * 0.36, 4, { stroke: ink, fill: BUTTER, width: 2, seed: 58, shift: [0, 0] });
    },
  },
  {
    id: 'winter', name: 'snow day', hint: 'play a Daily in December (unlocks a winter hat)', ink: '#5b8fc4', bg: WHITE,
    icon: (p, x, y, r, ink) => {
      // a six-armed snowflake
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        p.line(x, y, x + c * r * 0.9, y + s * r * 0.9, { stroke: ink, width: 2.6, seed: 59 + i });
        const bx = x + c * r * 0.55, by = y + s * r * 0.55;
        p.line(bx, by, bx + Math.cos(a + 0.7) * r * 0.25, by + Math.sin(a + 0.7) * r * 0.25, { stroke: ink, width: 2, seed: 70 + i });
        p.line(bx, by, bx + Math.cos(a - 0.7) * r * 0.25, by + Math.sin(a - 0.7) * r * 0.25, { stroke: ink, width: 2, seed: 80 + i });
      }
    },
  },
  {
    id: 'lv10', name: 'level 10', hint: 'reach level 10', ink: '#8a68c0', bg: LILAC,
    icon: (p, x, y, r, ink) => {
      p.circle(x, y, r * 0.8, { stroke: ink, fill: BUTTER, width: 2.6, seed: 56 });
      p.text('10', x, y + 1, { size: r * 0.82, color: ink });
    },
  },
];
export const STAMPS = STAMPS_;
export const stampById = (id: string) => STAMPS.find((s) => s.id === id);

/** Draw a stamp (static: no line boil) into a fresh canvas of css size `size`. */
export function stampCanvas(st: Stamp | null, size: number, rot = 0): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = cv.height = Math.round(size * dpr);
  cv.style.width = cv.style.height = `${size}px`;
  const ctx = cv.getContext('2d')!;
  ctx.scale(dpr, dpr);
  drawStamp(new Pen(ctx), st, size / 2, size / 2, size * 0.44, rot);
  return cv;
}

export function drawStamp(pen: Pen, st: Stamp | null, x: number, y: number, R: number, rot = 0) {
  const ctx = pen.ctx;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  if (!st) {
    pen.circle(0, 0, R, { stroke: INK, width: 2, dash: [5, 6], alpha: 0.3, seed: 60 });
    pen.text('?', 0, 2, { size: R * 0.8, alpha: 0.28 });
  } else {
    // a rubber stamp: thick outer ring, thin inner ring, a little uneven ink
    pen.circle(0, 0, R, { stroke: st.ink, fill: st.bg, width: 3.4, seed: 61, shift: [2, 2] });
    pen.circle(0, 0, R * 0.82, { stroke: st.ink, width: 1.6, alpha: 0.7, seed: 62 });
    st.icon(pen, 0, 0, R * 0.58, st.ink);
  }
  ctx.restore();
}

/* ——— earning + the little "new stamp!" toast ——— */

let held = false;
const queue: Stamp[] = [];
let showing = false;

/** Give a stamp. Returns true if it's new. Toasts wait while a run is in play. */
export function earn(id: string): boolean {
  if (hasStamp(id)) return false;
  const st = stampById(id);
  if (!st) return false;
  addStamp(id);
  queue.push(st);
  if (!held) flush();
  return true;
}

/** While true, new-stamp toasts wait (so they don't cover a round in play). */
export function holdStamps(on: boolean) {
  held = on;
  if (!on) flush();
}

function flush() {
  if (showing || held) return;
  const st = queue.shift();
  if (!st) return;
  showing = true;
  const t = document.createElement('div');
  t.className = 'stamp-toast';
  t.setAttribute('role', 'status');
  t.innerHTML = `<div class="st-art"></div><div><em>new stamp!</em><b></b><span></span></div>`;
  t.querySelector('b')!.textContent = st.name;
  t.querySelector('span')!.textContent = st.hint;
  t.querySelector('.st-art')!.appendChild(stampCanvas(st, 56, -0.12));
  document.body.appendChild(t);
  sfx.stamp();
  let gone = false;
  const done = () => {
    if (gone) return;
    gone = true;
    t.remove();
    showing = false;
    flush();
  };
  t.addEventListener('click', done, { once: true });
  window.setTimeout(() => {
    t.classList.add('out');
    window.setTimeout(done, 300);
  }, 2600);
}
