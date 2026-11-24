import { Shell, type GameDef, type Step, type StepResult } from './lib/shell';
import { getBest, hasLearned, saveScore } from './lib/store';
import { icons } from './lib/icons';
import { seedRandom, shuffle } from './lib/rng';
import { BUTTER, LILAC, WHITE } from './lib/palette';

/* ——— shared bits ——— */

const LAUNCH = Date.UTC(2026, 10, 24);

export function today() {
  const d = new Date();
  const n = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - LAUNCH) / 864e5) + 1;
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  return { n: Math.max(1, n), seed };
}

/** One of each game (seeded order), difficulty ramping up through the run. */
export function buildRun(games: GameDef[], count: number, seed: number): Step[] {
  seedRandom(seed);
  const order = shuffle([...games]);
  seedRandom(null);
  const picked: GameDef[] = [];
  while (picked.length < count) picked.push(order[picked.length % order.length]);
  return picked.map((game, i) => ({ game, level: Math.min(4, Math.floor((i * 5) / count)) }));
}

export const RUN_RANKS: [number, string][] = [
  [0.85, 'Calibrated Human'],
  [0.72, 'Eagle Eyeball'],
  [0.58, 'Solid Guesstimator'],
  [0.42, 'Certified Vibes-Haver'],
  [0.25, 'Extremely 대충'],
  [0, 'Were Your Eyes Open?'],
];
export const runRank = (ratio: number) => RUN_RANKS.find(([min]) => ratio >= min)![1];

export const sum = (r: StepResult[]) => r.reduce((a, s) => a + s.acc + s.bonus, 0);

export function breakdown(results: StepResult[]) {
  return `<ul class="breakdown">${results
    .map(
      (r, i) => `<li style="--c:${r.game.color};--d:${i * 60}ms">
        <span>${r.game.name}</span><i><u style="--w:${Math.max(3, r.acc)}%"></u></i><b>${r.acc}</b>${r.bonus ? `<em>+${r.bonus}</em>` : '<em></em>'}
      </li>`,
    )
    .join('')}</ul>`;
}

async function share(text: string, g: Shell) {
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
    await navigator.clipboard.writeText(text);
    g.say('copied! paste it in the group chat.', 'happy');
  } catch {
    /* share sheet dismissed */
  }
}

/* ——— practice: one game, five rounds, no clock ——— */

export function startPractice(app: HTMLElement, def: GameDef, exit: () => void): () => void {
  const g = new Shell(app, { title: def.name, kr: def.kr, color: def.color, steps: 5, timed: false }, exit);
  const steps: Step[] = [0, 1, 2, 3, 4].map((level) => ({ game: def, level }));

  const go = async (intro: boolean) => {
    if (intro) {
      try {
        await g.teach(def, !hasLearned(def.id), 'start!');
      } catch {
        return;
      }
    }
    const results = await g.playSteps(steps, null);
    if (!results) return;
    const total = results.reduce((a, r) => a + r.acc, 0);
    const isBest = saveScore(def.id, total);
    const best = getBest(def.id) ?? total;
    const rank = def.ranks.find(([min]) => total >= min)?.[1] ?? def.ranks[def.ranks.length - 1][1];
    const card = g.card(`
      <div class="final-label">practice total</div>
      <div class="final-total"><b>0</b><span>/500</span></div>
      <div class="final-rank">“${rank}”</div>
      <div class="bars">${results.map((r, i) => `<div class="bar" style="--h:${Math.max(6, r.acc)}%;--d:${i * 90}ms"><i></i><span>${r.acc}</span></div>`).join('')}</div>
      <div class="final-best">${isBest ? '<em>new personal best!</em>' : `your best: ${best}`}</div>`);
    g.countUp(card.querySelector('.final-total b')!, total);
    const ratio = total / 500;
    g.confetti(ratio);
    g.setMood(ratio >= 0.75 ? 'cheer' : ratio >= 0.45 ? 'happy' : 'sad');
    g.say(ratio >= 0.85 ? 'okay that was <b>scary</b> good.' : ratio >= 0.65 ? 'your eyeballs are well calibrated!' : ratio >= 0.45 ? 'solidly 대충. respectable.' : 'that was very 대충. try again?');
    try {
      const i = await g.choose([`${icons.again} again`, `${icons.home} home`], 0);
      if (i === 1) return exit();
    } catch {
      return;
    }
    g.resetTotal();
    g.overlay.innerHTML = '';
    void go(false);
  };
  void go(true);
  return () => g.destroy();
}

/* ——— runs: every game once, against the clock ——— */

export function startRun(app: HTMLElement, games: GameDef[], kind: 'daily' | 'quick', exit: () => void): () => void {
  let g: Shell | null = null;
  const play = async () => {
    g?.destroy();
    const day = today();
    const seed = kind === 'daily' ? day.seed : (Math.random() * 1e9) | 0;
    const steps = buildRun(games, games.length, seed);
    const label = kind === 'daily' ? `daily #${day.n}` : 'quick run';
    g = new Shell(app, { title: kind === 'daily' ? `Daily #${day.n}` : 'Quick Run', kr: '대충', color: kind === 'daily' ? BUTTER : LILAC, steps: steps.length, timed: true }, exit);
    const shell = g;
    // slot-machine preview: flick through the games in this run
    shell.stage.draw = (pen, w, h, t) => {
      pen.text(`${steps.length} mini-games`, w / 2, 48, { size: Math.min(40, w * 0.1) });
      pen.text('be close · be quick', w / 2, 84, { size: 22, font: 'gaegu', alpha: 0.7 });
      const bw = Math.min(w - 60, 340), bh = Math.min(h - 200, bw * 0.78);
      const x = (w - bw) / 2, y = 112;
      const per = 1.1;
      const i = Math.floor(t / per) % steps.length;
      const k = (t % per) / per;
      const slide = k < 0.15 ? (1 - k / 0.15) * 30 : 0;
      const game = steps[i].game;
      pen.rrect(x, y, bw, bh, 18, { fill: WHITE, seed: 900 + i, shift: [6, 6] });
      pen.ctx.save();
      pen.ctx.beginPath();
      pen.ctx.rect(x + 4, y + 4, bw - 8, bh - 8);
      pen.ctx.clip();
      pen.ctx.translate(x + 8, y + 8 + slide);
      game.thumb(pen, bw - 16, bh - 16, t);
      pen.ctx.restore();
      pen.text(`${i + 1}. ${game.name}`, w / 2, y + bh + 30, { size: 24 });
    };
    shell.say(
      kind === 'daily'
        ? `today's run is the <b>same for everyone</b>. ${steps.length} mini-games, each on a timer. faster = bonus points!`
        : `${steps.length} random mini-games, each on a timer. close = points, fast = <b>bonus</b>.`,
      'happy',
    );
    try {
      await shell.button("let's go!");
    } catch {
      return;
    }
    const results = await shell.playSteps(steps, seed);
    if (!results) return;

    shell.setHeader(kind === 'daily' ? `Daily #${day.n}` : 'Quick Run', '대충', kind === 'daily' ? BUTTER : LILAC);
    const max = steps.length * 120;
    const total = sum(results);
    const key = kind === 'daily' ? `daily-${day.n}` : 'run';
    const isBest = saveScore(key, total);
    const best = getBest(key) ?? total;
    const ratio = total / max;
    const card = shell.card(`
      <div class="final-label">${label}</div>
      <div class="final-total"><b>0</b><span>/${max}</span></div>
      <div class="final-rank">“${runRank(ratio)}”</div>
      ${breakdown(results)}
      <div class="final-best">${isBest ? '<em>new best!</em>' : `best: ${best}`}</div>`);
    shell.countUp(card.querySelector('.final-total b')!, total);
    shell.confetti(ratio);
    shell.setMood(ratio >= 0.7 ? 'cheer' : ratio >= 0.45 ? 'happy' : 'sad');
    shell.say(ratio >= 0.8 ? 'you might actually be a ruler.' : ratio >= 0.55 ? 'nicely eyeballed!' : 'very 대충. which is the point, honestly.');
    const text = `대충 ${label}: ${total}/${max} — “${runRank(ratio)}”\n${results.map((r) => `${r.game.name} ${r.acc}`).join(' · ')}\n${location.href.split('#')[0]}`;
    for (;;) {
      let i: number;
      try {
        i = await shell.choose([`share`, `${icons.again} again`, `${icons.home} home`], 0);
      } catch {
        return;
      }
      if (i === 0) await share(text, shell);
      else if (i === 1) return void play();
      else return exit();
    }
  };
  void play();
  return () => g?.destroy();
}
