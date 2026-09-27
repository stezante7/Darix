# Decisions

## Same-color contacts wear down the touching squares · 2026-09-27

When same-colored squares make a new contact, the touching squares each lose 1 resolve point, once for that new contact. Squares that reach zero are destroyed and score points. A stable contact does not keep decrementing over time.

## Full rows wear down by one · 2026-09-27

Completing a row decreases each square in it by 1 instead of clearing the row immediately. If the row remains full, check it again after a later piece locks.

## Resolve values vary per square · 2026-09-27

Each square starts with a random resolve value from 1 to 5.

## Destroyed squares leave gaps that gravity fills · 2026-09-27

When squares are destroyed, unsupported squares fall straight down in their columns to fill the gaps.

## Rotation changes the piece color · 2026-09-27

The whole falling piece changes color when rotated. The palette and exact cycle are still open.

## First-pass board and scoring defaults · 2026-09-27

The first playable version uses a classic 10×20 board and awards 10 points per destroyed square. The visual palette uses six high-contrast accent colors; a clockwise rotation advances the whole piece by one color.

## Gravity can create new contacts · 2026-09-27

When destruction makes squares fall, a same-color adjacency created by that fall is a new contact and resolves once. A square can lose once for each distinct touching pair and once for a full-row event in the same lock resolution.

## Keep the best score in this browser · 2026-09-27

The best score persists in browser storage on this device. It does not need an account or online sync.

## Remove the button row without dropping touch play · 2026-09-27

The bottom touch buttons go away, but the game remains playable on touch screens through gestures on the canvas. Keyboard controls remain available.

## Ramp speed in score steps · 2026-09-27

The automatic fall interval starts at 700 ms, drops by 50 ms for each 100 points, and bottoms out at 120 ms so the game remains playable at high scores.

## Map touch gestures onto the canvas · 2026-09-27

A tap rotates, a horizontal swipe moves one column per cell-width, and a downward swipe hard-drops. Keyboard controls remain the precise alternative.

## Show one combined points popup per clear · 2026-09-27

When a lock destroys squares, animate a burst at each destroyed square and show one popup with the combined points for that clear, rather than a separate score label for every square.

## Same-color destruction builds the multiplier · 2026-09-27

The multiplier starts at ×1. A lock that destroys at least one square through a new same-color contact increases it by one, and that clear scores at the new multiplier. A lock without a same-color-caused destruction resets it to ×1. This counts once per lock, not once per matching pair.

## Send score particles into the HUD · 2026-09-27

Each destroyed square sends one colored particle into the score display. The score counts up as each particle arrives, with each one adding the square's points at the current multiplier. This replaces the earlier floating combined-points popup. Best score is shown on the game-over screen rather than in the top bar.

## Put the title on a start splash, not in the HUD · 2026-09-27

Use a full-width score/multiplier bar, remove the frame around the playfield, and show the colorful Darix title and “Resolve the grid” tagline on an initial splash. Click, tap, or Space starts the game. The reference's lives display is not a Darix mechanic.

## Put the HUD and next piece in a sidebar · 2026-09-27

On wide screens, put Darix, score, multiplier, and an exact next-piece preview in a left sidebar beside the playfield. Stack the sidebar above the playfield on narrow screens so the grid stays usable. The preview includes the next piece's shape, color, and resolve values. This replaces the earlier full-width top bar.

## Reverse the desktop columns and grow the playfield · 2026-09-27

Put the playfield on the left and the title/stats/next-piece sidebar on the right. Let the board scale to the available viewport height and remove the instruction text below it. On narrow screens, stack a compact sidebar above the board. This replaces the previous left-sidebar layout.

## Pieces keep their shape unless they land on a color match · 2026-09-27

A landed piece stays intact as its original shape. A new same-color contact breaks every intact piece involved into loose squares: the landing piece and the piece it touched, including contacts created by falling. When support is destroyed, an intact piece falls as one rigid unit until any of its squares is supported, while loose squares fall straight down on their own. This refines "Destroyed squares leave gaps that gravity fills," which let every square fall independently.

## Sidebar left, board right · 2026-09-27

Put the title/stats/next-piece sidebar on the left and the playfield on the right, on every screen size. The board column is as tall as the viewport allows. On phones, the sidebar condenses into one slim bar above the board (score and multiplier on the left, title in the middle, next piece on the right), so the board gets the full width. This replaces "Reverse the desktop columns and grow the playfield."

## Show intact and loose squares differently · 2026-09-27

Intact pieces are drawn as one merged solid shape; loose squares are separate tiles. When a piece breaks apart, each square flashes white and throws off shards at the spot where it broke.

## Completed rows take the landing piece's color · 2026-09-27

When a lock completes a row, the whole row turns the color of the piece that completed it and then resolves like one big color match: every new same-color adjacency wears both squares by 1, pieces in the row break loose, and destruction counts toward the multiplier. A row that stays full is recolored again on a later lock. A colored sweep across the row shows the change. This replaces "Full rows wear down by one."

## Sound effects and music · 2026-09-27

A short click plays on start, restart, and each lock without destruction; a combo sound plays when a lock destroys squares; a game-over sting plays at the end. The first music loop plays during the game and switches to the second above 2.5× speed, back below 2×. M or the speaker button mutes everything, and the choice is remembered on this device.
