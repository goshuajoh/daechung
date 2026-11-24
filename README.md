# 대충 · daechung

*adv.* roughly, more or less, by eye.

**Play: https://goshuajoh.github.io/daechung/**

Five tiny hand-drawn games that test how good your eyeball is, hosted by **Kongi (콩이)**, a little bean-sprout mochi.

![home screen](docs/preview-home.png)

![the five games on a phone](docs/preview-games.png)

| # | game | what you do |
|---|------|-------------|
| 01 | **Angle Eye** 각도 | Drag an arm to make the angle you're given. Later rounds rotate the baseline. |
| 02 | **Keep the Beat** 박자 | Listen to a beat, then keep tapping after it stops. Some rounds go silent and you tap a single far-off beat. |
| 03 | **Fair Slice** 자르기 | Chop a kimbap / baguette / sausage / swiss roll / cucumber so the left piece is exactly N%. |
| 04 | **Quick Count** 몇 개? | A pile of beans flashes for 5 seconds. Guess how many. |
| 05 | **Where'd it Land?** 궤도 | A ball is flung and goes invisible mid-air. Tap where it will land. |

Each game is 5 rounds × 100 points. Best scores are saved in your browser.

## Run it

```bash
npm install
npm run dev
```

`npm run build` outputs a static site to `dist/`.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which publishes to GitHub Pages.
Turn it on once in the repo: **Settings → Pages → Source: GitHub Actions**.

## How the look works

No image assets and no emoji: everything is drawn in code.

- `src/lib/pen.ts` is a small "wobbly pen" for canvas. Every shape is jittered with a seeded RNG that re-rolls about 7 times a second, so lines "boil" like a looping hand-drawn animation. Fills are offset from their outlines, like a slightly misregistered riso print.
- `src/lib/kongi.ts` draws the mascot with that pen. Moods: idle, happy, cheer, wow, sad, focus, listen.
- DOM bits (buttons, cards, speech bubble) get the same boil from an SVG `feTurbulence` filter that's re-seeded from JS.
- Sounds are synthesized with Web Audio in `src/lib/audio.ts`. There are no audio files.
- Fonts: [Jua](https://fonts.google.com/specimen/Jua) and [Gaegu](https://fonts.google.com/specimen/Gaegu).

## Adding a game

Make a `GameDef` (see `src/lib/shell.ts`) with a `thumb()` for the home card and an async `play(shell, round)` that returns `{ score, detail }`. Register it in `src/main.ts`. The shell takes care of rounds, stickers, Kongi's reactions, the final card and best scores.
