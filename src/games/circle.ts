import type { GameDef, Shell } from '../lib/shell';
import type { Pen, Pt } from '../lib/pen';
import { sfx } from '../lib/audio';
import { BERRY, INK, LILAC, MINT, WHITE } from '../lib/palette';
import { clamp, easeOutBack, rand } from '../lib/rng';

const TAU = Math.PI * 2;

interface Verdict { ok: boolean; why?: string; pct: number; R: number }

/** How round is this stroke around (cx, cy)? */
function judge(pts: Pt[], cx: number, cy: number): Verdict {
  if (pts.length < 12) return { ok: false, why: 'draw a bigger loop!', pct: 0, R: 0 };
  let swept = 0;
  let prev = Math.atan2(pts[0][1] - cy, pts[0][0] - cx);
  for (let i = 1; i < pts.length; i++) {
    const a = Math.atan2(pts[i][1] - cy, pts[i][0] - cx);
    let d = a - prev;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    swept += d;
    prev = a;
  }
  const radii = pts.map(([x, y]) => Math.hypot(x - cx, y - cy));
  const R = radii.reduce((a, b) => a + b, 0) / radii.length;
  if (R < 28) return { ok: false, why: 'bigger! draw around the dot', pct: 0, R };
  if (Math.abs(swept) < TAU * 0.9) return { ok: false, why: 'go all the way around!', pct: 0, R };
  const rms = Math.sqrt(radii.reduce((a, r) => a + (r - R) ** 2, 0) / radii.length) / R;
  const pct = clamp(100 * (1 - rms * 2.6), 0, 100);
  return { ok: true, pct, R };
}

function errColor(err: number) {
  return err < 0.04 ? MINT : err < 0.09 ? '#e9d36f' : BERRY;
}

function drawStroke(ctx: CanvasRenderingContext2D, pts: Pt[], cx: number, cy: number, R: number | null) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // ink under-stroke, then the coloured stroke on top
  ctx.lineWidth = 9;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.lineWidth = 5;
  for (let i = 1; i < pts.length; i++) {
    const r = Math.hypot(pts[i][0] - cx, pts[i][1] - cy);
    const ref = R ?? r;
    ctx.strokeStyle = R == null ? WHITE : errColor(Math.abs(r - ref) / ref);
    ctx.beginPath();
    ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
    ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDot(pen: Pen, x: number, y: number, t: number) {
  pen.circle(x, y, 7 + Math.sin(t * 4) * 1, { fill: LILAC, seed: 1, width: 2.5 });
}

export const circle: GameDef = {
  id: 'circle',
  name: 'Perfect Circle',
  kr: '동그라미',
  blurb: 'Draw a perfect circle around the dot. One stroke, no take-backs.',
  howto: 'Put your finger down and <b>draw one circle</b> around the dot. Lift to finish.',
  verb: 'draw a perfect circle!',
  color: LILAC,
  ranks: [
    [460, 'Human Compass'],
    [400, 'Steady Hand'],
    [320, 'Round-ish'],
    [220, 'Potato Artist'],
    [0, 'That Was an Egg'],
  ],

  thumb(pen, w, h, t) {
    const cx = w / 2, cy = h * 0.54, R = Math.min(w, h) * 0.32;
    const k = (t % 3) / 2.2;
    const pts: Pt[] = [];
    const end = Math.min(1, k) * TAU * 1.02;
    for (let a = 0; a <= end; a += 0.12) {
      const r = R * (1 + Math.sin(a * 3 + 1) * 0.025);
      pts.push([cx + Math.cos(a - 1.2) * r, cy + Math.sin(a - 1.2) * r]);
    }
    drawDot(pen, cx, cy, t);
    if (pts.length > 1) drawStroke(pen.ctx, pts, cx, cy, k >= 1 ? R : null);
    if (k >= 1) pen.text('96.4%', cx, cy + 26, { size: Math.min(26, h * 0.16), outline: WHITE });
  },

  async play(g: Shell) {
    const stage = g.stage;
    const off: Pt = [rand(-0.08, 0.08), rand(-0.06, 0.06)];
    const centre = (): Pt => [stage.w * (0.5 + off[0]), stage.h * (0.52 + off[1])];
    let pts: Pt[] = [];
    let drawing = false;
    let verdict: Verdict | null = null;
    let doneAt = 0;
    let finish: (() => void) | null = null;

    g.say('draw <b>one circle</b> around the dot. lift your finger to finish.', 'focus');

    stage.draw = (pen, _w, _h, t) => {
      const [cx, cy] = centre();
      if (!pts.length && !verdict) {
        pen.text('draw around me', cx, cy - 30, { size: 20, font: 'gaegu', alpha: 0.55 + Math.sin(t * 3) * 0.2 });
      }
      if (verdict?.ok) {
        // the ideal circle, faint and dashed
        pen.circle(cx, cy, verdict.R, { stroke: INK, width: 2, dash: [6, 8], alpha: 0.35, seed: 2 });
      }
      if (pts.length > 1) drawStroke(pen.ctx, pts, cx, cy, verdict?.ok ? verdict.R : null);
      drawDot(pen, cx, cy, t);
      if (verdict?.ok) {
        const pop = easeOutBack(clamp((t - doneAt) / 0.4, 0, 1));
        pen.text(`${verdict.pct.toFixed(1)}%`, cx, cy + 34, { size: Math.max(1, 40 * pop), outline: WHITE });
      }
    };

    const canvas = stage.canvas;
    let lastPt: Pt | null = null;
    const down = (e: PointerEvent) => {
      if (verdict?.ok) return;
      canvas.setPointerCapture(e.pointerId);
      drawing = true;
      verdict = null;
      pts = [stage.local(e)];
      lastPt = pts[0];
      sfx.click();
      g.setMood('focus');
    };
    const move = (e: PointerEvent) => {
      if (!drawing) return;
      const evs = e.getCoalescedEvents?.() ?? [e];
      for (const ev of evs) {
        const p = stage.local(ev);
        if (lastPt && Math.hypot(p[0] - lastPt[0], p[1] - lastPt[1]) < 2.5) continue;
        pts.push(p);
        lastPt = p;
      }
      const [cx, cy] = centre();
      g.look = [clamp((lastPt![0] - cx) / 120, -1, 1), clamp((lastPt![1] - cy) / 120, -1, 1)];
    };
    const up = () => {
      if (!drawing) return;
      drawing = false;
      const [cx, cy] = centre();
      const v = judge(pts, cx, cy);
      if (!v.ok) {
        g.say(`${v.why} <em>try again</em>`, 'wow');
        sfx.boop();
        return;
      }
      verdict = v;
      finish?.();
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    let timedOut = false;
    try {
      timedOut = await Promise.race([
        g.until<boolean>((done) => {
          finish = () => done(false);
        }),
        g.clock(9).then(() => true),
      ]);
    } finally {
      g.stopClock();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
    }
    g.look = undefined;
    if (timedOut) {
      // judge whatever is on the canvas
      const [cx, cy] = centre();
      const v = judge(pts, cx, cy);
      if (v.ok) verdict = v;
    }
    doneAt = stage.time;
    if (!verdict?.ok) {
      pts = [];
      return { score: 0, detail: "time's up — no circle!" };
    }
    await g.wait(1200);
    const pct = verdict.pct;
    const score = 100 * Math.pow(clamp((pct - 50) / 46, 0, 1), 1.2);
    return { score, detail: `a <b>${pct.toFixed(1)}%</b> perfect circle` };
  },
};
