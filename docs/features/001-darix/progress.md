# Progress · Darix

**Plan:** Darix: drop the numbers
**Now:** —
**Next:** —

## Steps
- [x] Strip resolve from the model — Cells and ActivePiece keep only color + group; rotation cycles one colour at every speed.
- [x] Group-pop rule in resolveLock — Flood-fill same-colour groups touching the landing piece or a recoloured row; pop groups of 4+.
- [x] Gravity chains re-check groups — Rigid/loose falling keeps working with the new destroy step.
- [x] Re-tune scoring and speed — Points per pop, hit/miss speed curve, multiplier still makes sense without numbers.
- [x] Renderer, preview and HUD cleanup — No number text in main.ts, preview shows colour only, README rewritten.
- [x] Tests and build — board.test.ts for groups, plus npm test and build green.

## Loose ends
- (none yet)
