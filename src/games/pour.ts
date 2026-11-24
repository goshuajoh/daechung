import type { GameDef, Shell } from '../lib/shell';
import type { Pen, Pt } from '../lib/pen';
import { sfx } from '../lib/audio';
import { APRICOT, BERRY, INK, WHITE } from '../lib/palette';
import { clamp, easeInOut, easeOutBack, lerp, pick, rand, randInt } from '../lib/rng';
import { drawHand, loop, span } from '../lib/hand';

interface Drink { name: string; color: string; foam: string }
const DRINKS: Drink[] = [
  { name: 'banana milk', color: '#ffe08f', foam: '#fff4cc' },
  { name: 'strawberry milk', color: '#f8b6c6', foam: '#fde0e8' },
  { name: 'matcha latte', color: '#b7d99a', foam: '#e3f1d3' },
  { name: 'iced choco', color: '#c9a182', foam: '#ead7c6' },
  { name: 'blue soda', color: '#a9d8f2', foam: '#dff1fb' },
];
/** Fill speed (cup heights per second) by level. */
const SPEED = [0.17, 0.21, 0.25, 0.3, 0.36];

function pickTarget() {
  for (;;) {
    const p = randInt(18, 92);
    if (Math.abs(p - 50) > 3) return p;
  }
}

interface Cup { x: number; y: number; w: number; h: number }

/** Straight-walled glass so "% full" means the same thing for height and volume. */
function drawCup(pen: Pen, c: Cup, fill: number, drink: Drink, t: number, wobble: number) {
  const ry = c.w * 0.12;
  const level = c.y + c.h - fill * c.h;
  // liquid
  if (fill > 0.002) {
    const wav = (x: number) => Math.sin(x * 0.06 + t * 8) * wobble * 4;
    const pts: Pt[] = [];
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const x = c.x + 4 + ((c.w - 8) * i) / n;
      pts.push([x, level + wav(x)]);
    }
    pts.push([c.x + c.w - 4, c.y + c.h - 2], [c.x + c.w / 2, c.y + c.h + ry * 0.7], [c.x + 4, c.y + c.h - 2]);
    pen.blob(pts, { fill: drink.color, stroke: null, shift: [0, 0], seed: 50, rough: 0.6 });
    pen.ellipse(c.x + c.w / 2, level, c.w / 2 - 5, ry * 0.8, { fill: drink.foam, stroke: INK, width: 2, seed: 51, rough: 0.5, shift: [0, 0] });
    // bubbles
    for (let i = 0; i < 5; i++) {
      const bx = c.x + c.w * (0.2 + ((i * 0.37) % 0.6));
      const by = c.y + c.h - ((t * 30 + i * 40) % Math.max(10, fill * c.h - 10)) - 6;
      if (by > level + 6) pen.circle(bx, by, 2.5, { stroke: WHITE, width: 1.6, seed: 52 + i, alpha: 0.8 });
    }
  }
  // glass walls (drawn over the liquid)
  pen.line(c.x, c.y, c.x, c.y + c.h, { width: 3.2, seed: 60 });
  pen.line(c.x + c.w, c.y, c.x + c.w, c.y + c.h, { width: 3.2, seed: 61 });
  pen.ellipse(c.x + c.w / 2, c.y + c.h, c.w / 2, ry, { stroke: INK, width: 3.2, seed: 62, rough: 0.6 });
  pen.ellipse(c.x + c.w / 2, c.y, c.w / 2, ry, { stroke: INK, width: 3.2, seed: 63, rough: 0.6 });
  pen.line(c.x + c.w * 0.82, c.y + c.h * 0.12, c.x + c.w * 0.82, c.y + c.h * 0.45, { stroke: WHITE, width: 4, seed: 64, alpha: 0.9 });
}

/** Pitcher tipping over the cup. `tip` 0..1. */
function drawPitcher(pen: Pen, mouth: Pt, tip: number, drink: Drink, scale = 1) {
  const ctx = pen.ctx;
  ctx.save();
  ctx.translate(mouth[0], mouth[1]);
  ctx.scale(scale, scale);
  ctx.rotate(0.35 + tip * 0.75);
  const w = 54, h = 66;
  pen.blob([[-6, 0], [-w, -4], [-w - 6, -h * 0.5], [-w + 2, -h], [-10, -h - 2], [-2, -h * 0.5]], { fill: WHITE, seed: 70, rough: 0.8 });
  pen.line(-w + 2, -h * 0.62, -8, -h * 0.62, { stroke: drink.color, width: 9, seed: 71 });
  pen.curve([[-w - 4, -h * 0.75], [-w - 22, -h * 0.55], [-w - 4, -h * 0.25]], { width: 3, seed: 72 });
  ctx.restore();
}

export const pour: GameDef = {
  id: 'pour',
  name: 'Fill It Up',
  kr: '붓기',
  blurb: 'Hold to pour. Let go when the glass is exactly 64% full.',
  howto: '<b>Press and hold</b> to pour. Let go when the glass is filled to the % I ask for. One pour only!',
  verb: 'pour it exactly!',
  color: APRICOT,
  ranks: [
    [460, 'Head Barista'],
    [400, 'Café Regular'],
    [320, 'Self-Serve Pro'],
    [220, 'Sticky Counter'],
    [0, 'Who Spilled the Milk'],
  ],

  thumb(pen, w, h, t) {
    const cw = Math.min(w * 0.24, h * 0.34), ch = Math.min(h * 0.5, cw * 1.6);
    const cup: Cup = { x: w * 0.56 - cw / 2, y: h * 0.94 - ch, w: cw, h: ch };
    const k = (t % 3.2) / 2.4;
    const fill = clamp(k, 0, 1) * 0.64;
    const pouring = k < 1;
    const sc = clamp(h / 260, 0.45, 1);
    const mouth: Pt = [cup.x + cw * 0.3, cup.y - ch * 0.2];
    if (pouring) pen.line(mouth[0], mouth[1], mouth[0] + 2, cup.y + ch - fill * ch, { stroke: '#ffe08f', width: 6, seed: 80, rough: 0.6 });
    drawCup(pen, cup, fill, DRINKS[0], t, pouring ? 1 : 0.2);
    drawPitcher(pen, mouth, pouring ? 1 : 0, DRINKS[0], sc);
    pen.text('64%', w * 0.84, h * 0.2, { size: Math.min(26, h * 0.16) });
  },

  steps: ['look at the %', 'press and <b>hold</b> to pour', '<b>let go</b> when the glass is that full'],

  demo(pen, w, h, t) {
    const k = loop(t, 5.2);
    const ch = h * 0.54, cw = Math.min(w * 0.2, ch * 0.62);
    const cup: Cup = { x: w * 0.46 - cw / 2, y: h * 0.94 - ch, w: cw, h: ch };
    const pouring = k > 0.16 && k < 0.66;
    const fill = span(k, 0.16, 0.66) * 0.6;
    const sc = clamp(h / 280, 0.45, 0.9);
    const mouth: Pt = [cup.x + cw * 0.3, cup.y - ch * 0.16];
    const drink = DRINKS[1];
    if (pouring) pen.line(mouth[0], mouth[1], mouth[0] + 2, cup.y + ch - fill * ch, { stroke: drink.color, width: 6, seed: 80, rough: 0.6 });
    drawCup(pen, cup, fill, drink, t, pouring ? 1 : 0.2);
    drawPitcher(pen, mouth, pouring ? 1 : 0, drink, sc);
    pen.text('60%', w * 0.12, h * 0.16, { size: Math.min(30, h * 0.18) });
    if (k > 0.7) {
      const ty = cup.y + ch - 0.6 * ch;
      pen.line(cup.x - 10, ty, cup.x + cw + 10, ty, { stroke: BERRY, width: 2.5, dash: [6, 5], seed: 83 });
      pen.text('perfect!', cup.x - 12, ty, { size: 16, color: BERRY, align: 'right', outline: WHITE });
    }
    const hx = w * 0.82, hy = h * 0.6;
    if (k < 0.16) {
      const m = easeInOut(span(k, 0, 0.12));
      drawHand(pen, lerp(w * 1.05, hx, m), lerp(h * 1.2, hy, m), { scale: 0.75 });
    } else if (k < 0.8) drawHand(pen, hx, hy - (pouring ? 0 : 10), { press: pouring ? 1 : 0, scale: 0.75 });
    if (pouring) pen.text('hold…', hx, hy - 52, { size: 17, font: 'gaegu' });
    else if (k >= 0.66 && k < 0.8) pen.text('let go!', hx, hy - 60, { size: 17, color: BERRY });
  },

  async play(g: Shell, level: number) {
    const drink = pick(DRINKS);
    const target = pickTarget();
    const aspect = rand(0.5, 1.05); // glass width / height
    const speed = SPEED[level] * rand(0.92, 1.08);
    let fill = 0;
    let tip = 0;
    let pouring = false;
    let started = false;
    let doneAt = 0;
    let wobble = 0;
    const drops: { x: number; y: number; vx: number; vy: number; life: number }[] = [];

    const layout = (w: number, h: number): Cup => {
      const ch = Math.min(h - 150, 330, (w * 0.46) / aspect);
      const cw = ch * aspect;
      return { x: Math.max(70, w / 2 - cw / 2 - 10), y: h - 36 - ch, w: cw, h: ch };
    };

    const born = g.stage.time;
    if (g.tutorial) g.say(`<b>press and hold</b> anywhere to pour. let go when the drink reaches the dashed line (${target}%).`, 'focus');
    else g.say(`pour the ${drink.name} to exactly <b>${target}%</b> full. hold to pour!`, 'focus');
    const stage = g.stage;
    let pourT = 0;
    stage.draw = (pen, w, h, t, dt) => {
      const cup = layout(w, h);
      if (pouring) {
        pourT += dt;
        // starts as a trickle, then glugs
        fill = Math.min(1, fill + speed * dt * Math.min(1, 0.35 + pourT * 1.4));
        if (fill >= 1) {
          drops.push({ x: cup.x + (Math.random() < 0.5 ? 0 : cup.w), y: cup.y, vx: (Math.random() - 0.5) * 60, vy: -20, life: 1 });
        }
      }
      tip += ((pouring ? 1 : 0) - tip) * Math.min(1, dt * 10);
      wobble += ((pouring ? 1 : 0) - wobble) * Math.min(1, dt * 3);
      pen.text(`${target}%`, w / 2, 42, { size: 46 });
      const mouth: Pt = [cup.x + cup.w * 0.28, cup.y - 40];
      if (tip > 0.6) {
        const surf = cup.y + cup.h - fill * cup.h;
        pen.line(mouth[0] - 3, mouth[1] + 4, mouth[0] + 2, surf, { stroke: drink.color, width: 7, seed: 81, rough: 0.8 });
        pen.line(mouth[0] - 3, mouth[1] + 4, mouth[0] + 2, surf, { stroke: INK, width: 1.5, seed: 82, alpha: 0.5 });
      }
      drawCup(pen, cup, fill, drink, t, wobble);
      drawPitcher(pen, mouth, tip, drink);
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.vy += 600 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.life -= dt;
        if (d.life <= 0) drops.splice(i, 1);
        else pen.circle(d.x, d.y, 4, { fill: drink.color, width: 1.6, seed: 90 + (i % 5) });
      }
      if (!started) pen.text('hold anywhere', w / 2, cup.y - 70, { size: 22, font: 'gaegu', alpha: 0.5 + Math.sin(t * 4) * 0.25 });
      if (!started && t - born > 1.2) {
        const k = (t - born) % 1.6;
        drawHand(pen, cup.x + cup.w + 50, cup.y + cup.h * 0.5, { press: k > 0.3 && k < 1.2 ? 1 : 0, alpha: 0.9 });
        if (k > 0.3 && k < 1.2) pen.text('hold…', cup.x + cup.w + 64, cup.y + cup.h * 0.5 - 40, { size: 18, font: 'gaegu' });
      }
      // training wheels: the target line and a live % while you pour
      if (g.tutorial && !doneAt) {
        const ty = cup.y + cup.h - (target / 100) * cup.h;
        pen.line(cup.x - 14, ty, cup.x + cup.w + 14, ty, { stroke: BERRY, width: 3, dash: [8, 6], seed: 83 });
        pen.text(`${target}%`, cup.x - 20, ty, { size: 20, color: BERRY, align: 'right', outline: WHITE });
        if (started) pen.text(`${Math.round(fill * 100)}%`, cup.x + cup.w / 2, cup.y + cup.h - fill * cup.h - 22, { size: 22, outline: WHITE });
      }
      if (doneAt) {
        const pop = easeOutBack(clamp((t - doneAt) / 0.4, 0, 1));
        const ty = cup.y + cup.h - (target / 100) * cup.h;
        let uy = cup.y + cup.h - fill * cup.h;
        pen.line(cup.x - 14, ty, cup.x + cup.w + 14, ty, { stroke: BERRY, width: 3, dash: [8, 6], seed: 83 });
        // both labels on the right, nudged apart if they'd overlap
        if (Math.abs(uy - ty) < 26) uy = ty + (uy >= ty ? 26 : -26);
        const lx = cup.x + cup.w + 20;
        pen.text(`${target}%`, lx, ty, { size: Math.max(1, 21 * pop), color: BERRY, align: 'left', outline: WHITE });
        pen.text(`you ${(fill * 100).toFixed(1)}%`, lx, uy, { size: Math.max(1, 19 * pop), align: 'left', outline: WHITE });
      }
    };

    const canvas = stage.canvas;
    let release: (() => void) | null = null;
    const startPour = () => {
      if (started) return;
      started = true;
      pouring = true;
      pourT = 0;
      sfx.noise(0.25, { freq: 700, q: 0.5, vol: 0.15 });
      g.setMood('wow');
    };
    const stopPour = () => {
      if (!pouring) return;
      pouring = false;
      release?.();
    };
    const pd = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      startPour();
    };
    const kd = (e: KeyboardEvent) => {
      if (e.key !== ' ' || e.repeat) return;
      e.preventDefault();
      startPour();
    };
    const ku = (e: KeyboardEvent) => e.key === ' ' && stopPour();
    canvas.addEventListener('pointerdown', pd);
    canvas.addEventListener('pointerup', stopPour);
    canvas.addEventListener('pointercancel', stopPour);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    const gurgle = setInterval(() => pouring && sfx.tone(rand(180, 320), 0.06, { type: 'sine', vol: 0.08 }), 110);

    let timedOut = false;
    try {
      timedOut = await Promise.race([
        g.until<boolean>((done) => {
          release = () => done(false);
        }),
        g.clock(9).then(() => true),
      ]);
    } finally {
      g.stopClock();
      clearInterval(gurgle);
      pouring = false;
      canvas.removeEventListener('pointerdown', pd);
      canvas.removeEventListener('pointerup', stopPour);
      canvas.removeEventListener('pointercancel', stopPour);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    }
    if (!started) return { score: 0, detail: `too slow! it was ${target}%` };
    doneAt = stage.time;
    g.setMood('idle');
    sfx.pop();
    await g.wait(1200);
    const got = Math.round(fill * 1000) / 10;
    const err = Math.abs(got - target);
    if (fill >= 1) return { score: 0, detail: 'it overflowed! <b>100%</b>+' };
    const score = 100 * Math.pow(Math.max(0, 1 - err / 20), 1.3);
    return { score, detail: timedOut ? `time's up at ${got}%` : err < 0.5 ? `perfect pour: ${got}%!` : `you poured ${got}% — off by <b>${err.toFixed(1)}</b>` };
  },
};
