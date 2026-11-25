import type { GameDef, Shell } from '../lib/shell';
import type { Pen, Pt } from '../lib/pen';
import { sfx } from '../lib/audio';
import { BERRY, BUTTER, INK, LILAC, MINT, PEACH, SKY, WHITE } from '../lib/palette';
import { drawKongi } from '../lib/kongi';
import { clamp, easeInOut, easeOutBack, lerp, rand, random } from '../lib/rng';
import { drawHand, drawPill, drawPrompt, loop, span } from '../lib/hand';

/**
 * Straighten — Kongi's portrait hangs crooked: drag it level.
 * Slanted wallpaper and a tilted room pull your sense of "level" with them
 * (the rod-and-frame and Zöllner illusions), so later rounds lie to you.
 */

const D2R = Math.PI / 180;
const FRAME = '#c98f55';

interface Room {
  /** wallpaper stripe angle (degrees), 0 = none */
  stripes: number;
  /** the room's outline (floor, ceiling, window) tilt (degrees) */
  room: number;
  /** frame colour */
  bg: string;
}

/** Room for a level. Signs are random, magnitudes grow. */
function makeRoom(level: number): Room {
  const s = () => (random() < 0.5 ? -1 : 1);
  const bg = [SKY, MINT, LILAC, PEACH, BUTTER][Math.floor(random() * 5)];
  if (level === 0) return { stripes: 0, room: 0, bg };
  if (level === 1) return { stripes: s() * rand(10, 14), room: 0, bg };
  if (level === 2) return { stripes: 0, room: s() * rand(5, 7), bg };
  const sign = s(); // stripes and room lean the same way: the strongest pull
  return { stripes: sign * rand(14, 20), room: sign * rand(6, 9) * (level === 4 ? 1.2 : 1), bg };
}

/** The wall behind: stripes (and a tilted room outline) filling the stage. */
function drawWall(pen: Pen, w: number, h: number, room: Room) {
  const ctx = pen.ctx;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(room.room * D2R);
  const R = Math.hypot(w, h);
  if (room.stripes) {
    // wallpaper: one cheap path of straight lines (it's background, it doesn't need to boil)
    const a = room.stripes * D2R;
    const dx = Math.cos(a), dy = Math.sin(a);
    ctx.beginPath();
    for (let k = -14; k <= 14; k++) {
      const ox = -dy * k * 26, oy = dx * k * 26;
      ctx.moveTo(ox - dx * R, oy - dy * R);
      ctx.lineTo(ox + dx * R, oy + dy * R);
    }
    ctx.strokeStyle = 'rgba(59,44,40,0.17)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (room.room) {
    // floor, ceiling and a window, all tilted with the room
    pen.line(-R, h * 0.36, R, h * 0.36, { width: 3, alpha: 0.4, seed: 1840 });
    pen.line(-R, -h * 0.44, R, -h * 0.44, { width: 2.5, alpha: 0.3, seed: 1841 });
    pen.rrect(w * 0.18, -h * 0.3, w * 0.22, h * 0.24, 6, { stroke: INK, width: 2.5, alpha: 0.35, seed: 1842 });
    pen.line(w * 0.29, -h * 0.3, w * 0.29, -h * 0.06, { width: 2, alpha: 0.3, seed: 1843 });
  }
  ctx.restore();
}

/** The hanging portrait, rotated by `deg` (clockwise) around its nail. */
function drawFrame(pen: Pen, nail: Pt, fw: number, fh: number, deg: number, bg: string, t: number) {
  const ctx = pen.ctx;
  // string from the nail to the frame's top corners (drawn rotated with the frame)
  pen.circle(nail[0], nail[1], 4, { fill: INK, stroke: null, seed: 1850, shift: [0, 0] });
  ctx.save();
  ctx.translate(nail[0], nail[1]);
  ctx.rotate(deg * D2R);
  const top = fh * 0.32;
  pen.line(0, 0, -fw * 0.36, top, { width: 2, seed: 1851 });
  pen.line(0, 0, fw * 0.36, top, { width: 2, seed: 1852 });
  pen.rrect(-fw / 2, top, fw, fh, 6, { fill: FRAME, width: 3, seed: 1853 });
  pen.rrect(-fw / 2 + 9, top + 9, fw - 18, fh - 18, 4, { fill: bg, width: 2.5, seed: 1854, shift: [0, 0] });
  drawKongi(pen, 0, top + fh - 14, Math.min(fw * 0.42, fh * 0.62), 'idle', t, { body: WHITE });
  ctx.restore();
}

/** A spirit level laid on the frame's top edge: the bubble drifts to the high side. */
function drawSpirit(pen: Pen, nail: Pt, fw: number, fh: number, deg: number, alpha = 1) {
  const ctx = pen.ctx;
  ctx.save();
  ctx.translate(nail[0], nail[1]);
  ctx.rotate(deg * D2R);
  ctx.globalAlpha *= alpha;
  const y = fh * 0.32 - 16, lw = fw * 0.7;
  pen.rrect(-lw / 2, y - 9, lw, 18, 8, { fill: '#e6f4b8', width: 2.5, seed: 1860, shift: [0, 0] });
  pen.line(-10, y - 7, -10, y + 7, { width: 1.5, seed: 1861 });
  pen.line(10, y - 7, 10, y + 7, { width: 1.5, seed: 1862 });
  // bubble floats up: toward the higher end (left when tilted clockwise)
  const off = clamp(-deg * 9, -lw / 2 + 12, lw / 2 - 12);
  pen.ellipse(off, y, 8, 5, { fill: WHITE, width: 1.8, seed: 1863, shift: [0, 0] });
  ctx.restore();
}

const DEMO_ROOM: Room = { stripes: 14, room: 0, bg: SKY };

export const straighten: GameDef = {
  id: 'straighten',
  name: 'Straighten',
  kr: '똑바로',
  short: 'Level',
  calm: true,
  blurb: "Kongi's picture is crooked. Make it level. The wallpaper lies.",
  howto: "Kongi's picture is hanging crooked. <b>Drag left or right</b> to turn it until it's perfectly <b>level</b>, then lock it in. Watch out: slanted wallpaper tricks your eyes.",
  verb: 'make it level!',
  color: '#c9e4a6',
  since: 4, // added during daily #2/#3 (timezones): joins from #4
  ranks: [
    [470, 'Human Spirit Level'],
    [420, 'Picture Perfect'],
    [340, 'Mostly Straight'],
    [240, 'A Bit Wonky'],
    [0, 'Gravity Who?'],
  ],

  thumb(pen, w, h, t) {
    drawWall(pen, w, h, DEMO_ROOM);
    const fw = Math.min(w * 0.56, h * 0.9), fh = fw * 0.66;
    drawFrame(pen, [w / 2, h * 0.12], fw, fh, Math.sin(t * 1.2) * 9, SKY, t);
  },

  steps: ['the picture is <b>crooked</b>', 'drag <b>left or right</b> to turn it level', "don't trust the wallpaper!"],

  demo(pen, w, h, t) {
    const k = loop(t, 5);
    drawWall(pen, w, h, DEMO_ROOM);
    const fw = Math.min(w * 0.42, h * 0.7), fh = fw * 0.66;
    const deg = k < 0.15 ? 12 : lerp(12, 0, easeInOut(span(k, 0.15, 0.6)));
    const nail: Pt = [w * 0.42, h * 0.1];
    drawFrame(pen, nail, fw, fh, deg, SKY, t);
    if (k > 0.66) drawSpirit(pen, nail, fw, fh, 0, span(k, 0.66, 0.74));
    const pill: Pt = [w * 0.86, h * 0.86];
    const press = k > 0.62 && k < 0.68 ? 1 : 0;
    drawPill(pen, pill[0], pill[1], 'level!', '#c9e4a6', press);
    const hx = lerp(w * 0.6, w * 0.3, easeInOut(span(k, 0.15, 0.6))), hy = h * 0.82;
    if (k < 0.58) drawHand(pen, hx, hy, { press: k > 0.12 ? 1 : 0, scale: 0.7 });
    else if (k < 0.8) {
      const m = easeInOut(span(k, 0.58, 0.62));
      drawHand(pen, lerp(hx, pill[0], m), lerp(hy, pill[1], m), { press, ripple: span(k, 0.62, 0.78), scale: 0.7 });
    }
  },

  async play(g: Shell, level: number) {
    // every random draw happens here, before the first await
    const room = makeRoom(level);
    const start = (random() < 0.5 ? -1 : 1) * rand(level < 2 ? 9 : 6, level < 2 ? 18 : 13);
    let deg = start;
    let touched = false;
    let dragging = false;
    let lastX = 0;
    let doneAt = 0;
    const born = g.stage.time;
    const stage = g.stage;

    g.say(
      g.tutorial
        ? 'drag <b>left or right</b> to turn the picture. the little level on top helps you this time!'
        : 'drag <b>left or right</b> until the picture is level. ignore the wallpaper!',
      'focus',
    );

    const layout = (w: number, h: number) => {
      const fw = Math.min(w * 0.6, (h - 120) * 0.95, 300), fh = fw * 0.66;
      return { nail: [w / 2, 96] as Pt, fw, fh };
    };

    stage.draw = (pen, w, h, t) => {
      drawWall(pen, w, h, room);
      // a soft panel behind the prompt so it stays readable over the stripes
      // a soft wash (the stage's own colour, feathered) behind the prompt so it stays readable
      const ctx = pen.ctx;
      const grad = ctx.createRadialGradient(w / 2, 44, 20, w / 2, 44, 150);
      grad.addColorStop(0, 'rgba(255,250,240,0.95)');
      grad.addColorStop(0.6, 'rgba(255,250,240,0.8)');
      grad.addColorStop(1, 'rgba(255,250,240,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(w / 2 - 150, 0, 300, 100);
      drawPrompt(pen, w, 'level?', 'make the picture');
      const { nail, fw, fh } = layout(w, h);
      drawFrame(pen, nail, fw, fh, deg, room.bg, t);
      if (g.tutorial && !doneAt) drawSpirit(pen, nail, fw, fh, deg);
      if (!touched && !doneAt && t - born > 1.2) drawHand(pen, w / 2 + Math.sin((t - born) * 2) * 50, h - 40, { press: 1, alpha: 0.85 });
      if (doneAt) {
        const k = clamp((t - doneAt) / 0.4, 0, 1);
        // the true level: a dashed line through the nail height, and the spirit level
        const y = nail[1] + fh * 0.32 + fh / 2;
        pen.line(w * 0.06, y, w * 0.94, y, { stroke: BERRY, width: 3, dash: [9, 8], seed: 1870, alpha: k });
        drawSpirit(pen, nail, fw, fh, deg, k);
        const pop = easeOutBack(clamp((t - doneAt - 0.3) / 0.35, 0, 1));
        if (pop > 0) pen.text(Math.abs(deg) < 0.5 ? 'level!' : `${Math.abs(deg).toFixed(1)}° off`, w / 2, h - 26, { size: Math.max(1, 24 * pop), color: BERRY, outline: WHITE });
      }
    };

    const canvas = stage.canvas;
    const set = (d: number) => {
      const prev = deg;
      deg = clamp(d, -35, 35);
      if (Math.floor(prev) !== Math.floor(deg)) sfx.click();
      touched = true;
      confirm.el.disabled = false;
    };
    const down = (e: PointerEvent) => {
      if (doneAt) return;
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      lastX = stage.local(e)[0];
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const x = stage.local(e)[0];
      // 100px of drag ≈ 16°: coarse enough to get close fast, fine enough to finish
      set(deg + (x - lastX) * 0.16);
      lastX = x;
    };
    const up = () => (dragging = false);
    const key = (e: KeyboardEvent) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d || doneAt) return;
      e.preventDefault();
      set(deg + d * (e.shiftKey ? 2 : 0.5));
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    window.addEventListener('keydown', key);
    const confirm = g.confirmButton('level!', false);
    let timedOut = false;
    try {
      timedOut = await g.lockIn(confirm, 8);
    } finally {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', key);
    }
    doneAt = stage.time;
    g.setMood(Math.abs(deg) < 1 ? 'cheer' : 'wow');
    sfx.whoosh(0.3);
    await g.wait(1300);
    if (timedOut && !touched) return { score: 0, detail: "time's up! it's still crooked" };
    const err = Math.abs(deg);
    const score = 100 * Math.pow(Math.max(0, 1 - err / 7), 1.3);
    const words = err < 0.5 ? 'perfectly level!' : err < 1.5 ? 'just a hair crooked' : err < 3 ? 'a little crooked' : err < 6 ? 'noticeably crooked' : 'very crooked';
    const side = err < 0.5 ? '' : ` · the ${deg > 0 ? 'right' : 'left'} side hangs low`;
    return { score, detail: `<b>${words}</b>${side}` };
  },
};
