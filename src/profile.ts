import { Stage } from './lib/stage';
import { drawKongi } from './lib/kongi';
import { el, esc, muteButton, type GameDef } from './lib/shell';
import { icons } from './lib/icons';
import { sfx } from './lib/audio';
import { MAX_PILLOWS, allDays, bestStreak, body, hasStamp, hat, history, levelOf, markStampsSeen, pillows, playerName, plays, setPlayerName, stampCount, streak, xp } from './lib/progress';
import { STAMPS, stampCanvas } from './lib/stamps';
import { getBest } from './lib/store';
import { today, RUN_LENGTH } from './modes';
import { closet } from './closet';
import { BERRY, INK, PINK, WHITE } from './lib/palette';
import type { Pen, Pt } from './lib/pen';

/** Six skills, each fed by the games that test it. */
const AXES = [
  { name: 'shapes', games: ['angle', 'center', 'bigger'], title: 'Shape Whisperer', line: 'angles and areas bow to you.' },
  { name: 'proportion', games: ['cut', 'pour', 'halfway', 'seesaw'], title: 'Ratio Ruler', line: 'you could split a bill to the cent.' },
  { name: 'timing', games: ['beat', 'stopwatch'], title: 'Human Metronome', line: 'you don’t keep the beat, you are the beat.' },
  { name: 'motion', games: ['trajectory', 'brake', 'tunnel'], title: 'Physics Brain', line: 'you know where things are going before they do.' },
  { name: 'counting', games: ['dots'], title: 'Bean Counter', line: 'one glance, one number.' },
  { name: 'memory', games: ['circle', 'color'], title: 'Steady Artist', line: 'steady hand, photographic colours.' },
];

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function skillValues() {
  return AXES.map((a) => {
    const per = a.games.map((g) => avg(history(g))).filter((v): v is number => v != null);
    return per.length ? per.reduce((x, y) => x + y, 0) / per.length : null;
  });
}

function drawRadar(pen: Pen, w: number, h: number, t: number, vals: (number | null)[]) {
  const cx = w / 2, cy = h / 2 + 4, R = Math.min(w * 0.28, h / 2 - 46);
  const n = AXES.length;
  const pt = (i: number, r: number): Pt => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  for (const k of [0.25, 0.5, 0.75, 1]) {
    pen.poly(Array.from({ length: n }, (_, i) => pt(i, R * k)), { stroke: INK, width: k === 1 ? 2.5 : 1.5, dash: k === 1 ? undefined : [4, 6], alpha: k === 1 ? 0.8 : 0.3, seed: 2000 + k * 10 });
  }
  for (let i = 0; i < n; i++) {
    const [x, y] = pt(i, R);
    pen.line(cx, cy, x, y, { width: 1.5, alpha: 0.3, seed: 2010 + i });
    const [lx, ly] = pt(i, R + 32);
    pen.text(vals[i] == null ? `${AXES[i].name} ?` : AXES[i].name, lx, ly, { size: 17, font: 'gaegu', outline: WHITE, alpha: vals[i] == null ? 0.5 : 0.9 });
  }
  if (vals.every((v) => v == null)) return;
  // the shape grows in on open
  const grow = Math.min(1, t * 2);
  const poly = vals.map((v, i) => pt(i, R * Math.max(0.04, ((v ?? 0) / 100) * grow)));
  pen.poly(poly, { fill: PINK, stroke: BERRY, width: 3, seed: 2020, rough: 0.6, shift: [3, 3] });
  poly.forEach(([x, y], i) => vals[i] != null && pen.circle(x, y, 4.5, { fill: WHITE, width: 2, seed: 2030 + i }));
}

/** "Me" page: Kongi, level, streak, your eyeball type, skill radar, daily calendar, per-game stats. */
export function renderProfile(app: HTMLElement, games: GameDef[], exit: () => void): () => void {
  const day = today();
  const lv = levelOf(xp());
  const vals = skillValues();
  const known = vals.map((v, i) => [v, i] as const).filter(([v]) => v != null) as [number, number][];
  const rounds = games.reduce((a, g) => a + history(g.id).length, 0);
  const top = known.length && rounds >= 3 ? known.sort((a, b) => b[0] - a[0])[0][1] : null;
  const days = allDays();

  // from 4 weeks ago (or daily #1) up to today, then the rest of this row as "coming up"
  const first = Math.max(1, day.n - 27);
  const count = day.n - first + 1;
  const padded = Math.ceil(count / 7) * 7;
  const cal = Array.from({ length: padded }, (_, k) => first + k)
    .map((n) => {
      if (n > day.n) return `<i class="future"><span>#${n}</span></i>`;
      const sc = days[n];
      const tierCls = sc == null ? '' : sc >= RUN_LENGTH * 85 ? 't4' : sc >= RUN_LENGTH * 60 ? 't3' : sc >= RUN_LENGTH * 35 ? 't2' : 't1';
      return `<i class="${tierCls}${n === day.n ? ' today' : ''}" title="daily #${n}${sc != null ? `: ${sc}` : ''}">${sc != null ? `<b>${sc}</b>` : `<span>#${n}</span>`}</i>`;
    })
    .join('');

  const rows = games
    .map((g) => {
      const h = history(g.id);
      const a = avg(h);
      const best = getBest(g.id);
      return `<li style="--c:${g.color}">
        <i class="dot"></i><span><b>${g.name}</b> <em>${g.kr}</em></span>
        <u><s style="width:${a ?? 0}%"></s></u>
        <strong>${a == null ? '–' : Math.round(a)}</strong>
        <small>${plays(g.id)} plays${best != null ? ` · best practice ${best}` : ''}</small>
      </li>`;
    })
    .join('');

  const root = el('section', 'screen me', `
    <header class="topbar">
      <button class="icon-btn back" aria-label="Back to home">${icons.back}</button>
      <div class="game-title"><b>You</b><span>나</span></div>
    </header>
    <div class="me-body">
      <div class="me-hero">
        <button class="me-kongi" aria-label="change Kongi's hat"></button>
        <div class="me-stats">
          <label class="me-name">name <input maxlength="14" placeholder="shown to friends" value="${esc(playerName())}" /></label>
          <div class="lvl"><b>Lv ${lv.level}</b><i><u style="width:${(lv.into / lv.need) * 100}%"></u></i><span>${lv.into}/${lv.need} xp</span></div>
          <div class="streak ${streak(day.n) ? '' : 'cold'}">${icons.flame}<b>${streak(day.n)}-day streak</b><em>best ${bestStreak()}</em></div>
          <div class="pillow-row${pillows() ? '' : ' none'}">${icons.pillow}<b>${pillows()}/${MAX_PILLOWS} nap pillows</b><small>every 5 days in a row earns one. each saves your streak for a missed day.</small></div>
          <button class="btn hat-btn"><span>change hat</span></button>
        </div>
      </div>
      <h3>your eyeball type</h3>
      <div class="me-type">${top == null ? '<b>still a mystery…</b><p>play a Daily and Kongi will figure you out.</p>' : `<b>${AXES[top].title}</b><p>${AXES[top].line}</p>`}</div>
      <div class="radar"></div>
      <h3>last 4 weeks of dailies</h3>
      <div class="cal">${cal}</div>
      <h3>stamp book <span>· ${stampCount()} of ${STAMPS.length}</span></h3>
      <div class="stamps">${STAMPS.map((s, i) => `<button class="stamp${hasStamp(s.id) ? '' : ' locked'}" data-i="${i}"><span class="st-art"></span><em>${hasStamp(s.id) ? s.name : '???'}</em></button>`).join('')}</div>
      <p class="stamp-info" aria-live="polite">tap a stamp to see how to get it.</p>
      <h3>every game <span>· average of your last 20</span></h3>
      <ul class="per-game">${rows}</ul>
    </div>`);
  app.appendChild(root);
  root.querySelector('.topbar')!.appendChild(muteButton());
  root.querySelector('.back')!.addEventListener('click', () => {
    sfx.click();
    exit();
  });
  const name = root.querySelector<HTMLInputElement>('.me-name input')!;
  name.addEventListener('change', () => setPlayerName(name.value));

  const stages: Stage[] = [];
  const k = new Stage(root.querySelector<HTMLElement>('.me-kongi')!, 'me-kongi-canvas', { fps: 15 });
  k.draw = (pen, w, h, t) => drawKongi(pen, w / 2, h - 6, Math.min(w * 0.7, h * 0.72), 'happy', t, { hat: hat(), body: body() });
  stages.push(k);
  const r = new Stage(root.querySelector<HTMLElement>('.radar')!, 'radar-canvas', { fps: 8 });
  r.draw = (pen, w, h, t) => drawRadar(pen, w, h, t, vals);
  stages.push(r);
  // stamps are static drawings: drawn once, no animation loop
  const info = root.querySelector<HTMLElement>('.stamp-info')!;
  markStampsSeen();
  void document.fonts.ready.then(() => {
    if (!root.isConnected) return;
    root.querySelectorAll<HTMLElement>('.stamp').forEach((b) => {
      const s = STAMPS[+b.dataset.i!];
      const got = hasStamp(s.id);
      b.querySelector('.st-art')!.appendChild(stampCanvas(got ? s : null, 62, got ? (((+b.dataset.i! * 37) % 9) - 4) * 0.035 : 0));
      b.addEventListener('click', () => {
        sfx.click();
        info.innerHTML = got ? `<b>${s.name}</b>: ${s.hint}. got it!` : `<b>locked</b>: ${s.hint}.`;
        root.querySelectorAll('.stamp').forEach((x) => x.classList.toggle('on', x === b));
      });
    });
  });
  const openCloset = () => {
    sfx.pop();
    closet();
  };
  root.querySelector('.me-kongi')!.addEventListener('click', openCloset);
  root.querySelector('.hat-btn')!.addEventListener('click', openCloset);

  return () => {
    stages.forEach((s) => s.destroy());
    document.querySelector<HTMLButtonElement>('.closet .done')?.click();
    root.remove();
  };
}

