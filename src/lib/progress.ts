/**
 * Everything that makes people come back: experience per game, XP & level,
 * daily streak, unlocked hats. All local to this device.
 */

const KEY = 'daechung:progress';

interface Progress {
  /** `${who}|${gameId}` → real (scored) rounds played */
  plays: Record<string, number>;
  xp: number;
  hat: string;
  streak: { last: number; count: number; best: number };
  /** daily number → best score that day */
  days: Record<number, number>;
  name: string;
  /** one-time hints already shown */
  hints: Record<string, 1>;
}

const fresh = (): Progress => ({ plays: {}, xp: 0, hat: 'none', streak: { last: 0, count: 0, best: 0 }, days: {}, name: '', hints: {} });

let cache: Progress | null = null;

function load(): Progress {
  if (cache) return cache;
  let p = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) p = { ...p, ...JSON.parse(raw) };
    // carry over the older "learned" flags as one play each
    const old = JSON.parse(localStorage.getItem('daechung:learned') || '{}') as Record<string, 1>;
    for (const k of Object.keys(old)) p.plays[k] = Math.max(p.plays[k] ?? 0, 1);
  } catch { /* storage blocked: progress lives for this session only */ }
  cache = p;
  return p;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(load()));
  } catch { /* ignore */ }
}

/* ——— experience per game (drives how much instruction we show) ——— */

export type Tier = 'new' | 'learning' | 'pro';

export function plays(gameId: string, who = '') {
  return load().plays[`${who}|${gameId}`] ?? 0;
}

export function tier(gameId: string, who = ''): Tier {
  const n = plays(gameId, who);
  return n === 0 ? 'new' : n < 3 ? 'learning' : 'pro';
}

export function addPlay(gameId: string, who = '') {
  const p = load();
  const k = `${who}|${gameId}`;
  p.plays[k] = (p.plays[k] ?? 0) + 1;
  save();
}

export function forgetTutorials() {
  load().plays = {};
  save();
  try {
    localStorage.removeItem('daechung:learned');
  } catch { /* ignore */ }
}

/* ——— XP & levels ——— */

/** XP needed to go from level n to n+1. */
const need = (n: number) => 250 * n;

export interface LevelInfo {
  level: number;
  /** XP into the current level */
  into: number;
  /** XP the current level needs */
  need: number;
}

export function levelOf(xp: number): LevelInfo {
  let level = 1;
  let rest = xp;
  while (rest >= need(level)) {
    rest -= need(level);
    level++;
  }
  return { level, into: rest, need: need(level) };
}

export function xp() {
  return load().xp;
}

/** Returns the level before and after, for the level-up celebration. */
export function addXp(n: number) {
  const p = load();
  const before = levelOf(p.xp);
  p.xp += Math.max(0, Math.round(n));
  save();
  return { before, after: levelOf(p.xp), xpBefore: p.xp - Math.round(n), xpAfter: p.xp };
}

/* ——— hats ——— */

export function hat() {
  return load().hat;
}

export function setHat(id: string) {
  load().hat = id;
  save();
}

/* ——— daily streak ——— */

export function recordDaily(n: number, score: number) {
  const p = load();
  const s = p.streak;
  const firstToday = s.last !== n;
  if (firstToday) {
    s.count = s.last === n - 1 ? s.count + 1 : 1;
    s.last = n;
    s.best = Math.max(s.best, s.count);
  }
  p.days[n] = Math.max(p.days[n] ?? 0, score);
  save();
  return { streak: s.count, best: s.best, firstToday };
}

/** Current streak (0 if they missed yesterday and haven't played today). */
export function streak(today: number) {
  const s = load().streak;
  return s.last === today || s.last === today - 1 ? s.count : 0;
}

export function dayScore(n: number): number | null {
  return load().days[n] ?? null;
}

/* ——— misc ——— */

export function playerName() {
  return load().name;
}

export function setPlayerName(name: string) {
  load().name = name.trim().slice(0, 14);
  save();
}

/** Show a one-time hint: returns true the first time only. */
export function firstTime(hint: string) {
  const p = load();
  if (p.hints[hint]) return false;
  p.hints[hint] = 1;
  save();
  return true;
}
