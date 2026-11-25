/**
 * Catching "back" while something is in progress (a run, a party):
 * the phone's back gesture lands on an extra history entry instead of leaving,
 * and a little dialog asks first.
 */

export interface BackGuard {
  /** Stop guarding. If we're still on our extra entry, step off it first, then run `then`. */
  release(then?: () => void): void;
}

export function guardBack(onBack: () => void): BackGuard {
  let on = true;
  history.pushState({ dcGuard: 1 }, '', location.href);
  const pop = () => {
    if (!on) return;
    history.pushState({ dcGuard: 1 }, '', location.href);
    onBack();
  };
  window.addEventListener('popstate', pop);
  return {
    release(then) {
      if (!on) return void then?.();
      on = false;
      window.removeEventListener('popstate', pop);
      if (!(history.state as { dcGuard?: number } | null)?.dcGuard) return void then?.();
      if (!then) return void history.back();
      // leave only once we're back on the real entry, so Back from home doesn't land on a dead screen
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.removeEventListener('popstate', finish);
        then();
      };
      window.addEventListener('popstate', finish);
      window.setTimeout(finish, 400);
      history.back();
    },
  };
}

/** "Leave …?" with keep-playing as the main button. Resolves true to leave. */
export function askLeave(parent: HTMLElement, title: string, text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const m = document.createElement('div');
    m.className = 'leave-wrap';
    m.innerHTML = `<div class="leave-card" role="alertdialog" aria-modal="true" aria-label="${title}">
        <b>${title}</b><p>${text}</p>
        <div><button class="btn primary stay"><span>keep playing</span></button><button class="btn go"><span>leave</span></button></div>
      </div>`;
    parent.appendChild(m);
    const back = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      done(false);
    };
    const done = (leave: boolean) => {
      window.removeEventListener('keydown', key, true);
      m.remove();
      if (!leave) back?.focus?.();
      resolve(leave);
    };
    m.querySelector('.stay')!.addEventListener('click', () => done(false));
    m.querySelector('.go')!.addEventListener('click', () => done(true));
    // keyboard / screen reader: start on the safe choice, Escape means "keep playing"
    window.addEventListener('keydown', key, true);
    m.querySelector<HTMLButtonElement>('.stay')!.focus();
  });
}
