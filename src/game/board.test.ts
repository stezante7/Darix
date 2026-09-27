import { describe, expect, it } from 'vitest';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  applyGravity,
  createEmptyBoard,
  createPiece,
  lockPiece,
  resolveLock,
  rotateBlocks,
} from './board';
import { dropIntervalForSpeed, nextSpeed } from './speed';

/** Fills the bottom row from column 2 with alternating non-matching colors, then completes it with an O piece of color 1. */
function completeBottomRow(resolve: number) {
  const before = createEmptyBoard();
  for (let x = 2; x < BOARD_WIDTH; x += 1) before[19][x] = { color: 2 + (x % 2), resolve, group: 50 + x };
  const piece = createPiece(1, 1, () => 0.5);
  piece.x = 0;
  piece.y = 18;
  return resolveLock(lockPiece(before, piece), before, pieceCells(piece));
}

function pieceCells(piece: ReturnType<typeof createPiece>) {
  return piece.blocks.map((block) => ({ x: piece.x + block.x, y: piece.y + block.y }));
}

describe('Darix board rules', () => {
  it('keeps every generated resolve value between one and five', () => {
    const board = createEmptyBoard();
    const piece = createPiece(0, 2, () => 0.999);
    const locked = lockPiece(board, piece, () => 0.999);

    expect(locked[0][3]?.resolve).toBe(5);
    expect(locked[0][6]?.resolve).toBe(5);
  });

  it('decreases both squares for a newly formed same-color contact', () => {
    const before = createEmptyBoard();
    const piece = createPiece(0, 1, () => 0.25);
    piece.x = 3;
    piece.y = 18;
    before[19][3] = { color: 1, resolve: 2 };
    before[19][4] = { color: 2, resolve: 5 };
    before[19][5] = { color: 2, resolve: 5 };
    before[19][6] = { color: 2, resolve: 5 };
    const locked = lockPiece(before, piece);

    const result = resolveLock(locked, before, piece.blocks.map((block) => ({ x: piece.x + block.x, y: piece.y + block.y })));
    expect(result.board[19][3]?.resolve).toBe(1);
    expect(result.board[18][3]?.resolve).toBe(1);
  });

  it('does not repeatedly wear an existing contact', () => {
    const board = createEmptyBoard();
    board[19][3] = { color: 1, resolve: 4 };
    board[18][3] = { color: 1, resolve: 4 };
    const before = board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
    const result = resolveLock(board, before, []);

    expect(result.board[19][3]?.resolve).toBe(4);
    expect(result.board[18][3]?.resolve).toBe(4);
  });

  it('destroys zeroed squares and drops columns into the gaps', () => {
    const board = createEmptyBoard();
    board[19][0] = { color: 1, resolve: 0 };
    board[18][0] = { color: 2, resolve: 3 };
    const fallen = applyGravity(board);

    expect(fallen[19][0]?.color).toBe(2);
    expect(fallen[18][0]).toBeNull();
  });

  it('reports the positions and colors of destroyed squares', () => {
    const board = createEmptyBoard();
    board[19][2] = { color: 3, resolve: 0 };
    board[19][4] = { color: 1, resolve: 0 };

    const result = resolveLock(board, board, []);

    expect(result.destroyed).toBe(2);
    expect(result.destroyedCells).toEqual([
      { x: 2, y: 19, color: 3 },
      { x: 4, y: 19, color: 1 },
    ]);
  });

  it('marks squares destroyed through a new same-color contact', () => {
    const before = createEmptyBoard();
    before[18][2] = { color: 1, resolve: 1 };
    const piece = createPiece(0, 1, () => 0);
    piece.x = 3;
    piece.y = 18;
    const locked = lockPiece(before, piece);

    const result = resolveLock(locked, before, piece.blocks.map((block) => ({
      x: piece.x + block.x,
      y: piece.y + block.y,
    })));

    expect(result.sameColorDestroyed).toBe(true);
    expect(result.destroyed).toBeGreaterThan(0);
  });

  it('keeps a landed piece whole when it makes no color match', () => {
    const before = createEmptyBoard();
    before[19][4] = { color: 2, resolve: 5 };
    // T piece pointing up, landing with only its middle column supported.
    const piece = createPiece(2, 1, () => 0.5);
    piece.x = 3;
    piece.y = 17;
    const locked = lockPiece(before, piece);

    const result = resolveLock(locked, before, pieceCells(piece));

    expect(result.board[18][3]?.color).toBe(1);
    expect(result.board[18][5]?.color).toBe(1);
    expect(result.board[19][3]).toBeNull();
    expect(result.board[19][5]).toBeNull();
  });

  it('breaks a landed piece into loose squares when it makes a color match', () => {
    const before = createEmptyBoard();
    before[19][4] = { color: 1, resolve: 5 };
    const piece = createPiece(2, 1, () => 0.5);
    piece.x = 3;
    piece.y = 17;
    const locked = lockPiece(before, piece);

    const result = resolveLock(locked, before, pieceCells(piece));

    expect(result.board[19][3]?.color).toBe(1);
    expect(result.board[19][5]?.color).toBe(1);
    expect(result.board[18][3]).toBeNull();
    expect(result.board[18][5]).toBeNull();
  });

  it('also breaks the intact piece that the landing piece touched', () => {
    const before = createEmptyBoard();
    before[19][4] = { color: 1, resolve: 5, group: 99 };
    before[19][5] = { color: 1, resolve: 5, group: 99 };
    const piece = createPiece(1, 1, () => 0.5);
    piece.x = 4;
    piece.y = 17;
    const locked = lockPiece(before, piece);

    const result = resolveLock(locked, before, pieceCells(piece));

    expect(result.board[19][4]?.group).toBeUndefined();
    expect(result.board[19][5]?.group).toBeUndefined();
    expect(result.loosenedCells).toHaveLength(6);
  });

  it('drops an intact piece as one unit when its support is destroyed', () => {
    const board = createEmptyBoard();
    board[19][0] = { color: 2, resolve: 0 };
    board[19][1] = { color: 3, resolve: 5 };
    board[18][0] = { color: 1, resolve: 3, group: 7 };
    board[17][0] = { color: 1, resolve: 3, group: 7 };
    board[17][1] = { color: 1, resolve: 3, group: 7 };

    const fallen = applyGravity(board);

    // The L drops one row together and stops as soon as its right square lands on column 1.
    expect(fallen[19][0]?.group).toBe(7);
    expect(fallen[18][0]?.group).toBe(7);
    expect(fallen[18][1]?.group).toBe(7);
    expect(fallen[17][0]).toBeNull();
    expect(fallen[17][1]).toBeNull();
  });

  it('rotates a piece and normalizes it back to a positive origin', () => {
    const rotated = rotateBlocks([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]);
    expect(rotated).toEqual([{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]);
  });

  it('uses the classic ten by twenty playfield', () => {
    expect(createEmptyBoard()).toHaveLength(BOARD_HEIGHT);
    expect(createEmptyBoard()[0]).toHaveLength(BOARD_WIDTH);
  });

  it('speeds up on a hit, slows down on a miss, and stays within bounds', () => {
    expect(nextSpeed(1, true)).toBe(1.1);
    expect(nextSpeed(3, true)).toBe(3.08);
    expect(nextSpeed(4.98, true)).toBe(5);
    expect(nextSpeed(1.2, false)).toBe(1.13);
    expect(nextSpeed(1, false)).toBe(1);
    expect(dropIntervalForSpeed(1)).toBe(700);
    expect(dropIntervalForSpeed(2)).toBe(350);
    expect(dropIntervalForSpeed(5)).toBe(140);
  });

  it('reports a hit for a new color contact or a completed row, and a miss otherwise', () => {
    const empty = createEmptyBoard();
    const piece = createPiece(1, 1, () => 0.5);
    piece.x = 0;
    piece.y = 18;
    const miss = resolveLock(lockPiece(empty, piece), empty, pieceCells(piece));
    expect(miss.hit).toBe(false);

    expect(completeBottomRow(5).hit).toBe(true);
  });

  it('turns a completed row the landing piece color and wears it like one big match', () => {
    const result = completeBottomRow(5);

    expect(result.recoloredRows).toEqual([{ y: 19, color: 1 }]);
    expect(result.board[19].every((cell) => cell?.color === 1)).toBe(true);
    // Inner squares touch a new same-color neighbour on both sides; the far edge only on one.
    expect(result.board[19][5]?.resolve).toBe(3);
    expect(result.board[19][9]?.resolve).toBe(4);
    expect(result.board[19][5]?.group).toBeUndefined();
    expect(result.sameColorDestroyed).toBe(false);
  });

  it('recolors a row to the color of the landing square in that row', () => {
    const before = createEmptyBoard();
    for (let x = 2; x < BOARD_WIDTH; x += 1) before[19][x] = { color: 2 + (x % 2), resolve: 5 };
    // O piece: top squares color 4, bottom squares color 5; only the bottom ones complete row 19.
    const piece = createPiece(1, [4, 4, 5, 5], () => 0.5);
    piece.x = 0;
    piece.y = 18;

    const result = resolveLock(lockPiece(before, piece), before, pieceCells(piece));

    expect(result.recoloredRows).toEqual([{ y: 19, color: 5 }]);
    expect(result.board[18][0]?.color).toBe(4);
  });

  it('counts squares destroyed by a recolored row as same-color destruction', () => {
    const result = completeBottomRow(2);

    expect(result.destroyedCells.filter((cell) => cell.y === 19).map((cell) => cell.x)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(result.sameColorDestroyed).toBe(true);
  });
});
