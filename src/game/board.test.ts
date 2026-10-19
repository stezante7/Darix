import { describe, expect, it } from 'vitest';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  POP_GROUP_SIZE,
  applyGravity,
  createEmptyBoard,
  createPiece,
  findColorGroups,
  lockPiece,
  resolveLock,
  rotateBlocks,
} from './board';
import { dropIntervalForSpeed, nextSpeed } from './speed';

type Boardish = Parameters<typeof lockPiece>[0];

function pieceCells(piece: ReturnType<typeof createPiece>) {
  return piece.blocks.map((block) => ({ x: piece.x + block.x, y: piece.y + block.y }));
}

function settle(board: Boardish, piece: ReturnType<typeof createPiece>) {
  return resolveLock(lockPiece(board, piece), board, pieceCells(piece));
}

/** A grey floor with a hole at column 7, and red squares wherever `reds` says. */
function floorWithReds(reds: Array<[number, number]>) {
  const board = createEmptyBoard();
  for (let x = 0; x < BOARD_WIDTH; x += 1) if (x !== 7) board[19][x] = { color: 0 };
  for (const [x, y] of reds) board[y][x] = { color: 1 };
  return board;
}

/** The red O piece dropping into the column-7 hole, its left squares touching the waiting reds. */
function bridgingO() {
  const piece = createPiece(1, 1);
  piece.x = 6;
  piece.y = 17;
  return piece;
}

describe('Darix board rules', () => {
  it('uses the classic ten by twenty playfield', () => {
    expect(createEmptyBoard()).toHaveLength(BOARD_HEIGHT);
    expect(createEmptyBoard()[0]).toHaveLength(BOARD_WIDTH);
  });

  it('pops a group once four squares already on the board are connected', () => {
    // Four waiting reds: three along row 18 and one above; the red O bridges them through the hole.
    const result = settle(floorWithReds([[3, 18], [4, 18], [5, 18], [5, 17]]), bridgingO());

    expect(result.destroyed).toBeGreaterThanOrEqual(POP_GROUP_SIZE);
    expect(result.sameColorDestroyed).toBe(true);
    expect(result.hit).toBe(true);
    for (const cell of result.destroyedCells) {
      expect(result.board[cell.y][cell.x]).toBeNull();
    }
  });

  it('keeps a landing piece that cannot complete a group, even when it is four of a kind', () => {
    // A whole red O piece lands on an empty floor: its own squares never count towards the threshold.
    const result = settle(floorWithReds([]), bridgingO());

    expect(result.destroyed).toBe(0);
    expect(result.hit).toBe(false);
    // The piece stays intact as its own shape.
    expect(result.board[17][6]?.group).toBeDefined();
  });

  it('keeps a group that only reaches the threshold through the landing piece', () => {
    // Three waiting reds plus the landing piece's touching squares: only three count, so no pop.
    const result = settle(floorWithReds([[3, 18], [4, 18], [5, 18]]), bridgingO());

    expect(result.destroyed).toBe(0);
    expect(result.board[18][3]?.color).toBe(1);
  });

  it('does not pop a group that was already complete before the lock', () => {
    // Four reds are already connected, but an unrelated piece lands clear of them.
    const piece = createPiece(1, 2);
    piece.x = 0;
    piece.y = 17;

    const result = settle(floorWithReds([[2, 18], [3, 18], [4, 18], [5, 18]]), piece);

    expect(result.destroyed).toBe(0);
    expect(result.board[18][3]?.color).toBe(1);
  });

  it('breaks both the landing piece and the intact piece caught in a pop into loose squares', () => {
    const before = floorWithReds([[3, 18], [4, 18], [5, 18]]);
    // The red above the waiting row belongs to an intact piece; the pop catches both alike.
    // (9001 is an id the piece counter never reaches, so this piece stays distinct in tests.)
    before[17][5] = { color: 1, group: 9001 };

    const result = settle(before, bridgingO());

    expect(result.destroyed).toBeGreaterThanOrEqual(POP_GROUP_SIZE);
    expect(result.loosenedCells.some((cell) => cell.x === 5 && cell.y === 17)).toBe(true);
    expect(result.loosenedCells.some((cell) => cell.x === 6 && cell.y === 17)).toBe(true);
  });

  it('drops columns into the gaps a pop leaves', () => {
    const before = floorWithReds([[3, 18], [4, 18], [5, 18], [5, 17]]);
    before[16][4] = { color: 2 };

    const result = settle(before, bridgingO());

    expect(result.destroyedCells.length).toBeGreaterThanOrEqual(POP_GROUP_SIZE);
    // Nothing is left hanging in mid-air anywhere on the board; squares may legally fall into
    // the positions a pop emptied, so only the floating check applies.
    for (let y = 0; y < BOARD_HEIGHT - 1; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        if (result.board[y][x]) {
          expect(result.board[y + 1][x], `square floating at ${x},${y}`).not.toBeNull();
        }
      }
    }
  });

  it('drops an intact piece as one rigid unit when its support is destroyed', () => {
    const board = floorWithReds([[3, 18], [4, 18], [5, 18], [5, 17]]);
    // A cyan O resting on the waiting reds; when they pop, it falls as one intact unit.
    for (const [x, y] of [[3, 16], [4, 16], [3, 17], [4, 17]] as Array<[number, number]>) {
      board[y][x] = { color: 2, group: 9001 };
    }

    const result = settle(board, bridgingO());

    expect(result.destroyedCells.length).toBeGreaterThanOrEqual(POP_GROUP_SIZE);
    // The cyan O fell rigidly and stayed intact: four squares, still one piece, two rows lower.
    const squares = result.board.flat().filter((cell) => cell?.group === 9001);
    expect(squares).toHaveLength(4);
    const rows = new Set(
      result.board.flatMap((row, y) => row.map((cell) => (cell?.group === 9001 ? y : -1)).filter((y) => y >= 0)),
    );
    expect([...rows]).toEqual([17, 18]);
  });

  it('pops a chain when a fall brings a piece next to its own color', () => {
    const board = floorWithReds([[4, 18], [5, 18], [5, 17], [5, 19], [2, 17], [2, 18], [2, 19]]);
    // An intact red O above, unconnected: after the pop it falls and lands next to the col-2 trio.
    for (const [x, y] of [[3, 15], [4, 15], [3, 16], [4, 16]] as Array<[number, number]>) {
      board[y][x] = { color: 1, group: 9001 };
    }

    const result = settle(board, bridgingO());

    // First the four waiting reds pop with the landing piece, then the fallen O pops with the trio.
    expect(result.destroyed).toBe(15);
    expect(result.board[17][2]).toBeNull();
    expect(result.board[19][2]).toBeNull();
  });

  it('does not chain-pop a piece that only falls without touching its color', () => {
    const board = floorWithReds([[3, 18], [4, 18], [5, 18], [5, 17], [3, 19], [4, 19]]);
    // A cyan O resting on the reds: it falls into the holes after the pop but touches no cyan.
    for (const [x, y] of [[3, 15], [4, 15], [3, 16], [4, 16]] as Array<[number, number]>) {
      board[y][x] = { color: 2, group: 9001 };
    }

    const result = settle(board, bridgingO());

    // The pop took the reds; the cyan O fell and stayed. No meltdown.
    expect(result.destroyed).toBe(10);
    const squares = result.board.flat().filter((cell) => cell?.group === 9001);
    expect(squares).toHaveLength(4);
  });

  it('reports groups of at least four squares through findColorGroups', () => {
    const board = createEmptyBoard();
    board[19][2] = { color: 4 };
    board[19][3] = { color: 4 };
    board[18][3] = { color: 4 };
    board[17][3] = { color: 4 };
    board[19][4] = { color: 5 };

    const groups = findColorGroups(board, [{ x: 2, y: 19 }]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(4);
  });

  it('does not report a group below the threshold', () => {
    const board = createEmptyBoard();
    board[19][2] = { color: 4 };
    board[19][3] = { color: 4 };
    board[18][3] = { color: 4 };

    expect(findColorGroups(board, [{ x: 2, y: 19 }])).toEqual([]);
  });

  it('drops a lone square down into empty space', () => {
    const board = createEmptyBoard();
    board[18][0] = { color: 3 };

    const fallen = applyGravity(board);

    expect(fallen[19][0]?.color).toBe(3);
    expect(fallen[18][0]).toBeNull();
  });

  it('paints only the touched run when a lock completes a row', () => {
    const before = createEmptyBoard();
    for (let x = 2; x < BOARD_WIDTH; x += 1) before[19][x] = { color: 2 + (x % 2), group: 50 + x };
    // A red O completes row 19 at columns 0-1.
    const piece = createPiece(1, 1);
    piece.x = 0;
    piece.y = 18;

    const result = settle(before, piece);

    // The landing run turned red; the rest of the row kept its own colors.
    expect(result.recoloredRows).toEqual([{ y: 19, color: 1, cells: [{ x: 0, y: 19 }, { x: 1, y: 19 }] }]);
    expect(result.board[19][2]?.color).toBe(2);
    expect(result.board[19][9]?.color).toBe(3);
    // Two painted squares plus the landing piece are below the threshold, so nothing pops.
    expect(result.destroyed).toBe(0);
    expect(result.hit).toBe(true);
  });

  it('does not recolor a row that is already all in the landing color', () => {
    const before = createEmptyBoard();
    for (let x = 0; x < BOARD_WIDTH; x += 1) before[19][x] = { color: 1 };
    // A red O lands on the full red floor, completing a row that cannot change color.
    const piece = createPiece(1, 1);
    piece.x = 3;
    piece.y = 18;

    const result = settle(before, piece);

    expect(result.recoloredRows).toEqual([]);
    // The floor's ten reds were already connected, so landing on them pops them.
    expect(result.destroyed).toBe(12);
    expect(result.hit).toBe(true);
  });

  it('rotates a piece and normalizes it back to a positive origin', () => {
    const rotated = rotateBlocks([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]);
    expect(rotated).toEqual([{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]);
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

  it('creates pieces in a single color', () => {
    const piece = createPiece(0, 3);
    expect(piece.color).toBe(3);
    expect(piece.blocks).toHaveLength(4);
  });
});
