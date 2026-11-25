import { Stage } from './lib/stage';
import { drawKongi } from './lib/kongi';
import { HATS } from './lib/hats';
import { hat, levelOf, setHat, xp } from './lib/progress';
import { sfx } from './lib/audio';

/** Hat closet: pick from the hats you've unlocked. */
export function closet(onPick: () => void = () => {}) {
  const lv = levelOf(xp()).level;
  const m = document.createElement('div');
  m.className = 'closet-wrap';
  m.innerHTML = `<div class="closet" role="dialog" aria-label="Kongi's hats">
      <b>Kongi's hats</b>
      <p>level up to unlock more. you're <b>Lv ${lv}</b>.</p>
      <div class="hats">${HATS.map((h) => `<button class="hat${h.id === hat() ? ' on' : ''}" data-id="${h.id}" ${h.level > lv ? 'disabled' : ''}><span class="hat-art"></span><em>${h.level > lv ? `Lv ${h.level}` : h.name}</em></button>`).join('')}</div>
      <button class="btn primary done"><span>done</span></button>
    </div>`;
  // on <body>: a transformed ancestor (the screen's entrance animation) would break position: fixed
  document.body.appendChild(m);
  const stages: Stage[] = [];
  m.querySelectorAll<HTMLButtonElement>('.hat').forEach((b) => {
    const id = b.dataset.id!;
    const locked = b.disabled;
    const st = new Stage(b.querySelector<HTMLElement>('.hat-art')!, 'hat-canvas', { fps: 8 });
    st.draw = (pen, w, h, t) => drawKongi(pen, w / 2, h - 3, Math.min(w * 0.62, h * 0.66), locked ? 'idle' : 'happy', t, { hat: id, body: locked ? '#e9e0d2' : undefined });
    stages.push(st);
    b.addEventListener('click', () => {
      setHat(id);
      sfx.pop();
      m.querySelectorAll('.hat').forEach((x) => x.classList.toggle('on', x === b));
      onPick();
    });
  });
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
