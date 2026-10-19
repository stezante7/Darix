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

/** Adjacent same-color squares that are still in separate blocks. Should always be zero. */
function strayPairs(board: Board): number {
  let strays = 0;
  for (let y = 0; y < BOARD_HEIGHT; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      const cell = board[y][x];
      if (!cell) continue;
      for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
        const other = board[y + dy]?.[x + dx];
        if (other && other.color === cell.color && other.group !== cell.group) strays += 1;
      }
    }
  }
  return strays;
}

function countGroup(board: Board, group: number | undefined): number {
  let count = 0;
  for (let y = 0; y < BOARD_HEIGHT; y += 1)
    for (let x = 0; x < BOARD_WIDTH; x += 1)
      if (board[y][x]?.group === group) count += 1;
  return count;
}

function setPiece(board: Board, piece: ActivePiece): ResolveResult {
  const locked = lockPiece(board, piece);
  const result = resolveLock(locked);
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
    const result = resolveLock(locked);
    // The two board squares joined the piece's block, so the merge is worth 2.
    expect(result.mergedSquares).toBe(2);
    expect(countGroup(result.board, locked[18][3]!.group)).toBe(6);
    expect(strayPairs(result.board)).toBe(0);
  });

  it('only merges the squares that share the piece colour', () => {
    const board = createEmptyBoard();
    setCells(board, [[2, 18, 1], [7, 18, 2]]);
    const piece = createPiece(0, 1);
    piece.x = 3;
    piece.y = 18;
    const locked = lockPiece(board, piece);
    const result = resolveLock(locked);
    // (2,18) is the same colour and joins; (7,18) is a different colour and does not.
    expect(result.mergedSquares).toBe(1);
    expect(countGroup(result.board, locked[18][3]!.group)).toBe(5);
    expect(strayPairs(result.board)).toBe(0);
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
    const result = resolveLock(locked);
    // 1 board square merged with the 4-piece block.
    expect(result.mergedSquares).toBe(1);
    expect(countGroup(result.board, locked[18][3]!.group)).toBe(5);
    expect(strayPairs(result.board)).toBe(0);
  });

  it('makes only a merged block solid', () => {
    const board = createEmptyBoard();
    setCells(board, [[2, 18, 1]]);
    const piece = createPiece(0, 1);
    piece.x = 3;
    piece.y = 18;
    const merged = setPiece(board, piece);
    expect(merged.board[19][2]!.merged).toBe(true);
    expect(merged.board[19][3]!.merged).toBe(true);

    // A piece that lands without touching its own colour stays separate squares.
    const alone = setPiece(createEmptyBoard(), createPiece(0, 1));
    expect(alone.board[19][3]!.merged).toBeUndefined();
  });

  it('does not merge when there is no same-color contact', () => {
    const board = createEmptyBoard();
    setCells(board, [[8, 18, 1]]);
    const piece = createPiece(0, 1);
    const result = setPiece(board, piece);
    expect(result.mergedSquares).toBe(0);
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
    expect(result.mergedSquares).toBe(BOARD_WIDTH);
  });
});

// ── Merge + row clear interaction ────────────────────────────

describe('merged blocks in cleared rows', () => {
  it('reports the squares that joined a block when a row closes', () => {
    // Row 17 is full of colour 1 except for the two gaps the O piece drops into,
    // so the piece both closes the row and merges with the rest of it.
    const board = createEmptyBoard();
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      if (x === 2 || x === 3) continue;
      setCells(board, [[x, 17, 1]]);
    }
    const piece = createPiece(1, 1);
    piece.x = 2;
    piece.y = 16;
    const result = setPiece(board, piece);
    expect(result.hit).toBe(true);
    expect(result.destroyed).toBe(BOARD_WIDTH);
    // The other eight squares of the row joined the piece's block.
    expect(result.mergedSquares).toBe(BOARD_WIDTH - 2);
  });

  it('merges same-color blocks that touch with no piece involved', () => {
    // Two separate blocks of one colour already touching on the board.
    const board = createEmptyBoard();
    setCells(board, [[0, 19, 1], [1, 19, 1]]);
    board[19][0]!.group = 5;
    board[19][1]!.group = 6;
    // A monochrome row above clears on the next lock, whatever that piece is.
    for (let x = 0; x < BOARD_WIDTH; x += 1) setCells(board, [[x, 18, 2]]);
    const piece = createPiece(0, 3);
    piece.x = 3;
    piece.y = 16;
    const result = setPiece(board, piece);
    expect(result.hit).toBe(true);
    expect(result.destroyed).toBe(BOARD_WIDTH);
    // The two touching blocks became one, so one square changed block.
    expect(result.mergedSquares).toBe(1);
    expect(strayPairs(result.board)).toBe(0);
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
    const result = resolveLock(locked);
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
