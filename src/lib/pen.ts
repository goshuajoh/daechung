import { mulberry32 } from './rng';
import { INK } from './palette';

export type Pt = [number, number];

export interface Style {
  /** Outline colour. `null` = no outline. */
  stroke?: string | null;
  /** Fill colour (drawn slightly offset, like a misregistered riso print). */
  fill?: string | null;
  width?: number;
  /** Which wobble this shape gets. Same seed = same wobble on a given boil frame. */
  seed?: number;
  /** Jitter amplitude in px. */
  rough?: number;
  /** Fill offset. */
  shift?: Pt;
  alpha?: number;
  dash?: number[];
}

const TAU = Math.PI * 2;

/** Catmull-Rom spline through points (or straight segments when !smooth). */
function trace(ctx: CanvasRenderingContext2D, pts: Pt[], closed: boolean, smooth = true) {
  const n = pts.length;
  if (n < 2) return;
  ctx.moveTo(pts[0][0], pts[0][1]);
  if (!smooth) {
    for (let i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (closed) ctx.closePath();
    return;
  }
  const get = (i: number) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    ctx.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
      p2[0], p2[1],
    );
  }
  if (closed) ctx.closePath();
}

/**
 * Hand-drawn pen. Every shape gets a little wobble that re-rolls a few
 * times a second ("line boil"), like a looping hand-drawn animation.
 */
export class Pen {
  boil = 0;
  /** Global multiplier on jitter, e.g. to calm things down on tiny canvases. */
  roughScale = 1;

  constructor(public ctx: CanvasRenderingContext2D) {}

  setTime(ms: number) {
    this.boil = Math.floor(ms / 150) % 4;
  }

  rng(seed: number) {
    const s = Math.imul((Math.round(seed * 97) | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(this.boil + 1, 0xc2b2ae35);
    return mulberry32(s);
  }

  private jit(r: () => number, amt: number) {
    return (r() - 0.5) * 2 * amt;
  }

  private paint(fillPts: Pt[] | null, strokePts: Pt[] | null, closed: boolean, s: Style, smooth = true) {
    const ctx = this.ctx;
    ctx.save();
    if (s.alpha != null) ctx.globalAlpha *= s.alpha;
    if (s.fill && fillPts) {
      const [dx, dy] = s.shift ?? [2.5, 2.5];
      ctx.beginPath();
      trace(ctx, dx || dy ? fillPts.map(([x, y]) => [x + dx, y + dy] as Pt) : fillPts, true, smooth);
      ctx.fillStyle = s.fill;
      ctx.fill();
    }
    if (s.stroke !== null && strokePts) {
      ctx.beginPath();
      trace(ctx, strokePts, closed, smooth);
      ctx.strokeStyle = s.stroke ?? INK;
      ctx.lineWidth = s.width ?? 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (s.dash) ctx.setLineDash(s.dash);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Wobbly ellipse; the outline overshoots its start like a real pen stroke. */
  ellipse(cx: number, cy: number, rx: number, ry: number, s: Style = {}, rot = 0) {
    const r = this.rng(s.seed ?? 1);
    const rough = (s.rough ?? Math.min(1.6, 0.5 + Math.max(rx, ry) * 0.04)) * this.roughScale;
    const n = Math.max(7, Math.min(36, Math.round((TAU * Math.max(rx, ry)) / 16)));
    const a0 = r() * TAU;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const at = (a: number, k: number): Pt => {
      const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
      return [cx + x * cos - y * sin, cy + x * sin + y * cos];
    };
    const fill: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const p = at(a0 + (i / n) * TAU, 1);
      fill.push([p[0] + this.jit(r, rough), p[1] + this.jit(r, rough)]);
    }
    let stroke: Pt[] | null = null;
    let closed = true;
    if (Math.max(rx, ry) > 9 && s.stroke !== null) {
      // Open spiral that overlaps its start a touch.
      stroke = [];
      const over = 0.28 + r() * 0.2;
      const m = n + Math.ceil((over / TAU) * n);
      for (let i = 0; i <= m; i++) {
        const t = i / n;
        const k = 1 - 0.018 + t * 0.03;
        const p = at(a0 + t * TAU, k);
        stroke.push([p[0] + this.jit(r, rough * 0.8), p[1] + this.jit(r, rough * 0.8)]);
      }
      closed = false;
    } else stroke = fill;
    this.paint(fill, stroke, closed, s);
  }

  circle(cx: number, cy: number, rad: number, s: Style = {}) {
    this.ellipse(cx, cy, rad, rad, s);
  }

  /** Closed smooth shape through given points (jittered). */
  blob(pts: Pt[], s: Style = {}) {
    const r = this.rng(s.seed ?? 2);
    const rough = (s.rough ?? 1.2) * this.roughScale;
    const p = pts.map(([x, y]) => [x + this.jit(r, rough), y + this.jit(r, rough)] as Pt);
    this.paint(p, p, true, s);
  }

  /** Polygon with straight-ish edges (each edge subdivided and nudged). */
  poly(pts: Pt[], s: Style = {}, closed = true) {
    const r = this.rng(s.seed ?? 3);
    const rough = (s.rough ?? 1.2) * this.roughScale;
    const out: Pt[] = [];
    const n = pts.length;
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const k = Math.max(1, Math.round(len / 40));
      for (let j = 0; j < k; j++) {
        const t = j / k;
        const amt = j === 0 ? rough * 0.6 : rough;
        out.push([a[0] + (b[0] - a[0]) * t + this.jit(r, amt), a[1] + (b[1] - a[1]) * t + this.jit(r, amt)]);
      }
    }
    if (!closed) out.push([pts[n - 1][0] + this.jit(r, rough * 0.5), pts[n - 1][1] + this.jit(r, rough * 0.5)]);
    this.paint(closed ? out : null, out, closed, s);
  }

  line(x1: number, y1: number, x2: number, y2: number, s: Style = {}) {
    const r = this.rng(s.seed ?? 4);
    const rough = (s.rough ?? 1.1) * this.roughScale;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const k = Math.max(2, Math.round(len / 45));
    const nx = -(y2 - y1) / (len || 1), ny = (x2 - x1) / (len || 1);
    const pts: Pt[] = [];
    for (let i = 0; i <= k; i++) {
      const t = i / k;
      const off = this.jit(r, rough) * (i === 0 || i === k ? 0.5 : 1);
      pts.push([x1 + (x2 - x1) * t + nx * off, y1 + (y2 - y1) * t + ny * off]);
    }
    this.paint(null, pts, false, s);
  }

  /** Open smooth curve through points. */
  curve(pts: Pt[], s: Style = {}) {
    const r = this.rng(s.seed ?? 5);
    const rough = (s.rough ?? 0.9) * this.roughScale;
    const p = pts.map(([x, y]) => [x + this.jit(r, rough), y + this.jit(r, rough)] as Pt);
    this.paint(null, p, false, s);
  }

  /** Thick outlined limb / tube along a curve (ink outline + coloured core). */
  limb(pts: Pt[], thick: number, color: string, seed = 6, outline = 3) {
    const r = this.rng(seed);
    const p = pts.map(([x, y]) => [x + this.jit(r, 0.8), y + this.jit(r, 0.8)] as Pt);
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    trace(ctx, p, false);
    ctx.strokeStyle = INK;
    ctx.lineWidth = thick + outline * 2;
    ctx.stroke();
    ctx.beginPath();
    trace(ctx, p, false);
    ctx.strokeStyle = color;
    ctx.lineWidth = thick;
    ctx.stroke();
    ctx.restore();
  }

  rrect(x: number, y: number, w: number, h: number, rad: number, s: Style = {}) {
    rad = Math.min(rad, w / 2, h / 2);
    const pts: Pt[] = [];
    const corner = (cx: number, cy: number, a0: number) => {
      for (let i = 0; i <= 3; i++) {
        const a = a0 + (i / 3) * (Math.PI / 2);
        pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
      }
    };
    const edge = (x1: number, y1: number, x2: number, y2: number) => {
      const len = Math.hypot(x2 - x1, y2 - y1);
      const k = Math.floor(len / 38);
      for (let i = 1; i <= k; i++) pts.push([x1 + ((x2 - x1) * i) / (k + 1), y1 + ((y2 - y1) * i) / (k + 1)]);
    };
    corner(x + w - rad, y + rad, -Math.PI / 2);
    edge(x + w, y + rad, x + w, y + h - rad);
    corner(x + w - rad, y + h - rad, 0);
    edge(x + w - rad, y + h, x + rad, y + h);
    corner(x + rad, y + h - rad, Math.PI / 2);
    edge(x, y + h - rad, x, y + rad);
    corner(x + rad, y + rad, Math.PI);
    edge(x + rad, y, x + w - rad, y);
    this.blob(pts, { rough: 1, ...s });
  }

  /** Little hand-drawn star (for sparkles & confetti). */
  star(cx: number, cy: number, rad: number, s: Style = {}, rot = 0, points = 5) {
    const pts: Pt[] = [];
    for (let i = 0; i < points * 2; i++) {
      const a = rot - Math.PI / 2 + (i / (points * 2)) * TAU;
      const rr = i % 2 ? rad * 0.48 : rad;
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    this.poly(pts, { rough: 0.6, ...s });
  }

  text(
    str: string, x: number, y: number,
    o: { size?: number; color?: string; align?: CanvasTextAlign; font?: 'jua' | 'gaegu'; rot?: number; alpha?: number; baseline?: CanvasTextBaseline; outline?: string } = {},
  ) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    // Tiny per-boil rotation so even text breathes a little.
    const r = this.rng(str.length * 13 + Math.round(x));
    ctx.rotate((o.rot ?? 0) + (r() - 0.5) * 0.03 * this.roughScale);
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    const size = o.size ?? 20;
    ctx.font = o.font === 'gaegu' ? `700 ${size}px Gaegu, cursive` : `${size}px Jua, sans-serif`;
    ctx.textAlign = o.align ?? 'center';
    ctx.textBaseline = o.baseline ?? 'middle';
    if (o.outline) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(4, size * 0.16);
      ctx.strokeStyle = o.outline;
      ctx.strokeText(str, 0, 0);
    }
    ctx.fillStyle = o.color ?? INK;
    ctx.fillText(str, 0, 0);
    ctx.restore();
  }
}
