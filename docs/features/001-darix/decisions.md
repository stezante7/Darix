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

## Multi-color pieces as speed rises · 2026-09-27

From 1.5× speed, a new piece can have two colors; the chance grows with speed and caps at 75% from 4×. From 3×, a multi-color piece can have three colors. Rotation advances every square's color by one. A completed row takes the color of the landing piece's square in that row. Pieces still draw as one solid shape, with a clean edge where two colors meet. This adds difficulty because fewer squares match.

## Installable app with an orange D icon · 2026-09-27

Darix is a PWA: a web manifest, an orange "D" icon on a dark rounded square (plus a maskable version for Android), and a service worker that caches the game, icons and sounds so it runs offline. Pages load network-first so new deploys appear on the next launch.

## Gentler difficulty curve · 2026-09-27

Feedback said the game got too hard too fast. A hit now adds +0.1× at 1×, shrinking to +0.05× at 5×; a miss takes off 0.07×. At a 50% hit rate, 2× takes about 86 pieces (was 20); at 60%, about 36 (was 13); below a 50% hit rate, speed stays near 1×. Multi-color pieces now start at 2× and reach at most 60% at 5×, and three colors start at 3.5×. This refines "Multi-color pieces as speed rises."

## Drop per-square resolve numbers · 2026-10-18

Players couldn't read the game: every square carried two facts (colour and a number 1-5) and the rule that consumed them (each *new* contact wears both by 1) was invisible on the board. Squares no longer have resolve values; colour is the only state on a square.

## Groups of 4 or more pop · 2026-10-18

With numbers gone, a pop needs its own trigger. When a piece lands, flood-fill each connected same-colour group touching it; a group of 4+ squares pops and scores, a smaller group stays on the board as groundwork. The threshold is fixed at 4 and never changes, so the rule is one sentence. Also considered: any contact pops instantly (simplest, but matches become automatic and there is nothing to build toward), and chain pops for bonus (keeps multi-step play but still needs a hint for which contacts will fire).

## Keep full-row recolour · 2026-10-18

A completed row still turns the landing piece's colour and resolves as part of the colour rules. Kept despite the simplification pass because it gives big clears their payoff. Also considered: remove it entirely, and make rows pop outright like classic Tetris.

## One colour per piece again · 2026-10-18

Multi-colour pieces go away at all speeds. Every piece is one solid colour and rotation cycles it, so colour choice is the whole decision and the board reads cleanly without numbers. Speed and difficulty still ramp, but through fall rate only. This replaces the speed-based colour mixing in "Multi-color pieces as speed rises".

## The landing piece's own squares never count towards the four · 2026-10-18

A landing piece can complete a group but never clear itself: its squares connect the group and pop with it, but the count of four must come from squares already on the board. Without this, a whole O piece landing anywhere would pop itself, and one bad drop onto a uniform floor could wipe the board.

## A completed row paints only the touched run · 2026-10-18

Completing a row paints the same-colour run the landing piece touched with the landing colour — not the whole row — and that run then pops as one bigger group. A row already all in the landing colour gains nothing and is not repainted. This replaces "Keep full-row recolour": painting all ten squares let a single lock pop the landing piece together with the whole painted row and melt large monochrome areas.

## Only new connections pop in a chain · 2026-10-18

After a pop, falling squares pop again only when a fall brings a square next to its own colour for the first time and the merged group reaches four counted squares. An intact piece that merely falls does not pop itself, so one lock cannot cascade through the whole board. Also considered: re-seeding every group around the event (one probe lock destroyed 19 squares and emptied the board), and not re-checking after falls at all (loses the chain thrill).

## Pieces keep their visual shape, not solid blocks · 2026-10-20

Every piece draws with its actual shape (the individual blocks visible). Solid rectangles are boring and hide the piece identity. Also considered: solid blocks for everything (simplest), or shape-only for multi-color pieces.

## Merge on any same-color contact · 2026-10-20

When a landing piece touches same-color squares (even one square), those squares merge with the piece into one solid block. The merged block takes the combined outline shape of all involved squares. Also considered: only merge when forming a group of 2+, and only merge after multiple contacts.

## Full row of same color pops · 2026-10-20

A row is cleared only when all 10 squares are the same color. This is the sole clear condition. Also considered: any full row regardless of color (classic Tetris, easier), groups of 4+ (too easy, not intuitive), and any same-color group of 3+ (still abstract).

## Merged pieces in a popping row pop with it · 2026-10-20

When a row pops, any merged piece that has squares in that row is also popped — its squares are removed along with the rest of the row. The merged piece does not break apart; it disappears entirely as part of the clear. Also considered: break merged pieces into loose squares (adds shatter logic and complexity), and keep merged pieces intact but clear only the non-merged squares (inconsistent).

## Squares above fall as solid blocks · 2026-10-20

After a row clears, the squares above drop down into the empty space as solid blocks, maintaining their merged identity (group). Loose squares fall on their own; merged pieces fall as rigid units. Also considered: every square falls independently (loses the solid-block feel), or squares stay in place (no gravity).

## Scoring: per-square + merge bonus · 2026-10-20

Each square in a cleared row scores POINTS_PER_SQUARE (10). Each merged piece caught in the row scores an additional bonus equal to (squares in that merged piece × current multiplier). This makes clearing rows with big merged blocks rewarding. Also considered: flat bonus per merged piece regardless of size, and no bonus (too little incentive to merge).

## Replaced: Groups of 4 or more pop · 2026-10-20

The groups-of-4 pop rule was too easy and not intuitive. Players found that pops happened too frequently and there was little strategy. The merge + full-row-clear mechanic is harder and more readable: you can see a full row, you can see a merge forming. Also considered: raising the groups threshold (still abstract), keeping groups-of-4 with a stricter rule (still too frequent), or removing pops entirely (game would stall).

## Replaced: A completed row paints only the touched run · 2026-10-20

The row-run painting was part of the groups-of-4 system. Full-row clear is a single condition — no painting needed. Also considered: paint the row to a uniform color (adds another layer), keep run-painting with row-clear (confusing).

## Replaced: Only new connections pop in a chain · 2026-10-20

There are no chain pops in the new system. A row clear removes a full row; blocks above fall as solid units. No falling squares re-check for groups. Also considered: chains from falling merged pieces (complex, unpredictable), and chains from falling loose squares (same problem).

## A block is solid only once it has merged · 2026-10-19

When the block isn't merged the pieces that form it should be separated, appearing not as a solid block — it becomes a solid block on merge. So "merged" is now a property of a block, and only merged blocks close the gaps between their squares.

## Any full row clears, not only a monochrome one · 2026-10-19

Replaces "Full row of same color pops". Playability: nothing ever cleared — in 164 random locks the monochrome condition was never met. A row goes when it is full, whatever colours are in it.

The completing block's colour is the row's colour: the whole row is washed in it as it goes, so the sweep and the score particles read as one event. For a row filled by a fall, the completing block is whichever block dropped into its hole.

## Full is full: cascades clear · 2026-10-19

Replaces "Only new connections pop in a chain" / the no-re-check decision, which belonged to the groups-of-4 model. The board settles until nothing is full, so a fall that fills a hole completes that row too. Also considered: only the row the lock completed, which left a full row sitting on the board looking like a bug.
