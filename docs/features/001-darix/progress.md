# Progress · Darix

**Plan:** Functional refactor of the board rules
**Now:** —
**Next:** —

## Steps
- [x] Coordinate + region helpers — One vocabulary: every cell, neighbours, flood/connectedGroups — replaces three hand-rolled flood fills.
- [x] Merge as a region pass — mergeSameColor rebuilt over same-colour regions with maps and reduce, no nested index loops.
- [x] Gravity as pure functions — Units, drop distance, drop-all, repeat-until-rest — each a small function over units.
- [x] Clear as maps — collectClear: claim blocks, assign colours, remove — all through Maps keyed by cell.
- [x] main.ts cell loops — Draw and effects iterate the occupied cells instead of nested row/column loops.
- [x] Tests + build green — The 33 existing tests are the safety net; add helpers tests if any rule moved.

## Loose ends
- `src/game/boardLegacy.ts` + `src/game/parity.test.ts` are a temporary safety net: the old rules kept next to the new ones so the two can be played against each other. Worth deleting once the refactored rules have been played with; until then run `npx vitest run` to check parity.
- The optional splash line saying whole blocks go with a cleared row is still not added.
