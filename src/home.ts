import { Stage } from './lib/stage';
import { drawKongi, type Mood } from './lib/kongi';
import { getBest } from './lib/store';
import { muteButton, type GameDef } from './lib/shell';
import { sfx } from './lib/audio';

/** Home screen: hero with Kongi + a sticker sheet of games. Returns a cleanup fn. */
export function renderHome(parent: HTMLElement, games: GameDef[], open: (g: GameDef) => void): () => void {
  const root = document.createElement('section');
  root.className = 'screen home';
  const tilts = [-1.6, 1.2, -0.8, 1.8, -1.3];
  root.innerHTML = `
    <header class="hero">
      <div class="hero-kongi" role="img" aria-label="Kongi, a little bean sprout"></div>
      <div class="hero-text">
        <h1>대충</h1>
        <p class="roman"><b>daechung</b> · <i>adv.</i> roughly, more or less, by eye</p>
        <p class="tag">Five tiny games for people who eyeball everything.</p>
      </div>
    </header>
    <ul class="cards">
      ${games
        .map((g, i) => {
          const best = getBest(g.id);
          return `<li style="--i:${i}"><button class="card" data-i="${i}" style="--c:${g.color};--tilt:${tilts[i % tilts.length]}deg">
            <div class="thumb"></div>
            <div class="card-meta">
              <span class="num">0${i + 1}</span>
              <b>${g.name}</b>
              <span class="kr">${g.kr}</span>
            </div>
            <p>${g.blurb}</p>
            <span class="best">${best == null ? 'not played yet' : `best <b>${best}</b>/${g.rounds * 100}`}</span>
          </button></li>`;
        })
        .join('')}
    </ul>
    <footer class="home-foot">
      <span>drawn with wobbly lines · scores stay on this device</span>
    </footer>`;
  parent.appendChild(root);
  root.querySelector('.home-foot')!.prepend(muteButton());

  const stages: Stage[] = [];
  const kongiSlot = root.querySelector<HTMLElement>('.hero-kongi')!;
  const kongi = new Stage(kongiSlot, 'kongi-hero');
  let mood: Mood = 'happy';
  let moodUntil = 0;
  kongi.draw = (pen, w, h, t) => {
    if (t > moodUntil) mood = Math.floor(t / 5) % 3 === 2 ? 'idle' : 'happy';
    drawKongi(pen, w / 2, h - 10, Math.min(w * 0.7, h * 0.72), mood, t);
  };
  kongiSlot.addEventListener('click', () => {
    mood = 'cheer';
    moodUntil = kongi.time + 1.6;
    sfx.pop();
  });
  stages.push(kongi);

  root.querySelectorAll<HTMLButtonElement>('.card').forEach((btn) => {
    const g = games[Number(btn.dataset.i)];
    const s = new Stage(btn.querySelector('.thumb')!, 'thumb-canvas');
    s.draw = (pen, w, h, t) => {
      pen.roughScale = 0.8;
      g.thumb(pen, w, h, t);
    };
    stages.push(s);
    btn.addEventListener('click', () => {
      sfx.pop();
      open(g);
    });
  });

  return () => {
    stages.forEach((s) => s.destroy());
    root.remove();
  };
}
