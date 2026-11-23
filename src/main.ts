import './style.css';
import { renderHome } from './home';
import { Shell, type GameDef } from './lib/shell';
import { angle } from './games/angle';
import { beat } from './games/beat';
import { cut } from './games/cut';
import { dots } from './games/dots';
import { trajectory } from './games/trajectory';

const games: GameDef[] = [angle, beat, cut, dots, trajectory];

const app = document.getElementById('app')!;
let cleanup: (() => void) | null = null;

function route() {
  cleanup?.();
  cleanup = null;
  const id = location.hash.replace(/^#\/?/, '');
  const game = games.find((g) => g.id === id);
  window.scrollTo(0, 0);
  if (game) {
    const shell = new Shell(app, game, () => (location.hash = ''));
    cleanup = () => shell.destroy();
    void shell.run();
  } else {
    cleanup = renderHome(app, games, (g) => (location.hash = `/${g.id}`));
  }
}

// Line boil for DOM doodles: re-seed the SVG turbulence a few times a second.
const noise = document.getElementById('wob-noise');
let seed = 0;
setInterval(() => noise?.setAttribute('seed', String((seed = (seed + 1) % 4) + 1)), 150);

window.addEventListener('hashchange', route);
// Canvas text needs the fonts loaded up front (the DOM alone won't trigger them in time).
const fonts = Promise.all([document.fonts.load('20px Jua'), document.fonts.load('700 20px Gaegu'), document.fonts.load('20px Jua', '대충')]);
Promise.race([fonts, new Promise((r) => setTimeout(r, 2500))]).finally(route);
