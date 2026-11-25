import { earn } from './lib/stamps';
import { Stage } from './lib/stage';
import { drawKongi, type Mood } from './lib/kongi';
import { Shell, el, esc, muteButton, type GameDef, type StepResult } from './lib/shell';
import { buildRun, sum, tiles } from './modes';
import { icons } from './lib/icons';
import { sfx } from './lib/audio';
import { BERRY, BUTTER, INK, LILAC, MINT, PAPER, PEACH, PINK, SKY, WHITE } from './lib/palette';
import { shareImage } from './share';
import { Pen as PenClass } from './lib/pen';
import type { Pen } from './lib/pen';

/** Kongi body tints, one per player. */
const BODIES = ['#fffdf7', '#fff0bd', '#d6f1df', '#d6e8fa', '#fddde6', '#e7dcfa', '#ffe0cf', '#e2efc4'];
const MAX_PLAYERS = 8;
const KEY = 'daechung:party';

interface Player {
  name: string;
  body: string;
  results?: StepResult[];
  total?: number;
}

function loadPlayers(): Player[] {
  try {
    const names: string[] = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (Array.isArray(names) && names.length >= 2) return names.slice(0, MAX_PLAYERS).map((name, i) => ({ name: String(name).slice(0, 14), body: BODIES[i] }));
  } catch { /* fresh start */ }
  return [{ name: 'Player 1', body: BODIES[0] }, { name: 'Player 2', body: BODIES[1] }];
}

function savePlayers(ps: Player[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ps.map((p) => p.name)));
  } catch { /* ignore */ }
}

function topbar(title: string, sub: string) {
  return `<header class="topbar">
    <button class="icon-btn back" aria-label="Back to home">${icons.back}</button>
    <div class="game-title"><b>${title}</b><span>${sub}</span></div>
  </header>`;
}

function screen(app: HTMLElement, cls: string, html: string, exit: () => void) {
  const root = el('section', `screen ${cls}`, html);
  app.appendChild(root);
  root.querySelector('.topbar')?.appendChild(muteButton());
  root.querySelector('.back')?.addEventListener('click', () => {
    sfx.click();
    exit();
  });
  return root;
}

/** A row of hopping Kongis, one per player. */
function crowd(pen: Pen, w: number, h: number, t: number, players: Player[]) {
  const n = players.length;
  const size = Math.min(84, (w - 20) / Math.max(n, 3) * 0.82, h * 0.78);
  const gap = Math.min(size * 1.15, (w - size) / Math.max(1, n - 1));
  const x0 = w / 2 - (gap * (n - 1)) / 2;
  players.forEach((p, i) => {
    const mood: Mood = Math.floor(t / 2.5 + i) % 3 === 0 ? 'cheer' : 'happy';
    drawKongi(pen, x0 + i * gap, h - 6, size, mood, t + i * 0.37, { body: p.body });
  });
}

export function startParty(app: HTMLElement, games: GameDef[], exit: () => void): () => void {
  let alive = true;
  let teardown: (() => void) | null = null;
  const swap = (fn: (() => void) | null) => {
    teardown?.();
    teardown = fn;
  };
  let players = loadPlayers();
  let count = 5;

  /* ——— setup ——— */
  const setup = () =>
    new Promise<void>((resolve) => {
      const root = screen(app, 'party', `${topbar('Party', '파티 · pass the phone')}
        <div class="party-body">
          <div class="crowd"></div>
          <p class="lede">Everyone plays the <b>same</b> mini-games, one after another. Closest eyeballs win.</p>
          <ol class="players"></ol>
          <button class="btn add"><span>+ add player</span></button>
          <div class="seg" role="group" aria-label="number of games"><span>games each</span>
            <button data-n="5">5</button><button data-n="10">10</button>
          </div>
          <button class="btn primary start"><span>start the party</span></button>
        </div>`, exit);
      const stage = new Stage(root.querySelector('.crowd')!, 'crowd-canvas', { fps: 20 });
      stage.draw = (pen, w, h, t) => crowd(pen, w, h, t, players);
      swap(() => {
        stage.destroy();
        root.remove();
      });
      const list = root.querySelector('.players')!;
      const add = root.querySelector<HTMLButtonElement>('.add')!;
      const render = () => {
        list.innerHTML = '';
        players.forEach((p, i) => {
          const li = el('li', '', `<i class="dot"></i><input maxlength="14" aria-label="player ${i + 1} name" value="${esc(p.name)}" />
            <button class="icon-btn rm" aria-label="remove ${esc(p.name)}" ${players.length <= 2 ? 'disabled' : ''}>${icons.close}</button>`);
          li.style.setProperty('--pc', p.body);
          const input = li.querySelector('input')!;
          input.addEventListener('input', () => (p.name = input.value.trim().slice(0, 14) || `Player ${i + 1}`));
          input.addEventListener('focus', () => input.select());
          li.querySelector('.rm')!.addEventListener('click', () => {
            if (players.length <= 2) return;
            players.splice(i, 1);
            players.forEach((q, k) => (q.body = BODIES[k]));
            sfx.click();
            render();
          });
          list.appendChild(li);
        });
        add.disabled = players.length >= MAX_PLAYERS;
      };
      render();
      add.addEventListener('click', () => {
        if (players.length >= MAX_PLAYERS) return;
        players.push({ name: `Player ${players.length + 1}`, body: BODIES[players.length] });
        sfx.pop();
        render();
        list.querySelector<HTMLInputElement>('li:last-child input')?.focus();
      });
      const segs = root.querySelectorAll<HTMLButtonElement>('.seg button');
      const syncSeg = () => segs.forEach((b) => b.classList.toggle('on', Number(b.dataset.n) === count));
      syncSeg();
      segs.forEach((b) =>
        b.addEventListener('click', () => {
          count = Number(b.dataset.n);
          sfx.click();
          syncSeg();
        }),
      );
      root.querySelector('.start')!.addEventListener('click', () => {
        sfx.pop();
        players.forEach((p, i) => (p.name = p.name.trim() || `Player ${i + 1}`));
        savePlayers(players);
        resolve();
      });
    });

  /* ——— "pass the phone to …" ——— */
  const pass = (p: Player, i: number) =>
    new Promise<void>((resolve) => {
      const leader = players.filter((q) => q.total != null).sort((a, b) => (b.total ?? 0) - (a.total ?? 0))[0];
      const root = screen(app, 'pass', `${topbar('Party', `${i + 1} of ${players.length}`)}
        <div class="pass-body">
          <div class="pass-kongi"></div>
          <p>pass the phone to</p>
          <h2>${esc(p.name)}</h2>
          <button class="btn primary"><span>I'm ${esc(p.name)} — go!</span></button>
          ${leader ? `<div class="to-beat">score to beat: <b>${esc(leader.name)}</b> ${leader.total}</div>` : ''}
          <small>${count} mini-games · each one on a timer</small>
        </div>`, exit);
      root.style.setProperty('--pc', p.body);
      const stage = new Stage(root.querySelector('.pass-kongi')!, 'pass-canvas', { fps: 20 });
      stage.draw = (pen, w, h, t) => drawKongi(pen, w / 2, h - 8, Math.min(w * 0.6, h * 0.75), 'cheer', t, { body: p.body });
      swap(() => {
        stage.destroy();
        root.remove();
      });
      root.querySelector('.btn')!.addEventListener('click', () => {
        sfx.pop();
        resolve();
      });
    });

  /* ——— one player's run ——— */
  const playOne = async (p: Player, seed: number, next: Player | undefined) => {
    const steps = buildRun(games, count, seed);
    const g = new Shell(app, { title: 'Party', kr: '파티', color: PINK, steps: steps.length, timed: true, player: { name: p.name, body: p.body } }, exit);
    swap(() => g.destroy());
    const results = await g.playSteps(steps, seed);
    if (!results) return false;
    p.results = results;
    p.total = sum(results);
    g.setHeader('Party', '파티', PINK);
    const card = g.card(`
      <div class="final-label">${esc(p.name)} scored</div>
      <div class="final-total"><b>0</b><span>/${steps.length * 120}</span></div>
      ${tiles(results)}`);
    g.countUp(card.querySelector('.final-total b')!, p.total);
    g.confetti(p.total / (steps.length * 120));
    g.setMood('happy');
    g.say(next ? `${esc(next.name)}, you're up next!` : 'everyone has played… drumroll please.');
    try {
      await g.button(next ? `pass to ${esc(next.name)}` : 'see who won!');
    } catch {
      return false;
    }
    return true;
  };

  /* ——— leaderboard ——— */
  const board = () =>
    new Promise<'again' | 'setup'>((resolve) => {
      if (players.length >= 2) earn('party');
      const ranked = [...players].sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
      const n = players[0].results?.length ?? 0;
      const mvps: string[] = [];
      for (let k = 0; k < n; k++) {
        const game = players[0].results![k].game;
        const top = Math.max(...players.map((p) => p.results![k].acc));
        const winners = players.filter((p) => p.results![k].acc === top);
        const who = top === 0
          ? '<b style="--pc:#eee">nobody</b>'
          : winners.map((p) => `<b style="--pc:${p.body}">${esc(p.name)}</b>`).join(' ');
        mvps.push(`<li style="--c:${game.color}"><span>${game.name}</span><div>${who}</div><em>${top}</em></li>`);
      }
      const root = screen(app, 'board', `${topbar('Results', '결과')}
        <div class="board-body">
          <div class="podium"></div>
          <ol class="ranking">${ranked
            .map((p, i) => `<li style="--pc:${p.body}"><span class="place">${i + 1}</span><i class="dot"></i><b>${esc(p.name)}</b><em>${p.total}</em></li>`)
            .join('')}</ol>
          <h3>closest eyeball per game</h3>
          <ul class="mvps">${mvps.join('')}</ul>
          <div class="board-actions">
            <button class="btn share"><span>share results</span></button>
            <button class="btn primary again"><span>${icons.again} rematch</span></button>
            <button class="btn setup"><span>change players</span></button>
            <button class="btn home"><span>${icons.home} home</span></button>
          </div>
        </div>`, exit);
      const stage = new Stage(root.querySelector('.podium')!, 'podium-canvas', { fps: 24 });
      stage.draw = (pen, w, h, t) => drawPodium(pen, w, h, t, ranked);
      swap(() => {
        stage.destroy();
        root.remove();
      });
      sfx.fanfare();
      const shareBtn = root.querySelector<HTMLButtonElement>('.share')!;
      shareBtn.addEventListener('click', async () => {
        sfx.pop();
        const text = `대충 party: ${ranked.map((p, i) => `${i + 1}. ${p.name} ${p.total}`).join(', ')}`;
        const res = await shareImage(drawPartyCard(ranked, n), text, `${location.origin}${location.pathname}`);
        if (res === 'copied') shareBtn.innerHTML = '<span>copied + saved!</span>';
        else if (res === 'saved') shareBtn.innerHTML = '<span>picture saved!</span>';
        else if (res === 'failed') shareBtn.innerHTML = '<span>couldn\'t share here</span>';
      });
      root.querySelector('.again')!.addEventListener('click', () => (sfx.pop(), resolve('again')));
      root.querySelector('.setup')!.addEventListener('click', () => (sfx.pop(), resolve('setup')));
      root.querySelector('.home')!.addEventListener('click', () => (sfx.click(), exit()));
    });

  void (async () => {
    await setup();
    for (;;) {
      if (!alive) return;
      const seed = (Math.random() * 1e9) | 0;
      for (let i = 0; i < players.length; i++) {
        players[i].results = undefined;
        players[i].total = undefined;
      }
      for (let i = 0; i < players.length; i++) {
        await pass(players[i], i);
        if (!alive) return;
        if (!(await playOne(players[i], seed, players[i + 1]))) return;
      }
      if (!alive) return;
      const choice = await board();
      if (choice === 'setup') await setup();
    }
  })();

  return () => {
    alive = false;
    swap(null);
  };
}

function drawPodium(pen: Pen, w: number, h: number, t: number, ranked: Player[]) {
  const spots = [
    { place: 2, k: 0.42, x: -1, color: SKY },
    { place: 1, k: 0.62, x: 0, color: BUTTER },
    { place: 3, k: 0.28, x: 1, color: PEACH },
  ].filter((s) => s.place <= ranked.length);
  const bw = Math.min(120, w / 3.4);
  const ground = h - 6;
  const maxBlock = h * 0.48;
  for (const s of spots) {
    const p = ranked[s.place - 1];
    const cx = w / 2 + s.x * (bw + 10);
    const bh = maxBlock * (s.k / 0.62);
    pen.rrect(cx - bw / 2, ground - bh, bw, bh, 10, { fill: s.color, seed: 800 + s.place });
    pen.text(String(s.place), cx, ground - bh / 2 + 4, { size: Math.min(42, bh * 0.6) });
    const size = Math.min(bw * 0.78, h * 0.34);
    const ky = ground - bh - 2;
    const mood: Mood = s.place === 1 ? 'cheer' : s.place === 2 ? 'happy' : 'wow';
    drawKongi(pen, cx, ky, size, mood, t + s.place * 0.4, { body: p.body });
    pen.text(p.name, cx, ky - size * 1.08 - (s.place === 1 ? 42 : 8), { size: 18, outline: WHITE });
    if (s.place === 1) {
      // crown, bobbing with the cheer hop
      const cy = ky - size * 0.98 - 8 + Math.sin(t * 6) * 2;
      const cw = size * 0.42;
      pen.poly([[cx - cw / 2, cy], [cx - cw / 2, cy - cw * 0.5], [cx - cw / 4, cy - cw * 0.22], [cx, cy - cw * 0.62], [cx + cw / 4, cy - cw * 0.22], [cx + cw / 2, cy - cw * 0.5], [cx + cw / 2, cy]], {
        fill: BUTTER, seed: 820, rough: 0.5, width: 2.5,
      });
      pen.circle(cx, cy - cw * 0.62, 3, { fill: PINK, stroke: INK, width: 1.5, seed: 821 });
    }
  }
  // a few sparkles
  for (let i = 0; i < 4; i++) {
    const a = t * 0.8 + i * 1.6;
    pen.star(w / 2 + Math.cos(a) * w * 0.38, h * 0.25 + Math.sin(a * 1.3) * h * 0.12, 6, { fill: [MINT, LILAC, PINK, BUTTER][i], width: 1.8, seed: 830 + i }, a);
  }
}

/** 4:5 party results picture: podium + full ranking, drawn with the wobbly pen. */
export function drawPartyCard(ranked: Player[], games: number): HTMLCanvasElement {
  const W = 1080, H = 1350;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d')!;
  const pen = new PenClass(ctx);
  pen.setTime(0);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  pen.rrect(60, 60, W - 120, H - 120, 46, { fill: WHITE, width: 6, seed: 1, shift: [14, 14] });
  pen.text('대충 party', 130, 160, { size: 76, align: 'left' });
  pen.text(new Date().toLocaleDateString(), W - 130, 160, { size: 36, font: 'gaegu', align: 'right', alpha: 0.7 });
  ctx.save();
  ctx.translate(140, 190);
  ctx.scale(2, 2);
  drawPodium(pen, 400, 270, 0.4, ranked);
  ctx.restore();
  const many = ranked.length > 5;
  const size = many ? 36 : 46, gap = many ? 50 : 66;
  let y = 800;
  ranked.forEach((p, i) => {
    pen.circle(190, y, size * 0.36, { fill: p.body, width: 4, seed: 40 + i });
    pen.text(String(i + 1), 140, y, { size, color: i === 0 ? BERRY : INK });
    pen.text(p.name, 240, y, { size, align: 'left' });
    pen.text(String(p.total ?? 0), W - 150, y, { size, align: 'right' });
    y += gap;
  });
  pen.text(`${games} mini-games each · how good is your eyeball?`, W / 2, H - 130, { size: 32, font: 'gaegu', alpha: 0.7 });
  pen.text(`${location.host}${location.pathname}`.replace(/\/$/, ''), W / 2, H - 92, { size: 28, font: 'gaegu', alpha: 0.5 });
  return cv;
}
