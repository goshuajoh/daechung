import { Stage } from './lib/stage';
import { drawKongi, type Mood } from './lib/kongi';
import { getBest } from './lib/store';
import { body, dayScore, firstTime, forgetTutorials, hat, levelOf, newStamps, pillows, streak, streakNeedsNap, xp } from './lib/progress';
import { friends, getPending } from './challenge';
import { closet } from './closet';
import { canPrompt, isIOS, onInstallChange, promptInstall, standalone } from './install';
import { icons } from './lib/icons';
import { esc, muteButton, type GameDef } from './lib/shell';
import { sfx } from './lib/audio';
import { RUN_LENGTH, nextDailyIn, today } from './modes';
import { BERRY, BUTTER, INK, LILAC, PINK, WHITE } from './lib/palette';
import type { Pen } from './lib/pen';

/* ——— little illustrations for the mode buttons ——— */

function drawCalendar(pen: Pen, w: number, h: number, t: number, n: number) {
  const cw = Math.min(w * 0.62, h * 0.95), ch = cw * 0.92;
  const x = w / 2 - cw / 2, y = h / 2 - ch / 2 + 4;
  pen.rrect(x, y, cw, ch, 10, { fill: WHITE, seed: 1 });
  pen.rrect(x, y, cw, ch * 0.28, 10, { fill: BERRY, seed: 2, shift: [0, 0] });
  for (const k of [0.3, 0.7]) pen.line(x + cw * k, y - 8, x + cw * k, y + 10, { width: 4, seed: 3 + k * 10 });
  pen.text(`#${n}`, w / 2, y + ch * 0.64, { size: ch * 0.36 });
  const a = Math.sin(t * 2) * 0.3;
  pen.star(x + cw * 0.92, y + ch * 0.9, cw * 0.16, { fill: BUTTER, seed: 5 }, a);
}

function drawStopwatch(pen: Pen, w: number, h: number, t: number) {
  const r = Math.min(w, h) * 0.34;
  const cx = w / 2, cy = h / 2 + r * 0.12;
  pen.rrect(cx - r * 0.18, cy - r * 1.32, r * 0.36, r * 0.24, 4, { fill: PINK, seed: 10 });
  pen.line(cx, cy - r * 1.08, cx, cy - r, { width: 4, seed: 11 });
  pen.circle(cx, cy, r, { fill: WHITE, seed: 12 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r0 = i % 3 ? r * 0.82 : r * 0.72;
    pen.line(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9, { width: 2, seed: 13 + i, rough: 0.3 });
  }
  const a = -Math.PI / 2 + Math.floor(t * 4) * (Math.PI / 15);
  pen.line(cx, cy, cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7, { stroke: BERRY, width: 3.5, seed: 30 });
  pen.circle(cx, cy, 4, { fill: INK, seed: 31, shift: [0, 0] });
}

function drawTrio(pen: Pen, w: number, h: number, t: number) {
  const bodies = ['#fff0bd', '#d6e8fa', '#fddde6'];
  const s = Math.min(w * 0.3, h * 0.62);
  bodies.forEach((b, i) => {
    const mood: Mood = (Math.floor(t / 2) + i) % 3 === 0 ? 'cheer' : 'happy';
    drawKongi(pen, w / 2 + (i - 1) * s * 0.95, h - 6 - (i === 1 ? 6 : 0), s, mood, t + i * 0.5, { body: b });
  });
}

/** Home screen: hero, the three ways to play, then practice tiles. Returns a cleanup fn. */
export function renderHome(parent: HTMLElement, games: GameDef[], go: (hash: string) => void): () => void {
  const day = today();
  const dailyBest = dayScore(day.n);
  const lv = levelOf(xp());
  const streakNow = streak(day.n);
  const pending = getPending();
  const challenge = pending && Math.abs(pending.day - day.n) <= 1 ? pending : null;
  const pals = friends(day.n);
  // first visit ever: Kongi says hi and points at the Daily
  const welcome = !challenge && xp() === 0 && firstTime('welcome');
  // last 7 dailies: played or not
  const week = Array.from({ length: 7 }, (_, k) => day.n - 6 + k)
    .map((n) => `<i class="${n === day.n ? 'today ' : ''}${n < 1 ? 'pre' : dayScore(n) != null ? 'done' : ''}"></i>`)
    .join('');
  const runBest = getBest('run');
  const tilts = [-1.4, 1.1, -0.7, 1.6, -1.2, 0.9, -1.7, 1.3, -0.9, 1.5];
  const root = document.createElement('section');
  root.className = 'screen home';
  root.innerHTML = `
    <header class="hero">
      <div class="hero-kongi" role="img" aria-label="Kongi, a little bean sprout"></div>
      <div class="hero-text">
        <h1>대충</h1>
        <p class="roman"><b>daechung</b> · <i>adv.</i> roughly, more or less, by eye</p>
        <p class="tag">${games.length} tiny games for people who eyeball everything.</p>
        <div class="me">
          <button class="lvl${newStamps() ? ' has-new' : ''}" aria-label="level ${lv.level}, open your profile${newStamps() ? ' (new stamps!)' : ''}"><b>Lv ${lv.level}</b><i><u style="width:${(lv.into / lv.need) * 100}%"></u></i><span>${lv.into}/${lv.need} xp</span></button>
          <span class="streak ${streakNow ? '' : 'cold'}">${icons.flame}<b>${streakNow ? `${streakNow}-day streak` : 'start a streak!'}</b>${
            pillows() ? `<span class="pils" role="img" aria-label="${pillows()} nap pillow${pillows() > 1 ? 's' : ''}">${icons.pillow.repeat(pillows())}</span>` : ''
          }</span>
          ${streakNeedsNap(day.n) && dailyBest == null ? '<span class="nap-note">missed yesterday? a pillow saves your streak if you play today.</span>' : ''}
        </div>
      </div>
    </header>
    ${welcome ? `<div class="welcome" role="note">hi! I'm <b>Kongi</b>. new here? tap today's <b>Daily</b> below to start. it teaches you as you go!</div>` : ''}
    ${challenge ? `<button class="challenge-ribbon" data-go="daily">${icons.flame}<span><b>${esc(challenge.name)}</b> challenged you: <b>${challenge.total}</b> on daily #${challenge.day}. <u>beat it!</u></span></button>` : ''}
    <div class="modes">
      <button class="mode m-daily${welcome ? ' beckon' : ''}" style="--c:${BUTTER};--tilt:-1deg" data-go="daily">
        <div class="mode-art"></div>
        <div class="mode-text">
          <small>daily #${day.n}</small>
          <b>Daily 대충</b>
          <p>${RUN_LENGTH} mini-games against the clock. Same ones for everyone today.</p>
          <span class="week" aria-label="this week">${week}</span>
          ${pals.length ? `<span class="pals">friends today: ${pals.slice(0, 3).map((f) => `<b>${esc(f.name)}</b> ${f.total}`).join(' · ')}</span>` : ''}
          <span class="best">${dailyBest == null ? 'not played today!' : `today: <b>${dailyBest}</b> · next in <span class="next-in">${nextDailyIn()}</span>`}</span>
        </div>
      </button>
      <button class="mode m-run" style="--c:${LILAC};--tilt:1.2deg" data-go="run">
        <div class="mode-art"></div>
        <div class="mode-text">
          <b>Quick Run</b>
          <p>Random order, fresh puzzles, every time.</p>
          <span class="best">${runBest == null ? 'no runs yet' : `best <b>${runBest}</b>`}</span>
        </div>
      </button>
      <button class="mode m-party" style="--c:${PINK};--tilt:-0.8deg" data-go="party">
        <div class="mode-art"></div>
        <div class="mode-text">
          <b>Party</b>
          <p>Pass the phone. Same games, who's closest?</p>
          <span class="best">2–8 players</span>
        </div>
      </button>
    </div>
    <h2 class="section-title">practice one <span>· untimed, 5 rounds</span></h2>
    <ul class="cards">
      ${games
        .map((g, i) => {
          const best = getBest(g.id);
          return `<li style="--i:${i}"><button class="card" data-i="${i}" style="--c:${g.color};--tilt:${tilts[i % tilts.length]}deg">
            <div class="thumb"></div>
            <div class="card-meta"><b>${g.name}</b><span class="kr">${g.kr}</span></div>
            <p>${g.blurb}</p>
            <span class="best">${best == null ? 'new!' : `best <b>${best}</b>`}</span>
          </button></li>`;
        })
        .join('')}
    </ul>
    <footer class="home-foot">
      <span>drawn with wobbly lines</span><span>scores stay on this device</span>
      <button class="link-btn reset-tut">show tutorials again</button>
      <span class="install-slot"></span>
    </footer>`;
  parent.appendChild(root);
  root.querySelector('.home-foot')!.prepend(muteButton());
  const reset = root.querySelector<HTMLButtonElement>('.reset-tut')!;
  reset.addEventListener('click', () => {
    forgetTutorials();
    sfx.pop();
    reset.textContent = 'done! every game will teach you again';
  });

  // install: a button where the browser supports it, a tip on iPhone Safari
  const slot = root.querySelector<HTMLElement>('.install-slot')!;
  const renderInstall = () => {
    slot.innerHTML = '';
    if (standalone()) return;
    if (canPrompt()) {
      const b = document.createElement('button');
      b.className = 'link-btn';
      b.textContent = '· add 대충 to your home screen';
      b.addEventListener('click', () => void promptInstall());
      slot.appendChild(b);
    } else if (isIOS()) slot.textContent = '· tip: Share → Add to Home Screen to keep me on your phone';
  };
  renderInstall();
  const offInstall = onInstallChange(renderInstall);

  const stages: Stage[] = [];
  // Home is ambient art: low frame rates (it reads as stop-motion, which suits the doodles)
  // and every canvas pauses itself when scrolled off-screen.
  const mount = (host: Element, cls: string, draw: Stage['draw'], fps = 12) => {
    const s = new Stage(host as HTMLElement, cls, { fps, maxDpr: 2 });
    s.draw = draw;
    stages.push(s);
    return s;
  };

  const kongiSlot = root.querySelector<HTMLElement>('.hero-kongi')!;
  let mood: Mood = 'happy';
  let moodUntil = 0;
  const kongi = mount(kongiSlot, 'kongi-hero', (pen, w, h, t) => {
    // late at night Kongi dozes off (tap to wake it for a moment)
    const hr = new Date().getHours();
    if (t > moodUntil) mood = hr >= 23 || hr < 6 ? 'sleepy' : Math.floor(t / 5) % 3 === 2 ? 'idle' : 'happy';
    drawKongi(pen, w / 2, h - 10, Math.min(w * 0.66, h * 0.66), mood, t, { hat: hat(), body: body() });
  }, 15);
  const openCloset = () => closet(() => (mood = 'cheer', moodUntil = kongi.time + 1.6));
  root.querySelector('.lvl')!.addEventListener('click', () => {
    sfx.pop();
    go('me');
  });
  root.querySelector('.challenge-ribbon')?.addEventListener('click', () => {
    sfx.pop();
    go('daily');
  });
  kongiSlot.addEventListener('dblclick', openCloset);
  kongiSlot.addEventListener('click', () => {
    mood = 'cheer';
    moodUntil = kongi.time + 1.6;
    sfx.pop();
  });

  const arts = root.querySelectorAll('.mode-art');
  // the calendar only changes when the lines boil (~7fps); the stopwatch hand ticks 4x a second
  mount(arts[0], 'art-canvas', (pen, w, h, t) => drawCalendar(pen, w, h, t, day.n), 7);
  mount(arts[1], 'art-canvas', (pen, w, h, t) => drawStopwatch(pen, w, h, t), 8);
  mount(arts[2], 'art-canvas', (pen, w, h, t) => drawTrio(pen, w, h, t));
  root.querySelectorAll<HTMLButtonElement>('.mode').forEach((b) =>
    b.addEventListener('click', () => {
      sfx.pop();
      go(b.dataset.go!);
    }),
  );

  root.querySelectorAll<HTMLButtonElement>('.card').forEach((btn) => {
    const g = games[Number(btn.dataset.i)];
    mount(btn.querySelector('.thumb')!, 'thumb-canvas', (pen, w, h, t) => {
      pen.roughScale = 0.8;
      g.thumb(pen, w, h, t);
    });
    btn.addEventListener('click', () => {
      sfx.pop();
      go(`practice/${g.id}`);
    });
  });

  // keep the "next daily in…" countdown honest while the home screen is open
  const rolledOver = () => today().n !== day.n;
  const refresh = () => window.dispatchEvent(new HashChangeEvent('hashchange')); // router re-renders home
  const tick = window.setInterval(() => {
    if (rolledOver()) return refresh();
    const el = root.querySelector('.next-in');
    if (el) el.textContent = nextDailyIn();
  }, 30000);
  const onVisible = () => !document.hidden && rolledOver() && refresh();
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    clearInterval(tick);
    document.removeEventListener('visibilitychange', onVisible);
    offInstall();
    stages.forEach((s) => s.destroy());
    document.querySelector<HTMLButtonElement>('.closet .done')?.click();
    root.remove();
  };
}
