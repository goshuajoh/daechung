import { Stage } from './stage';
import { drawKongi, type Mood } from './kongi';
import { sfx } from './audio';
import { hasLearned, markLearned } from './store';
import { icons } from './icons';
import { clamp, pick, rand, seedRandom } from './rng';
import { BLUSH, BUTTER, LILAC, MINT, PASTELS, PEACH, SKY } from './palette';
import type { Pen } from './pen';

export interface RoundResult {
  /** Accuracy, 0..100 */
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
  /** Short shout for the title card in runs, e.g. "make the angle!" */
  verb: string;
  color: string;
  /** Has its own timing, so no countdown bar (speed bonus is flat). */
  untimed?: boolean;
  /** Practice ranks: [minimum total out of 500, title], highest first. */
  ranks: [number, string][];
  thumb(pen: Pen, w: number, h: number, t: number): void;
  /** 2–3 tiny steps for the how-to card. Keep them dead simple. */
  steps: string[];
  /** Looping demo of how to play, with a ghost hand doing the moves. */
  demo(pen: Pen, w: number, h: number, t: number): void;
  /**
   * One challenge. `level` 0..4 is difficulty. When `g.tutorial` is on it's a free
   * practice go: no clock, and games may show training wheels (live numbers, guides).
   */
  play(g: Shell, level: number): Promise<RoundResult>;
}

export interface Step {
  game: GameDef;
  level: number;
}

export interface StepResult {
  game: GameDef;
  acc: number;
  bonus: number;
  detail: string;
}

export interface FrameOpts {
  title: string;
  kr: string;
  color: string;
  steps: number;
  /** Run mode: countdowns, speed bonus, title cards, quick variants, auto-advance. */
  timed: boolean;
  player?: { name: string; body: string };
}

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html) n.innerHTML = html;
  return n;
};

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

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
 * The frame around every mini-game: top bar, canvas stage, Kongi's speech dock,
 * countdown bar, score stickers. Modes (practice / run / party) drive it.
 */
export class Shell {
  readonly root: HTMLElement;
  readonly stage: Stage;
  readonly overlay: HTMLElement;
  readonly timed: boolean;
  private kongi: Stage;
  private bubble: HTMLElement;
  private actions: HTMLElement;
  private progress: HTMLElement;
  private totalEl: HTMLElement;
  private titleEl: HTMLElement;
  private timebar: HTMLElement;
  private timefill: HTMLElement;
  private ac = new AbortController();
  private moodTimer = 0;
  private baseMood: Mood = 'idle';
  mood: Mood = 'idle';
  look: [number, number] | undefined;
  /** Games can set this to 1 to make Kongi bounce; it decays by itself. */
  bop = 0;
  total = 0;
  /** True during a free practice try (no clock, training wheels on). */
  tutorial = false;
  private demoCleanup: (() => void) | null = null;
  /** Aborted to cancel just the current round (e.g. skipping a practice try). */
  private roundAc = new AbortController();
  /** Fraction of the countdown left when the player locked in (null = no clock ran). */
  timeLeft: number | null = null;
  private clockLive = false;
  private clockT0 = 0;
  private clockDur = 0;
  private clockRaf = 0;

  constructor(parent: HTMLElement, readonly opts: FrameOpts, private exit: () => void) {
    this.timed = opts.timed;
    this.root = el('section', 'screen game');
    this.root.style.setProperty('--c', opts.color);
    this.root.innerHTML = `
      <header class="topbar">
        <button class="icon-btn back" aria-label="Back to home">${icons.back}</button>
        <div class="game-title"></div>
        <div class="progress" aria-hidden="true"></div>
        <div class="score-chip" title="total score"><span class="total">0</span></div>
      </header>
      <div class="timebar" aria-hidden="true"><i></i></div>
      <div class="stage-wrap">
        <div class="overlay"></div>
      </div>
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
    this.progress = $('.progress');
    this.totalEl = $('.total');
    this.titleEl = $('.game-title');
    this.timebar = $('.timebar');
    this.timefill = $('.timebar i');
    $('.topbar').appendChild(muteButton());
    $('.back').addEventListener('click', () => {
      sfx.click();
      this.exit();
    });
    if (opts.steps <= 6) for (let i = 0; i < opts.steps; i++) this.progress.appendChild(el('i'));
    else this.progress.classList.add('count');
    this.setHeader(opts.title, opts.kr, opts.color);

    const wrap = $('.stage-wrap');
    this.stage = new Stage(wrap, 'stage');
    wrap.insertBefore(this.stage.canvas, this.overlay);

    this.kongi = new Stage($('.kongi-slot'), 'kongi-mini');
    this.kongi.draw = (pen, w, h, t, dt) => {
      this.bop = Math.max(0, this.bop - dt * 5);
      drawKongi(pen, w / 2, h - 6, Math.min(w * 0.72, h * 0.8), this.mood, t, { look: this.look, bop: this.bop, body: opts.player?.body });
    };

    this.onKey = this.onKey.bind(this);
    window.addEventListener('keydown', this.onKey);
  }

  get signal() {
    return this.ac.signal;
  }

  /** Runs use quicker variants (shorter flashes, fewer beats). */
  get quick() {
    return this.timed && !this.tutorial;
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
    this.demoCleanup?.();
    this.ac.abort();
    this.stopClock();
    seedRandom(null);
    window.removeEventListener('keydown', this.onKey);
    clearTimeout(this.moodTimer);
    this.stage.destroy();
    this.kongi.destroy();
    this.root.remove();
  }

  /* ——— header ——— */

  setHeader(name: string, kr: string, color: string) {
    const who = this.opts.player ? `<em class="who" style="--pc:${this.opts.player.body}">${esc(this.opts.player.name)}</em>` : '';
    this.titleEl.innerHTML = `${who}<b>${name}</b><span>${kr}</span>`;
    this.root.style.setProperty('--c', color);
  }

  resetTotal() {
    this.total = 0;
    this.totalEl.textContent = '0';
  }

  setProgress(i: number) {
    if (this.progress.classList.contains('count')) {
      this.progress.textContent = i < this.opts.steps ? `${i + 1}/${this.opts.steps}` : `${this.opts.steps}/${this.opts.steps}`;
      return;
    }
    [...this.progress.children].forEach((p, k) => (p.className = k < i ? 'done' : k === i ? 'now' : ''));
  }

  private bumpTotal(to: number) {
    countUp(this.totalEl, to, 600, this.signal);
    const chip = this.totalEl.parentElement!;
    chip.classList.remove('bump');
    void chip.offsetWidth;
    chip.classList.add('bump');
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
      const round = this.roundAc.signal;
      if (this.signal.aborted || round.aborted) return onAbort();
      this.signal.addEventListener('abort', onAbort, { once: true });
      round.addEventListener('abort', onAbort, { once: true });
      cleanup = setup((v) => {
        if (settled) return;
        settled = true;
        this.signal.removeEventListener('abort', onAbort);
        round.removeEventListener('abort', onAbort);
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

  /** In practice: a button to start. In runs: just a beat, the title card already said "ready". */
  ready(label: string) {
    if (this.tutorial) return this.wait(500);
    return this.timed ? this.wait(250) : this.button(label);
  }

  /** A confirm button whose enabled state the game controls. */
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

  /* ——— countdown ——— */

  /** Starts the countdown bar; resolves when time runs out. Never resolves outside runs. */
  clock(seconds: number): Promise<void> {
    if (!this.timed || this.tutorial) return new Promise(() => {});
    this.stopClock();
    this.clockT0 = performance.now();
    this.clockDur = seconds * 1000;
    this.clockLive = true;
    this.timeLeft = null;
    this.timebar.classList.add('on');
    this.timebar.classList.remove('warn');
    let lastSec = Math.ceil(seconds);
    return new Promise<void>((resolve) => {
      const step = () => {
        if (!this.clockLive || this.signal.aborted) return;
        const left = Math.max(0, 1 - (performance.now() - this.clockT0) / this.clockDur);
        this.timefill.style.transform = `scaleX(${left})`;
        const sec = Math.ceil(left * seconds);
        if (left < 0.34 && sec !== lastSec) {
          lastSec = sec;
          this.timebar.classList.add('warn');
          sfx.click();
        }
        if (left <= 0) {
          this.clockLive = false;
          this.timeLeft = 0;
          sfx.boop();
          resolve();
          return;
        }
        this.clockRaf = requestAnimationFrame(step);
      };
      this.clockRaf = requestAnimationFrame(step);
    });
  }

  stopClock() {
    if (!this.clockLive) return;
    this.clockLive = false;
    cancelAnimationFrame(this.clockRaf);
    this.timeLeft = Math.max(0, 1 - (performance.now() - this.clockT0) / this.clockDur);
  }

  private hideClock() {
    this.stopClock();
    this.timebar.classList.remove('on', 'warn');
  }

  /** Wait for the confirm button or the countdown. Returns true if time ran out. */
  async lockIn(confirm: { pressed: Promise<void> }, seconds: number): Promise<boolean> {
    const timedOut = await Promise.race([confirm.pressed.then(() => false), this.clock(seconds).then(() => true)]);
    this.stopClock();
    this.clearActions();
    if (timedOut) this.say("time's up!", 'sad');
    return timedOut;
  }

  /* ——— flow ——— */

  /** Draw a game's thumbnail big in the middle of the stage. */
  showcase(def: GameDef, subtitle: string) {
    this.stage.draw = (pen, w, h, t) => {
      const bw = Math.min(w - 32, 440), bh = Math.min(h * 0.62, bw * 0.72);
      const x = (w - bw) / 2, y = Math.max(76, (h - bh) / 2 + 30);
      pen.text(def.name, w / 2, y - 44, { size: Math.min(44, w * 0.1) });
      pen.text(subtitle, w / 2, y - 12, { size: 20, font: 'gaegu', alpha: 0.7 });
      pen.ctx.save();
      pen.ctx.translate(x, y);
      def.thumb(pen, bw, bh, t);
      pen.ctx.restore();
    };
  }

  /** Big slammed-in card before each game in a run. Resolves true if they asked for help. */
  private async titleCard(def: GameDef, i: number, offerHelp: boolean, sub = def.verb): Promise<boolean> {
    this.stage.draw = (pen, w, h, t) => {
      def.thumb(pen, w, h, t);
      // fade it back with a wash of paper (globalAlpha would break layered doodles)
      pen.ctx.fillStyle = 'rgba(255, 250, 240, 0.68)';
      pen.ctx.fillRect(0, 0, w, h);
    };
    const card = el('div', 'title-card', `<small>${i + 1} / ${this.opts.steps}</small><b>${def.name}</b><span>${sub}</span>`);
    card.style.setProperty('--tc', def.color);
    card.style.setProperty('--rot', `${(i % 2 ? 1 : -1) * rand(1.5, 3.5)}deg`);
    const help = el('button', 'help-chip', 'how do I play?') as HTMLButtonElement;
    if (offerHelp) card.appendChild(help);
    this.overlay.appendChild(card);
    this.say(sub, 'wow');
    sfx.whoosh(0.3);
    const wantHelp = await Promise.race([
      this.wait(offerHelp ? 1900 : 1300).then(() => false),
      this.until<boolean>((done) => {
        card.addEventListener('pointerdown', (e) => {
          if (e.target === help) return;
          done(false);
        });
        help.addEventListener('click', (e) => {
          e.stopPropagation();
          sfx.pop();
          done(true);
        });
      }),
    ]);
    card.classList.add('bye');
    await this.wait(180);
    card.remove();
    this.setMood('idle');
    return wantHelp;
  }

  /* ——— tutorials ——— */

  private get who() {
    return this.opts.player?.name ?? '';
  }

  /** The animated "how to play" card: demo with a ghost hand + numbered steps. */
  private showHowTo(def: GameDef) {
    this.demoCleanup?.();
    this.stage.draw = () => {};
    this.overlay.innerHTML = '';
    const card = el('div', 'howto', `
      <div class="howto-head"><small>how to play</small><b>${def.name}</b><span>${def.kr}</span></div>
      <div class="howto-demo"></div>
      <ol class="howto-steps">${def.steps.map((st, k) => `<li style="--d:${300 + k * 160}ms"><i>${k + 1}</i><span>${st}</span></li>`).join('')}</ol>`);
    card.style.setProperty('--tc', def.color);
    this.overlay.appendChild(card);
    const demo = new Stage(card.querySelector<HTMLElement>('.howto-demo')!, 'demo-canvas');
    demo.draw = (pen, w, h, t) => def.demo(pen, w, h, t);
    this.demoCleanup = () => {
      demo.destroy();
      card.remove();
      this.demoCleanup = null;
    };
  }

  /**
   * Teach a game: how-to card, then as many free practice tries as they like.
   * `first` = they've never played it, so we push the practice try.
   */
  async teach(def: GameDef, first: boolean, goLabel = "I'm ready!") {
    this.showHowTo(def);
    this.setMood('happy');
    this.say(first ? "new game! watch the hand, then have a <b>free practice go</b>. it won't count." : def.howto);
    const labels = first ? ['try it (free)', 'skip, I get it'] : [goLabel, 'try it (free)'];
    let i = await this.choose(labels, 0);
    this.demoCleanup?.();
    let action: 'try' | 'go' = (first ? i === 0 : i === 1) ? 'try' : 'go';
    while (action === 'try') {
      await this.tryRound(def);
      i = await this.choose([goLabel, 'practice again', 'how to play'], 0);
      if (i === 2) {
        this.showHowTo(def);
        this.say(def.howto, 'happy');
        i = await this.choose([goLabel, 'try it (free)'], 0);
        this.demoCleanup?.();
        action = i === 0 ? 'go' : 'try';
      } else action = i === 0 ? 'go' : 'try';
    }
    this.overlay.innerHTML = '';
    markLearned(def.id, this.who);
  }

  /** A free, untimed go with training wheels. Doesn't count. */
  private async tryRound(def: GameDef) {
    this.overlay.innerHTML = '';
    this.look = undefined;
    this.setMood('idle');
    this.clearActions();
    this.tutorial = true;
    this.root.classList.add('practicing');
    this.roundAc = new AbortController();
    const skip = el('button', 'skip-chip', 'skip practice') as HTMLButtonElement;
    skip.addEventListener('click', () => {
      sfx.click();
      this.roundAc.abort();
    });
    this.overlay.appendChild(skip);
    let res: RoundResult | null = null;
    try {
      seedRandom(null);
      res = await def.play(this, 0);
    } catch (e) {
      // skipping only cancels this round; leaving the screen still propagates
      if (!isAbort(e) || this.signal.aborted) throw e;
    } finally {
      this.tutorial = false;
      this.hideClock();
      this.root.classList.remove('practicing');
      skip.remove();
      this.roundAc = new AbortController();
    }
    if (!res) {
      this.overlay.innerHTML = '';
      this.stage.draw = () => {};
      this.setMood('happy');
      this.say('no worries! you can always practice from the home screen.');
      return;
    }
    const acc = Math.round(clamp(res.score, 0, 100));
    const s = el('div', 'sticker', `<b>${acc}</b><span>practice</span><em>doesn't count</em>`);
    s.style.setProperty('--sc', 'var(--white)');
    s.style.setProperty('--rot', `${rand(-10, 8).toFixed(1)}deg`);
    this.overlay.appendChild(s);
    sfx.pop();
    this.setMood(acc >= 60 ? 'cheer' : 'happy', 2600);
    this.say(`${res.detail} <em>· that's how it works! ready for real?</em>`);
  }

  /** Play a list of mini-games. Returns null if the player left. */
  async playSteps(steps: Step[], seed: number | null): Promise<StepResult[] | null> {
    const results: StepResult[] = [];
    try {
      for (let i = 0; i < steps.length; i++) {
        const { game, level } = steps[i];
        if (this.timed) this.setHeader(game.name, game.kr, game.color);
        this.setProgress(i);
        this.overlay.innerHTML = '';
        this.look = undefined;
        this.setMood('idle');
        this.clearActions();
        if (this.timed) {
          const learned = hasLearned(game.id, this.who);
          const wantHelp = await this.titleCard(game, i, learned);
          if (wantHelp || !learned) {
            await this.teach(game, !learned);
            await this.titleCard(game, i, false, 'for real now!');
          }
        }
        this.timeLeft = null;
        seedRandom(seed == null ? null : (seed * 7919 + (i + 1) * 104729 + level) | 0);
        let res: RoundResult;
        try {
          res = await game.play(this, level);
        } finally {
          seedRandom(null);
          this.hideClock();
        }
        const acc = Math.round(clamp(res.score, 0, 100));
        const bonus = !this.timed ? 0 : game.untimed ? Math.round((10 * acc) / 100) : Math.round((20 * (this.timeLeft ?? 0) * acc) / 100);
        results.push({ game, acc, bonus, detail: res.detail });
        this.total += acc + bonus;
        this.bumpTotal(this.total);
        await this.sticker(acc, bonus, res.detail, i === steps.length - 1);
      }
      this.setProgress(steps.length);
      return results;
    } catch (e) {
      if (isAbort(e)) return null;
      throw e;
    }
  }

  private async sticker(acc: number, bonus: number, detail: string, last: boolean) {
    const [, word, sub, color] = STICKERS.find(([min]) => acc >= min)!;
    const s = el('div', 'sticker', `<b>${acc}</b><span>${word}</span>${bonus ? `<em>+${bonus} speed</em>` : ''}`);
    s.style.setProperty('--sc', color);
    s.style.setProperty('--rot', `${rand(-12, 10).toFixed(1)}deg`);
    this.overlay.appendChild(s);
    if (acc >= 80) sfx.ding();
    else if (acc >= 35) sfx.pop();
    else sfx.boop();
    const mood: Mood = acc >= 90 ? 'cheer' : acc >= 65 ? 'happy' : acc >= 35 ? 'wow' : 'sad';
    this.setMood(mood, 2600);
    this.say(`${detail} <em>· ${sub}</em>`);
    if (this.timed && !last) await Promise.race([this.button('next'), this.wait(2800)]);
    else await this.button(last ? 'see results' : 'next round');
    this.clearActions();
    s.classList.add('bye');
  }

  /* ——— finale helpers ——— */

  card(html: string, cls = 'final-card') {
    this.overlay.innerHTML = '';
    const c = el('div', cls, html);
    this.overlay.appendChild(c);
    return c;
  }

  countUp(target: Element, to: number, ms = 1100) {
    countUp(target, to, ms, this.signal);
  }

  /** Doodle confetti falling behind whatever card is showing. */
  confetti(amount: number, extra?: (pen: Pen, w: number, h: number, t: number) => void) {
    const bits: Confetto[] = [];
    const n = Math.round(8 + clamp(amount, 0, 1) * 52);
    const { w } = this.stage;
    for (let i = 0; i < n; i++) {
      bits.push({
        x: rand(0, w), y: rand(-400, -20), vy: rand(40, 110), vx: rand(-20, 20),
        r: rand(0, 6), vr: rand(-2, 2), kind: i % 4, c: pick([...PASTELS, BLUSH]), s: rand(6, 12),
      });
    }
    this.stage.draw = (pen, sw, sh, t, dt) => {
      extra?.(pen, sw, sh, t);
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
    if (amount >= 0.6) sfx.fanfare();
    else sfx.ding();
  }
}

export function countUp(target: Element, to: number, ms: number, signal?: AbortSignal) {
  const from = Number(target.textContent) || 0;
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    target.textContent = String(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
    if (k < 1 && !signal?.aborted) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
