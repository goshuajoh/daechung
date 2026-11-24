import type { GameDef, Shell } from '../lib/shell';
import type { Pen, Pt } from '../lib/pen';
import { sfx } from '../lib/audio';
import { BERRY, BUTTER, INK, LILAC, PEACH, PINK, WHITE } from '../lib/palette';
import { clamp, randInt } from '../lib/rng';
import { drawHand } from '../lib/hand';

type Mode = 'keep' | 'silent';
interface Plan { mode: Mode; bpm: [number, number]; listen: number; gap: number }

const PLAN: Plan[] = [
  { mode: 'keep', bpm: [84, 100], listen: 8, gap: 0 },
  { mode: 'keep', bpm: [104, 122], listen: 8, gap: 0 },
  { mode: 'silent', bpm: [92, 110], listen: 4, gap: 4 },
  { mode: 'keep', bpm: [128, 146], listen: 8, gap: 0 },
  { mode: 'silent', bpm: [78, 92], listen: 4, gap: 8 },
];

/** Map a performance.now() timestamp to the AudioContext time that was *audible* at that moment. */
function heardAt(ctx: AudioContext, perfMs: number): number {
  const ts = ctx.getOutputTimestamp?.();
  if (ts && ts.performanceTime && ts.contextTime != null) return ts.contextTime + (perfMs - ts.performanceTime) / 1000;
  return ctx.currentTime - sfx.latency + (perfMs - performance.now()) / 1000;
}

interface Note { x: number; y: number; t0: number; side: number }

function drawNote(pen: Pen, x: number, y: number, s: number, alpha: number, seed: number) {
  pen.ellipse(x, y, s * 0.55, s * 0.4, { fill: INK, stroke: null, shift: [0, 0], alpha, seed }, -0.4);
  pen.line(x + s * 0.48, y - s * 0.1, x + s * 0.5, y - s * 1.6, { width: 2.5, alpha, seed: seed + 1 });
  pen.curve([[x + s * 0.5, y - s * 1.6], [x + s * 1.0, y - s * 1.25], [x + s * 1.05, y - s * 0.8]], { width: 2.5, alpha, seed: seed + 2 });
}

/** A little buk (Korean barrel drum) seen from the side. `hit` 0..1 squashes the head. */
function drawDrum(pen: Pen, cx: number, cy: number, r: number, hit: number, stick: number) {
  const ry = r * 0.32 * (1 - hit * 0.18);
  const bodyH = r * 0.95;
  // body
  const body: Pt[] = [];
  for (let i = 0; i <= 8; i++) body.push([cx - r + (2 * r * i) / 8, cy + Math.sin((i / 8) * Math.PI) * ry]);
  body.push([cx + r * 1.04, cy + bodyH * 0.5], [cx + r, cy + bodyH]);
  for (let i = 8; i >= 0; i--) body.push([cx - r + (2 * r * i) / 8, cy + bodyH + Math.sin((i / 8) * Math.PI) * ry]);
  body.push([cx - r * 1.04, cy + bodyH * 0.5]);
  pen.blob(body, { fill: PEACH, seed: 40, rough: 1 });
  // bands + tacks
  for (const k of [0.22, 0.78]) {
    const pts: Pt[] = [];
    for (let i = 0; i <= 10; i++) pts.push([cx - r * 1.02 + (2.04 * r * i) / 10, cy + bodyH * k + Math.sin((i / 10) * Math.PI) * ry]);
    pen.curve(pts, { stroke: INK, width: 2.5, seed: 41 + k * 10 });
  }
  for (let i = 1; i < 8; i++) {
    const a = (i / 8) * Math.PI;
    pen.circle(cx - Math.cos(a) * r * 0.98, cy + Math.sin(a) * ry * 1.05 + 6, 2.4, { fill: INK, stroke: null, shift: [0, 0], seed: 50 + i });
  }
  // head
  pen.ellipse(cx, cy, r, ry, { fill: WHITE, seed: 42, shift: [0, 2] });
  pen.ellipse(cx, cy, r * 0.42, ry * 0.42, { fill: PINK, stroke: null, shift: [0, 0], seed: 43 });
  // stick (rests up-right, swings down on a hit)
  const piv: Pt = [cx + r * 1.5, cy - r * 0.75];
  const ang = -0.35 + stick * 0.62;
  const len = r * 1.25;
  const tip: Pt = [piv[0] - Math.cos(ang) * len, piv[1] + Math.sin(ang) * len];
  pen.limb([piv, [(piv[0] + tip[0]) / 2, (piv[1] + tip[1]) / 2], tip], 7, BUTTER, 44, 2.5);
  pen.circle(tip[0], tip[1], 8, { fill: LILAC, seed: 45 });
}

export const beat: GameDef = {
  id: 'beat',
  name: 'Keep the Beat',
  kr: '박자',
  blurb: 'The music stops. Your inner metronome keeps going… right?',
  howto: "I'll drum a beat. When I <b>stop</b>, you keep it going — tap the stage (or any key). Turn your sound on!",
  color: PINK,
  verb: 'keep the beat!',
  untimed: true,
  ranks: [
    [460, 'Human Metronome'],
    [400, 'Session Drummer'],
    [320, 'Toe Tapper'],
    [220, 'Clap-on-1-and-3'],
    [0, 'Free Jazz Enthusiast'],
  ],

  thumb(pen, w, h, t) {
    const iv = 0.55;
    const ph = (t % iv) / iv;
    const hit = Math.exp(-ph * 7);
    const r = Math.min(w * 0.22, h * 0.24);
    drawDrum(pen, w * 0.44, h * 0.52, r, hit, hit);
    for (let i = 0; i < 3; i++) {
      const k = ((t / iv + i) % 3) / 3;
      drawNote(pen, w * 0.13 + i * 5, h * 0.62 - k * h * 0.3, 12, 1 - k, 60 + i);
    }
    const dots = 4;
    const cur = Math.floor(t / iv) % dots;
    for (let i = 0; i < dots; i++) {
      pen.circle(w * 0.1 + i * Math.min(20, w * 0.08), h * 0.13, Math.min(6, h * 0.04), { fill: i <= cur ? PINK : null, width: 2, seed: 70 + i });
    }
  },

  steps: ['listen to the drum beat', 'when the drum <b>stops</b>, keep tapping the same beat', 'tap anywhere on the screen (or any key)'],

  demo(pen, w, h, t) {
    const iv = 0.5, D = iv * 8 + 1.4;
    const tt = t % D;
    const i = Math.floor(tt / iv), ph = (tt % iv) / iv;
    const machine = i < 4, mine = i >= 4 && i < 8;
    const hit = i < 8 ? Math.exp(-ph * 7) : 0;
    const r = Math.min(w * 0.19, h * 0.26);
    const cx = w * 0.5, cy = h * 0.5;
    drawDrum(pen, cx, cy, r, hit, machine ? hit : 0);
    const gap = Math.min(24, w * 0.07);
    for (let k = 0; k < 8; k++) {
      const lit = i >= k && i < 8;
      pen.circle(w / 2 + (k - 3.5) * gap, h * 0.1, 6.5, { fill: lit ? (k < 4 ? PINK : BUTTER) : null, width: 2, seed: 70 + k });
    }
    pen.text(machine ? 'listen…' : mine ? 'your turn!' : 'nice!', w * 0.14, h * 0.5, { size: 18, color: mine ? BERRY : INK });
    if (mine) drawHand(pen, cx - r * 0.1, cy, { press: hit, ripple: ph < 0.6 ? ph / 0.6 : undefined, scale: 0.75 });
  },

  async play(g: Shell, level: number) {
    // Runs use one bar instead of two so the whole thing stays snappy.
    const base = PLAN[level];
    const short = g.quick || g.tutorial;
    const plan = short && base.mode === 'keep' ? { ...base, listen: 4 } : base;
    const YOUR_TAPS = short ? 4 : 8;
    const bpm = randInt(plan.bpm[0], plan.bpm[1]);
    const iv = 60 / bpm;
    const ctx = sfx.ensure();
    const tapBeat = plan.listen + plan.gap; // silent mode: index of the beat to tap on
    const needed = plan.mode === 'keep' ? YOUR_TAPS : 1;

    let t0 = Infinity; // audio time of beat 0
    let started = false;
    let done = false;
    let lastBeat = -1;
    let lastHit = -10;
    const taps: number[] = []; // audio times (counted ones)
    const notes: Note[] = [];

    if (g.tutorial) {
      g.say(`listen to 4 drum beats. when the drum <b>stops</b>, tap the screen 4 more times on the same beat. the circles help you!`, 'listen');
    } else if (plan.mode === 'keep') {
      g.say(`<b>${bpm} BPM</b>. listen to ${plan.listen} beats, then <b>keep tapping</b> ${YOUR_TAPS} more on your own.`, 'listen');
    } else {
      g.say(`only ${plan.listen} clicks this time. keep counting in your head and <b>tap once on beat ${tapBeat + 1}</b>.`, 'focus');
    }

    const stage = g.stage;
    stage.draw = (pen, w, h, t) => {
      const now = heardAt(ctx, performance.now());
      const bf = (now - t0) / iv;
      const bi = Math.floor(bf);
      // machine beats
      if (started && bi >= 0 && bi < plan.listen && bi !== lastBeat) {
        lastBeat = bi;
        lastHit = t;
        g.bop = 1;
        notes.push({ x: w / 2, y: h * 0.46, t0: t, side: bi % 2 ? 1 : -1 });
      }
      const hit = Math.exp(-(t - lastHit) * 9);

      // dots row
      const total = plan.mode === 'keep' ? plan.listen + YOUR_TAPS : tapBeat + 1;
      const pad = 26, gapX = Math.min(34, (w - pad * 2) / (total - 1));
      const x0 = w / 2 - (gapX * (total - 1)) / 2;
      const dr = Math.min(9, gapX * 0.3);
      for (let i = 0; i < total; i++) {
        const x = x0 + i * gapX, y = 40;
        const mine = i >= plan.listen;
        let fill: string | null = null;
        if (!mine && started && bi >= i) fill = PINK;
        if (mine && plan.mode === 'keep' && taps.length > i - plan.listen) fill = BUTTER;
        if (plan.mode === 'silent' && i === tapBeat) {
          pen.star(x, y, dr * 1.6, { fill: taps.length ? BUTTER : WHITE, width: 2.2, seed: 80 + i }, 0);
          continue;
        }
        const ghost = mine && plan.mode === 'silent';
        pen.circle(x, y, ghost ? dr * 0.55 : dr, { fill, width: ghost ? 1.8 : 2.4, seed: 80 + i, alpha: ghost ? 0.35 : 1, dash: ghost ? [3, 4] : undefined });
      }
      // training wheels: a ring pulses on each beat you should tap
      if (g.tutorial && started && !done && plan.mode === 'keep' && bi >= plan.listen && bi < plan.listen + YOUR_TAPS) {
        const ph = bf - bi;
        pen.circle(x0 + bi * gapX, 40, dr * (1.5 + ph * 1.2), { stroke: BERRY, width: 3, alpha: Math.max(0, 1 - ph * 1.4), seed: 97 });
      }
      if (plan.mode === 'keep') {
        const mid = x0 + (plan.listen - 0.5) * gapX;
        pen.line(mid, 24, mid, 56, { width: 2, seed: 99, alpha: 0.5 });
        pen.text('me', x0 + ((plan.listen - 1) * gapX) / 2, 70, { size: 18, font: 'gaegu', alpha: 0.55 });
        pen.text('you', x0 + (plan.listen + (YOUR_TAPS - 1) / 2) * gapX, 70, { size: 18, font: 'gaegu', alpha: 0.55 });
      }

      // drum
      const r = Math.min(w * 0.22, h * 0.2, 120);
      drawDrum(pen, w / 2, h * 0.46, r, hit, hit);
      // nudge: show a tapping hand when it's your turn and you haven't tapped
      if (started && !done && plan.mode === 'keep' && bi >= plan.listen && !taps.length) {
        const ph = bf - bi;
        drawHand(pen, w / 2 - r * 0.15, h * 0.46 - r * 0.05, { press: Math.exp(-ph * 6), ripple: ph < 0.6 ? ph / 0.6 : undefined, alpha: 0.9 });
      }

      // notes
      for (let i = notes.length - 1; i >= 0; i--) {
        const n = notes[i];
        const k = (t - n.t0) / 1.2;
        if (k > 1) {
          notes.splice(i, 1);
          continue;
        }
        drawNote(pen, n.x + n.side * (r * 0.9 + k * 40), n.y - k * h * 0.25, 15, 1 - k, 110 + (i % 5) * 3);
      }

      // countdown before the first beat
      if (!started) return;
      if (bf < 0) pen.text('get ready…', w / 2, h * 0.82, { size: 26, alpha: 0.7 });
      else if (bi < plan.listen) pen.text('listen', w / 2, h * 0.82, { size: 26, alpha: 0.7, rot: Math.sin(t * 6) * 0.04 });
      else if (!done) pen.text(plan.mode === 'keep' ? 'your turn!' : 'shh… counting…', w / 2, h * 0.82, { size: 28, color: BERRY });

      if (done) drawReveal(pen, w, h);
    };

    // ——— reveal drawing ———
    let drawReveal: (pen: Pen, w: number, h: number) => void = () => {};

    // ——— start ———
    await g.ready(plan.mode === 'keep' ? 'play the beat' : 'play');
    g.setMood(plan.mode === 'keep' ? 'listen' : 'focus');
    started = true;
    t0 = ctx.currentTime + 0.9;
    for (let k = 0; k < plan.listen; k++) sfx.tick(k % 4 === 0, t0 + k * iv);

    const countFrom = t0 + (plan.listen - 0.5) * iv;
    const deadline = t0 + (tapBeat + (plan.mode === 'keep' ? YOUR_TAPS : 1) + 2) * iv;

    await g.until<void>((finish) => {
      const onTap = (perfMs: number) => {
        const at = heardAt(ctx, perfMs);
        sfx.tap();
        lastHit = stage.time;
        g.bop = 1;
        if (at < countFrom || taps.length >= needed) return;
        taps.push(at);
        if (taps.length >= needed) finish();
      };
      const pd = (e: PointerEvent) => onTap(e.timeStamp);
      const kd = (e: KeyboardEvent) => {
        if (e.repeat || e.key === 'Enter' || e.key === 'Tab' || e.key === 'Escape' || e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        onTap(e.timeStamp);
      };
      stage.canvas.addEventListener('pointerdown', pd);
      window.addEventListener('keydown', kd);
      const poll = setInterval(() => {
        if (ctx.currentTime > deadline) finish();
        if (ctx.currentTime > t0 + (plan.listen - 0.3) * iv) g.setMood('focus');
      }, 50);
      return () => {
        stage.canvas.removeEventListener('pointerdown', pd);
        window.removeEventListener('keydown', kd);
        clearInterval(poll);
      };
    });
    done = true;
    g.setMood('idle');

    // ——— scoring ———
    if (plan.mode === 'keep') {
      const expected = Array.from({ length: YOUR_TAPS }, (_, i) => t0 + (plan.listen + i) * iv);
      const errs = expected.map((e, i) => (taps[i] != null ? taps[i] - e : null));
      const absErr = errs.map((e) => (e == null ? iv * 0.5 : Math.min(Math.abs(e), iv * 0.5)));
      const mean = absErr.reduce((a, b) => a + b, 0) / absErr.length;
      let userBpm = bpm;
      if (taps.length >= 3) userBpm = 60 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1));

      drawReveal = (pen, w, h) => {
        const y = h * 0.84, xa = 30, xb = w - 30;
        const span = (YOUR_TAPS + 0.2) * iv;
        const start = expected[0] - 0.6 * iv;
        const X = (tt: number) => xa + ((tt - start) / span) * (xb - xa);
        pen.line(xa, y, xb, y, { width: 2.5, seed: 200 });
        expected.forEach((e, i) => pen.line(X(e), y - 14, X(e), y + 14, { width: 3, seed: 201 + i }));
        taps.forEach((tp, i) => {
          const x = clamp(X(tp), xa - 10, xb + 10);
          pen.line(X(expected[i]), y, x, y - 22, { stroke: BERRY, width: 2, seed: 220 + i, alpha: 0.6 });
          pen.circle(x, y - 22, 7, { fill: BERRY, width: 2, seed: 230 + i });
        });
        pen.text('early', xa + 30, y + 30, { size: 17, font: 'gaegu', alpha: 0.6 });
        pen.text('late', xb - 30, y + 30, { size: 17, font: 'gaegu', alpha: 0.6 });
      };
      sfx.shh();
      await g.wait(900);
      const ms = Math.round(mean * 1000);
      const drift = Math.round(userBpm - bpm);
      const tempo = taps.length < 3 ? 'you went quiet!' : Math.abs(drift) <= 2 ? 'rock steady tempo' : drift > 0 ? `you rushed to ${Math.round(userBpm)} BPM` : `you dragged to ${Math.round(userBpm)} BPM`;
      const score = 100 * Math.pow(Math.max(0, 1 - mean / (0.45 * iv)), 1.2);
      return { score, detail: `avg <b>${ms}ms</b> off · ${tempo}` };
    }

    const expected = t0 + tapBeat * iv;
    const err = taps.length ? taps[0] - expected : iv;
    drawReveal = (pen, w, h) => {
      const y = h * 0.84;
      const X = (tt: number) => w / 2 + ((tt - expected) / iv) * (w * 0.35);
      pen.line(w * 0.1, y, w * 0.9, y, { width: 2.5, seed: 200 });
      for (let k = -1; k <= 1; k++) pen.line(X(expected + k * iv), y - (k ? 9 : 16), X(expected + k * iv), y + (k ? 9 : 16), { width: k ? 2 : 3.5, seed: 210 + k, alpha: k ? 0.4 : 1 });
      if (taps.length) pen.circle(clamp(X(taps[0]), w * 0.06, w * 0.94), y - 22, 8, { fill: BERRY, width: 2, seed: 230 });
      pen.text('beat ' + (tapBeat + 1), w / 2, y + 30, { size: 17, font: 'gaegu', alpha: 0.6 });
    };
    sfx.shh();
    await g.wait(900);
    const ms = Math.round(Math.abs(err) * 1000);
    const score = 100 * Math.pow(Math.max(0, 1 - Math.abs(err) / (0.9 * iv)), 1.2);
    return {
      score,
      detail: !taps.length ? 'you never tapped!' : ms < 15 ? `dead on — <b>${ms}ms</b> off!` : `<b>${ms}ms</b> ${err < 0 ? 'early' : 'late'} (${bpm} BPM)`,
    };
  },
};
