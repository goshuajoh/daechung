import { Pen } from './lib/pen';
import { drawKongi } from './lib/kongi';
import type { StepResult } from './lib/shell';
import { BERRY, INK, PAPER, PEACH, WHITE } from './lib/palette';

export interface ShareCard {
  title: string;
  total: number;
  max: number;
  rank: string;
  results: StepResult[];
  streak: number;
  hat: string;
  body?: string;
  name: string;
  rival?: { name: string; total: number } | null;
  /** Shown under the big number instead of "/ max" (survival: "rounds"). */
  unit?: string;
}

/** A 4:5 result card for group chats, drawn with the same wobbly pen as the game. */
export function drawShareCard(c: ShareCard): HTMLCanvasElement {
  const W = 1080, H = 1350;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d')!;
  const pen = new Pen(ctx);
  pen.setTime(0);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  // a few paper specks
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = `rgba(59,44,40,${0.03 + (i % 5) * 0.01})`;
    ctx.fillRect((i * 397) % W, (i * 811) % H, 3, 3);
  }

  pen.rrect(60, 60, W - 120, H - 120, 46, { fill: WHITE, width: 6, seed: 1, shift: [14, 14] });

  // header
  pen.text('대충', 130, 170, { size: 92, align: 'left' });
  pen.text(c.title, W - 130, 160, { size: 46, align: 'right' });
  if (c.streak > 1) pen.text(`${c.streak}-day streak`, W - 130, 214, { size: 34, font: 'gaegu', color: BERRY, align: 'right' });

  // Kongi + score
  drawKongi(pen, 290, 560, 300, 'cheer', 0.25, { hat: c.hat, body: c.body });
  pen.text(String(c.total), 760, 390, { size: 190 });
  pen.text(c.unit ?? `/ ${c.max}`, 760, 500, { size: 50, alpha: 0.5 });
  if (c.name) pen.text(`by ${c.name}`, W - 130, c.streak > 1 ? 262 : 214, { size: 34, font: 'gaegu', alpha: 0.7, align: 'right' });
  // rank on its own row, highlighter behind it
  const rk = `“${c.rank}”`;
  let size = 54;
  ctx.font = `${size}px Jua, sans-serif`;
  while (ctx.measureText(rk).width > W - 260 && size > 34) ctx.font = `${--size}px Jua, sans-serif`;
  const rw = ctx.measureText(rk).width;
  pen.rrect(W / 2 - rw / 2 - 20, 650, rw + 40, size * 0.62, 14, { fill: PEACH, stroke: null, shift: [0, 0], seed: 3 });
  pen.text(rk, W / 2, 662, { size });

  // tiles
  const cols = 5, tw = 160, th = 170, gap = 22;
  const x0 = W / 2 - (cols * tw + (cols - 1) * gap) / 2, y0 = 740;
  // at most two rows: a long survival run shows its last ten rounds
  c.results.slice(-10).forEach((r, i) => {
    const x = x0 + (i % cols) * (tw + gap), y = y0 + Math.floor(i / cols) * (th + gap);
    pen.rrect(x, y, tw, th, 26, { fill: r.game.color, width: 5, seed: 10 + i, shift: [8, 8] });
    pen.text(String(r.acc + r.bonus), x + tw / 2, y + 74, { size: 66 });
    pen.text(r.game.short, x + tw / 2, y + 134, { size: 30, font: 'gaegu' });
    if (r.acc >= 90) pen.star(x + tw - 22, y + 22, 20, { fill: WHITE, width: 4, seed: 30 + i }, 0.2);
  });

  if (c.rival) {
    const won = c.total > c.rival.total;
    pen.text(won ? `beat ${c.rival.name}'s ${c.rival.total}!` : `${c.rival.name} got ${c.rival.total}…`, W / 2, 1150, { size: 44, color: won ? BERRY : INK });
  } else pen.text('how good is your eyeball?', W / 2, 1150, { size: 44 });
  pen.text(`${location.host}${location.pathname}`.replace(/\/$/, ''), W / 2, 1210, { size: 30, font: 'gaegu', alpha: 0.6 });
  return cv;
}

/**
 * Turn a canvas into a PNG File synchronously, so navigator.share() still runs inside the
 * tap that asked for it (iOS Safari refuses to share after a slow async gap).
 */
function canvasFile(cv: HTMLCanvasElement, name = 'daechung.png'): File | null {
  try {
    const url = cv.toDataURL('image/png');
    const bin = atob(url.slice(url.indexOf(',') + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], name, { type: 'image/png' });
  } catch {
    return null;
  }
}

/** shared: share sheet · copied: text copied (+ picture saved) · saved: only the picture saved · failed: nothing worked */
export type ShareOutcome = 'shared' | 'copied' | 'saved' | 'cancelled' | 'failed';

/**
 * Share a picture + text (+ link) with the OS share sheet where possible, otherwise copy
 * the text and download the image. 'failed' means nothing worked.
 */
export async function shareImage(cv: HTMLCanvasElement, text: string, link: string): Promise<ShareOutcome> {
  const file = canvasFile(cv);
  const full = `${text}\n${link}`;
  try {
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text: full });
      return 'shared';
    }
    if (navigator.share) {
      await navigator.share({ text, url: link });
      return 'shared';
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    // NotAllowedError & co: fall back to copying
  }
  let copied = false;
  try {
    await navigator.clipboard.writeText(full);
    copied = true;
  } catch { /* no clipboard access */ }
  let saved = false;
  if (file) {
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      saved = true;
    } catch { /* no downloads either */ }
  }
  return copied ? 'copied' : saved ? 'saved' : 'failed';
}

export const shareResult = (card: ShareCard, text: string, link: string) => shareImage(drawShareCard(card), text, link);
