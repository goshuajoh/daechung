import { Stage, stayLively } from './stage';
import { drawKongi, type Mood } from './kongi';
import { sfx } from './audio';
import { type Tier, addPlay, body, firstTime, hat, plays, recordScore, tier } from './progress';
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
  /** A friend's run to compare against (challenge links). */
  rival?: { name: string; scores: number[] };
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

const STICKERS: [number, string, string[], string][] = [
  [95, '대박!!', ['daebak', 'are you a robot?', 'unreal eyes', 'chef’s kiss', 'Kongi is shook'], MINT],
  [80, 'nice~', ['so close', 'super sharp', 'nicely done', 'eyes of a hawk', 'smooth'], BUTTER],
  [60, 'not bad', ['pretty good', 'solid', 'respectable', 'getting the hang of it'], SKY],
  [35, 'hmm..', ['getting there', 'close-ish', 'very 대충', 'shake it off'], PEACH],
  [0, 'oops', ['next one!', 'it happens', 'Kongi believes in you', 'we don’t talk about that one'], LILAC],
];

interface Confetto { x: number; y: number; vy: number; vx: number; r: number; vr: number; kind: number; c: string; s: number }
interface Particle extends Confetto { life: number }

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
  private timesec: HTMLElement;
  private fx: Stage;
  private particles: Particle[] = [];
  /** Rounds in a row scoring 70+. */
  combo = 0;
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
  private clockTimer = 0;
  private clockPausedAt = 0;
  private lastSec = 0;
  private clockDone: (() => void) | null = null;
  private currentGame: GameDef | null = null;
  /** A run is in progress (leaving asks first). */
  private running = false;

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
      <div class="timebar" aria-hidden="true"><span class="tb-ico">${icons.clock}</span><div class="tb-track"><i></i></div><b class="tb-sec"></b></div>
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
    this.timefill = $('.tb-track i');
    this.timesec = $('.tb-sec');
    $('.topbar').appendChild(muteButton());
    $('.back').addEventListener('click', () => {
      sfx.click();
      if (this.running && (this.timed || this.total > 0)) this.confirmLeave();
      else this.exit();
    });
    if (opts.steps <= 6) for (let i = 0; i < opts.steps; i++) this.progress.appendChild(el('i'));
    else this.progress.classList.add('count');
    this.setHeader(opts.title, opts.kr, opts.color);

    const wrap = $('.stage-wrap');
    this.stage = new Stage(wrap, 'stage', { fps: 30, activeFps: 60 });
    wrap.insertBefore(this.stage.canvas, this.overlay);
    // effects layer (particles) above the game, below the DOM overlay; only draws while busy
    this.fx = new Stage(wrap, 'fx', { fps: 30, activeFps: 60 });
    wrap.insertBefore(this.fx.canvas, this.overlay);
    this.fx.sleep(); // no memory for an empty effects layer until something bursts

    this.kongi = new Stage($('.kongi-slot'), 'kongi-mini', { fps: 15 });
    this.kongi.draw = (pen, w, h, t, dt) => {
      this.bop = Math.max(0, this.bop - dt * 5);
      drawKongi(pen, w / 2, h - 6, Math.min(w * 0.68, h * 0.74), this.mood, t, { look: this.look, bop: this.bop, body: opts.player ? opts.player.body : body(), hat: opts.player ? undefined : hat() });
    };

    this.onKey = this.onKey.bind(this);
    window.addEventListener('keydown', this.onKey);
    if (import.meta.env.DEV) (window as unknown as { __shell: Shell }).__shell = this;
  }

  get signal() {
    return this.ac.signal;
  }

  /** Runs use quicker variants (shorter flashes, fewer beats). */
  get quick() {
    return this.timed && !this.tutorial;
  }

  private onKey(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.repeat) return;
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
    this.fx.destroy();
    this.kongi.destroy();
    this.root.remove();
  }

  /** "Leave this run?" — the clock pauses while you decide. */
  private confirmLeave() {
    if (this.root.querySelector('.leave-card')) return;
    this.pauseClock();
    const m = el('div', 'leave-wrap', `<div class="leave-card" role="dialog" aria-label="leave this run?">
        <b>leave this run?</b><p>your score so far won't be saved.</p>
        <div><button class="btn primary stay"><span>keep playing</span></button><button class="btn go"><span>leave</span></button></div>
      </div>`);
    this.root.appendChild(m);
    m.querySelector('.stay')!.addEventListener('click', () => {
      sfx.pop();
      m.remove();
      this.resumeClock();
    });
    m.querySelector('.go')!.addEventListener('click', () => {
      sfx.click();
      m.remove();
      this.exit();
    });
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
        const b = el('button', `btn${i === primary ? ' primary' : ''}${label.startsWith('<svg') ? ' icon-only' : ''}`, `<span>${label}</span>`);
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

  /** Starts the countdown bar; resolves when time runs out. Never resolves outside runs.
   *  The bar itself is a CSS transition (runs on the compositor); JS only wakes once a second. */
  clock(seconds: number): Promise<void> {
    if (!this.timed || this.tutorial) return new Promise(() => {});
    // the very first time someone plays a game they get extra time
    if (this.currentGame && plays(this.currentGame.id, this.who) === 0) seconds = Math.round(seconds * 1.4);
    this.stopClock();
    this.clockT0 = performance.now();
    this.clockDur = seconds * 1000;
    this.clockPausedAt = 0;
    this.clockLive = true;
    this.timeLeft = null;
    this.timebar.classList.add('on');
    this.timebar.classList.remove('warn');
    this.timesec.textContent = `${Math.ceil(seconds)}s`;
    this.lastSec = Math.ceil(seconds);
    this.setFill(1, 0);
    return new Promise<void>((resolve) => {
      this.clockDone = resolve;
      this.runClock();
    });
  }

  /** Bar at `frac`, then (if `ms` > 0) sliding linearly to empty over `ms`. */
  private setFill(frac: number, ms: number) {
    const f = this.timefill;
    f.style.transition = 'none';
    f.style.transform = `scaleX(${frac})`;
    if (ms <= 0) return;
    void f.offsetWidth; // commit the start position before animating
    f.style.transition = `transform ${ms}ms linear`;
    f.style.transform = 'scaleX(0)';
  }

  private clockLeftMs(at = performance.now()) {
    return Math.max(0, this.clockDur - (at - this.clockT0));
  }

  /** Animate the bar from wherever it is now, and wake at each whole second. */
  private runClock() {
    const ms = this.clockLeftMs();
    this.setFill(ms / this.clockDur, ms);
    this.clockTick();
  }

  private clockTick = () => {
    clearTimeout(this.clockTimer);
    if (!this.clockLive || this.signal.aborted) return;
    const ms = this.clockLeftMs();
    const sec = Math.ceil(ms / 1000);
    if (sec !== this.lastSec) {
      this.lastSec = sec;
      this.timesec.textContent = `${sec}s`;
      if (ms < this.clockDur * 0.34 && sec > 0) {
        this.timebar.classList.add('warn');
        sfx.click();
      }
    }
    if (ms <= 0) {
      this.clockLive = false;
      this.timeLeft = 0;
      this.setFill(0, 0);
      sfx.boop();
      this.clockDone?.();
      return;
    }
    // next whole second (or the end)
    this.clockTimer = window.setTimeout(this.clockTick, Math.max(4, ms - (sec - 1) * 1000 + 2));
  };

  /** Freeze the countdown (e.g. while the "leave?" question is open). */
  private pauseClock() {
    if (!this.clockLive) return;
    this.clockLive = false;
    this.clockPausedAt = performance.now();
    clearTimeout(this.clockTimer);
    this.setFill(this.clockLeftMs(this.clockPausedAt) / this.clockDur, 0);
    this.timebar.classList.remove('warn'); // stop the shake while paused
  }

  private resumeClock() {
    if (!this.clockPausedAt) return;
    this.clockT0 += performance.now() - this.clockPausedAt;
    this.clockPausedAt = 0;
    this.clockLive = true;
    this.runClock();
  }

  stopClock() {
    if (this.clockPausedAt) {
      this.timeLeft = this.clockLeftMs(this.clockPausedAt) / this.clockDur;
      this.clockPausedAt = 0;
      return;
    }
    if (!this.clockLive) return;
    this.clockLive = false;
    clearTimeout(this.clockTimer);
    this.timeLeft = this.clockLeftMs() / this.clockDur;
    this.setFill(this.timeLeft, 0); // freeze where it stopped
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

  /* ——— instruction cards (Bishi-Bashi style) ——— */

  private get who() {
    return this.opts.player?.name ?? '';
  }

  /**
   * Shown before every game. How much it explains depends on how often this
   * player has played it: new → full demo + steps (practice offered, never forced),
   * learning → demo + auto-start countdown, pro → a quick flash card.
   */
  async briefing(def: GameDef, i: number | null, opts: { force?: Tier; goLabel?: string } = {}) {
    let t: Tier = opts.force ?? tier(def.id, this.who);
    let practised = false;
    for (;;) {
      const action = t === 'pro' ? await this.flashCard(def, i) : await this.instructionCard(def, i, t, practised, opts.goLabel);
      if (action === 'go') break;
      if (action === 'help') {
        t = 'new';
        continue;
      }
      await this.tryRound(def);
      practised = true;
      t = 'new';
    }
    this.overlay.innerHTML = '';
    await this.goFlash();
  }

  private fadedThumb(def: GameDef) {
    this.stage.draw = (pen, w, h, t) => {
      def.thumb(pen, w, h, t);
      // wash of paper on top (globalAlpha would break layered doodles)
      pen.ctx.fillStyle = 'rgba(255, 250, 240, 0.72)';
      pen.ctx.fillRect(0, 0, w, h);
    };
  }

  /** Full or "learning" card with the animated demo. */
  private async instructionCard(def: GameDef, i: number | null, t: Tier, practised: boolean, goLabel?: string): Promise<'go' | 'practice'> {
    this.overlay.innerHTML = '';
    this.clearActions();
    this.stage.clear();
    const full = t === 'new';
    const counter = i == null ? '' : `<small>${i + 1} / ${this.opts.steps}</small>`;
    const badge = full && !practised ? '<em>new game!</em>' : '';
    // explain the countdown once, on the first timed game someone ever plays
    const clockNote = this.timed && !def.untimed && !practised && firstTime('timer');
    const card = el('div', `howto brief${full ? ' full' : ''}`, `
      <div class="howto-head">${counter}<b>${def.name}</b><span>${def.kr}</span>${badge}</div>
      <div class="howto-demo"></div>
      ${full
        ? `<ol class="howto-steps">${def.steps.map((st, k) => `<li style="--d:${250 + k * 140}ms"><i>${k + 1}</i><span>${st}</span></li>`).join('')}</ol>`
        : `<p class="brief-verb">${def.verb}</p>`}
      ${clockNote ? `<p class="brief-note">${icons.clock}<span>a <b>timer</b> runs up top. faster = bonus!</span></p>` : ''}
`);
    card.style.setProperty('--tc', def.color);
    this.overlay.appendChild(card);
    const demo = new Stage(card.querySelector<HTMLElement>('.howto-demo')!, 'demo-canvas', { fps: 30 });
    demo.draw = (pen, w, h, tt) => def.demo(pen, w, h, tt);
    this.demoCleanup = () => {
      demo.destroy();
      card.remove();
      this.demoCleanup = null;
    };
    sfx.whoosh(0.25);
    stayLively();
    this.setMood('happy');
    const tryLabel = this.timed ? 'practice first' : 'try with hints';
    if (full) this.say(practised ? "got it? press <b>I'm ready!</b>" : this.timed ? 'new game! try it <b>free</b> first?' : 'watch the hand, then start!');
    else this.say(`${def.verb} <em>· press go when you're ready</em>`);
    // no auto-start until someone has played a game three times (then they get the quick flash card)
    const labels = full
      ? [practised ? (goLabel ?? "I'm ready!") : (goLabel ?? "let's go!"), practised ? 'practice again' : tryLabel]
      : ['go!', 'practice'];
    const pick = await this.choose(labels, 0);
    this.clearActions();
    this.demoCleanup?.();
    return pick === 0 ? 'go' : 'practice';
  }

  /** Pros get a quick slammed-in card with a "?" in case they forgot. */
  private async flashCard(def: GameDef, i: number | null): Promise<'go' | 'help'> {
    this.overlay.innerHTML = '';
    this.clearActions();
    this.fadedThumb(def);
    const counter = i == null ? '' : `<small>${i + 1} / ${this.opts.steps}</small>`;
    const card = el('div', 'title-card', `${counter}<b>${def.name}</b><span>${def.verb}</span>`);
    card.style.setProperty('--tc', def.color);
    card.style.setProperty('--rot', `${((i ?? 0) % 2 ? 1 : -1) * rand(1.5, 3.5)}deg`);
    const help = el('button', 'help-chip', '? how to play') as HTMLButtonElement;
    card.appendChild(help);
    this.overlay.appendChild(card);
    this.say(def.verb, 'wow');
    sfx.whoosh(0.3);
    const wantHelp = await Promise.race([
      this.wait(1700).then(() => false),
      this.until<boolean>((done) => {
        const skip = (e: PointerEvent) => e.target !== help && done(false);
        const ask = (e: MouseEvent) => {
          e.stopPropagation();
          sfx.pop();
          done(true);
        };
        card.addEventListener('pointerdown', skip);
        help.addEventListener('click', ask);
        return () => {
          card.removeEventListener('pointerdown', skip);
          help.removeEventListener('click', ask);
        };
      }),
    ]);
    card.classList.add('bye');
    await this.wait(180);
    card.remove();
    return wantHelp ? 'help' : 'go';
  }

  /** "ready… GO!" */
  private async goFlash() {
    const g = el('div', 'go-flash', '<b>GO!</b>');
    this.overlay.appendChild(g);
    sfx.tone(660, 0.12, { type: 'triangle', vol: 0.2 });
    sfx.tone(990, 0.18, { type: 'triangle', vol: 0.2, at: sfx.now + 0.09 });
    await this.wait(520);
    g.remove();
    this.setMood('idle');
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
      stayLively();
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
    if (!res) return;
    const acc = Math.round(clamp(res.score, 0, 100));
    const s = el('div', 'sticker', `<b>${acc}</b><span>practice</span><em>doesn't count</em>`);
    s.style.setProperty('--sc', 'var(--white)');
    s.style.setProperty('--rot', `${rand(-10, 8).toFixed(1)}deg`);
    this.overlay.appendChild(s);
    sfx.pop();
    this.setMood(acc >= 60 ? 'cheer' : 'happy', 2600);
    this.say(`${res.detail} <em>· that's how it works!</em>`);
    await this.wait(1600);
  }

  /** Play a list of mini-games. Returns null if the player left. */
  async playSteps(steps: Step[], seed: number | null): Promise<StepResult[] | null> {
    const results: StepResult[] = [];
    this.combo = 0;
    this.running = true;
    try {
      for (let i = 0; i < steps.length; i++) {
        const { game, level } = steps[i];
        if (this.timed) this.setHeader(game.name, game.kr, game.color);
        this.setProgress(i);
        this.overlay.innerHTML = '';
        this.look = undefined;
        this.setMood('idle');
        this.clearActions();
        if (this.timed) await this.briefing(game, i);
        this.timeLeft = null;
        this.currentGame = game;
        seedRandom(seed == null ? null : (seed * 7919 + (i + 1) * 104729 + level) | 0);
        stayLively();
        let res: RoundResult;
        try {
          res = await game.play(this, level);
        } finally {
          seedRandom(null);
          this.hideClock();
        }
        addPlay(game.id, this.who);
        const acc = Math.round(clamp(res.score, 0, 100));
        if (!this.opts.player) recordScore(game.id, acc);
        const bonus = !this.timed ? 0 : game.untimed ? Math.round((10 * acc) / 100) : Math.round((20 * (this.timeLeft ?? 0) * acc) / 100);
        results.push({ game, acc, bonus, detail: res.detail });
        this.total += acc + bonus;
        this.bumpTotal(this.total);
        await this.sticker(acc, bonus, res.detail, i === steps.length - 1, i);
      }
      this.setProgress(steps.length);
      return results;
    } catch (e) {
      if (isAbort(e)) return null;
      throw e;
    } finally {
      this.running = false;
      this.currentGame = null;
    }
  }

  private async sticker(acc: number, bonus: number, detail: string, last: boolean, i: number) {
    const [, word, subs, color] = STICKERS.find(([min]) => acc >= min)!;
    // Math.random on purpose: flavour text must not consume the seeded game randomness
    const sub = subs[Math.floor(Math.random() * subs.length)];
    stayLively();
    const s = el('div', 'sticker', `<b>0</b><span>${word}</span>${bonus ? `<em>+${bonus} speed</em>` : ''}`);
    s.style.setProperty('--sc', color);
    s.style.setProperty('--rot', `${rand(-12, 10).toFixed(1)}deg`);
    this.overlay.appendChild(s);
    // count the number up with rising blips, then the payoff
    const num = s.querySelector('b')!;
    const steps = Math.max(1, Math.min(12, Math.round(acc / 8)));
    for (let k = 1; k <= steps; k++) {
      num.textContent = String(Math.round((acc * k) / steps));
      sfx.blip(Math.round((k / steps) * (acc / 4)));
      await this.wait(28);
    }
    num.textContent = String(acc);
    const w = this.stage.w;
    if (acc >= 95) {
      sfx.fanfare();
      this.banner(acc === 100 ? 'PERFECT!!' : '대박!!');
      this.burst(w - 62, 62, 34);
      this.shake();
    } else if (acc >= 80) {
      sfx.ding();
      this.burst(w - 62, 62, 18);
    } else if (acc >= 35) sfx.pop();
    else {
      sfx.boop();
      this.shake(true);
    }
    // hot streak
    this.combo = acc >= 70 ? this.combo + 1 : 0;
    if (this.combo >= 2) {
      const c = el('div', 'combo', `${icons.flame}<b>${this.combo} in a row!</b>`);
      this.overlay.appendChild(c);
      sfx.tone(520 + this.combo * 90, 0.16, { type: 'square', vol: 0.06 });
    }
    const mood: Mood = acc >= 90 ? 'cheer' : acc >= 65 ? 'happy' : acc >= 35 ? 'wow' : 'sad';
    this.setMood(mood, 2600);
    const rival = this.opts.rival;
    let vs = '';
    if (rival && rival.scores[i] != null) {
      const theirs = rival.scores[i];
      const mine = acc + bonus;
      vs = ` <em>· ${esc(rival.name)} got ${theirs} ${mine > theirs ? '(you win this one!)' : mine === theirs ? '(tie!)' : '(they win this one)'}</em>`;
    }
    this.say(`${detail} <em>· ${sub}</em>${vs}`);
    if (this.timed && !last) await Promise.race([this.button('next'), this.wait(rival ? 3400 : 2800)]);
    else await this.button(last ? 'see results' : 'next round');
    this.clearActions();
    s.classList.add('bye');
  }

  /* ——— juice ——— */

  private shake(soft = false) {
    const wrap = this.stage.canvas.parentElement!;
    wrap.classList.remove('shake', 'shake-soft');
    void wrap.offsetWidth;
    wrap.classList.add(soft ? 'shake-soft' : 'shake');
    setTimeout(() => wrap.classList.remove('shake', 'shake-soft'), 450);
  }

  banner(text: string) {
    const b = el('div', 'banner', `<b>${text}</b>`);
    this.overlay.appendChild(b);
    setTimeout(() => b.remove(), 1500);
  }

  /** Doodle particles flying out from (x, y) on the effects layer. */
  burst(x: number, y: number, n: number) {
    const cols = [...PASTELS, BLUSH];
    for (let k = 0; k < n; k++) {
      const a = rand(0, Math.PI * 2), v = rand(140, 420);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, r: rand(0, 6), vr: rand(-6, 6), kind: k % 3, c: pick(cols), s: rand(5, 10), life: rand(0.7, 1.2) });
    }
    if (!this.fx.draw) this.fx.draw = this.drawFx;
    this.fx.boost(1600);
  }

  private drawFx = (pen: Pen, _w: number, _h: number, _t: number, dt: number) => {
    const ps = this.particles;
    for (let k = ps.length - 1; k >= 0; k--) {
      const p = ps[k];
      p.life -= dt;
      if (p.life <= 0) {
        ps.splice(k, 1);
        continue;
      }
      p.vy += 700 * dt;
      p.vx *= 0.985;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += p.vr * dt;
      const al = Math.min(1, p.life * 2);
      if (p.kind === 0) pen.star(p.x, p.y, p.s, { fill: p.c, width: 1.8, seed: 700 + k, alpha: al }, p.r);
      else if (p.kind === 1) pen.circle(p.x, p.y, p.s * 0.5, { fill: p.c, width: 1.8, seed: 700 + k, alpha: al });
      else pen.line(p.x - Math.cos(p.r) * p.s, p.y - Math.sin(p.r) * p.s, p.x + Math.cos(p.r) * p.s, p.y + Math.sin(p.r) * p.s, { stroke: p.c === BUTTER ? PEACH : p.c, width: 3, seed: 700 + k, alpha: al });
    }
    if (!ps.length) this.fx.sleep(); // done: stop drawing and free the layer until the next burst
  };

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
    stayLively();
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
