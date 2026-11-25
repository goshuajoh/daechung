import './style.css';
import { renderHome } from './home';
import type { GameDef } from './lib/shell';
import { startPractice, startRun } from './modes';
import { startParty } from './party';
import { decodeChallenge, setPending } from './challenge';
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

export const games: GameDef[] = [angle, beat, cut, dots, trajectory, circle, stopwatch, pour, center, color];

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
    if (c) setPending(c);
    history.replaceState(null, '', `${location.pathname}#/${path}`);
  }
  window.scrollTo(0, 0);
  if (path === 'daily' || path === 'run') cleanup = startRun(app, games, path === 'daily' ? 'daily' : 'quick', home);
  else if (path === 'party') cleanup = startParty(app, games, home);
  else if (path.startsWith('practice/')) {
    const game = games.find((g) => g.id === path.slice(9));
    if (game) cleanup = startPractice(app, game, home);
  }
  if (!cleanup) cleanup = renderHome(app, games, (h) => (location.hash = `/${h}`));
}

// Note: DOM doodle borders use a *static* SVG wobble filter. Re-seeding it every
// frame made Safari re-render every filtered element ~7x/sec (CPU-only filters).

window.addEventListener('hashchange', route);
// Canvas text needs the fonts loaded up front (the DOM alone won't trigger them in time).
const fonts = Promise.all([document.fonts.load('20px Jua'), document.fonts.load('700 20px Gaegu'), document.fonts.load('20px Jua', '대충')]);
Promise.race([fonts, new Promise((r) => setTimeout(r, 2500))]).finally(route);
