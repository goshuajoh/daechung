import './style.css';
import { renderHome } from './home';
import type { GameDef } from './lib/shell';
import { decodeSurvival, startPractice, startRun, startSurvival } from './modes';
import { startParty } from './party';
import { renderProfile } from './profile';
import { decodeChallenge, isMine, rememberFriend, setPending } from './challenge';
import { playerName } from './lib/progress';
import { angle } from './games/angle';
import { beat } from './games/beat';
import { cut } from './games/cut';
import { dots } from './games/dots';
import { trajectory } from './games/trajectory';
import { circle } from './games/circle';
import { stopwatch } from './games/stopwatch';
import { pour } from './games/pour';
import { center } from './games/center';
import { color } from './games/color';
import { brake } from './games/brake';
import { halfway } from './games/halfway';
import { seesaw } from './games/seesaw';
import { bigger } from './games/bigger';
import { tunnel } from './games/tunnel';

export const games: GameDef[] = [angle, beat, cut, dots, trajectory, circle, stopwatch, pour, center, color, brake, halfway, bigger, tunnel, seesaw];

const app = document.getElementById('app')!;
let cleanup: (() => void) | null = null;
const home = () => (location.hash = '');

function route() {
  cleanup?.();
  cleanup = null;
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  // challenge links: #/daily?c=<code> → remember the rival, tidy the URL
  const code = new URLSearchParams(query ?? '').get('c');
  if (code) {
    const c = decodeChallenge(code);
    if (c) {
      setPending(c);
      // opening your own link shouldn't list you as your own friend
      if (!isMine(code) && c.name !== playerName()) rememberFriend(c);
    }
    history.replaceState(null, '', `${location.pathname}#/${path}`);
  }
  window.scrollTo(0, 0);
  if (path === 'daily' || path === 'run') cleanup = startRun(app, games, path === 'daily' ? 'daily' : 'quick', home);
  else if (path === 'party') cleanup = startParty(app, games, home);
  else if (path === 'survival') cleanup = startSurvival(app, games, home, decodeSurvival(new URLSearchParams(query ?? '').get('vs')));
  else if (path === 'me') cleanup = renderProfile(app, games, home);
  else if (path.startsWith('practice/')) {
    const game = games.find((g) => g.id === path.slice(9));
    if (game) cleanup = startPractice(app, game, home);
  }
  if (!cleanup) cleanup = renderHome(app, games, (h) => (location.hash = `/${h}`));
}

// Note: DOM doodle borders use a *static* SVG wobble filter. Re-seeding it every
// frame made Safari re-render every filtered element ~7x/sec (CPU-only filters).

// Safety net: if anything unexpected throws, offer a way out instead of a frozen screen.
let oopsShown = false;
function oops(err: unknown) {
  if (err instanceof DOMException && err.name === 'AbortError') return; // leaving a screen, not a bug
  console.error(err);
  if (oopsShown) return;
  oopsShown = true;
  const box = document.createElement('div');
  box.className = 'oops';
  box.innerHTML = `<b>oops, Kongi tripped.</b><p>something went wrong on this screen.</p><button class="btn primary"><span>back home</span></button>`;
  box.querySelector('button')!.addEventListener('click', () => {
    box.remove();
    oopsShown = false;
    if (location.hash) location.hash = '';
    else route();
  });
  document.body.appendChild(box);
}
window.addEventListener('error', (e) => oops(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => oops(e.reason));

window.addEventListener('hashchange', route);
// Canvas text needs the fonts loaded up front (the DOM alone won't trigger them in time).
const fonts = Promise.all([document.fonts.load('20px Jua'), document.fonts.load('700 20px Gaegu'), document.fonts.load('20px Jua', '대충')]);
Promise.race([fonts, new Promise((r) => setTimeout(r, 2500))]).finally(route);

// Offline + home-screen install (production only; the dev server shouldn't be cached).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
