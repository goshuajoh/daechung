import { Stage } from './lib/stage';
import { drawKongi } from './lib/kongi';
import { BODIES, HATS, hatUnlocked, lockLabel } from './lib/hats';
import { bestStreak, body, bodyId, hat, levelOf, setBody, setHat, xp } from './lib/progress';
import { sfx } from './lib/audio';

/** Kongi's closet: hats (levels 2–10, streak rewards) and body colours (levels 11+). */
export function closet(onPick: () => void = () => {}) {
  const lv = levelOf(xp()).level;
  const best = bestStreak();
  const m = document.createElement('div');
  m.className = 'closet-wrap';
  m.innerHTML = `<div class="closet" role="dialog" aria-label="Kongi's closet">
      <b>Kongi's closet</b>
      <p>level up and keep your streak to unlock more. you're <b>Lv ${lv}</b>.</p>
      <div class="hats">${HATS.map((h) => {
        const open = hatUnlocked(h, lv, best);
        return `<button class="hat${h.id === hat() ? ' on' : ''}" data-id="${h.id}" ${open ? '' : `aria-disabled="true" data-lock="${lockLabel(h).replace('Lv', 'level')}"`}><span class="hat-art"></span><em>${open ? h.name : lockLabel(h)}</em></button>`;
      }).join('')}</div>
      <p class="closet-msg" aria-live="polite"></p>
      <p class="closet-sub">colours</p>
      <div class="bodies">${BODIES.map((b) => {
        const open = lv >= b.level;
        return `<button class="body-chip${b.id === bodyId() ? ' on' : ''}" data-id="${b.id}" style="--bc:${b.color}" ${open ? '' : `aria-disabled="true" data-lock="level ${b.level}"`}><i></i><em>${open ? b.name : `Lv ${b.level}`}</em></button>`;
      }).join('')}</div>
      <button class="btn primary done"><span>done</span></button>
    </div>`;
  // on <body>: a transformed ancestor (the screen's entrance animation) would break position: fixed
  document.body.appendChild(m);
  const stages: Stage[] = [];
  const msg = m.querySelector<HTMLElement>('.closet-msg')!;
  const nope = (b: HTMLElement) => {
    sfx.click();
    const lock = b.dataset.lock ?? '';
    msg.textContent = lock.includes('streak') ? `keep a ${lock} to unlock this one!` : `unlocks at ${lock}. keep playing!`;
    b.classList.remove('wiggle');
    void b.offsetWidth;
    b.classList.add('wiggle');
  };
  m.querySelectorAll<HTMLButtonElement>('.hat').forEach((b) => {
    const id = b.dataset.id!;
    const locked = b.getAttribute('aria-disabled') === 'true';
    const st = new Stage(b.querySelector<HTMLElement>('.hat-art')!, 'hat-canvas', { fps: 8 });
    st.draw = (pen, w, h, t) => drawKongi(pen, w / 2, h - 3, Math.min(w * 0.62, h * 0.66), locked ? 'idle' : 'happy', t, { hat: id, body: locked ? '#e9e0d2' : body() });
    stages.push(st);
    b.addEventListener('click', () => {
      if (locked) return nope(b);
      setHat(id);
      sfx.pop();
      m.querySelectorAll('.hat').forEach((x) => x.classList.toggle('on', x === b));
      onPick();
    });
  });
  m.querySelectorAll<HTMLButtonElement>('.body-chip').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.getAttribute('aria-disabled') === 'true') return nope(b);
      setBody(b.dataset.id!);
      sfx.pop();
      m.querySelectorAll('.body-chip').forEach((x) => x.classList.toggle('on', x === b));
      onPick();
    }),
  );
  const close = () => {
    stages.forEach((s) => s.destroy());
    m.remove();
  };
  m.querySelector('.done')!.addEventListener('click', () => {
    sfx.click();
    close();
  });
  m.addEventListener('click', (e) => e.target === m && close());
}
