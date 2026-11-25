import { Stage } from './lib/stage';
import { drawKongi, type Mood } from './lib/kongi';
import { getBest } from './lib/store';
import { dayScore, forgetTutorials, hat, levelOf, setHat, streak, xp } from './lib/progress';
import { HATS } from './lib/hats';
import { getPending } from './challenge';
import { icons } from './lib/icons';
import { esc, muteButton, type GameDef } from './lib/shell';
import { sfx } from './lib/audio';
import { today } from './modes';
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
  const dailyBest = getBest(`daily-${day.n}`);
  const lv = levelOf(xp());
  const streakNow = streak(day.n);
  const pending = getPending();
  const challenge = pending && pending.day === day.n ? pending : null;
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
          <button class="lvl" aria-label="level ${lv.level}, open the hat closet"><b>Lv ${lv.level}</b><i><u style="width:${(lv.into / lv.need) * 100}%"></u></i><span>${lv.into}/${lv.need} xp</span></button>
          <span class="streak ${streakNow ? '' : 'cold'}">${icons.flame}<b>${streakNow ? `${streakNow}-day streak` : 'start a streak!'}</b></span>
        </div>
      </div>
    </header>
    ${challenge ? `<button class="challenge-ribbon" data-go="daily">${icons.flame}<span><b>${esc(challenge.name)}</b> challenged you: <b>${challenge.total}</b> on today's daily. <u>beat it!</u></span></button>` : ''}
    <div class="modes">
      <button class="mode m-daily" style="--c:${BUTTER};--tilt:-1deg" data-go="daily">
        <div class="mode-art"></div>
        <div class="mode-text">
          <small>daily #${day.n}</small>
          <b>Daily 대충</b>
          <p>${games.length} mini-games against the clock. Same ones for everyone today.</p>
          <span class="week" aria-label="last 7 days">${week}</span>
          <span class="best">${dailyBest == null ? 'not played today!' : `today: <b>${dailyBest}</b>`}</span>
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
      <span>drawn with wobbly lines · scores stay on this device ·</span>
      <button class="link-btn reset-tut">show tutorials again</button>
    </footer>`;
  parent.appendChild(root);
  root.querySelector('.home-foot')!.prepend(muteButton());
  const reset = root.querySelector<HTMLButtonElement>('.reset-tut')!;
  reset.addEventListener('click', () => {
    forgetTutorials();
    sfx.pop();
    reset.textContent = 'done! every game will teach you again';
  });

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
    if (t > moodUntil) mood = Math.floor(t / 5) % 3 === 2 ? 'idle' : 'happy';
    drawKongi(pen, w / 2, h - 10, Math.min(w * 0.66, h * 0.66), mood, t, { hat: hat() });
  }, 15);
  const openCloset = () => closet(() => (mood = 'cheer', moodUntil = kongi.time + 1.6));
  root.querySelector('.lvl')!.addEventListener('click', () => {
    sfx.pop();
    openCloset();
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

  return () => {
    stages.forEach((s) => s.destroy());
    document.querySelector<HTMLButtonElement>('.closet .done')?.click();
    root.remove();
  };
}


/** Hat closet: pick from the hats you've unlocked. */
function closet(onPick: () => void) {
  const lv = levelOf(xp()).level;
  const m = document.createElement('div');
  m.className = 'closet-wrap';
  m.innerHTML = `<div class="closet" role="dialog" aria-label="Kongi's hats">
      <b>Kongi's hats</b>
      <p>level up to unlock more. you're <b>Lv ${lv}</b>.</p>
      <div class="hats">${HATS.map((h) => `<button class="hat${h.id === hat() ? ' on' : ''}" data-id="${h.id}" ${h.level > lv ? 'disabled' : ''}><span class="hat-art"></span><em>${h.level > lv ? `Lv ${h.level}` : h.name}</em></button>`).join('')}</div>
      <button class="btn primary done"><span>done</span></button>
    </div>`;
  // on <body>: a transformed ancestor (the screen's entrance animation) would break position: fixed
  document.body.appendChild(m);
  const stages: Stage[] = [];
  m.querySelectorAll<HTMLButtonElement>('.hat').forEach((b) => {
    const id = b.dataset.id!;
    const locked = b.disabled;
    const st = new Stage(b.querySelector<HTMLElement>('.hat-art')!, 'hat-canvas', { fps: 8 });
    st.draw = (pen, w, h, t) => drawKongi(pen, w / 2, h - 3, Math.min(w * 0.62, h * 0.66), locked ? 'idle' : 'happy', t, { hat: id, body: locked ? '#e9e0d2' : undefined });
    stages.push(st);
    b.addEventListener('click', () => {
      setHat(id);
      sfx.pop();
      m.querySelectorAll('.hat').forEach((x) => x.classList.toggle('on', x === b));
      onPick();
    });
  });
  const close = () => {
    stages.forEach((s) => s.destroy());
    m.remove();
  };
  m.querySelector('.done')!.addEventListener('click', () => {
    sfx.click();
    close();
  });
  m.addEventListener('click', (e) => e.target === m && close());
}
