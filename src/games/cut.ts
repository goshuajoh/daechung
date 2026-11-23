import type { GameDef, Shell } from '../lib/shell';
import type { Pen, Pt } from '../lib/pen';
import { sfx } from '../lib/audio';
import { BERRY, BUTTER, INK, LEAF, PEACH, PINK, WHITE } from '../lib/palette';
import { clamp, easeOutBack, rand, randInt, shuffle } from '../lib/rng';

interface Food {
  name: string;
  /** Side view, centred vertically on y. */
  body(pen: Pen, x0: number, y: number, len: number, hgt: number): void;
  /** Cross-section face (an ellipse) centred at x,y. */
  face(pen: Pen, x: number, y: number, rx: number, ry: number): void;
  ratio: number; // height / length
}

const sq = (pen: Pen, x: number, y: number, rx: number, ry: number, fill: string, seed: number, stroke: string | null = null) =>
  pen.ellipse(x, y, rx, ry, { fill, stroke, width: 2, shift: [0, 0], seed, rough: 0.5 });

const FOODS: Food[] = [
  {
    name: 'kimbap',
    ratio: 0.2,
    body(pen, x0, y, len, h) {
      pen.rrect(x0, y - h / 2, len, h, h * 0.42, { fill: '#46553f', seed: 1, shift: [3, 3] });
      for (let i = 0; i < 6; i++) {
        const x = x0 + len * (0.12 + i * 0.15);
        pen.line(x, y - h * 0.3, x + len * 0.05, y - h * 0.3, { stroke: '#7d9270', width: 2.5, seed: 2 + i, rough: 0.4 });
      }
    },
    face(pen, x, y, rx, ry) {
      sq(pen, x, y, rx, ry, '#46553f', 20, INK);
      sq(pen, x, y, rx * 0.82, ry * 0.84, WHITE, 21);
      sq(pen, x - rx * 0.2, y - ry * 0.3, rx * 0.22, ry * 0.18, BUTTER, 22, INK);
      sq(pen, x + rx * 0.2, y + ry * 0.05, rx * 0.2, ry * 0.16, '#f39a5b', 23, INK);
      sq(pen, x - rx * 0.15, y + ry * 0.35, rx * 0.2, ry * 0.15, LEAF, 24, INK);
      sq(pen, x + rx * 0.25, y - ry * 0.38, rx * 0.16, ry * 0.13, PINK, 25, INK);
    },
  },
  {
    name: 'baguette',
    ratio: 0.2,
    body(pen, x0, y, len, h) {
      const pts: Pt[] = [];
      const n = 14;
      for (let i = 0; i <= n; i++) {
        const k = i / n;
        const bulge = Math.pow(Math.sin(k * Math.PI), 0.35);
        pts.push([x0 + k * len, y - (h / 2) * bulge]);
      }
      for (let i = n; i >= 0; i--) {
        const k = i / n;
        const bulge = Math.pow(Math.sin(k * Math.PI), 0.3);
        pts.push([x0 + k * len, y + (h / 2) * bulge * 0.9]);
      }
      pen.blob(pts, { fill: '#eab36d', seed: 30, shift: [3, 3] });
      for (let i = 0; i < 5; i++) {
        const cx = x0 + len * (0.16 + i * 0.17);
        pen.curve([[cx - h * 0.35, y + h * 0.05], [cx, y - h * 0.18], [cx + h * 0.4, y - h * 0.3]], { stroke: INK, width: 2.5, seed: 31 + i });
      }
    },
    face(pen, x, y, rx, ry) {
      sq(pen, x, y, rx, ry, '#eab36d', 40, INK);
      sq(pen, x, y, rx * 0.8, ry * 0.8, '#fff0d2', 41);
      for (let i = 0; i < 4; i++) sq(pen, x + rx * (i % 2 ? 0.2 : -0.25), y + ry * (-0.4 + i * 0.25), rx * 0.1, ry * 0.06, '#e8cfa0', 42 + i);
    },
  },
  {
    name: 'sausage',
    ratio: 0.17,
    body(pen, x0, y, len, h) {
      pen.ellipse(x0 - h * 0.12, y, h * 0.12, h * 0.16, { fill: '#e48a76', seed: 50, width: 2.5 });
      pen.ellipse(x0 + len + h * 0.12, y, h * 0.12, h * 0.16, { fill: '#e48a76', seed: 51, width: 2.5 });
      pen.rrect(x0, y - h / 2, len, h, h / 2, { fill: '#e48a76', seed: 52, shift: [3, 3] });
      pen.curve([[x0 + h * 0.5, y - h * 0.24], [x0 + len * 0.45, y - h * 0.3], [x0 + len - h * 0.8, y - h * 0.24]], { stroke: WHITE, width: 4, seed: 53 });
    },
    face(pen, x, y, rx, ry) {
      sq(pen, x, y, rx, ry, '#e48a76', 60, INK);
      sq(pen, x, y, rx * 0.82, ry * 0.85, '#f6bfae', 61);
      for (let i = 0; i < 5; i++) sq(pen, x + rx * (((i * 37) % 7) / 7 - 0.4), y + ry * (-0.5 + i * 0.24), rx * 0.08, ry * 0.05, WHITE, 62 + i);
    },
  },
  {
    name: 'swiss roll',
    ratio: 0.3,
    body(pen, x0, y, len, h) {
      pen.rrect(x0, y - h / 2, len, h, h * 0.25, { fill: '#f6cf7f', seed: 70, shift: [3, 3] });
      for (let i = 0; i < 9; i++) {
        pen.circle(x0 + len * (0.08 + i * 0.105), y - h * 0.32 + (i % 2) * 6, 2.2, { fill: WHITE, stroke: null, shift: [0, 0], seed: 71 + i });
      }
    },
    face(pen, x, y, rx, ry) {
      sq(pen, x, y, rx, ry, '#f6cf7f', 80, INK);
      const spiral: Pt[] = [];
      for (let a = 0; a < Math.PI * 5; a += 0.35) {
        const r = 0.12 + (a / (Math.PI * 5)) * 0.72;
        spiral.push([x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r]);
      }
      pen.curve(spiral, { stroke: WHITE, width: 4, seed: 81, rough: 0.2 });
    },
  },
  {
    name: 'cucumber',
    ratio: 0.18,
    body(pen, x0, y, len, h) {
      pen.rrect(x0, y - h / 2, len, h, h * 0.48, { fill: '#7fbf6a', seed: 90, shift: [3, 3] });
      for (let i = 0; i < 3; i++) {
        pen.curve([[x0 + h * 0.6, y - h * 0.22 + i * h * 0.2], [x0 + len - h * 0.6, y - h * 0.2 + i * h * 0.2]], { stroke: '#5f9e4e', width: 2.5, seed: 91 + i });
      }
      for (let i = 0; i < 12; i++) {
        pen.circle(x0 + len * (0.07 + i * 0.078), y + (i % 3 - 1) * h * 0.25, 1.8, { fill: '#e6f5d0', stroke: null, shift: [0, 0], seed: 95 + i });
      }
    },
    face(pen, x, y, rx, ry) {
      sq(pen, x, y, rx, ry, '#5f9e4e', 100, INK);
      sq(pen, x, y, rx * 0.84, ry * 0.86, '#d9f0c2', 101);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        sq(pen, x + Math.cos(a) * rx * 0.35, y + Math.sin(a) * ry * 0.35, rx * 0.08, ry * 0.07, '#f5fbe8', 102 + i, INK);
      }
    },
  },
];

function drawKnife(pen: Pen, x: number, bottom: number, lift = 0, sc = 1) {
  const top = bottom - 64 * sc - lift;
  const b = bottom - lift;
  const W = 24 * sc;
  pen.poly([[x, top], [x + W, top], [x + W, b - 18 * sc], [x + 6 * sc, b], [x, b - 2]], { fill: '#e3eaf1', seed: 120, rough: 0.6 });
  pen.line(x + W * 0.66, top + 8 * sc, x + W * 0.66, b - 20 * sc, { stroke: WHITE, width: 3, seed: 121 });
  pen.rrect(x + 3 * sc, top - 50 * sc, 18 * sc, 52 * sc, 7 * sc, { fill: '#c98f63', seed: 122 });
  pen.circle(x + 12 * sc, top - 34 * sc, 2.4, { fill: INK, stroke: null, shift: [0, 0], seed: 123 });
  pen.circle(x + 12 * sc, top - 16 * sc, 2.4, { fill: INK, stroke: null, shift: [0, 0], seed: 124 });
}

function pickPercent(): number {
  for (;;) {
    const p = randInt(12, 88);
    if (Math.abs(p - 50) > 3) return p;
  }
}

let order: Food[] = [];

export const cut: GameDef = {
  id: 'cut',
  name: 'Fair Slice',
  kr: '자르기',
  blurb: 'Cut it at exactly 37%. Your sibling is watching.',
  howto: 'Move the knife and <b>chop</b> so the <b>left</b> piece is exactly the % I ask for.',
  color: PEACH,
  rounds: 5,
  ranks: [
    [470, 'Laser Cutter'],
    [410, 'Sushi Chef'],
    [330, 'Fair Sibling'],
    [230, 'Cake Butcher'],
    [0, 'Just Eats It Whole'],
  ],

  thumb(pen, w, h, t) {
    const food = FOODS[Math.floor(t / 3) % FOODS.length];
    const len = w * 0.7, hgt = Math.min(len * food.ratio, h * 0.24);
    const x0 = (w - len) / 2, y = h * 0.72;
    food.body(pen, x0, y, len, hgt);
    const kx = x0 + len * (0.37 + Math.sin(t * 1.4) * 0.12);
    pen.line(kx, y - hgt / 2 - 4, kx, y + hgt / 2 + 6, { stroke: BERRY, width: 2, dash: [5, 6], seed: 130 });
    const sc = Math.min(1, h / 190);
    drawKnife(pen, kx, y - hgt / 2 - 6, (4 + Math.abs(Math.sin(t * 3)) * 10) * sc, sc);
    pen.text('37%', w * 0.2, h * 0.2, { size: Math.min(30, h * 0.18) });
  },

  async play(g: Shell, round: number) {
    if (round === 0) order = shuffle([...FOODS]);
    const food = order[round % order.length];
    const target = pickPercent();
    const lenK = rand(0.6, 0.86);
    const offK = rand(0, 1);
    let knifeK = 0.5; // 0..1 along the food
    let chopAt = 0;
    let aimed = false;

    const layout = (w: number, h: number) => {
      const len = Math.min(w - 70, 720) * lenK;
      const hgt = clamp(len * food.ratio, 34, 90);
      const x0 = 35 + (w - 70 - len) * offK;
      return { len, hgt, x0, y: h * 0.56 };
    };

    g.say(`cut the ${food.name} so the <b>left</b> piece is <b>${target}%</b>`, 'focus');
    const stage = g.stage;

    stage.draw = (pen, w, h, t) => {
      const { len, hgt, x0, y } = layout(w, h);
      pen.text(`${target}%`, w / 2, 42, { size: 46 });
      // shadow
      pen.ellipse(x0 + len / 2, y + hgt / 2 + 12, len * 0.52, 9, { fill: 'rgba(59,44,40,0.1)', stroke: null, shift: [0, 0], seed: 140 });
      const cutX = x0 + len * knifeK;

      if (!chopAt) {
        food.body(pen, x0, y, len, hgt);
        if (aimed) pen.line(cutX, y - hgt / 2 - 6, cutX, y + hgt / 2 + 8, { stroke: BERRY, width: 2, dash: [5, 6], seed: 141 });
        drawKnife(pen, cutX, y - hgt / 2 - 8, aimed ? 0 : 10 + Math.sin(t * 4) * 6);
        if (!aimed) pen.text('move me', cutX + 60, y - hgt / 2 - 70, { size: 20, font: 'gaegu', alpha: 0.6 });
        return;
      }

      const k = t - chopAt;
      const plunge = clamp(k / 0.1, 0, 1);
      const apart = easeOutBack(clamp((k - 0.1) / 0.45, 0, 1));
      const ctx = pen.ctx;
      const pieces: [number, number, number, number][] = [
        // clipFrom, clipTo, dx, rot
        [x0 - 60, cutX, -16 * apart, -0.05 * apart],
        [cutX, x0 + len + 60, 16 * apart, 0.05 * apart],
      ];
      pieces.forEach(([a, b, dx, rot], i) => {
        ctx.save();
        const pivot = i === 0 ? a + (cutX - a) / 2 : cutX + (b - cutX) / 2;
        ctx.translate(pivot + dx, y + hgt / 2);
        ctx.rotate(rot);
        ctx.translate(-pivot, -(y + hgt / 2));
        ctx.beginPath();
        ctx.rect(a, y - hgt * 2, b - a, hgt * 4);
        ctx.clip();
        food.body(pen, x0, y, len, hgt);
        ctx.restore();
        if (i === 1 && apart > 0.05) {
          ctx.save();
          ctx.translate(pivot + dx, y + hgt / 2);
          ctx.rotate(rot);
          ctx.translate(-pivot, -(y + hgt / 2));
          food.face(pen, cutX + 2, y, hgt * 0.2 * apart, hgt * 0.5);
          ctx.restore();
        }
      });
      // knife: plunge then lift away
      const lift = plunge < 1 ? -hgt * plunge - 8 : -hgt - 8 + Math.pow(clamp((k - 0.25) / 0.4, 0, 1), 2) * 160;
      if (k < 0.8) {
        ctx.save();
        ctx.globalAlpha = 1 - clamp((k - 0.5) / 0.3, 0, 1);
        drawKnife(pen, cutX, y - hgt / 2 - 8, lift);
        ctx.restore();
      }

      // reveal ruler under the food
      if (k > 0.7) {
        const pop = easeOutBack(clamp((k - 0.7) / 0.4, 0, 1));
        const ry = y + hgt / 2 + 46;
        pen.line(x0, ry, x0 + len, ry, { width: 2.5, seed: 150 });
        pen.line(x0, ry - 8, x0, ry + 8, { width: 2.5, seed: 151 });
        pen.line(x0 + len, ry - 8, x0 + len, ry + 8, { width: 2.5, seed: 152 });
        const tx = x0 + (len * target) / 100;
        pen.line(tx, ry - 12, tx, ry + 12, { stroke: BERRY, width: 4, seed: 153 });
        pen.poly([[tx, ry - 12], [tx + 16, ry - 7], [tx, ry - 2]], { fill: BERRY, seed: 154, rough: 0.4 });
        pen.poly([[cutX - 8, ry + 22], [cutX + 8, ry + 22], [cutX, ry + 9]], { fill: INK, seed: 155, rough: 0.4 });
        const left = tx < cutX;
        pen.text(`${target}%`, tx + (left ? -8 : 8), ry - 26, { size: 21 * pop + 1, color: BERRY, align: left ? 'right' : 'left', outline: WHITE });
        pen.text(`you ${(knifeK * 100).toFixed(1)}%`, cutX + (left ? 8 : -8), ry + 40, { size: 21 * pop + 1, align: left ? 'left' : 'right', outline: WHITE });
      }
    };

    const canvas = stage.canvas;
    let dragging = false;
    const aim = (e: PointerEvent) => {
      const { len, x0 } = layout(stage.w, stage.h);
      const [px] = stage.local(e);
      const prev = knifeK;
      knifeK = clamp((px - x0) / len, 0.02, 0.98);
      if (Math.floor(prev * 40) !== Math.floor(knifeK * 40)) sfx.click();
      if (!aimed) {
        aimed = true;
        confirm.el.disabled = false;
      }
      g.look = [clamp((px / stage.w) * 2 - 1, -1, 1), 0.3];
    };
    const move = (e: PointerEvent) => {
      if (chopAt) return;
      if (e.pointerType === 'mouse' || dragging) aim(e);
    };
    const down = (e: PointerEvent) => {
      if (chopAt) return;
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      aim(e);
    };
    const up = (e: PointerEvent) => {
      dragging = false;
      // with a mouse, clicking on the stage chops right away
      if (e.pointerType === 'mouse' && aimed && !chopAt) confirm.el.click();
    };
    const key = (e: KeyboardEvent) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d || chopAt) return;
      e.preventDefault();
      knifeK = clamp(knifeK + d * (e.shiftKey ? 0.05 : 0.005), 0.02, 0.98);
      aimed = true;
      confirm.el.disabled = false;
      sfx.click();
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointerup', up);
    window.addEventListener('keydown', key);

    const confirm = g.confirmButton('chop!', false);
    try {
      await confirm.pressed;
    } finally {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', key);
    }
    chopAt = stage.time;
    g.look = undefined;
    setTimeout(() => sfx.chop(), 90);
    g.setMood('wow', 900);
    await g.wait(1300);
    const guess = Math.round(knifeK * 1000) / 10;
    const err = Math.abs(guess - target);
    const score = 100 * Math.pow(Math.max(0, 1 - err / 20), 1.3);
    return { score, detail: err < 0.5 ? `basically perfect: ${guess}%!` : `you cut ${guess}% — off by <b>${err.toFixed(1)}</b>` };
  },
};
