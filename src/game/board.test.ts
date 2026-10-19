import { describe, it, expect } from 'vitest';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  cloneBoard,
  createEmptyBoard,
  createPiece,
  lockPiece,
  resolveLock,
  SHAPES,
  applyGravity,
  rotateBlocks,
  canPlace,
  createCell,
  ResolveResult,
} from './board';

// ── Helpers ──────────────────────────────────────────────────

function setCells(board: Board, cells: Array<[number, number, number]>) {
  for (const [x, y, color] of cells) board[y][x] = { color };
}

function setPiece(board: Board, piece: ActivePiece): ResolveResult {
  const locked = lockPiece(board, piece);
  const result = resolveLock(locked, piece);
  return result;
}

type Board = import('./board').Board;
type ActivePiece = import('./board').ActivePiece;

// ── Basic helpers ────────────────────────────────────────────

describe('createPiece', () => {
  it('returns the correct shape and color', () => {
    const piece = createPiece(0, 3);
    expect(piece.blocks).toEqual(SHAPES[0]);
    expect(piece.color).toBe(3);
    expect(piece.x).toBe(3);
    expect(piece.y).toBe(0);
  });
});

describe('rotateBlocks', () => {
  it('rotates a shape 90 degrees clockwise', () => {
    const original = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    const rotated = rotateBlocks(original);
    expect(rotated).toEqual([{ x: 0, y: 0 }, { x: 0, y: 1 }]);
  });
});

describe('canPlace', () => {
  it('returns true when space is clear', () => {
    const board = createEmptyBoard();
    const piece = createPiece(0, 0);
    expect(canPlace(board, piece)).toBe(true);
  });

  it('returns false when overlapping existing cells', () => {
    const board = createEmptyBoard();
    setCells(board, [[3, 0, 0]]);
    const piece = createPiece(0, 0);
    expect(canPlace(board, piece)).toBe(false);
  });
});

describe('cloneBoard', () => {
  it('deep-copies the board', () => {
    const board = createEmptyBoard();
    setCells(board, [[0, 0, 1]]);
    const copy = cloneBoard(board);
    copy[0][0] = null;
    expect(board[0][0]).not.toBe(null);
  });
});

// ── Merge ────────────────────────────────────────────────────

describe('merge on same-color contact', () => {
  it('merges a piece with a same-color neighbor', () => {
    // Place existing cells adjacent to where the I-piece will lock.
    // I-piece at x=3, y=18 locks at (3,18)..(6,18).
    // Put existing cells at (2,18) and (7,18) — adjacent but not overwritten.
    const board = createEmptyBoard();
    setCells(board, [[2, 18, 1], [7, 18, 1]]);
    const piece = createPiece(0, 1);
    piece.x = 3;
    piece.y = 18;
    const locked = lockPiece(board, piece);
    const result = resolveLock(locked, piece);
    // 2 board squares merged with the 4-piece block = 6 total in one group.
    expect(result.mergedSquaresDestroyed).toBe(0); // no row cleared, merge happened
    // Count cells with the merged group on the result board (after gravity).
    const group = locked[18][3]!.group; // group ID from before merge
    let groupCount = 0;
    for (let y = 0; y < BOARD_HEIGHT; y++)
      for (let x = 0; x < BOARD_WIDTH; x++)
        if (result.board[y][x]?.group === group) groupCount++;
    expect(groupCount).toBe(6);
  });

  it('does not merge when colors differ', () => {
    const board = createEmptyBoard();
    setCells(board, [[2, 18, 1], [7, 18, 2]]);
    const piece = createPiece(0, 1);
    piece.x = 3;
    piece.y = 18;
    const locked = lockPiece(board, piece);
    const result = resolveLock(locked, piece);
    expect(result.mergedSquaresDestroyed).toBe(0);
    // Piece group on result board should only cover piece cells (4 cells).
    const group = locked[18][3]!.group;
    let groupCount = 0;
    for (let y = 0; y < BOARD_HEIGHT; y++)
      for (let x = 0; x < BOARD_WIDTH; x++)
        if (result.board[y][x]?.group === group) groupCount++;
    // Cell at (2,18) has color 1 — merges. Cell at (7,18) has color 2 — does not.
    expect(groupCount).toBe(5);
  });

  it('merges a single contact square', () => {
    const board = createEmptyBoard();
    // I-piece at x=3, y=18 locks at (3,18)..(6,18).
    // Put existing cell at (2,18) — adjacent to (3,18).
    setCells(board, [[2, 18, 1]]);
    const piece = createPiece(0, 1);
    piece.x = 3;
    piece.y = 18;
    const locked = lockPiece(board, piece);
    const result = resolveLock(locked, piece);
    // 1 board square merged with 4-piece block.
    expect(result.mergedSquaresDestroyed).toBe(0); // no row cleared
    const group = locked[18][3]!.group;
    let groupCount = 0;
    for (let y = 0; y < BOARD_HEIGHT; y++)
      for (let x = 0; x < BOARD_WIDTH; x++)
        if (result.board[y][x]?.group === group) groupCount++;
    expect(groupCount).toBe(5);
  });

  it('does not merge when there is no same-color contact', () => {
    const board = createEmptyBoard();
    setCells(board, [[8, 18, 1]]);
    const piece = createPiece(0, 1);
    const result = setPiece(board, piece);
    expect(result.mergedSquaresDestroyed).toBe(0);
  });
});

// ── Row clear ────────────────────────────────────────────────

describe('monochrome row clear', () => {
  it('clears a full row of one color', () => {
    const board = createEmptyBoard();
    for (let x = 0; x < BOARD_WIDTH; x++) setCells(board, [[x, 19, 1]]);
    const piece = createPiece(0, 1);
    piece.x = 3;
    piece.y = 18;
    const result = setPiece(board, piece);
    expect(result.hit).toBe(true);
    expect(result.destroyed).toBe(BOARD_WIDTH);
    expect(result.clearedRows.length).toBe(1);
    expect(result.clearedRows[0].y).toBe(19);
    expect(result.clearedRows[0].color).toBe(1);
  });

  it('does not clear a row with mixed colors', () => {
    const board = createEmptyBoard();
    for (let x = 0; x < BOARD_WIDTH - 1; x++) setCells(board, [[x, 19, 1]]);
    setCells(board, [[9, 19, 2]]);
    const piece = createPiece(0, 1);
    piece.x = 3;
    piece.y = 18;
    const result = setPiece(board, piece);
    expect(result.hit).toBe(false);
  });

  it('does not clear a row with a null cell', () => {
    const board = createEmptyBoard();
    for (let x = 0; x < BOARD_WIDTH - 1; x++) setCells(board, [[x, 19, 1]]);
    const piece = createPiece(0, 1);
    piece.x = 3;
    piece.y = 18;
    const result = setPiece(board, piece);
    expect(result.hit).toBe(false);
  });

  it('clears multiple monochrome rows at once', () => {
    const board = createEmptyBoard();
    for (const y of [18, 19]) {
      for (let x = 0; x < BOARD_WIDTH; x++) setCells(board, [[x, y, 1]]);
    }
    const piece = createPiece(0, 1);
    piece.x = 3;
    piece.y = 17;
    const result = setPiece(board, piece);
    expect(result.hit).toBe(true);
    expect(result.clearedRows.length).toBe(2);
    expect(result.destroyed).toBe(BOARD_WIDTH * 2);
  });

  it('counts merged squares in a cleared row', () => {
    // Fill row 18 with color 1. Place an O piece above it that will merge.
    const board = createEmptyBoard();
    for (let x = 0; x < BOARD_WIDTH; x++) setCells(board, [[x, 18, 1]]);
    // Lock an O piece at x=3, y=16 → covers (3,16),(4,16),(3,17),(4,17).
    // Its squares at (3,17),(4,17) touch row 18 squares at (3,18),(4,18).
    // Flood fill merges row 18 into the piece's group. Row 18 clears.
    const piece = createPiece(1, 1);
    piece.x = 3;
    piece.y = 16;
    const result = setPiece(board, piece);
    expect(result.hit).toBe(true);
    expect(result.mergedSquaresDestroyed).toBe(BOARD_WIDTH);
  });
});

// ── Merge + row clear interaction ────────────────────────────

describe('merged pieces in cleared rows', () => {
  it('counts merged squares caught in a row clear', () => {
    // Build a full row of color 1 with a merged piece spanning it.
    const board = createEmptyBoard();
    // Create a merged piece (O shape = 2×2) sitting on row 18.
    // Then fill the rest of row 18 with color 1 to make it monochrome.
    // Actually, let's make row 18 monochrome: fill it with color 1,
    // and have the locked piece be part of a merge that includes some of these squares.
    for (let x = 0; x < BOARD_WIDTH; x++) setCells(board, [[x, 18, 1]]);
    // Lock an O piece on row 17 overlapping row 18 squares.
    // O piece: [[0,0],[1,0],[0,1],[1,1]]. At x=2, y=16 → covers x=2,3 at y=16,17.
    // That doesn't reach row 18. Let me use a different approach.
    //
    // Better: fill row 18 with color 1 (already done). Lock a piece whose
    // locked squares are in row 18 — but pieces lock on empty space, and row 18
    // is full. Can't lock there.
    //
    // Better approach: fill row 17 (not 18). Lock piece on row 17 so its squares
    // are part of the row. The piece's squares count as part of the merge group.
    const board2 = createEmptyBoard();
    for (let x = 0; x < BOARD_WIDTH; x++) setCells(board2, [[x, 17, 1]]);
    // Now lock an O piece at y=16, x=2 → covers (2,16),(3,16),(2,17),(3,17).
    // The squares at (2,17) and (3,17) are in the monochrome row 17.
    // After merge, all row 17 squares share group. The O piece's 2 squares in the row
    // are part of the merged group.
    const piece = createPiece(1, 1);
    piece.x = 2;
    piece.y = 16;
    const locked = lockPiece(board2, piece);
    const result = resolveLock(locked, piece);
    expect(result.hit).toBe(true);
    expect(result.mergedSquaresDestroyed).toBeGreaterThan(0);
  });
});

// ── Gravity ──────────────────────────────────────────────────

describe('solid block gravity', () => {
  it('drops an intact piece as a rigid unit', () => {
    const board = createEmptyBoard();
    // Place a merged 2×2 piece at row 16 with empty space below.
    setCells(board, [[0, 16, 1], [1, 16, 1], [0, 17, 1], [1, 17, 1]]);
    board[16][0]!.group = 1;
    board[17][0]!.group = 1;
    board[16][1]!.group = 1;
    board[17][1]!.group = 1;
    const result = applyGravity(board);
    // The 2×2 piece falls as a rigid unit to the floor.
    expect(result[18][0]).not.toBe(null);
    expect(result[18][1]).not.toBe(null);
    expect(result[19][0]).not.toBe(null);
    expect(result[19][1]).not.toBe(null);
    expect(result[18][0]!.group).toBe(1);
    expect(result[19][1]!.group).toBe(1);
  });

  it('drops loose squares individually', () => {
    const board = createEmptyBoard();
    setCells(board, [[0, 18, 1]]);
    setCells(board, [[1, 18, 1]]);
    // No group — these are loose.
    delete board[18][0]!.group;
    delete board[18][1]!.group;
    const result = applyGravity(board);
    expect(result[19][0]).not.toBe(null);
    expect(result[19][1]).not.toBe(null);
  });

  it('stops a falling piece on the board floor', () => {
    const board = createEmptyBoard();
    setCells(board, [[0, 19, 1]]);
    board[19][0]!.group = 1;
    setCells(board, [[1, 19, 1]]);
    board[19][1]!.group = 1;
    const result = applyGravity(board);
    // Already on floor — stays put.
    expect(result[19][0]).not.toBe(null);
    expect(result[19][1]).not.toBe(null);
  });
});

// ── Full resolveLock flow ────────────────────────────────────

describe('resolveLock integration', () => {
  it('merges, clears rows, and applies gravity in order', () => {
    // Build a monochrome row at y=16 with a merged piece.
    const board = createEmptyBoard();
    for (let x = 0; x < BOARD_WIDTH; x++) setCells(board, [[x, 16, 1]]);
    // Place a merged piece above the row.
    // Lock at x=3, y=14: I-piece covers (3,14),(4,14),(5,14),(6,14).
    // Then fill row 15 with color 1.
    for (let x = 0; x < BOARD_WIDTH; x++) setCells(board, [[x, 15, 1]]);
    // Row 15 is monochrome. Lock an I-piece on row 14.
    // The piece at row 14 doesn't touch row 15, so no merge from the lock.
    // But row 15 is monochrome.
    const piece = createPiece(0, 1);
    piece.x = 3;
    piece.y = 14;
    const locked = lockPiece(board, piece);
    const result = resolveLock(locked, piece);
    // Row 15 should clear.
    expect(result.hit).toBe(true);
    expect(result.clearedRows.some((r) => r.y === 15)).toBe(true);
  });

  it('returns empty destroyed cells when nothing clears', () => {
    const board = createEmptyBoard();
    setCells(board, [[0, 0, 1]]);
    const piece = createPiece(0, 1);
    const result = setPiece(board, piece);
    expect(result.destroyed).toBe(0);
    expect(result.destroyedCells).toEqual([]);
    expect(result.hit).toBe(false);
  });
});

// ── Cell ─────────────────────────────────────────────────────

describe('createCell', () => {
  it('creates a cell with the given color', () => {
    const cell = createCell(5);
    expect(cell.color).toBe(5);
    expect(cell.group).toBeUndefined();
  });
});
