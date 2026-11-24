import type { GameDef, Shell } from '../lib/shell';
import type { Pen } from '../lib/pen';
import { sfx } from '../lib/audio';
import { AQUA, BERRY, INK, PINK, WHITE } from '../lib/palette';
import { clamp, easeOutBack, pick, rand, randInt } from '../lib/rng';

/** Seconds of the watch you get to see before it goes dark. */
const PEEK = 1.0;

function target(level: number): number {
  switch (level) {
    case 0: return randInt(3, 4);
    case 1: return 5;
    case 2: return pick([4.5, 5.5, 6.5]);
    case 3: return randInt(7, 9);
    default: return Math.round(rand(9, 12) * 10) / 10;
  }
}

/** Big stopwatch. `elapsed` drives the hand; `cover` 0..1 pulls a sleepy blanket over the face. */
function drawWatch(pen: Pen, cx: number, cy: number, r: number, elapsed: number, cover: number, t: number, ghost?: number) {
  pen.rrect(cx - r * 0.2, cy - r * 1.33, r * 0.4, r * 0.24, 5, { fill: PINK, seed: 10 });
  pen.line(cx, cy - r * 1.1, cx, cy - r * 0.98, { width: 5, seed: 11 });
  pen.circle(cx, cy, r, { fill: WHITE, seed: 12, width: 3.4 });
  for (let i = 0; i < 60; i += 5) {
    const a = (i / 60) * Math.PI * 2;
    const r0 = i % 15 ? r * 0.84 : r * 0.74;
    pen.line(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92, { width: i % 15 ? 2 : 3, seed: 13 + i, rough: 0.3 });
  }
  // the hand does one lap per 10 seconds
  const hand = (sec: number, color: string, seed: number, dash?: number[]) => {
    const a = -Math.PI / 2 + (sec / 10) * Math.PI * 2;
    pen.line(cx, cy, cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72, { stroke: color, width: 4, seed, dash });
  };
  if (ghost != null) hand(ghost, BERRY, 31, [7, 6]);
  if (cover < 1) hand(elapsed, INK, 30);
  pen.circle(cx, cy, 5, { fill: INK, seed: 32, shift: [0, 0] });
  if (cover > 0) {
    // a blanket of fluffy cloud slides over the face
    const k = easeOutBack(cover);
    const y = cy - r * 1.4 + k * r * 1.4;
    const bumps = 6;
    const pts: [number, number][] = [];
    for (let i = 0; i <= bumps; i++) {
      const x = cx - r * 1.15 + (i / bumps) * r * 2.3;
      pts.push([x, y - r * 0.72 + (i % 2 ? -r * 0.12 : r * 0.04)]);
    }
    pts.push([cx + r * 1.2, y + r * 0.6], [cx - r * 1.2, y + r * 0.6]);
    pen.blob(pts, { fill: AQUA, seed: 40, rough: 1.2 });
    pen.text('z', cx + r * 0.5 + Math.sin(t * 2) * 4, y - r * 0.95 - ((t * 20) % 20), { size: 26, alpha: 0.6 });
    pen.text('z', cx + r * 0.75, y - r * 1.2 - ((t * 20 + 10) % 20), { size: 18, alpha: 0.5 });
  }
}

export const stopwatch: GameDef = {
  id: 'stopwatch',
  name: 'Inner Clock',
  kr: '몇 초?',
  blurb: 'Stop the watch at exactly 5 seconds. It falls asleep after one.',
  howto: 'Tap to <b>start</b>, then tap again when you think the time is up. The watch naps after the first second!',
  verb: 'count the seconds!',
  color: AQUA,
  untimed: true,
  ranks: [
    [460, 'Atomic Clock'],
    [400, 'Swiss Watch'],
    [320, 'Kitchen Timer'],
    [220, 'Sundial on a Cloudy Day'],
    [0, '"Five More Minutes"'],
  ],

  thumb(pen, w, h, t) {
    const r = Math.min(w, h) * 0.32;
    const k = t % 4;
    const cover = clamp((k - 1.2) / 0.4, 0, 1) * (k < 3.4 ? 1 : 0);
    drawWatch(pen, w / 2, h * 0.58, r, Math.min(k, 3.4) * 2, cover, t);
    pen.text('5.00s', w * 0.18, h * 0.16, { size: Math.min(26, h * 0.15) });
  },

  async play(g: Shell, level: number) {
    const T = target(level);
    const label = T % 1 ? T.toFixed(1) : String(T);
    let t0 = 0; // performance.now() at start
    let stoppedAt = 0; // seconds
    let phase: 'ready' | 'run' | 'done' = 'ready';
    let doneAt = 0;

    g.say(`tap to start, tap again at exactly <b>${label} seconds</b>.`, 'focus');
    const stage = g.stage;
    stage.draw = (pen, w, h, t) => {
      const r = Math.min(w * 0.34, h * 0.3, 150);
      const cx = w / 2, cy = h * 0.55;
      const el = phase === 'run' ? (performance.now() - t0) / 1000 : phase === 'done' ? stoppedAt : 0;
      const cover = phase === 'run' ? clamp((el - PEEK) / 0.35, 0, 1) : 0;
      pen.text(`${label}s`, w / 2, 42, { size: 46 });
      drawWatch(pen, cx, cy, r, el, cover, t, phase === 'done' ? T : undefined);
      const readout = phase === 'ready' ? '0.00' : phase === 'run' && el > PEEK ? '?.??' : el.toFixed(2);
      if (phase !== 'done') pen.text(readout, cx, cy + r + 34, { size: 30, alpha: 0.8 });
      else {
        const pop = easeOutBack(clamp((t - doneAt) / 0.4, 0, 1));
        pen.text(`you: ${el.toFixed(2)}s`, cx, cy + r + 34, { size: Math.max(1, 30 * pop), outline: WHITE });
      }
      if (phase === 'ready') pen.text('tap to start', cx, cy - r - 50, { size: 22, font: 'gaegu', alpha: 0.5 + Math.sin(t * 4) * 0.25 });
    };

    const canvas = stage.canvas;
    let tapHandler: (stamp: number) => void = () => {};
    const pd = (e: PointerEvent) => tapHandler(e.timeStamp);
    const kd = (e: KeyboardEvent) => {
      if (e.repeat || e.key === 'Tab' || e.key === 'Escape' || e.metaKey || e.ctrlKey) return;
      if (e.key === 'Enter' && document.activeElement?.tagName === 'BUTTON') return;
      e.preventDefault();
      tapHandler(e.timeStamp);
    };
    canvas.addEventListener('pointerdown', pd);
    window.addEventListener('keydown', kd);
    try {
      // start
      g.clearActions();
      await g.until<void>((done) => {
        tapHandler = (stamp) => {
          t0 = stamp;
          phase = 'run';
          sfx.tick(true);
          done();
        };
      });
      g.setMood('listen');
      g.say(`shh… counting to <b>${label}</b>…`);
      setTimeout(() => phase === 'run' && sfx.shh(), PEEK * 1000);
      // stop (or give up after a long while)
      const timedOut = await g.until<boolean>((done) => {
        tapHandler = (stamp) => {
          stoppedAt = (stamp - t0) / 1000;
          sfx.tick(false);
          done(false);
        };
        const id = setTimeout(() => done(true), (T * 2.5 + 3) * 1000);
        return () => clearTimeout(id);
      });
      if (timedOut) stoppedAt = (performance.now() - t0) / 1000;
    } finally {
      tapHandler = () => {};
      canvas.removeEventListener('pointerdown', pd);
      window.removeEventListener('keydown', kd);
    }
    phase = 'done';
    doneAt = stage.time;
    g.setMood('wow');
    await g.wait(1100);
    const err = Math.abs(stoppedAt - T);
    const score = 100 * Math.pow(Math.max(0, 1 - err / (0.2 * T + 0.3)), 1.3);
    return {
      score,
      detail: err < 0.03 ? `<b>${stoppedAt.toFixed(2)}s</b> — you ARE a clock` : `<b>${stoppedAt.toFixed(2)}s</b> — ${(err).toFixed(2)}s ${stoppedAt < T ? 'early' : 'late'}`,
    };
  },
};
