/**
 * Challenge links: your daily scores packed into the URL, so a friend can
 * play the same puzzles and see a head-to-head. No server needed.
 */

export interface Challenge {
  name: string;
  /** daily number the scores are from */
  day: number;
  total: number;
  /** per-game points (accuracy + speed), in run order */
  scores: number[];
}

const b64 = {
  enc: (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))),
};

export function encodeChallenge(c: Challenge): string {
  return b64.enc(JSON.stringify([1, c.name, c.day, c.total, c.scores]));
}

export function decodeChallenge(code: string): Challenge | null {
  try {
    const [v, name, day, total, scores] = JSON.parse(b64.dec(code));
    if (v !== 1 || typeof name !== 'string' || !Array.isArray(scores)) return null;
    const clean = scores.slice(0, 20).map((n: unknown) => Math.max(0, Math.min(120, Math.round(Number(n) || 0))));
    return {
      name: name.slice(0, 14) || 'a friend',
      day: Math.max(1, Math.round(Number(day) || 1)),
      total: clean.reduce((a: number, b: number) => a + b, 0) || Math.max(0, Math.round(Number(total) || 0)),
      scores: clean,
    };
  } catch {
    return null;
  }
}

export function challengeLink(c: Challenge): string {
  return `${location.origin}${location.pathname}#/daily?c=${encodeChallenge(c)}`;
}

/** The challenge someone opened a link for (kept until they finish that daily). */
let pending: Challenge | null = null;
const KEY = 'daechung:challenge';

export function setPending(c: Challenge | null) {
  pending = c;
  try {
    if (c) sessionStorage.setItem(KEY, JSON.stringify(c));
    else sessionStorage.removeItem(KEY);
  } catch { /* ignore */ }
}

export function getPending(): Challenge | null {
  if (pending) return pending;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) pending = JSON.parse(raw);
  } catch { /* ignore */ }
  return pending;
}
