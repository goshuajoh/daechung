const k = (id: string) => `daechung:best:${id}`;

export function getBest(id: string): number | null {
  try {
    const v = localStorage.getItem(k(id));
    return v == null ? null : Number(v);
  } catch {
    return null;
  }
}

/** Returns true when this is a new personal best. */
export function saveScore(id: string, score: number): boolean {
  const prev = getBest(id);
  if (prev != null && prev >= score) return false;
  try {
    localStorage.setItem(k(id), String(score));
  } catch { /* storage blocked: still fun */ }
  return true;
}

/* ——— tutorials: remember which games someone has already learned ——— */
const SEEN = 'daechung:learned';

function learned(): Record<string, 1> {
  try {
    return JSON.parse(localStorage.getItem(SEEN) || '{}');
  } catch {
    return {};
  }
}

/** `who` lets party players each get their own first-time tutorial. */
export function hasLearned(gameId: string, who = ''): boolean {
  return !!learned()[`${who}|${gameId}`];
}

export function markLearned(gameId: string, who = '') {
  try {
    const all = learned();
    all[`${who}|${gameId}`] = 1;
    localStorage.setItem(SEEN, JSON.stringify(all));
  } catch { /* ignore */ }
}

export function forgetTutorials() {
  try {
    localStorage.removeItem(SEEN);
  } catch { /* ignore */ }
}
