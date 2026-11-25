import { Shell, el, esc, type GameDef, type Step, type StepResult } from './lib/shell';
import { Stage } from './lib/stage';
import { drawKongi } from './lib/kongi';
import { getBest, saveScore } from './lib/store';
import { icons } from './lib/icons';
import { seedRandom, shuffle } from './lib/rng';
import { BUTTER, LILAC, WHITE } from './lib/palette';
import { sfx } from './lib/audio';
import { addXp, firstTime, hat, levelOf, playerName, recordDaily, setHat, setPlayerName, xp, type LevelInfo } from './lib/progress';
import { isIOS, standalone } from './install';
import { hatForLevel } from './lib/hats';
import { challengeLink, friends, getPending, setPending, type Challenge } from './challenge';
import { shareResult } from './share';

/* ——— shared bits ——— */

const LAUNCH = Date.UTC(2026, 10, 24);

export function today() {
  const d = new Date();
  const n = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - LAUNCH) / 864e5) + 1;
  const day = Math.max(1, n);
  return { n: day, seed: dailySeed(day) };
}

/** Time until the next daily unlocks (local midnight), e.g. "7h 12m". */
export function nextDailyIn(): string {
  const d = new Date();
  const mins = Math.max(1, Math.ceil((new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - d.getTime()) / 60000));
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** The puzzles come from the daily *number*, so a friend a timezone away can still play yours. */
export const dailySeed = (n: number) => Math.imul(n, 2654435761) ^ 0x5eed;

/** Games a run is made of. With more games than this, each day/run picks a different mix. */
export const RUN_LENGTH = 10;

/** Distinct games (seeded order), difficulty ramping up through the run. */
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

const levelPreview = () => levelOf(xp());

export const sum = (r: StepResult[]) => r.reduce((a, s) => a + s.acc + s.bonus, 0);

/** Wordle-ish grid of coloured score tiles (also used on the share image). */
export function tiles(results: StepResult[], rival?: number[] | null) {
  return `<div class="tiles">${results
    .map((r, i) => {
      const pts = r.acc + r.bonus;
      const vs = rival?.[i];
      const mark = vs == null ? '' : `<i class="${pts > vs ? 'win' : pts < vs ? 'lose' : 'tie'}">${pts > vs ? 'W' : pts < vs ? 'L' : '='}</i>`;
      return `<div class="tile${r.acc >= 90 ? ' star' : ''}" style="--c:${r.game.color};--d:${i * 70}ms" title="${r.game.name}: ${r.acc} + ${r.bonus} speed"><b>${pts}</b><span>${r.game.kr}</span>${mark}</div>`;
    })
    .join('')}</div>`;
}

function xpBar(info: LevelInfo, gain: number) {
  return `<div class="xp"><b>Lv ${info.level}</b><i><u style="width:${(info.into / info.need) * 100}%"></u></i><em>+${gain} xp</em></div>`;
}

/** Animate the XP bar and celebrate any level-ups (with hat unlocks). */
async function awardXp(g: Shell, card: HTMLElement, gain: number) {
  const { before, after } = addXp(gain);
  const bar = card.querySelector<HTMLElement>('.xp u')!;
  const lvl = card.querySelector<HTMLElement>('.xp b')!;
  await g.wait(500);
  if (after.level === before.level) {
    bar.style.width = `${(after.into / after.need) * 100}%`;
    return;
  }
  bar.style.width = '100%';
  await g.wait(900);
  for (let lv = before.level + 1; lv <= after.level; lv++) {
    lvl.textContent = `Lv ${lv}`;
    bar.style.transition = 'none';
    bar.style.width = '0%';
    void bar.offsetWidth;
    bar.style.transition = '';
    const unlocked = hatForLevel(lv);
    const m = el('div', 'levelup', `<small>level up!</small><b>Lv ${lv}</b><div class="lu-kongi"></div><p>${unlocked ? `new hat unlocked: <b>${unlocked.name}</b>` : 'keep going, more hats ahead!'}</p>`);
    g.overlay.appendChild(m);
    const st = new Stage(m.querySelector<HTMLElement>('.lu-kongi')!, 'lu-canvas', { fps: 24 });
    st.draw = (pen, w, h, t) => drawKongi(pen, w / 2, h - 6, Math.min(w * 0.55, h * 0.8), 'cheer', t, { hat: unlocked?.id ?? hat() });
    sfx.fanfare();
    g.burst(g.stage.w / 2, g.stage.h * 0.4, 40);
    g.setMood('cheer');
    g.say(unlocked ? `level ${lv}! I get a <b>${unlocked.name}</b>?! for me?!` : `level ${lv}!`);
    try {
      const i = await g.choose(unlocked ? ['wear it!', 'later'] : ['yay!'], 0);
      if (unlocked && i === 0) setHat(unlocked.id);
    } finally {
      st.destroy();
      m.remove();
    }
  }
  bar.style.width = `${(after.into / after.need) * 100}%`;
}

/** Sharing and copying both failed: show the link so it can be copied by hand. */
async function showLink(g: Shell, link: string) {
  const m = el('div', 'name-card', `<b>send this link to a friend</b><input readonly aria-label="challenge link" value="${esc(link)}" />`);
  g.overlay.appendChild(m);
  const input = m.querySelector('input')!;
  input.addEventListener('focus', () => input.select());
  setTimeout(() => input.select(), 50);
  g.say("couldn't open sharing here. press and hold the link to copy it!", 'happy');
  try {
    await g.choose(['done'], 0);
  } finally {
    m.remove();
  }
}

/** Ask once what friends should call you (for challenge links). */
async function askName(g: Shell): Promise<string | null> {
  const existing = playerName();
  if (existing) return existing;
  const m = el('div', 'name-card', `<b>what should your friends call you?</b><input maxlength="14" placeholder="your name" aria-label="your name" />`);
  g.overlay.appendChild(m);
  const input = m.querySelector('input')!;
  setTimeout(() => input.focus(), 50);
  g.say('so they know who to beat!', 'happy');
  try {
    const i = await g.choose(['save', 'skip'], 0);
    const name = input.value.trim();
    if (i === 0 && name) {
      setPlayerName(name);
      return name;
    }
    return null;
  } finally {
    m.remove();
  }
}

/* ——— practice: one game, five rounds, no clock ——— */

export function startPractice(app: HTMLElement, def: GameDef, exit: () => void): () => void {
  const g = new Shell(app, { title: def.name, kr: def.kr, color: def.color, steps: 5, timed: false }, exit);
  const steps: Step[] = [0, 1, 2, 3, 4].map((level) => ({ game: def, level }));

  const go = async (intro: boolean) => {
    if (intro) {
      try {
        await g.briefing(def, null, { force: 'new', goLabel: 'start!' });
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
    const { level, into, need } = levelPreview();
    const card = g.card(`
      <div class="final-label">practice total</div>
      <div class="final-total"><b>0</b><span>/500</span></div>
      <div class="final-rank">“${rank}”</div>
      <div class="bars">${results.map((r, i) => `<div class="bar" style="--h:${Math.max(6, r.acc)}%;--d:${i * 90}ms"><i></i><span>${r.acc}</span></div>`).join('')}</div>
      ${xpBar({ level, into, need }, total)}
      <div class="final-best">${isBest ? '<em>new personal best!</em>' : `your best: ${best}`}</div>`);
    g.countUp(card.querySelector('.final-total b')!, total);
    const ratio = total / 500;
    g.confetti(ratio);
    g.setMood(ratio >= 0.75 ? 'cheer' : ratio >= 0.45 ? 'happy' : 'sad');
    g.say(ratio >= 0.85 ? 'okay that was <b>scary</b> good.' : ratio >= 0.65 ? 'your eyeballs are well calibrated!' : ratio >= 0.45 ? 'solidly 대충. respectable.' : 'that was very 대충. try again?');
    try {
      await awardXp(g, card, total);
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
    const now = today();
    const pending = kind === 'daily' ? getPending() : null;
    // a friend's challenge from yesterday/tomorrow (timezones!) still plays *their* puzzles
    const linkDay = pending && Math.abs(pending.day - now.n) <= 1 ? pending.day : null;
    const day = linkDay ? { n: linkDay, seed: dailySeed(linkDay) } : now;
    const isToday = day.n === now.n;
    const seed = kind === 'daily' ? day.seed : (Math.random() * 1e9) | 0;
    const steps = buildRun(games, Math.min(RUN_LENGTH, games.length), seed);
    const label = kind === 'daily' ? `daily #${day.n}` : 'quick run';
    const rival: Challenge | null = linkDay ? pending : null;
    const color = kind === 'daily' ? BUTTER : LILAC;
    g = new Shell(
      app,
      { title: kind === 'daily' ? `Daily #${day.n}` : 'Quick Run', kr: '대충', color, steps: steps.length, timed: true, rival: rival ? { name: rival.name, scores: rival.scores } : undefined },
      exit,
    );
    const shell = g;
    // slot-machine preview: flick through the games in this run
    shell.stage.draw = (pen, w, h, t) => {
      pen.text(rival ? `beat ${rival.name}: ${rival.total}` : `${steps.length} mini-games`, w / 2, 48, { size: Math.min(38, w * 0.09) });
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
    if (rival) shell.say(`<b>${esc(rival.name)}</b> challenged you! they scored <b>${rival.total}</b> on daily #${rival.day}. same puzzles. go get 'em!`, 'cheer');
    else if (pending) shell.say(`that challenge was for daily #${pending.day}, which has expired. play today's and send one back!`, 'happy');
    else if (kind === 'daily' && isIOS() && !standalone() && firstTime('a2hs'))
      // before the first daily (not after!), because the home-screen app keeps its own progress on iPhone
      shell.say("tip: tap <b>Share → Add to Home Screen</b> first, then play from there. the home-screen app keeps its own streak!", 'happy');
    else
      shell.say(
        kind === 'daily'
          ? `today's run is the <b>same for everyone</b>. ${steps.length} mini-games, each on a timer. faster = bonus points!`
          : `${steps.length} random mini-games, each on a timer. close = points, fast = <b>bonus</b>.`,
        'happy',
      );
    try {
      await shell.button(rival ? 'accept challenge!' : "let's go!");
    } catch {
      return;
    }
    const results = await shell.playSteps(steps, seed);
    if (!results) return;

    shell.setHeader(kind === 'daily' ? `Daily #${day.n}` : 'Quick Run', '대충', color);
    const max = steps.length * 120;
    const total = sum(results);
    const key = kind === 'daily' ? `daily-${day.n}` : 'run';
    const isBest = saveScore(key, total);
    const best = getBest(key) ?? total;
    const ratio = total / max;
    // only today's daily counts toward the streak (a friend's yesterday-run still scores)
    const streak = kind === 'daily' && isToday ? recordDaily(day.n, total) : null;
    if (pending) setPending(null);
    const won = rival ? total > rival.total : false;
    // friends whose challenge links for this day you've opened, and you outscored
    const beat = kind === 'daily' ? friends(day.n).filter((f) => f.total < total && f.name !== rival?.name) : [];
    const head = rival
      ? `<div class="vs"><span>you <b>${total}</b></span><i>vs</i><span>${esc(rival.name)} <b>${rival.total}</b></span></div>`
      : '';
    const streakChip = streak && streak.streak > 0 ? `<div class="streak-chip">${icons.flame}<b>${streak.streak}-day streak</b></div>` : '';
    const card = shell.card(`
      <div class="final-label">${label}</div>
      ${streakChip}
      <div class="final-total"><b>0</b><span>/${max}</span></div>
      <div class="final-rank">“${runRank(ratio)}”</div>
      ${head}
      ${tiles(results, rival?.scores)}
      ${xpBar(levelPreview(), total)}
      <div class="final-best">${isBest ? '<em>new best!</em>' : `best: ${best}`}${kind === 'daily' && isToday ? ` · next daily in ${nextDailyIn()}` : ''}</div>`);
    shell.countUp(card.querySelector('.final-total b')!, total);
    shell.confetti(rival ? (won ? 1 : 0.3) : ratio);
    if (rival) shell.banner(won ? 'YOU WIN!' : total === rival.total ? 'TIE!' : 'SO CLOSE…');
    shell.setMood(rival ? (won ? 'cheer' : 'sad') : ratio >= 0.7 ? 'cheer' : ratio >= 0.45 ? 'happy' : 'sad');
    shell.say(
      rival
        ? won
          ? `you beat <b>${esc(rival.name)}</b>! send it back so they can try again.`
          : `${esc(rival.name)} wins this time. rematch tomorrow?`
        : beat.length
          ? `you beat <b>${beat.map((f) => esc(f.name)).join(', ')}</b> today!${streak && streak.streak > 1 ? ` and that's ${streak.streak} days in a row.` : ''}`
        : streak && streak.firstToday && streak.streak > 1
          ? `<b>${streak.streak} days in a row!</b> see you tomorrow?`
          : ratio >= 0.8
            ? 'you might actually be a ruler.'
            : ratio >= 0.55
              ? 'nicely eyeballed! now challenge a friend.'
              : 'very 대충. which is the point, honestly.',
    );
    try {
      await awardXp(shell, card, total);
    } catch {
      return;
    }
    const text = `대충 ${label}: ${total}/${max} “${runRank(ratio)}”${rival ? ` (vs ${rival.name} ${rival.total})` : ''}`;
    for (;;) {
      let i: number;
      try {
        i = await shell.choose([kind === 'daily' ? 'challenge friends' : 'share', icons.again, icons.home], 0);
      } catch {
        return;
      }
      if (i === 0) {
        let name = playerName();
        if (kind === 'daily' && !name) {
          try {
            name = (await askName(shell)) ?? '';
          } catch {
            return;
          }
        }
        const link =
          kind === 'daily'
            ? challengeLink({ name: name || 'a friend', day: day.n, total, scores: results.map((r) => r.acc + r.bonus) })
            : `${location.origin}${location.pathname}`;
        const res = await shareResult(
          { title: label, total, max, rank: runRank(ratio), results, streak: streak?.streak ?? 0, hat: hat(), name, rival: rival ? { name: rival.name, total: rival.total } : null },
          kind === 'daily' ? `${text}\ncan you beat me? same puzzles:` : text,
          link,
        );
        if (res === 'copied') shell.say('link copied and picture saved! paste it in the group chat.', 'happy');
        else if (res === 'shared') shell.say('sent! now we wait…', 'cheer');
        else if (res === 'failed') {
          try {
            await showLink(shell, link);
          } catch {
            return;
          }
        }
      } else if (i === 1) return void play();
      else return exit();
    }
  };
  void play();
  return () => g?.destroy();
}
