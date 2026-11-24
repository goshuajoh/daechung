import { Pen } from './pen';

type DrawFn = (pen: Pen, w: number, h: number, t: number, dt: number) => void;

export interface StageOpts {
  /** Redraws per second when idle. The doodles "boil" at ~7fps anyway, so ambient art needs very few. */
  fps?: number;
  /** Redraws per second for a moment after the player touches this canvas (smooth dragging/drawing). */
  activeFps?: number;
  /** Cap on backing-store resolution. Hand-drawn lines look fine at 2x; 3x costs 2.25x the pixels. */
  maxDpr?: number;
}

const live = new Set<Stage>();
let running = false;

function frame(now: number) {
  for (const s of live) s.render(now);
  if (live.size) requestAnimationFrame(frame);
  else running = false;
}

/**
 * A DPR-aware canvas on one shared animation loop.
 * Each stage redraws at its own capped frame rate (never the display's 120Hz),
 * and stops drawing entirely while it's scrolled off-screen.
 */
export class Stage {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly pen: Pen;
  w = 0;
  h = 0;
  draw: DrawFn | null = null;
  fps: number;
  activeFps: number;
  private maxDpr: number;
  private born = performance.now();
  private lastDraw = -1e9;
  private activeUntil = 0;
  private onScreen = true;
  private ro: ResizeObserver;
  private io: IntersectionObserver;

  constructor(parent: HTMLElement, className = '', opts: StageOpts = {}) {
    this.fps = opts.fps ?? 30;
    this.activeFps = opts.activeFps ?? this.fps;
    this.maxDpr = opts.maxDpr ?? 2;
    this.canvas = document.createElement('canvas');
    this.canvas.className = className;
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.pen = new Pen(this.ctx);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.canvas);
    this.io = new IntersectionObserver(([e]) => (this.onScreen = e.isIntersecting));
    this.io.observe(this.canvas);
    if (this.activeFps > this.fps) {
      const boost = () => (this.activeUntil = performance.now() + 900);
      this.canvas.addEventListener('pointerdown', boost);
      this.canvas.addEventListener('pointermove', boost);
    }
    this.resize();
    live.add(this);
    if (!running) {
      running = true;
      requestAnimationFrame(frame);
    }
  }

  /** Seconds since this stage was created (wall clock, independent of frame rate). */
  get time() {
    return (performance.now() - this.born) / 1000;
  }

  /** Run at the active frame rate for a while, e.g. while something flies across the screen. */
  boost(ms = 900) {
    this.activeUntil = Math.max(this.activeUntil, performance.now() + ms);
  }

  resize() {
    // Layout size (ignores CSS transforms like the tilted cards / entrance animation).
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const dpr = Math.min(this.maxDpr, window.devicePixelRatio || 1);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.lastDraw = -1e9; // resizing clears the canvas, so redraw on the next tick
  }

  render(now: number) {
    if (!this.draw || !this.onScreen || this.w < 2 || this.h < 2) return;
    const fps = now < this.activeUntil ? this.activeFps : this.fps;
    const since = now - this.lastDraw;
    // small tolerance so a 30fps target lands on every 2nd 60Hz frame (or every 4th at 120Hz)
    if (since < 1000 / fps - 3) return;
    const dt = Math.min(0.1, since / 1000);
    this.lastDraw = now;
    const { ctx } = this;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();
    this.pen.setTime(now);
    this.draw(this.pen, this.w, this.h, this.time, dt);
  }

  /** Pointer position in canvas CSS pixels. */
  local(e: PointerEvent | MouseEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / (r.width || 1)) * this.w, ((e.clientY - r.top) / (r.height || 1)) * this.h];
  }

  destroy() {
    live.delete(this);
    this.ro.disconnect();
    this.io.disconnect();
    this.canvas.remove();
  }
}
