import { Stage } from './stage';
import { drawKongi, type Mood } from './kongi';
import { sfx } from './audio';
import { icons } from './icons';
import { getBest, saveScore } from './store';
import type { Pen } from './pen';
import { clamp, pick, rand } from './rng';
import { BLUSH, BUTTER, LILAC, MINT, PASTELS, PEACH, SKY } from './palette';

export interface RoundResult {
  /** 0..100 */
  score: number;
  /** One short line about how close you were, e.g. "off by 3°". */
  detail: string;
}

export interface GameDef {
  id: string;
  name: string;
  kr: string;
  blurb: string;
  howto: string;
  color: string;
  rounds: number;
  /** [minimum total, title], highest first. */
  ranks: [number, string][];
  thumb(pen: Pen, w: number, h: number, t: number): void;
  play(g: Shell, round: number): Promise<RoundResult>;
}

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html) n.innerHTML = html;
  return n;
};

export function muteButton(): HTMLButtonElement {
  const b = el('button', 'icon-btn mute');
  const sync = () => {
    b.innerHTML = sfx.muted ? icons.soundOff : icons.soundOn;
    b.setAttribute('aria-label', sfx.muted ? 'Sound off' : 'Sound on');
  };
  sync();
  b.addEventListener('click', () => {
    sfx.setMuted(!sfx.muted);
    sync();
    if (!sfx.muted) sfx.pop();
  });
  return b;
}

const STICKERS: [number, string, string, string][] = [
  [95, '대박!!', 'daebak', MINT],
  [80, 'nice~', 'so close', BUTTER],
  [60, 'not bad', 'pretty good', SKY],
  [35, 'hmm..', 'getting there', PEACH],
  [0, 'oops', 'next one!', LILAC],
];

interface Confetto { x: number; y: number; vy: number; vx: number; r: number; vr: number; kind: number; c: string; s: number }

/**
 * The frame around every game: top bar, canvas stage, Kongi's speech dock,
 * round flow, score stickers and the final card.
 */
export class Shell {
  readonly root: HTMLElement;
  readonly stage: Stage;
  readonly overlay: HTMLElement;
  private kongi: Stage;
  private bubble: HTMLElement;
  private actions: HTMLElement;
  private pips: HTMLElement;
  private totalEl: HTMLElement;
  private ac = new AbortController();
  private moodTimer = 0;
  private baseMood: Mood = 'idle';
  mood: Mood = 'idle';
  look: [number, number] | undefined;
  /** Games can set this to 1 to make Kongi bounce; it decays by itself. */
  bop = 0;
  total = 0;
  scores: number[] = [];

  constructor(parent: HTMLElement, readonly def: GameDef, private exit: () => void) {
    this.root = el('section', 'screen game');
    this.root.style.setProperty('--c', def.color);
    this.root.innerHTML = `
      <header class="topbar">
        <button class="icon-btn back" aria-label="Back to all games">${icons.back}</button>
        <div class="game-title"><b>${def.name}</b><span>${def.kr}</span></div>
        <div class="pips" aria-hidden="true"></div>
        <div class="score-chip" title="total score"><span class="total">0</span></div>
      </header>
      <div class="stage-wrap"><div class="overlay"></div></div>
      <footer class="dock">
        <div class="kongi-slot"></div>
        <div class="bubble" aria-live="polite"></div>
        <div class="actions"></div>
      </footer>`;
    parent.appendChild(this.root);
    const $ = <T extends HTMLElement>(s: string) => this.root.querySelector(s) as T;
    this.overlay = $('.overlay');
    this.bubble = $('.bubble');
    this.actions = $('.actions');
    this.pips = $('.pips');
    this.totalEl = $('.total');
    $('.topbar').appendChild(muteButton());
    $('.back').addEventListener('click', () => {
      sfx.click();
      this.exit();
    });
    for (let i = 0; i < def.rounds; i++) this.pips.appendChild(el('i'));

    const wrap = $('.stage-wrap');
    this.stage = new Stage(wrap, 'stage');
    wrap.insertBefore(this.stage.canvas, this.overlay);

    this.kongi = new Stage($('.kongi-slot'), 'kongi-mini');
    this.kongi.draw = (pen, w, h, t, dt) => {
      this.bop = Math.max(0, this.bop - dt * 5);
      drawKongi(pen, w / 2, h - 6, Math.min(w * 0.72, h * 0.8), this.mood, t, { look: this.look, bop: this.bop });
    };

    this.onKey = this.onKey.bind(this);
    window.addEventListener('keydown', this.onKey);
  }

  get signal() {
    return this.ac.signal;
  }

  private onKey(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    const b = this.actions.querySelector<HTMLButtonElement>('.btn.primary:not([disabled])');
    if (b) {
      e.preventDefault();
      b.click();
    }
  }

  destroy() {
    this.ac.abort();
    window.removeEventListener('keydown', this.onKey);
    clearTimeout(this.moodTimer);
    this.stage.destroy();
    this.kongi.destroy();
    this.root.remove();
  }

  /* ——— Kongi ——— */

  say(html: string, mood?: Mood) {
    this.bubble.innerHTML = `<p>${html}</p>`;
    this.bubble.classList.remove('pop');
    void this.bubble.offsetWidth;
    this.bubble.classList.add('pop');
    if (mood) this.setMood(mood);
  }

  /** Set Kongi's mood; with `ms` it springs back afterwards. */
  setMood(m: Mood, ms = 0) {
    clearTimeout(this.moodTimer);
    this.mood = m;
    if (ms) this.moodTimer = window.setTimeout(() => (this.mood = this.baseMood), ms);
    else this.baseMood = m;
  }

  /* ——— async helpers (all reject when the player leaves) ——— */

  /** Resolve when `setup` calls done(). `setup` may return a cleanup fn. */
  until<T = void>(setup: (done: (v: T) => void) => (() => void) | void): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let cleanup: (() => void) | void;
      let settled = false;
      const onAbort = () => {
        if (settled) return;
        settled = true;
        cleanup?.();
        reject(new DOMException('left the game', 'AbortError'));
      };
      if (this.signal.aborted) return onAbort();
      this.signal.addEventListener('abort', onAbort, { once: true });
      cleanup = setup((v) => {
        if (settled) return;
        settled = true;
        this.signal.removeEventListener('abort', onAbort);
        // cleanup may not exist yet if done() fired synchronously
        queueMicrotask(() => cleanup?.());
        resolve(v);
      });
    });
  }

  wait(ms: number) {
    return this.until<void>((done) => {
      const id = setTimeout(done, ms);
      return () => clearTimeout(id);
    });
  }

  clearActions() {
    this.actions.innerHTML = '';
  }

  /** Show one or more buttons; resolves with the index pressed. */
  choose(labels: string[], primary = 0): Promise<number> {
    this.clearActions();
    return this.until<number>((done) => {
      labels.forEach((label, i) => {
        const b = el('button', `btn${i === primary ? ' primary' : ''}`, `<span>${label}</span>`);
        b.addEventListener('click', () => {
          sfx.pop();
          this.clearActions();
          done(i);
        });
        this.actions.appendChild(b);
      });
    });
  }

  button(label: string) {
    return this.choose([label]).then(() => undefined);
  }

  /** A button that stays until the returned promise is used; for "lock it in" style confirms. */
  confirmButton(label: string, enabled = true) {
    this.clearActions();
    const b = el('button', 'btn primary', `<span>${label}</span>`) as HTMLButtonElement;
    b.disabled = !enabled;
    this.actions.appendChild(b);
    const pressed = this.until<void>((done) => {
      const h = () => {
        sfx.pop();
        done();
      };
      b.addEventListener('click', h);
      return () => b.removeEventListener('click', h);
    }).finally(() => this.clearActions());
    return { el: b, pressed };
  }

  /* ——— flow ——— */

  private setPip(r: number) {
    [...this.pips.children].forEach((p, i) => {
      p.className = i < r ? 'done' : i === r ? 'now' : '';
    });
  }

  private bumpTotal(to: number) {
    const from = Number(this.totalEl.textContent) || 0;
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 600);
      this.totalEl.textContent = String(Math.round(from + (to - from) * k));
      if (k < 1 && !this.signal.aborted) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    this.totalEl.parentElement!.classList.remove('bump');
    void this.totalEl.offsetWidth;
    this.totalEl.parentElement!.classList.add('bump');
  }

  async run(skipIntro = false) {
    try {
      if (!skipIntro) await this.intro();
      for (let r = 0; r < this.def.rounds; r++) {
        this.setPip(r);
        this.overlay.innerHTML = '';
        this.look = undefined;
        this.setMood('idle');
        const res = await this.def.play(this, r);
        const score = Math.round(clamp(res.score, 0, 100));
        this.scores.push(score);
        this.total += score;
        this.bumpTotal(this.total);
        await this.sticker(score, res.detail, r === this.def.rounds - 1);
      }
      this.setPip(this.def.rounds);
      await this.final();
    } catch (e) {
      if (!isAbort(e)) throw e;
    }
  }

  private async intro() {
    const def = this.def;
    this.stage.draw = (pen, w, h, t) => {
      const bw = Math.min(w - 32, 440), bh = Math.min(h * 0.62, bw * 0.72);
      const x = (w - bw) / 2, y = Math.max(70, (h - bh) / 2 + 30);
      pen.text(def.name, w / 2, y - 44, { size: Math.min(44, w * 0.11) });
      pen.text(`${def.kr}  ·  ${def.rounds} rounds`, w / 2, y - 12, { size: 20, font: 'gaegu', alpha: 0.7 });
      const ctx = pen.ctx;
      ctx.save();
      ctx.translate(x, y);
      def.thumb(pen, bw, bh, t);
      ctx.restore();
    };
    this.say(def.howto, 'happy');
    await this.button('start!');
    sfx.ensure();
  }

  private async sticker(score: number, detail: string, last: boolean) {
    const [, word, sub, color] = STICKERS.find(([min]) => score >= min)!;
    const s = el('div', 'sticker', `<b>${score}</b><span>${word}</span>`);
    s.style.setProperty('--sc', color);
    s.style.setProperty('--rot', `${rand(-12, 10).toFixed(1)}deg`);
    this.overlay.appendChild(s);
    if (score >= 80) sfx.ding();
    else if (score >= 35) sfx.pop();
    else sfx.boop();
    const mood: Mood = score >= 90 ? 'cheer' : score >= 65 ? 'happy' : score >= 35 ? 'wow' : 'sad';
    this.setMood(mood, 2600);
    this.say(`${detail} <em>· ${sub}</em>`);
    await this.button(last ? 'see results' : 'next round');
    s.classList.add('bye');
  }

  private async final() {
    const def = this.def;
    const max = def.rounds * 100;
    const isBest = saveScore(def.id, this.total);
    const best = getBest(def.id) ?? this.total;
    const rank = def.ranks.find(([min]) => this.total >= min)?.[1] ?? def.ranks[def.ranks.length - 1][1];
    const ratio = this.total / max;

    this.overlay.innerHTML = '';
    const card = el('div', 'final-card');
    card.innerHTML = `
      <div class="final-label">total</div>
      <div class="final-total"><b>0</b><span>/${max}</span></div>
      <div class="final-rank">“${rank}”</div>
      <div class="bars">${this.scores
        .map((s, i) => `<div class="bar" style="--h:${Math.max(6, s)}%;--d:${i * 90}ms"><i></i><span>${s}</span></div>`)
        .join('')}</div>
      <div class="final-best">${isBest ? '<em>new personal best!</em>' : `your best: ${best}`}</div>`;
    this.overlay.appendChild(card);
    const totalB = card.querySelector('.final-total b')!;
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 1100);
      totalB.textContent = String(Math.round(this.total * (1 - Math.pow(1 - k, 3))));
      if (k < 1 && !this.signal.aborted) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);

    // confetti doodles behind the card
    const bits: Confetto[] = [];
    const n = Math.round(10 + ratio * 50);
    const { w } = this.stage;
    for (let i = 0; i < n; i++) {
      bits.push({
        x: rand(0, w), y: rand(-400, -20), vy: rand(40, 110), vx: rand(-20, 20),
        r: rand(0, 6), vr: rand(-2, 2), kind: i % 4, c: pick([...PASTELS, BLUSH]), s: rand(6, 12),
      });
    }
    this.stage.draw = (pen, sw, sh, t, dt) => {
      for (const b of bits) {
        b.y += b.vy * dt;
        b.x += (b.vx + Math.sin(t * 2 + b.r) * 20) * dt;
        b.r += b.vr * dt;
        if (b.y > sh + 20) {
          b.y = -20;
          b.x = rand(0, sw);
        }
        const seed = 300 + b.kind * 7 + Math.round(b.s);
        if (b.kind === 0) pen.star(b.x, b.y, b.s, { fill: b.c, width: 2, seed }, b.r);
        else if (b.kind === 1) pen.circle(b.x, b.y, b.s * 0.5, { fill: b.c, width: 2, seed });
        else if (b.kind === 2) {
          const c = Math.cos(b.r), s = Math.sin(b.r);
          const pts: [number, number][] = [];
          for (let k = 0; k < 5; k++) {
            const lx = (k - 2) * b.s * 0.55, ly = (k % 2 ? 1 : -1) * b.s * 0.3;
            pts.push([b.x + lx * c - ly * s, b.y + lx * s + ly * c]);
          }
          pen.curve(pts, { stroke: b.c === BUTTER ? PEACH : b.c, width: 3, seed });
        } else {
          const c = Math.cos(b.r), s = Math.sin(b.r), z = b.s * 0.9;
          const heart: [number, number][] = [[0, -0.25], [0.45, -0.7], [0.95, -0.25], [0, 0.75], [-0.95, -0.25], [-0.45, -0.7]];
          pen.blob(heart.map(([hx, hy]) => [b.x + (hx * c - hy * s) * z, b.y + (hx * s + hy * c) * z]), { fill: BLUSH, width: 2, seed, rough: 0.4 });
        }
      }
    };

    if (ratio >= 0.6) sfx.fanfare();
    else sfx.ding();
    this.setMood(ratio >= 0.75 ? 'cheer' : ratio >= 0.45 ? 'happy' : 'sad');
    this.say(
      ratio >= 0.85 ? 'okay that was <b>scary</b> good.' :
      ratio >= 0.65 ? 'your eyeballs are well calibrated!' :
      ratio >= 0.45 ? 'solidly 대충. respectable.' :
      'that was very 대충. try again?',
    );
    const i = await this.choose([`${icons.again} again`, `${icons.home} all games`], 0);
    if (i === 0) this.restart();
    else this.exit();
  }

  private restart() {
    this.total = 0;
    this.scores = [];
    this.totalEl.textContent = '0';
    void this.run(true);
  }
}
