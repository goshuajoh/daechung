import type { Pen, Pt } from './pen';
import { BERRY, WHITE } from './palette';

/**
 * A cartoon pointing hand for demos and "do this" hints. The fingertip is at (x, y).
 * `press` 0..1 squashes it and sends out a tap ripple.
 */
export function drawHand(pen: Pen, x: number, y: number, o: { press?: number; scale?: number; alpha?: number; ripple?: number } = {}) {
  const ctx = pen.ctx;
  const s = (o.scale ?? 1) * (1 - (o.press ?? 0) * 0.1);
  ctx.save();
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  if (o.ripple != null && o.ripple > 0 && o.ripple < 1) {
    const r = 6 + o.ripple * 26 * (o.scale ?? 1);
    pen.circle(x, y, r, { stroke: BERRY, width: 3, alpha: 1 - o.ripple, seed: 990 });
  }
  ctx.translate(x, y);
  ctx.rotate(-0.38);
  ctx.scale(s, s);
  const st = { fill: WHITE, width: 2.6, rough: 0.5, shift: [2, 2] as Pt };
  // palm + curled fingers + thumb, then the pointing finger on top
  pen.blob([[-6, 30], [24, 26], [30, 44], [26, 62], [2, 66], [-14, 56], [-14, 40]], { ...st, seed: 991 });
  pen.ellipse(20, 31, 9, 7, { ...st, seed: 992 }, 0.3);
  pen.ellipse(26, 41, 8, 7, { ...st, seed: 993 }, 0.3);
  pen.ellipse(-14, 46, 7, 11, { ...st, seed: 994 }, -0.5);
  pen.rrect(-7, -2, 14, 40, 7, { ...st, seed: 995 });
  pen.line(-3, 4, 3, 4, { width: 1.6, seed: 996, alpha: 0.5 });
  pen.rrect(-8, 62, 34, 10, 4, { fill: '#f3e7cf', width: 2.4, rough: 0.4, seed: 997, shift: [0, 0] });
  ctx.restore();
}

/** Ping-pong 0→1→0 over a loop of `period` seconds. */
export const loop = (t: number, period: number) => (t % period) / period;
/** Remap k from [a,b] to [0,1], clamped. */
export const span = (k: number, a: number, b: number) => Math.max(0, Math.min(1, (k - a) / (b - a)));

/** A fake button inside demos, e.g. "lock it in". */
export function drawPill(pen: Pen, cx: number, cy: number, label: string, color: string, press = 0) {
  const w = Math.max(62, label.length * 8.6 + 26), h = 30;
  const d = press * 2;
  pen.rrect(cx - w / 2 + d, cy - h / 2 + d, w, h, 12, { fill: color, seed: 980, rough: 0.6, shift: press ? [0, 0] : [3, 3] });
  pen.text(label, cx + d, cy + d + 1, { size: 15 });
}

/** The big target at the top of the stage, with a plain-words caption under it. */
export function drawPrompt(pen: Pen, w: number, big: string, caption: string) {
  pen.text(big, w / 2, 40, { size: 44 });
  pen.text(caption, w / 2, 76, { size: 19, font: 'gaegu', alpha: 0.65 });
}
