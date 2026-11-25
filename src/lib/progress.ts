import { bodyById } from './hats';
/**
 * Everything that makes people come back: experience per game, XP & level,
 * daily streak, unlocked hats. All local to this device.
 */

const KEY = 'daechung:progress';

interface Progress {
  /** `${who}|${gameId}` → real (scored) rounds played */
  plays: Record<string, number>;
  /** gameId → recent accuracies (newest last), for the profile page */
  hist: Record<string, number[]>;
  xp: number;
  hat: string;
  body: string;
  streak: { last: number; count: number; best: number };
  /** daily number → best score that day */
  days: Record<number, number>;
  name: string;
  /** one-time hints already shown */
  hints: Record<string, 1>;
  /** gameId → best single-round accuracy ever (history only keeps the last 20) */
  top: Record<string, number>;
  /** stamp id → when it was earned */
  stamps: Record<string, number>;
  /** nap pillows: each one covers a missed day so the streak survives */
  pillows: number;
  /** when the stamp book was last looked at (stamps earned after it are "new") */
  seenAt: number;
}

const fresh = (): Progress => ({ plays: {}, hist: {}, xp: 0, hat: 'none', body: 'white', streak: { last: 0, count: 0, best: 0 }, days: {}, name: '', hints: {}, stamps: {}, seenAt: 0, top: {}, pillows: 0 });

let cache: Progress | null = null;

function load(): Progress {
  if (cache) return cache;
  let p = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      p = { ...p, ...saved };
      // older saves counted seen stamps instead of timing them: everything seen then stays seen
      if (saved.seenAt == null && typeof saved.seen === 'number' && saved.seen >= Object.keys(p.stamps ?? {}).length)
        p.seenAt = Math.max(0, ...Object.values(p.stamps ?? {}));
    }
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

const HIST = 20;

/** Remember a scored round (device owner only — party guests don't count). */
export function recordScore(gameId: string, acc: number) {
  const p = load();
  const h = (p.hist[gameId] ??= []);
  h.push(Math.round(acc));
  if (h.length > HIST) h.splice(0, h.length - HIST);
  p.top ??= {};
  p.top[gameId] = Math.max(p.top[gameId] ?? 0, Math.round(acc));
  save();
}

/** Best round ever in a game (falls back to recent history for older saves). */
export function topScore(gameId: string) {
  const p = load();
  return Math.max(p.top?.[gameId] ?? 0, ...(p.hist[gameId] ?? [0]));
}

export function history(gameId: string): number[] {
  return load().hist[gameId] ?? [];
}

export function allDays(): Record<number, number> {
  return load().days;
}

export function bestStreak() {
  return load().streak.best;
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

export function body() {
  return bodyById(load().body).color;
}

export function bodyId() {
  return load().body;
}

export function setBody(id: string) {
  load().body = id;
  save();
}

export function setHat(id: string) {
  load().hat = id;
  save();
}

/* ——— daily streak ——— */

/** Every 5 days in a row earns a nap pillow; you can hold this many. */
export const MAX_PILLOWS = 2;

export function recordDaily(n: number, score: number) {
  const p = load();
  const s = p.streak;
  p.pillows ??= 0;
  const firstToday = s.last !== n;
  const missed = s.last > 0 ? n - s.last - 1 : 0;
  // missed days that pillows can cover: Kongi naps through them and the streak lives on
  const napped = firstToday && missed > 0 && s.count > 0 && missed <= p.pillows ? missed : 0;
  // played before, then skipped at least two days (and no pillow saved it)
  const back = firstToday && !napped && s.last > 0 && missed >= 2;
  let pillow = false;
  if (firstToday) {
    s.count = s.last === n - 1 || napped ? s.count + 1 : 1;
    p.pillows -= napped;
    s.last = n;
    s.best = Math.max(s.best, s.count);
    if (s.count % 5 === 0 && p.pillows < MAX_PILLOWS) {
      p.pillows++;
      pillow = true;
    }
  }
  p.days[n] = Math.max(p.days[n] ?? 0, score);
  save();
  return { streak: s.count, best: s.best, firstToday, back, napped, pillow, pillows: p.pillows };
}

/** Current streak: alive if you played today or yesterday, or your pillows can cover the gap. */
export function streak(today: number) {
  const p = load();
  const s = p.streak;
  if (s.last === today || s.last === today - 1) return s.count;
  const missed = today - s.last - 1;
  return s.last > 0 && missed > 0 && missed <= (p.pillows ?? 0) ? s.count : 0;
}

/** True when today's Daily would spend a pillow (you missed yesterday). */
export function streakNeedsNap(today: number) {
  const s = load().streak;
  return s.last > 0 && s.last < today - 1 && streak(today) > 0;
}

export function pillows() {
  return load().pillows ?? 0;
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

/* ——— stamps ——— */

export function hasStamp(id: string) {
  return !!load().stamps[id];
}

export function addStamp(id: string) {
  load().stamps[id] = Date.now();
  save();
}

export function stampCount() {
  return Object.keys(load().stamps).length;
}

/** Stamps earned since the stamp book was last looked at. */
export function newStamps() {
  const p = load();
  return Object.values(p.stamps).filter((at) => at > (p.seenAt ?? 0)).length;
}

export function isNewStamp(id: string) {
  const p = load();
  return (p.stamps[id] ?? 0) > (p.seenAt ?? 0);
}

export function markStampsSeen() {
  load().seenAt = Date.now();
  save();
}
