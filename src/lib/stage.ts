import { Pen } from './pen';

type DrawFn = (pen: Pen, w: number, h: number, t: number, dt: number) => void;

const live = new Set<Stage>();
let last = 0;
let running = false;

function frame(now: number) {
  const dt = Math.min(0.05, (now - (last || now)) / 1000);
  last = now;
  for (const s of live) s.render(now, dt);
  if (live.size) requestAnimationFrame(frame);
  else running = false;
}

/** A DPR-aware canvas that redraws every frame while mounted. */
export class Stage {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly pen: Pen;
  w = 0;
  h = 0;
  draw: DrawFn | null = null;
  /** Seconds since this stage was created. */
  time = 0;
  private ro: ResizeObserver;

  constructor(parent: HTMLElement, className = '') {
    this.canvas = document.createElement('canvas');
    this.canvas.className = className;
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.pen = new Pen(this.ctx);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.canvas);
    this.resize();
    live.add(this);
    if (!running) {
      running = true;
      last = 0;
      requestAnimationFrame(frame);
    }
  }

  resize() {
    // Layout size (ignores CSS transforms like the tilted cards / entrance animation).
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(now: number, dt: number) {
    this.time += dt;
    if (!this.draw || this.w < 2 || this.h < 2) return;
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
    this.canvas.remove();
  }
}
