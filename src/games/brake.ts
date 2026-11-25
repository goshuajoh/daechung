import type { GameDef, Shell } from '../lib/shell';
import type { Pen, Pt } from '../lib/pen';
import { sfx } from '../lib/audio';
import { BERRY, INK, PEACH, SKY, WHITE } from '../lib/palette';
import { clamp, easeInOut, easeOutBack, lerp, pick, rand } from '../lib/rng';
import { drawHand, loop, span } from '../lib/hand';

/**
 * Brake! — a car rolls toward a stop line; tap once to brake. It slides to a stop
 * (same braking power every round), so you have to judge its speed.
 */

/** Braking deceleration, in stage-widths per second². Constant so it can be learned. */
const DECEL = 0.85;
const SPEED: [number, number][] = [[0.3, 0.36], [0.36, 0.44], [0.42, 0.5], [0.48, 0.56], [0.52, 0.62]];
const CAR_COLORS = [PEACH, SKY, '#a9dfbf', '#cdb7ec', '#ffe08a'];

/** Side-on doodle car; (x, y) = front bumper at road level. `skid` 0..1 tilts it forward. */
function drawCar(pen: Pen, x: number, y: number, len: number, color: string, t: number, skid: number) {
  const h = len * 0.42;
  const ctx = pen.ctx;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(skid * 0.05);
  const bx = -len;
  // body + cabin
  pen.rrect(bx, -h * 0.95, len, h * 0.6, h * 0.25, { fill: color, seed: 1500, width: 3 });
  pen.blob([[bx + len * 0.22, -h * 0.9], [bx + len * 0.32, -h * 1.45], [bx + len * 0.7, -h * 1.45], [bx + len * 0.84, -h * 0.9]], { fill: WHITE, seed: 1501, width: 3, rough: 0.6 });
  // a little face in the window
  pen.circle(bx + len * 0.48, -h * 1.17, 2.6, { fill: INK, stroke: null, shift: [0, 0], seed: 1502 });
  pen.circle(bx + len * 0.6, -h * 1.17, 2.6, { fill: INK, stroke: null, shift: [0, 0], seed: 1503 });
  pen.curve([[bx + len * 0.51, -h * 1.05], [bx + len * 0.54, -h * 1.0], [bx + len * 0.57, -h * 1.05]], { width: 2, seed: 1504, rough: 0.2 });
  // headlight
  pen.circle(-len * 0.06, -h * 0.68, h * 0.1, { fill: '#fff3b0', seed: 1505, width: 2 });
  // wheels
  for (const wx of [bx + len * 0.24, bx + len * 0.78]) {
    pen.circle(wx, -h * 0.32, h * 0.3, { fill: INK, seed: 1506 + Math.round(wx), shift: [0, 0] });
    const a = t * 14 * (1 - skid);
    pen.line(wx, -h * 0.32, wx + Math.cos(a) * h * 0.2, -h * 0.32 + Math.sin(a) * h * 0.2, { stroke: WHITE, width: 2, seed: 1510 });
  }
  ctx.restore();
}

function drawRoad(pen: Pen, w: number, roadY: number, lineX: number) {
  pen.line(-4, roadY, w + 4, roadY, { width: 3, seed: 1520 });
  for (let x = 10; x < w; x += 46) pen.line(x, roadY + 16, x + 22, roadY + 16, { width: 2.5, seed: 1521 + x, alpha: 0.35 });
  // stop line + little sign
  pen.line(lineX, roadY - 4, lineX, roadY + 26, { stroke: BERRY, width: 5, seed: 1530 });
  pen.line(lineX + 30, roadY, lineX + 30, roadY - 62, { width: 3, seed: 1531 });
  pen.poly(
    Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      return [lineX + 30 + Math.cos(a) * 17, roadY - 76 + Math.sin(a) * 17] as Pt;
    }),
    { fill: BERRY, seed: 1532, rough: 0.5, width: 2.5 },
  );
  pen.text('STOP', lineX + 30, roadY - 75, { size: 11, color: WHITE });
}

export const brake: GameDef = {
  id: 'brake',
  name: 'Brake!',
  kr: '주차',
  blurb: 'Tap to brake. The car slides — stop the bumper right on the line.',
  howto: "The car drives toward the line. <b>Tap once to brake</b> — it slides a bit, so brake early enough to stop right on the line!",
  verb: 'stop on the line!',
  color: SKY,
  untimed: true,
  ranks: [
    [460, 'Valet of the Year'],
    [400, 'Smooth Operator'],
    [320, 'Passed the Test'],
    [220, 'Slight Fender Bender'],
    [0, 'Insurance Is Calling'],
  ],

  thumb(pen, w, h, t) {
    const roadY = h * 0.8, lineX = w * 0.78;
    drawRoad(pen, w, roadY, lineX);
    const k = (t % 3.2) / 3.2;
    const x = lerp(w * 0.1, lineX, Math.min(1, easeOutBack(Math.min(1, k * 1.4)) * 0.98));
    drawCar(pen, x, roadY, Math.min(w * 0.3, 90), PEACH, t, k > 0.4 && k < 0.75 ? 1 : 0);
  },

  steps: ['the car drives toward the <b>STOP</b> line', 'tap anywhere to <b>brake</b> (it slides!)', 'stop the front bumper right on the line'],

  demo(pen, w, h, t) {
    const k = loop(t, 4.6);
    const roadY = h * 0.78, lineX = w * 0.78, len = Math.min(w * 0.24, 80);
    drawRoad(pen, w, roadY, lineX);
    // drive, brake at 40%, slide to the line
    const brakeK = 0.42;
    const xBrake = lerp(w * 0.04, lineX - w * 0.2, span(k, 0, brakeK));
    const slide = easeInOut(span(k, brakeK, 0.7));
    const x = k < brakeK ? xBrake : lerp(lineX - w * 0.2, lineX, Math.sin((slide * Math.PI) / 2));
    if (k > brakeK) for (let i = 0; i < 3; i++) pen.line(lineX - w * 0.2 - len * 0.7, roadY - 2 - i, x - len * 0.7, roadY - 2 - i, { width: 2, seed: 1540 + i, alpha: 0.35 });
    drawCar(pen, x, roadY, len, PEACH, t, k > brakeK && k < 0.7 ? 1 : 0);
    if (k > brakeK - 0.06 && k < brakeK + 0.14) drawHand(pen, w * 0.45, h * 0.35, { press: k > brakeK - 0.02 && k < brakeK + 0.05 ? 1 : 0, ripple: span(k, brakeK, brakeK + 0.12), scale: 0.75 });
    if (k > 0.74) pen.text('perfect!', lineX, roadY - 104, { size: 20, color: BERRY, outline: WHITE });
  },

  async play(g: Shell, level: number) {
    const stage = g.stage;
    const [lo, hi] = SPEED[level];
    const v = rand(lo, hi); // stage widths per second
    const lineK = rand(0.66, 0.8);
    const color = pick(CAR_COLORS);
    const stopDist = (v * v) / (2 * DECEL);
    let state: 'ready' | 'drive' | 'brake' | 'done' = 'ready';
    let t0 = 0; // when driving started (stage time)
    let tb = 0; // when braking started
    let xb = 0; // front position (widths) when braking started
    let doneAt = 0;
    const x0 = -0.05;

    /** Front-bumper position in stage widths at stage time t. */
    const pos = (t: number) => {
      if (state === 'ready') return x0;
      if (state === 'drive') return x0 + v * (t - t0);
      const tau = Math.min(t - tb, v / DECEL);
      return xb + v * tau - (DECEL * tau * tau) / 2;
    };

    g.say(g.tutorial ? 'tap anywhere to brake. the <b>ghost car</b> shows where you\'d stop if you braked right now!' : 'tap anywhere to <b>brake</b>. stop the bumper on the line!', 'focus');

    stage.draw = (pen, w, h, t) => {
      const roadY = h * 0.72, len = Math.min(w * 0.22, 100);
      const lineX = w * lineK;
      drawRoad(pen, w, roadY, lineX);
      const x = pos(t) * w;
      const sliding = state === 'brake' && t - tb < v / DECEL;
      if (state === 'brake' || state === 'done') {
        for (let i = 0; i < 3; i++) pen.line(xb * w - len * 0.75, roadY - 2 - i * 2, x - len * 0.75, roadY - 2 - i * 2, { width: 2, seed: 1545 + i, alpha: 0.3 });
      }
      // training wheels: where you'd stop if you braked now
      if (g.tutorial && state === 'drive') {
        pen.ctx.save();
        pen.ctx.globalAlpha = 0.3;
        drawCar(pen, x + stopDist * w, roadY, len, WHITE, t, 0);
        pen.ctx.restore();
      }
      drawCar(pen, x, roadY, len, color, t, sliding ? 1 : 0);
      if (sliding && Math.floor(t * 12) % 2 === 0) pen.circle(x - len * 0.9, roadY - 10, 6 + Math.random() * 3, { fill: WHITE, width: 1.6, seed: 1550, alpha: 0.7 });
      if (state === 'drive' && t - t0 > 0.6 && t - t0 < 2.4) drawHand(pen, w * 0.5, h * 0.3, { press: Math.sin(t * 8) * 0.5 + 0.5, alpha: 0.8 });
      if (doneAt) {
        const pop = easeOutBack(clamp((t - doneAt) / 0.4, 0, 1));
        const off = Math.round((x - lineX) / len * 100) / 100;
        pen.line(Math.min(x, lineX), roadY + 40, Math.max(x, lineX), roadY + 40, { stroke: BERRY, width: 3, seed: 1560 });
        pen.text(Math.abs(off) < 0.02 ? 'right on it!' : `${Math.abs(off).toFixed(2)} cars ${off > 0 ? 'over' : 'short'}`, (x + lineX) / 2, roadY + 62, { size: Math.max(1, 20 * pop), outline: WHITE });
      }
      if (state === 'ready') pen.text('ready…', w / 2, h * 0.3, { size: 26, alpha: 0.6 });
    };

    await g.ready('start the car');
    state = 'drive';
    t0 = stage.time;
    stage.boost(8000);
    sfx.tone(140, 0.4, { to: 200, type: 'sawtooth', vol: 0.05 });

    const canvas = stage.canvas;
    const lastX = 1.15; // runs off the right edge if you never brake
    const braked = await g.until<boolean>((done) => {
      const hit = () => done(true);
      const kd = (e: KeyboardEvent) => {
        if (e.repeat || e.key === 'Tab' || e.key === 'Escape') return;
        e.preventDefault();
        done(true);
      };
      canvas.addEventListener('pointerdown', hit);
      window.addEventListener('keydown', kd);
      const id = setInterval(() => pos(stage.time) > lastX && done(false), 50);
      return () => {
        canvas.removeEventListener('pointerdown', hit);
        window.removeEventListener('keydown', kd);
        clearInterval(id);
      };
    });
    if (braked) {
      xb = pos(stage.time);
      tb = stage.time;
      state = 'brake';
      sfx.noise(0.5, { freq: 2600, to: 900, q: 3, vol: 0.14 });
      g.setMood('wow');
      await g.wait((v / DECEL) * 1000 + 250);
    }
    state = braked ? 'done' : state;
    doneAt = stage.time;
    const finalX = pos(stage.time);
    const len = Math.min(stage.w * 0.22, 100) / stage.w;
    const err = Math.abs(finalX - lineK) / len; // in car lengths
    if (finalX > lineK) sfx.thud();
    await g.wait(900);
    if (!braked) return { score: 0, detail: 'you never braked! the car drove off' };
    const score = 100 * Math.pow(Math.max(0, 1 - err / 1.1), 1.3);
    return { score, detail: err < 0.03 ? 'parked <b>perfectly</b> on the line!' : `stopped <b>${err.toFixed(2)}</b> car lengths ${finalX > lineK ? 'past' : 'short of'} the line` };
  },
};
