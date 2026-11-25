import { Pen } from './pen';

type DrawFn = (pen: Pen, w: number, h: number, t: number, dt: number) => void;

export interface StageOpts {
  /** Redraws per second normally. The doodles "boil" at ~7fps anyway, so ambient art needs very few. */
  fps?: number;
  /** Redraws per second for a moment after the player touches this canvas (smooth dragging/drawing). */
  activeFps?: number;
  /** Cap on backing-store resolution. Hand-drawn lines look fine at 2x; 3x costs 2.25x the pixels. */
  maxDpr?: number;
}

/** After this long without any touch/key, ambient redraws drop to IDLE_FPS (motion boosts itself back up). */
const IDLE_AFTER = 8000;
const IDLE_FPS = 12;

const live = new Set<Stage>();
let lastInput = performance.now();
let timer = 0;
let rafPending = false;
if (import.meta.env.DEV) (window as unknown as { __stages: Set<Stage> }).__stages = live;

for (const ev of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(ev, () => (lastInput = performance.now()), { capture: true, passive: true });
}

function frame(now: number) {
  rafPending = false;
  let soonest = Infinity;
  for (const s of live) soonest = Math.min(soonest, s.render(now));
  if (!live.size) return;
  // If nothing is due for a while (everything at ≤30fps, or paused), sleep instead of
  // waking up on every display refresh (60–120 times a second).
  const wait = soonest - performance.now();
  if (wait > 20) {
    timer = window.setTimeout(() => {
      timer = 0;
      rafPending = true;
      requestAnimationFrame(frame);
    }, Math.min(wait - 10, 250));
  } else {
    rafPending = true;
    requestAnimationFrame(frame);
  }
}

/** Treat this moment like player input (so automatic animations after it stay smooth). */
export function stayLively() {
  lastInput = performance.now();
  kick();
}

/** Make sure a frame is coming soon (cancels a long sleep). */
function kick() {
  if (!live.size) return;
  if (timer) {
    clearTimeout(timer);
    timer = 0;
  }
  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(frame);
  }
}

/**
 * A DPR-aware canvas on one shared animation loop.
 * Each stage redraws at its own capped frame rate (never the display's 120Hz),
 * stops drawing while scrolled off-screen, and slows down when nobody is touching anything.
 */
export class Stage {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly pen: Pen;
  w = 0;
  h = 0;
  private _draw: DrawFn | null = null;
  fps: number;
  activeFps: number;
  private maxDpr: number;
  private born = performance.now();
  /** When this stage really last drew (for dt). */
  private lastDraw = -1;
  /** Draw on the very next tick regardless of the frame-rate cap. */
  private force = true;
  private activeUntil = 0;
  private onScreen = true;
  /** Backing store released (see sleep()). */
  private asleep = false;
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
    this.io = new IntersectionObserver((entries) => {
      // several entries can queue up during a fast scroll; the newest one is the truth
      this.onScreen = entries[entries.length - 1].isIntersecting;
      if (this.onScreen) kick();
    });
    this.io.observe(this.canvas);
    if (this.activeFps > this.fps) {
      const boost = () => this.boost(900);
      this.canvas.addEventListener('pointerdown', boost, { passive: true });
      this.canvas.addEventListener('pointermove', boost, { passive: true });
    }
    this.resize();
    live.add(this);
    kick();
  }

  get draw() {
    return this._draw;
  }

  /** Setting a draw function (re)starts drawing; `null` stops (call clear() to also wipe it). */
  set draw(fn: DrawFn | null) {
    this._draw = fn;
    if (fn) {
      if (this.asleep) this.wake();
      this.force = true;
      kick();
    }
  }

  /** Seconds since this stage was created (wall clock, independent of frame rate). */
  get time() {
    return (performance.now() - this.born) / 1000;
  }

  /** Run at the active frame rate for a while, e.g. while something flies across the screen. */
  boost(ms = 900) {
    this.activeUntil = Math.max(this.activeUntil, performance.now() + ms);
    kick();
  }

  /** Wipe the canvas once and stop drawing until a new draw function is set. */
  clear() {
    this._draw = null;
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
  }

  /** Stop drawing and release the backing store (for layers that are usually empty). */
  sleep() {
    this._draw = null;
    this.asleep = true;
    this.canvas.width = 1;
    this.canvas.height = 1;
  }

  private wake() {
    this.asleep = false;
    this.resize();
  }

  resize() {
    if (this.asleep) return;
    // Layout size (ignores CSS transforms like the tilted cards / entrance animation).
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const dpr = Math.min(this.maxDpr, window.devicePixelRatio || 1);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.force = true; // resizing clears the canvas, so redraw on the next tick
    kick();
  }

  /** Draws if due; returns when this stage next wants a frame (Infinity if idle). */
  render(now: number): number {
    if (!this._draw || !this.onScreen || this.w < 2 || this.h < 2) return Infinity;
    const active = now < this.activeUntil;
    const fps = active ? this.activeFps : now - lastInput > IDLE_AFTER ? Math.min(this.fps, IDLE_FPS) : this.fps;
    const interval = 1000 / fps;
    const since = this.lastDraw < 0 ? interval : now - this.lastDraw;
    // small tolerance so a 30fps target lands on every 2nd 60Hz frame (or every 4th at 120Hz)
    if (!this.force && since < interval - 3) return this.lastDraw + interval;
    this.force = false;
    const dt = Math.min(0.1, since / 1000);
    this.lastDraw = now;
    const { ctx } = this;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();
    this.pen.setTime(now);
    this._draw(this.pen, this.w, this.h, this.time, dt);
    return now + interval;
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
