import { Shell, el, esc, type GameDef, type Step, type StepResult } from './lib/shell';
import { Stage } from './lib/stage';
import type { Pen, Pt } from './lib/pen';
import { drawKongi } from './lib/kongi';
import { getBest, saveScore } from './lib/store';
import { icons } from './lib/icons';
import { seedRandom, shuffle } from './lib/rng';
import { BERRY, BUTTER, LILAC, MINT, PINK, WHITE } from './lib/palette';
import { sfx } from './lib/audio';
import { type LevelInfo, addXp, body, firstTime, hat, levelOf, topScore, playerName, plays, recordDaily, setBody, setHat, setPlayerName, xp } from './lib/progress';
import { bodyForLevel, hatForLevel, hatForStreak } from './lib/hats';
import { challengeLink, friends, getPending, setPending, type Challenge } from './challenge';
import { shareResult } from './share';
import { earn, holdStamps } from './lib/stamps';

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
/** Result tiles. `accOnly` (survival): show accuracy, and fade rounds under it (they broke a heart). */
export function tiles(results: StepResult[], rival?: number[] | null, accOnly?: number) {
  return `<div class="tiles">${results
    .map((r, i) => {
      const pts = accOnly != null ? r.acc : r.acc + r.bonus;
      const vs = rival?.[i];
      const mark = vs == null ? '' : `<i class="${pts > vs ? 'win' : pts < vs ? 'lose' : 'tie'}">${pts > vs ? 'W' : pts < vs ? 'L' : '='}</i>`;
      return `<div class="tile${r.acc >= 90 ? ' star' : ''}${accOnly != null && r.acc < accOnly ? ' broke' : ''}" style="--c:${r.game.color};--d:${i * 70}ms" title="${r.game.name}: ${r.acc} + ${r.bonus} speed"><b>${pts}</b><span>${r.game.short}</span>${mark}</div>`;
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
    const colour = bodyForLevel(lv);
    const m = el('div', 'levelup', `<small>level up!</small><b>Lv ${lv}</b><div class="lu-kongi"></div><p>${
      unlocked ? `new hat unlocked: <b>${unlocked.name}</b>` : colour ? `new colour unlocked: <b>${colour.name}</b>` : 'keep going!'
    }</p>`);
    g.overlay.appendChild(m);
    const st = new Stage(m.querySelector<HTMLElement>('.lu-kongi')!, 'lu-canvas', { fps: 24 });
    st.draw = (pen, w, h, t) => drawKongi(pen, w / 2, h - 6, Math.min(w * 0.55, h * 0.8), 'cheer', t, { hat: unlocked?.id ?? hat(), body: colour?.color ?? body() });
    sfx.fanfare();
    g.burst(g.stage.w / 2, g.stage.h * 0.4, 40);
    g.setMood('cheer');
    g.say(unlocked ? `level ${lv}! I get a <b>${unlocked.name}</b>?! for me?!` : colour ? `level ${lv}! I can be <b>${colour.name}</b> now?!` : `level ${lv}!`);
    try {
      const i = await g.choose(unlocked || colour ? ['wear it!', 'later'] : ['yay!'], 0);
      if (unlocked && i === 0) setHat(unlocked.id);
      if (colour && i === 0) setBody(colour.id);
    } finally {
      st.destroy();
      m.remove();
    }
  }
  bar.style.width = `${(after.into / after.need) * 100}%`;
  if (after.level >= 10) earn('lv10');
}

/** Stamps for a finished run (shown once the results have been revealed). */
function runStamps(games: GameDef[], ratio: number) {
  if (ratio >= 0.75) earn('great');
  if (ratio >= 0.85) earn('legend');
  if (games.every((g) => plays(g.id) > 0)) earn('tour');
  if (games.every((g) => topScore(g.id) >= 90)) earn('ace');
}

/** Hitting a streak milestone for the first time unlocks a special hat. */
async function streakReward(g: Shell, days: number, best: number) {
  const reward = hatForStreak(days);
  if (!reward || best > days) return; // already earned on an earlier, longer streak
  const m = el('div', 'levelup', `<small>${days}-day streak!</small><b>${icons.flame}</b><div class="lu-kongi"></div><p>streak reward: <b>${reward.name}</b></p>`);
  g.overlay.appendChild(m);
  const st = new Stage(m.querySelector<HTMLElement>('.lu-kongi')!, 'lu-canvas', { fps: 24 });
  st.draw = (pen, w, h, t) => drawKongi(pen, w / 2, h - 6, Math.min(w * 0.55, h * 0.8), 'cheer', t, { hat: reward.id, body: body() });
  sfx.fanfare();
  g.burst(g.stage.w / 2, g.stage.h * 0.4, 40);
  g.say(`${days} days in a row! that earns you the <b>${reward.name}</b>.`, 'cheer');
  try {
    if ((await g.choose(['wear it!', 'later'], 0)) === 0) setHat(reward.id);
  } finally {
    st.destroy();
    m.remove();
  }
}

/** Sharing and copying both failed: show the link so it can be copied by hand. */
async function showLink(g: Shell, link: string) {
  const m = el('div', 'name-card', `<b>send this link to a friend</b><input readonly aria-label="challenge link" value="${esc(link)}" />`);
  g.overlay.appendChild(m);
  const input = m.querySelector('input')!;
  input.addEventListener('focus', () => input.select());
  setTimeout(() => input.select(), 50);
  g.say("couldn't open sharing here (the picture may have saved). press and hold the link to copy it!", 'happy');
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
    holdStamps(true);
    const results = await g.playSteps(steps, null);
    if (!results) return void holdStamps(false);
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
      holdStamps(false);
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
  return () => {
    holdStamps(false);
    g.destroy();
  };
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
    const pool = kind === 'daily' ? games.filter((g) => (g.since ?? 0) <= day.n) : games;
    const steps = buildRun(pool, Math.min(RUN_LENGTH, pool.length), seed);
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
    holdStamps(true);
    const results = await shell.playSteps(steps, seed);
    if (!results) return void holdStamps(false);

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
    const streakChip = streak && streak.streak > 0 ? `<div class="streak-chip">${icons.flame}<b>${streak.streak}-day streak</b>${streak.napped ? icons.pillow : ''}</div>` : '';
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
    // the very first result explains the numbers
    const firstResult = firstTime('first-result');
    const comment =
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
            : firstResult
              ? `each game is worth up to <b>100</b>, plus up to 20 for speed, so ${max} is perfect.${kind === 'daily' ? ' a new Daily comes out every day!' : ''}`
              : ratio >= 0.55
                ? 'nicely eyeballed! now challenge a friend.'
                : 'very 대충. which is the point, honestly.';
    shell.say(comment);
    // earned now (saved straight away), shown once the celebrations are over
    runStamps(games, ratio);
    if (kind === 'daily' && isToday) {
      earn('first');
      const hr = new Date().getHours();
      if (hr < 5) earn('owl');
      else if (hr < 8) earn('bird');
    }
    if (streak) {
      if (streak.streak >= 3) earn('streak3');
      if (streak.streak >= 7) earn('streak7');
      if (streak.streak >= 30) earn('streak30');
      if (streak.back) earn('back');
    }
    if (won) earn('rival');
    try {
      await awardXp(shell, card, total);
      if (streak?.firstToday) await streakReward(shell, streak.streak, streak.best);
    } catch {
      return void holdStamps(false);
    }
    holdStamps(false);
    if (streak?.napped)
      shell.say(`you missed ${streak.napped > 1 ? `${streak.napped} days` : 'yesterday'}, so I napped on a <b>pillow</b> for you. streak saved!${streak.pillow ? ` and ${streak.streak} days earns you a new one.` : ''}`, 'happy');
    else if (streak?.pillow)
      shell.say(`${streak.streak} days in a row earns a <b>nap pillow</b>! if you miss a day, it saves your streak. (you have ${streak.pillows})`, 'cheer');
    // back to the result comment (a level-up or streak reward may have replaced it)
    else shell.say(comment);
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
          { title: label, total, max, rank: runRank(ratio), results, streak: streak?.streak ?? 0, hat: hat(), body: body(), name, rival: rival ? { name: rival.name, total: rival.total } : null },
          kind === 'daily' ? `${text}\ncan you beat me? same puzzles:` : text,
          link,
        );
        if (kind === 'daily' && (res === 'shared' || res === 'copied')) earn('gift');
        if (res === 'copied') shell.say('link copied and picture saved! paste it in the group chat.', 'happy');
        else if (res === 'shared') shell.say('sent! now we wait…', 'cheer');
        else if (res === 'failed' || res === 'saved') {
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
  return () => {
    holdStamps(false);
    g?.destroy();
  };
}

/* ——— survival: rounds until you run out of hearts ——— */

export const LIVES = 3;
/** A round scoring under this costs a heart. */
export const SURVIVE_MIN = 50;
const SURVIVE_RANKS: [number, string][] = [
  [20, 'Unbreakable'],
  [15, 'Eyeball Athlete'],
  [10, 'Tough Cookie'],
  [6, 'Hanging In'],
  [3, 'Just Warming Up'],
  [0, 'Blinked Early'],
];
const surviveRank = (rounds: number) => SURVIVE_RANKS.find(([min]) => rounds >= min)![1];

function heart(pen: Pen, x: number, y: number, r: number, fill: string, seed: number) {
  pen.blob(
    [[0, 0.95], [-0.85, 0.15], [-0.95, -0.45], [-0.5, -0.85], [0, -0.45], [0.5, -0.85], [0.95, -0.45], [0.85, 0.15]].map(([a, b]) => [x + a * r, y + b * r] as Pt),
    { fill, width: 3, seed },
  );
}

/** Home tile art: three hearts, one wobbling. */
export function drawHearts(pen: Pen, w: number, h: number, t: number) {
  const r = Math.min(w / 8, h / 3.2);
  for (let k = 0; k < 3; k++) {
    const wob = k === 2 ? Math.sin(t * 5) * 0.12 : 0;
    pen.ctx.save();
    pen.ctx.translate(w / 2 + (k - 1) * r * 2.3, h / 2 + (k === 1 ? -r * 0.25 : 0));
    pen.ctx.rotate(wob);
    heart(pen, 0, 0, r, k === 2 ? PINK : BERRY, 3100 + k);
    pen.ctx.restore();
  }
}

/** A Survival result to beat, carried in the share link: #/survival?vs=<code>. */
export interface SurvivalRival {
  name: string;
  rounds: number;
}

const b64u = {
  enc: (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))),
};

export function survivalLink(name: string, rounds: number) {
  return `${location.origin}${location.pathname}#/survival?vs=${b64u.enc(JSON.stringify([1, name.slice(0, 14), rounds]))}`;
}

export function decodeSurvival(code: string | null): SurvivalRival | null {
  if (!code) return null;
  try {
    const [v, name, rounds] = JSON.parse(b64u.dec(code));
    if (v !== 1 || typeof name !== 'string') return null;
    const n = Math.round(Number(rounds));
    return n >= 0 && n <= 60 ? { name: name.slice(0, 14) || 'a friend', rounds: n } : null;
  } catch {
    return null;
  }
}

export function startSurvival(app: HTMLElement, games: GameDef[], exit: () => void, rival: SurvivalRival | null = null): () => void {
  let g: Shell | null = null;
  const play = async () => {
    g?.destroy();
    // every game once before any repeats (and never the same one twice in a row); harder every 3 rounds
    seedRandom(null);
    const order: GameDef[] = [];
    while (order.length < 60) {
      const batch = shuffle([...games]);
      if (order.length && batch[0] === order[order.length - 1]) batch.push(batch.shift()!);
      order.push(...batch);
    }
    const steps: Step[] = order.slice(0, 60).map((game, i) => ({ game, level: Math.min(4, Math.floor(i / 3)) }));
    g = new Shell(app, { title: 'Survival', kr: '버티기', color: MINT, steps: steps.length, timed: true, lives: LIVES }, exit);
    const shell = g;
    shell.setProgress(0);
    const best = getBest('survival');
    shell.stage.draw = (pen, w, h, t) => {
      pen.text(`${LIVES} hearts`, w / 2, 52, { size: Math.min(40, w * 0.1) });
      pen.text(`score under ${SURVIVE_MIN} and one breaks`, w / 2, 90, { size: 22, font: 'gaegu', alpha: 0.7 });
      const r = Math.min(w / 9, 46);
      for (let k = 0; k < LIVES; k++) {
        const bob = Math.sin(t * 3 + k) * 4;
        heart(pen, w / 2 + (k - 1) * r * 2.4, h * 0.48 + bob, r, BERRY, 3200 + k);
      }
      pen.text(rival ? `beat ${rival.name}: ${rival.rounds} rounds` : best ? `your best: ${best} rounds` : 'how far can you go?', w / 2, h * 0.48 + r * 2.2, { size: 24, font: 'gaegu', color: rival ? BERRY : undefined });
    };
    shell.say(
      rival
        ? `<b>${esc(rival.name)}</b> lasted <b>${rival.rounds} round${rival.rounds === 1 ? '' : 's'}</b>. you have ${LIVES} hearts; under <b>${SURVIVE_MIN}</b> breaks one. can you last longer?`
        : `you have <b>${LIVES} hearts</b>. score under <b>${SURVIVE_MIN}</b> on a round and you lose one. it gets harder as you go!`,
      rival ? 'cheer' : 'happy',
    );
    try {
      await shell.button("let's go!");
    } catch {
      return;
    }
    let lives = LIVES;
    holdStamps(true);
    const results = await shell.playSteps(steps, null, (r, i) => {
      const notes: string[] = [];
      if (r.acc < SURVIVE_MIN) {
        lives--;
        shell.setLives(lives, true);
        sfx.boop();
        // the score that counts is accuracy (the speed bonus doesn't save a heart)
        notes.push(lives > 0 ? `<b>${r.acc} is under ${SURVIVE_MIN}: a heart broke!</b> ${lives} left.` : `<b>${r.acc} is under ${SURVIVE_MIN}: out of hearts!</b>`);
        if (lives <= 0) shell.banner('OUT OF HEARTS');
      }
      // the moment you outlast the friend who sent the link
      if (rival && i + 1 === rival.rounds + 1) {
        shell.banner(`passed ${esc(rival.name)}!`);
        sfx.fanfare();
        notes.push(`that's more rounds than <b>${esc(rival.name)}</b>!`);
      }
      shell.roundNote = notes.join(' ');
      return lives <= 0;
    });
    if (!results) return void holdStamps(false);

    const rounds = results.length;
    const total = sum(results);
    shell.setHeader('Survival', '버티기', MINT);
    const isBest = saveScore('survival', rounds);
    const bestNow = getBest('survival') ?? rounds;
    const outOfGames = lives > 0;
    const nines = results.filter((r) => r.acc >= 90).length;
    const plural = (n: number) => `${n} round${n === 1 ? '' : 's'}`;
    const card = shell.card(`
      <div class="final-label">survival · ${outOfGames ? 'every round played!' : 'out of hearts'}</div>
      <div class="final-total"><b>0</b><span> ${rounds === 1 ? 'round' : 'rounds'}</span></div>
      <div class="final-rank">“${outOfGames ? 'Survived Everything' : surviveRank(rounds)}”</div>
      ${rival ? `<div class="vs"><span>you <b>${rounds}</b></span><i>vs</i><span>${esc(rival.name)} <b>${rival.rounds}</b></span></div>` : ''}
      ${tiles(results.slice(-10), null, SURVIVE_MIN)}
      <div class="final-best">${results.length > 10 ? 'last 10 rounds · ' : ''}${total} points${nines ? ` · ${plural(nines)} of 90+` : ''}</div>
      ${xpBar(levelPreview(), total)}
      <div class="final-best">${isBest ? '<em>new best!</em>' : `best: ${bestNow} rounds`}</div>`);
    shell.countUp(card.querySelector('.final-total b')!, rounds);
    shell.confetti(Math.min(1, rounds / 15));
    const won = rival ? rounds > rival.rounds : false;
    shell.setMood(won || rounds >= 10 ? 'cheer' : rounds >= 5 ? 'happy' : 'sad');
    if (rival && (won || rounds === rival.rounds || rival.rounds - rounds <= 2)) shell.banner(won ? 'YOU WIN!' : rounds === rival.rounds ? 'TIE!' : 'SO CLOSE…');
    const comment = rival
      ? won
        ? `you outlasted <b>${esc(rival.name)}</b> (${plural(rival.rounds)})! send it back.`
        : rounds === rival.rounds
          ? `a tie with <b>${esc(rival.name)}</b>! rematch?`
          : `<b>${esc(rival.name)}</b> lasted ${plural(rival.rounds - rounds)} more. again?`
      : outOfGames
      ? 'you played every round I had and never ran out of hearts. who ARE you?'
      : isBest && rounds > 1
        ? `a new record: <b>${rounds} rounds</b>!`
        : rounds >= 10
          ? 'tough cookie! the later rounds are no joke.'
          : 'the hearts go fast. one more go?';
    shell.say(comment);
    if (rounds >= 10) earn('survivor');
    if (won) earn('rival');
    try {
      await awardXp(shell, card, total);
    } catch {
      return void holdStamps(false);
    }
    holdStamps(false);
    shell.say(comment);
    for (;;) {
      let i: number;
      try {
        i = await shell.choose(['share', icons.again, icons.home], 0);
      } catch {
        return;
      }
      if (i === 0) {
        let name = playerName();
        if (!name) {
          try {
            name = (await askName(shell)) ?? '';
          } catch {
            return;
          }
        }
        const link = survivalLink(name || 'a friend', rounds);
        const res = await shareResult(
          { title: 'survival', total: rounds, max: 0, unit: rounds === 1 ? 'round' : 'rounds', accOnly: SURVIVE_MIN, rank: outOfGames ? 'Survived Everything' : surviveRank(rounds), results, streak: 0, hat: hat(), body: body(), name, rival: rival ? { name: rival.name, total: rival.rounds } : null },
          `대충 survival: I lasted ${rounds} round${rounds === 1 ? '' : 's'} “${surviveRank(rounds)}”. can you last longer?`,
          link,
        );
        if (res === 'shared' || res === 'copied') earn('gift');
        if (res === 'copied') shell.say('copied! paste it in the group chat.', 'happy');
        else if (res === 'shared') shell.say('sent! now we wait…', 'cheer');
        else if (res === 'failed' || res === 'saved') {
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
  return () => {
    holdStamps(false);
    g?.destroy();
  };
}
