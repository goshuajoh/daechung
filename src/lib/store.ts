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
