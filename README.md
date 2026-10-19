# Darix

[![Build and deploy](https://github.com/stezante7/Darix/actions/workflows/deploy.yml/badge.svg)](https://github.com/stezante7/Darix/actions/workflows/deploy.yml)

A falling-block puzzle game where you merge pieces and clear rows.

<img src="screenshot.png" alt="Darix in play: score, multiplier, speed and next piece on the left, the board with coloured pieces on the right" width="360">

Play it: https://stezante7.github.io/Darix/

On a phone, use your browser's "Install app" or "Add to Home screen" to get it as an app. It works offline too.

## How it plays

- Every piece is one colour. Rotating it cycles to the next colour, so you choose what it matches.
- Squares of the same colour that touch **merge** into one solid block. A piece that has never merged is still separate squares; the block it becomes is solid.
- Any **full row** clears, whatever colours are in it, and sweeps away in the colour of the block that completed it. Blocks above fall as rigid units, and a fall that fills another row completes that row too.
- A row takes **whole blocks** with it: any block with a square in the cleared row goes entirely, the part sticking above the line too. Big and satisfying, and the reason not to park a giant blob across a row you are about to close.
- When a row clears, every square it takes scores 10 × multiplier, and a square that belongs to a **merged block scores double** (20 × multiplier). Building big same-colour blocks is what makes a clear worth a lot; a full row of unmatched squares is the cheapest possible clear.
- Consecutive clears build your multiplier. Every clear speeds the game up, and nothing slows it back down — the speed only ever climbs.

## Controls

| Action    | Keyboard | Touch               |
|-----------|----------|---------------------|
| Start     | Space    | Tap                 |
| Move      | ← →      | Swipe sideways      |
| Rotate    | ↑        | Tap                 |
| Soft drop | ↓        | —                   |
| Hard drop | Space    | Swipe down          |
| Restart   | R        | Tap after game over |
| Mute      | M        | 🔊 button           |

## Building

You need Node.js 22.12 or newer.

    npm install
    npm run dev       # dev server with hot reload
    npm test          # run the tests
    npm run build     # type-check and build the static site into dist/
    npm run preview   # serve the built site locally

The build is a plain static site with relative paths, so `dist/` can be hosted from any folder.

Every push to `main` runs [the deploy workflow](.github/workflows/deploy.yml): it installs dependencies, runs the tests, builds, and publishes `dist/` to GitHub Pages. If the tests fail, nothing is published. The badge at the top shows the latest run.

## Credits and licence

Built with [Phaser](https://phaser.io). Sound effects and music are from Pixabay; see [CREDITS.md](CREDITS.md).

The code is under the [MIT licence](LICENSE). The audio in `public/sounds/` is not: it's covered by the Pixabay Content License.
