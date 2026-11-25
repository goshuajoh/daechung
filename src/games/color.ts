import type { GameDef, Shell } from '../lib/shell';
import type { Pen, Pt } from '../lib/pen';
import { sfx } from '../lib/audio';
import { BERRY, INK, ROSE, WHITE } from '../lib/palette';
import { clamp, easeInOut, easeOutBack, lerp, rand } from '../lib/rng';
import { drawHand, drawPill, drawPrompt, loop, span } from '../lib/hand';

const hsl = (h: number, s: number, l: number) => `hsl(${((h % 360) + 360) % 360} ${s}% ${l}%)`;
const hueDiff = (a: number, b: number) => {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return Math.min(d, 360 - d);
};
/** Seconds you get to stare at the colour. */
const MEMO = [3, 3, 2.5, 2, 1.6];

/** A wobbly jelly with a face, filled with the colour. */
function drawJelly(pen: Pen, cx: number, cy: number, r: number, fill: string, t: number, seed = 1) {
  const pts: Pt[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const wob = 1 + Math.sin(a * 3 + t * 3) * 0.03 + (Math.sin(a) > 0 ? 0.06 : 0);
    pts.push([cx + Math.cos(a) * r * wob * 1.06, cy + Math.sin(a) * r * wob * (Math.sin(a) > 0 ? 0.82 : 0.95)]);
  }
  pen.blob(pts, { fill, seed, rough: 1, width: 3.2, shift: [3, 3] });
  const e = r * 0.07;
  pen.ellipse(cx - r * 0.3, cy - r * 0.05, e, e * 1.3, { fill: INK, stroke: null, shift: [0, 0], seed: seed + 1, rough: 0.2 });
  pen.ellipse(cx + r * 0.3, cy - r * 0.05, e, e * 1.3, { fill: INK, stroke: null, shift: [0, 0], seed: seed + 2, rough: 0.2 });
  pen.curve([[cx - r * 0.1, cy + r * 0.12], [cx, cy + r * 0.18], [cx + r * 0.1, cy + r * 0.12]], { width: 2.5, seed: seed + 3, rough: 0.2 });
  pen.curve([[cx - r * 0.55, cy - r * 0.45], [cx - r * 0.42, cy - r * 0.6]], { stroke: WHITE, width: 5, seed: seed + 4, rough: 0.2 });
}

/** Hue ring at fixed saturation/lightness. */
function drawRing(ctx: CanvasRenderingContext2D, pen: Pen, cx: number, cy: number, r0: number, r1: number, s: number, l: number) {
  const n = 72;
  ctx.save();
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1.08) / n) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r1, a0, a1);
    ctx.arc(cx, cy, r0, a1, a0, true);
    ctx.closePath();
    ctx.fillStyle = hsl((i / n) * 360, s, l);
    ctx.fill();
  }
  ctx.restore();
  pen.circle(cx, cy, r1, { stroke: INK, width: 3, seed: 20, rough: 0.6 });
  pen.circle(cx, cy, r0, { stroke: INK, width: 3, seed: 21, rough: 0.6 });
}

const ringPos = (cx: number, cy: number, r: number, hue: number): Pt => {
  const a = (hue / 360) * Math.PI * 2 - Math.PI / 2;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
};

export const color: GameDef = {
  id: 'color',
  name: 'Color Recall',
  kr: '색깔',
  blurb: 'Stare at a colour for 3 seconds. Then find it again on the wheel.',
  howto: "I'll show you a colour for a few seconds. Then <b>spin the wheel</b> to find the exact same one.",
  verb: 'remember this colour!',
  color: ROSE,
  ranks: [
    [460, 'Paint Chip Savant'],
    [400, 'Designer Eyes'],
    [320, 'Close Enough Beige'],
    [220, '"It\'s Basically Blue"'],
    [0, 'All Cats Are Grey'],
  ],

  thumb(pen, w, h, t) {
    const cx = w / 2, cy = h * 0.54;
    const r1 = Math.min(w, h) * 0.42, r0 = r1 * 0.72;
    drawRing(pen.ctx, pen, cx, cy, r0, r1, 70, 72);
    const hue = (t * 40) % 360;
    drawJelly(pen, cx, cy, r0 * 0.68, hsl(hue, 70, 72), t);
    const [kx, ky] = ringPos(cx, cy, (r0 + r1) / 2, hue);
    pen.circle(kx, ky, (r1 - r0) * 0.62, { fill: WHITE, seed: 30, width: 2.5 });
  },

  steps: ['stare at the colour', 'it vanishes. <b>remember it!</b>', "spin the wheel to find it, press <b>that's it!</b>"],

  demo(pen, w, h, t) {
    const k = loop(t, 6.2);
    const cx = w * 0.42, cy = h * 0.52;
    const r1 = Math.min(w * 0.26, h * 0.44), r0 = r1 * 0.72;
    const target = 330;
    if (k < 0.32) {
      drawJelly(pen, cx, cy, r1 * 0.8, hsl(target, 70, 72), t);
      pen.text(String(3 - Math.floor(span(k, 0, 0.32) * 2.99)), w * 0.84, h * 0.18, { size: 28, color: BERRY });
      pen.text('remember me!', cx, cy - r1 * 0.95, { size: 17, font: 'gaegu', alpha: 0.7 });
      return;
    }
    if (k < 0.4) {
      pen.text('gone! do you remember?', cx, cy, { size: 18, font: 'gaegu', alpha: 0.7 });
      return;
    }
    drawRing(pen.ctx, pen, cx, cy, r0, r1, 70, 72);
    const hue = lerp(200, target, easeInOut(span(k, 0.46, 0.78)));
    drawJelly(pen, cx, cy, r0 * 0.7, hsl(hue, 70, 72), t);
    const [kx, ky] = ringPos(cx, cy, (r0 + r1) / 2, hue);
    pen.circle(kx, ky, (r1 - r0) * 0.6, { fill: WHITE, seed: 43, width: 3 });
    const pill: Pt = [w * 0.84, h * 0.82];
    const press = k > 0.88 && k < 0.93 ? 1 : 0;
    drawPill(pen, pill[0], pill[1], "that's it!", ROSE, press);
    if (k < 0.8) drawHand(pen, kx, ky, { press: k > 0.44 ? 1 : 0, scale: 0.75 });
    else {
      const m = easeInOut(span(k, 0.8, 0.88));
      drawHand(pen, lerp(kx, pill[0], m), lerp(ky, pill[1], m), { press, ripple: span(k, 0.88, 0.98), scale: 0.75 });
    }
  },

  async play(g: Shell, level: number) {
    const target = rand(0, 360);
    const s = Math.round(rand(55, 80));
    const l = Math.round(rand(60, 74));
    let pickHue = (target + rand(100, 260)) % 360;
    const memo = g.tutorial ? 4 : g.quick ? Math.max(1.5, MEMO[level] - 0.5) : MEMO[level];
    const distract = level >= 2 && !g.tutorial;
    let phase: 'memo' | 'gap' | 'pick' | 'done' = 'memo';
    let phaseAt = g.stage.time;
    let touched = false;
    let doneAt = 0;
    const lure = (target + rand(60, 120) * (rand(0, 1) < 0.5 ? -1 : 1)) % 360;

    g.say(`remember this colour! you have <b>${memo}s</b>.`, 'wow');
    const stage = g.stage;
    stage.draw = (pen, w, h, t) => {
      const cx = w / 2, cy = h * 0.54;
      const r1 = Math.min(w * 0.44, h * 0.4, 190), r0 = r1 * 0.74;
      const k = t - phaseAt;
      if (phase === 'memo') {
        drawJelly(pen, cx, cy, r1 * 0.8, hsl(target, s, l), t);
        const left = Math.max(0, memo - k);
        drawPrompt(pen, w, `${left.toFixed(1)}s`, 'remember this colour! time left:');
        return;
      }
      if (phase === 'gap') {
        if (distract) {
          drawJelly(pen, cx, cy, r1 * 0.55, hsl(lure, s, l), t, 9);
          pen.text("don't look at me!", cx, cy - r1 * 0.75, { size: 22, font: 'gaegu', alpha: 0.7 });
        }
        return;
      }
      drawRing(pen.ctx, pen, cx, cy, r0, r1, s, l);
      const mid = (r0 + r1) / 2;
      if (phase === 'done') {
        const pop = easeOutBack(clamp((t - doneAt) / 0.45, 0, 1));
        // half & half: yours vs the real one
        const rr = r0 * 0.8;
        const ctx = pen.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.rect(cx - rr - 10, cy - rr - 10, rr + 10, rr * 2 + 20);
        ctx.clip();
        pen.circle(cx, cy, rr, { fill: hsl(pickHue, s, l), seed: 40, shift: [0, 0] });
        ctx.restore();
        ctx.save();
        ctx.beginPath();
        ctx.rect(cx, cy - rr - 10, rr + 10, rr * 2 + 20);
        ctx.clip();
        pen.circle(cx, cy, rr, { fill: hsl(target, s, l), seed: 40, shift: [0, 0] });
        ctx.restore();
        pen.line(cx, cy - rr, cx, cy + rr, { width: 2.5, seed: 41 });
        pen.text('you', cx - rr * 0.45, cy, { size: Math.max(1, 20 * pop), outline: WHITE });
        pen.text('real', cx + rr * 0.45, cy, { size: Math.max(1, 20 * pop), outline: WHITE, color: BERRY });
        const [tx, ty] = ringPos(cx, cy, mid, target);
        pen.star(tx, ty, (r1 - r0) * 0.45 * pop + 1, { fill: hsl(target, s, l), seed: 42, width: 2.5 }, 0);
      } else {
        drawJelly(pen, cx, cy, r0 * 0.72, hsl(pickHue, s, l), t);

      }
      const [kx, ky] = ringPos(cx, cy, mid, pickHue);
      pen.circle(kx, ky, (r1 - r0) * 0.6, { fill: WHITE, seed: 43, width: 3 });
      pen.circle(kx, ky, (r1 - r0) * 0.32, { fill: hsl(pickHue, s, l), stroke: null, seed: 44, shift: [0, 0] });
      if (phase === 'pick' && !touched && t - phaseAt > 1.2) {
        const a = Math.sin((t - phaseAt) * 2) * 0.3;
        const [hx, hy] = ringPos(cx, cy, mid, pickHue + a * 40);
        drawHand(pen, hx, hy, { press: 1, alpha: 0.85 });
      }
      // training wheels: keep the real colour on screen in the corner
      if (g.tutorial && phase === 'pick') {
        pen.circle(42, 74, 24, { fill: hsl(target, s, l), seed: 45 });
        pen.text('find me!', 74, 74, { size: 18, font: 'gaegu', align: 'left' });
      }
    };

    await g.wait(memo * 1000);
    phase = 'gap';
    phaseAt = stage.time;
    sfx.shh();
    g.setMood('focus');
    g.say(distract ? 'ignore this one…' : 'okay, close your eyes… just kidding.');
    await g.wait(distract ? 900 : 450);
    phase = 'pick';
    phaseAt = stage.time;
    g.say(g.tutorial ? 'drag the white knob around the wheel until the jelly matches the colour in the corner. then press the button.' : 'spin the wheel to find <b>that</b> colour.', 'focus');

    const canvas = stage.canvas;
    let dragging = false;
    const aim = (e: PointerEvent) => {
      const [px, py] = stage.local(e);
      const cx = stage.w / 2, cy = stage.h * 0.54;
      const prev = pickHue;
      pickHue = ((Math.atan2(py - cy, px - cx) + Math.PI / 2) * 180) / Math.PI;
      pickHue = ((pickHue % 360) + 360) % 360;
      if (Math.floor(prev / 10) !== Math.floor(pickHue / 10)) sfx.click();
      if (!touched) {
        touched = true;
        confirm.el.disabled = false;
      }
    };
    const down = (e: PointerEvent) => {
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      aim(e);
    };
    const move = (e: PointerEvent) => dragging && aim(e);
    const up = () => (dragging = false);
    const key = (e: KeyboardEvent) => {
      const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      pickHue = (pickHue + d * (e.shiftKey ? 15 : 2) + 360) % 360;
      touched = true;
      confirm.el.disabled = false;
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    window.addEventListener('keydown', key);
    const confirm = g.confirmButton("that's it!", false);
    try {
      await g.lockIn(confirm, 9);
    } finally {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', key);
    }
    phase = 'done';
    doneAt = stage.time;
    g.setMood('wow');
    await g.wait(1200);
    if (!touched) return { score: 0, detail: 'too slow! the wheel never moved' };
    const d = hueDiff(pickHue, target);
    const score = 100 * Math.pow(Math.max(0, 1 - d / 50), 1.25);
    const words = d < 2 ? 'literally the same colour!' : d < 6 ? 'practically the same colour' : d < 14 ? 'a very close shade' : d < 28 ? 'a bit off' : 'quite a different colour';
    return { score, detail: `<b>${words}</b>` };
  },
};
