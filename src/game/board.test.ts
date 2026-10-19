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

/** Squares that are already one merged block, sharing an id. */
function setBlock(board: Board, cells: Array<[number, number]>, color: number) {
  const group = (blockId += 1);
  for (const [x, y] of cells) board[y][x] = { color, group, merged: true };
}

let blockId = 100;

function countGroup(board: Board, group: number | undefined): number {
  let count = 0;
  for (let y = 0; y < BOARD_HEIGHT; y += 1)
    for (let x = 0; x < BOARD_WIDTH; x += 1)
      if (board[y][x]?.group === group) count += 1;
  return count;
}

function setPiece(board: Board, piece: ActivePiece): ResolveResult {
  const locked = lockPiece(board, piece);
  const result = resolveLock(locked, piece.color);
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
    const result = resolveLock(locked, piece.color);
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
    const result = resolveLock(locked, piece.color);
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
    const result = resolveLock(locked, piece.color);
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
    expect(result.stages.reduce((n, s) => n + s.rows.length, 0)).toBe(1);
    expect(result.stages[0]!.rows[0].y).toBe(19);
    expect(result.stages[0]!.rows[0].color).toBe(1);
    // The piece matched the row and became part of it, so the whole of it went: 10 + its own 4.
    expect(result.destroyed).toBe(BOARD_WIDTH + piece.blocks.length);
  });

  it('clears a full row whatever the colours, in the colour that completed it', () => {
    // Row 19 holds eight squares of colour 1; the O piece drops into the last two and fills it.
    const board = createEmptyBoard();
    for (let x = 0; x < 8; x++) setCells(board, [[x, 19, 1]]);
    const piece = createPiece(1, 2);
    piece.x = 8;
    piece.y = 17;
    const result = setPiece(board, piece);
    expect(result.hit).toBe(true);
    // The row's ten squares, plus the two squares stacked above the line: the piece that completed
    // the row is one block reaching into it, so it goes whole.
    expect(result.destroyed).toBe(BOARD_WIDTH + 2);
    // The completing block is colour 2, so everything it takes goes in that colour.
    expect(result.stages[0]!.rows[0].color).toBe(2);
    expect(result.stages[0]!.cells.every((cell) => cell.color === 2)).toBe(true);
  });

  it('clears a row that a fall completes', () => {
    // Row 19 has one hole at x=4 and a loose square parked above it. Nothing clears until that
    // square drops into the hole, and then it is the loose square's colour that sweeps the row.
    const board = createEmptyBoard();
    for (let x = 0; x < BOARD_WIDTH; x++) if (x !== 4) setCells(board, [[x, 19, 1]]);
    setCells(board, [[4, 17, 3]]);
    const piece = createPiece(0, 2);
    piece.x = 0;
    piece.y = 0;
    const result = setPiece(board, piece);
    expect(result.hit).toBe(true);
    expect(result.destroyed).toBe(BOARD_WIDTH);
    expect(result.stages[0]!.rows[0].color).toBe(3);
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
    expect(result.stages.reduce((n, s) => n + s.rows.length, 0)).toBe(2);
    // Twenty row squares, plus the four squares of the piece parked above: it merged into those
    // rows, so they took it with them.
    expect(result.destroyed).toBe(BOARD_WIDTH * 2 + piece.blocks.length);
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
    // The row's ten squares plus the piece's two squares above the line, taken whole with it.
    expect(result.destroyed).toBe(BOARD_WIDTH + 2);
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

// ── A clear takes the whole block ────────────────────────────

describe('a clear takes the whole block', () => {
  it('takes the squares above the row that belong to a block inside it', () => {
    // A merged column of colour 3 stands on the floor. Its floor square lands in the row that
    // completes, so the whole column goes — the two squares above the line with it.
    const board = createEmptyBoard();
    setBlock(board, [[0, 19], [0, 18], [0, 17]], 3);
    for (let x = 1; x <= 7; x += 1) setCells(board, [[x, 19, 1]]);
    const piece = createPiece(1, 2);
    piece.x = 8;
    piece.y = 15;
    const result = setPiece(board, piece);
    expect(result.hit).toBe(true);
    const stage = result.stages[0]!;
    // Ten squares in the row (7 loose + the column's floor square + the piece's two), plus the two
    // squares each of those two blocks had above the line.
    expect(stage.cells.length).toBe(BOARD_WIDTH + 2 + 2);
    for (const [x, y] of [[0, 18], [0, 17]] as const) {
      // Painted in the row's colour while it holds, then gone from the settled board.
      expect(stage.painted[y][x]!.color).toBe(2);
      expect(result.board[y][x]).toBe(null);
    }
    // Only the column squares are worth double; the loose squares and the fresh piece are not.
    expect(stage.cells.filter((cell) => cell.merged).length).toBe(3);
  });

  it('leaves a block alone when none of its squares reach the row', () => {
    // The colour-3 column rests ON the floor row instead of being in it, so it is not taken — it
    // just falls once the row under it goes.
    const board = createEmptyBoard();
    setBlock(board, [[0, 18], [0, 17]], 3);
    for (let x = 0; x <= 7; x += 1) setCells(board, [[x, 19, 1]]);
    const piece = createPiece(1, 2);
    piece.x = 8;
    piece.y = 15;
    const result = setPiece(board, piece);
    expect(result.hit).toBe(true);
    expect(result.stages[0]!.cells.length).toBe(BOARD_WIDTH + 2);
    expect(result.board[19][0]).not.toBe(null);
    expect(result.board[19][0]!.color).toBe(3);
    expect(result.board[17][0]).toBe(null);
  });

  it('takes each square of a block once when two rows clear through it', () => {
    const board = createEmptyBoard();
    setBlock(board, [[0, 19], [0, 18], [0, 17]], 3);
    for (const y of [18, 19]) for (let x = 1; x < BOARD_WIDTH; x += 1) setCells(board, [[x, y, 1]]);
    const piece = createPiece(0, 2);
    piece.x = 3;
    piece.y = 0;
    const result = setPiece(board, piece);
    expect(result.stages.length).toBe(1);
    const stage = result.stages[0]!;
    expect(stage.rows.map((row) => row.y)).toEqual([18, 19]);
    // Twenty row squares plus the one column square above them, with no square counted twice.
    expect(result.destroyed).toBe(BOARD_WIDTH * 2 + 1);
    const keys = stage.cells.map((cell) => `${cell.x},${cell.y}`);
    expect(new Set(keys).size).toBe(keys.length);
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

  it('drops the parts of a broken block separately', () => {
    const board = createEmptyBoard();
    // One block id shared by two parts that no longer touch: a domino on the floor and the
    // other one floating four rows up. They fall on their own, not as one rigid shape.
    setBlock(board, [[1, 19], [2, 19], [1, 17], [2, 17]], 1);

    const result = applyGravity(board);

    expect(result[17][1]).toBe(null);
    expect(result[17][2]).toBe(null);
    expect(result[18][1]?.group).toBe(board[19][1]?.group);
    expect(result[18][2]?.group).toBe(board[19][2]?.group);
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
    // Two rows full of loose squares with a piece parked above them.
    const board = createEmptyBoard();
    for (const y of [15, 16]) for (let x = 0; x < BOARD_WIDTH; x++) setCells(board, [[x, y, 1]]);
    const piece = createPiece(0, 1);
    piece.x = 3;
    piece.y = 14;
    const result = setPiece(board, piece);
    // Loose squares fall first, so both rows reach the bottom and clear from there.
    expect(result.hit).toBe(true);
    expect(result.stages.flatMap((stage) => stage.rows.map((row) => row.y))).toEqual([18, 19]);
    // Nothing of the piece is left: it merged into those rows and went with them.
    expect(result.destroyed).toBe(BOARD_WIDTH * 2 + piece.blocks.length);
    expect(result.board.flat().filter((c) => c !== null).length).toBe(0);
  });

  it('reports the cleared row painted and still standing, so the change can be shown', () => {
    // Eight loose squares in row 19; the O piece drops into the last two holes and completes it.
    const board = createEmptyBoard();
    for (let x = 0; x < 8; x += 1) setCells(board, [[x, 19, 1]]);
    const piece = createPiece(1, 2);
    piece.x = 8;
    piece.y = 17;
    const result = setPiece(board, piece);
    const stage = result.stages[0]!;
    // The snapshot holds the row intact and washed in the completing colour.
    expect(stage.painted[19].every((cell) => cell !== null)).toBe(true);
    expect(stage.painted[19].every((cell) => cell!.color === 2)).toBe(true);
    // The row is gone, and so is the rest of the O piece that completed it — one block, taken whole.
    expect(result.stages.length).toBe(1);
    expect(result.board[19].filter((cell) => cell !== null).length).toBe(0);
  });

  it('marks the cleared squares that belong to a merged block', () => {
    // The floor row is one merged block of ten squares. Every cleared square in it is worth double.
    const board = createEmptyBoard();
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      setCells(board, [[x, 19, 1]]);
      board[19][x]!.group = 7;
      board[19][x]!.merged = true;
    }
    const piece = createPiece(0, 2);
    piece.x = 3;
    piece.y = 0;
    const result = setPiece(board, piece);
    expect(result.stages.length).toBe(1);
    const stage = result.stages[0]!;
    expect(stage.rows[0].y).toBe(19);
    expect(stage.cells.filter((cell) => cell.merged).length).toBe(BOARD_WIDTH);
    expect(stage.cells.every((cell) => cell.color === 2)).toBe(true);
  });

  it('reports which blocks grew during the lock', () => {
    const board = createEmptyBoard();
    setCells(board, [[2, 19, 1]]);
    board[19][2]!.group = 3;
    const piece = createPiece(1, 1);
    piece.x = 3;
    piece.y = 18;
    const locked = lockPiece(board, piece);
    const result = resolveLock(locked, piece.color);
    // The run keeps the lowest id it had, so block 3 swallowed the piece and grew to five squares.
    expect(result.mergedGroups).toEqual([3]);
    expect(countGroup(result.board, 3)).toBe(5);
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
