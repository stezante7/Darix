export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;
export const MIN_RESOLVE = 1;
export const MAX_RESOLVE = 5;
export const POINTS_PER_SQUARE = 10;

export interface Cell {
  color: number;
  resolve: number;
  /** Id of the intact piece this square belongs to; absent once the square is loose. */
  group?: number;
}

export type Board = Array<Array<Cell | null>>;

export interface Point {
  x: number;
  y: number;
}

export interface ActivePiece {
  blocks: Point[];
  resolves: number[];
  x: number;
  y: number;
  color: number;
}

export interface RandomSource {
  (): number;
}

export function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_HEIGHT }, () =>
    Array<Cell | null>(BOARD_WIDTH).fill(null),
  );
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

export function randomResolve(random: RandomSource = Math.random): number {
  return MIN_RESOLVE + Math.floor(random() * (MAX_RESOLVE - MIN_RESOLVE + 1));
}

export function createCell(color: number, random: RandomSource = Math.random): Cell {
  return { color, resolve: randomResolve(random) };
}

export function canPlace(board: Board, piece: ActivePiece, x = piece.x, y = piece.y): boolean {
  return piece.blocks.every((block) => {
    const boardX = x + block.x;
    const boardY = y + block.y;
    return (
      boardX >= 0 &&
      boardX < BOARD_WIDTH &&
      boardY >= 0 &&
      boardY < BOARD_HEIGHT &&
      board[boardY][boardX] === null
    );
  });
}

let nextGroupId = 1;

export function lockPiece(
  board: Board,
  piece: ActivePiece,
  random: RandomSource = Math.random,
): Board {
  const locked = cloneBoard(board);
  const group = nextGroupId;
  nextGroupId += 1;
  for (const [index, block] of piece.blocks.entries()) {
    locked[piece.y + block.y][piece.x + block.x] = {
      color: piece.color,
      resolve: piece.resolves[index] ?? randomResolve(random),
      group,
    };
  }
  return locked;
}

function key(x: number, y: number): string {
  return `${x},${y}`;
}

const DIRECTIONS: Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

function getSameColorContacts(
  board: Board,
  before: Board,
  candidateCells: Point[] = [],
  landingPieceCells: Point[] = [],
): Array<[Point, Point]> {
  const candidates = new Set(candidateCells.map((point) => key(point.x, point.y)));
  const landingPiece = new Set(landingPieceCells.map((point) => key(point.x, point.y)));
  const contacts: Array<[Point, Point]> = [];

  for (let y = 0; y < BOARD_HEIGHT; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      const cell = board[y][x];
      if (!cell) continue;

      for (const direction of DIRECTIONS) {
        const otherX = x + direction.x;
        const otherY = y + direction.y;
        if (otherX < 0 || otherX >= BOARD_WIDTH || otherY < 0 || otherY >= BOARD_HEIGHT) continue;
        const other = board[otherY][otherX];
        if (!other || other.color !== cell.color || (direction.x < 0 || direction.y < 0)) continue;

        // The cells inside one tetromino already touch before it locks.
        if (landingPiece.has(key(x, y)) && landingPiece.has(key(otherX, otherY))) continue;

        const isCandidateContact = candidates.size === 0 ||
          candidates.has(key(x, y)) || candidates.has(key(otherX, otherY));
        if (!isCandidateContact) continue;

        const wasContact = before[y][x]?.color === cell.color && before[otherY][otherX]?.color === other.color;
        if (!wasContact) contacts.push([{ x, y }, { x: otherX, y: otherY }]);
      }
    }
  }

  return contacts;
}

function applyContacts(board: Board, contacts: Array<[Point, Point]>): Set<string> {
  const affected = new Set<string>();
  for (const [first, second] of contacts) {
    const firstCell = board[first.y][first.x];
    const secondCell = board[second.y][second.x];
    if (firstCell) {
      firstCell.resolve -= 1;
      affected.add(key(first.x, first.y));
    }
    if (secondCell) {
      secondCell.resolve -= 1;
      affected.add(key(second.x, second.y));
    }
  }
  return affected;
}

export interface DestroyedCell extends Point {
  color: number;
}

function destroyResolved(board: Board): DestroyedCell[] {
  const destroyed: DestroyedCell[] = [];
  for (let y = 0; y < BOARD_HEIGHT; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      const cell = board[y][x];
      if (cell && cell.resolve <= 0) {
        board[y][x] = null;
        destroyed.push({ x, y, color: cell.color });
      }
    }
  }
  return destroyed;
}

/** Turns every complete row the given color and returns the recolored row indexes. */
function recolorFullRows(board: Board, color: number): number[] {
  const rows: number[] = [];
  for (const [y, row] of board.entries()) {
    if (!row.every((cell) => cell !== null)) continue;
    for (const cell of row) if (cell) cell.color = color;
    rows.push(y);
  }
  return rows;
}

/** Breaks every intact piece that takes part in a contact into loose squares, and reports those squares. */
function loosenContactPieces(board: Board, contacts: Array<[Point, Point]>): DestroyedCell[] {
  const groups = new Set<number>();
  for (const point of contacts.flat()) {
    const group = board[point.y][point.x]?.group;
    if (group !== undefined) groups.add(group);
  }
  const loosened: DestroyedCell[] = [];
  if (groups.size === 0) return loosened;
  for (let y = 0; y < BOARD_HEIGHT; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      const cell = board[y][x];
      if (cell?.group === undefined || !groups.has(cell.group)) continue;
      delete cell.group;
      loosened.push({ x, y, color: cell.color });
    }
  }
  return loosened;
}

/** Squares that fall together: a loose square alone, or a connected run of squares from one intact piece. */
function fallingUnits(board: Board): Point[][] {
  const seen = new Set<string>();
  const units: Point[][] = [];
  for (let y = 0; y < BOARD_HEIGHT; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      const cell = board[y][x];
      if (!cell || seen.has(key(x, y))) continue;
      seen.add(key(x, y));
      const unit: Point[] = [{ x, y }];
      if (cell.group !== undefined) {
        for (let index = 0; index < unit.length; index += 1) {
          for (const direction of DIRECTIONS) {
            const nextX = unit[index].x + direction.x;
            const nextY = unit[index].y + direction.y;
            if (nextX < 0 || nextX >= BOARD_WIDTH || nextY < 0 || nextY >= BOARD_HEIGHT) continue;
            if (seen.has(key(nextX, nextY)) || board[nextY][nextX]?.group !== cell.group) continue;
            seen.add(key(nextX, nextY));
            unit.push({ x: nextX, y: nextY });
          }
        }
      }
      units.push(unit);
    }
  }
  return units;
}

/**
 * Drops every unsupported unit until the board settles. Loose squares fall on their own;
 * intact pieces fall rigidly until any of their squares is supported.
 */
export function applyGravity(board: Board): Board {
  const settled = createEmptyBoard();
  for (let y = 0; y < BOARD_HEIGHT; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      const cell = board[y][x];
      if (cell && cell.resolve > 0) settled[y][x] = { ...cell };
    }
  }

  let moved = true;
  while (moved) {
    moved = false;
    const units = fallingUnits(settled).sort(
      (a, b) => Math.max(...b.map((point) => point.y)) - Math.max(...a.map((point) => point.y)),
    );
    for (const unit of units) {
      const own = new Set(unit.map((point) => key(point.x, point.y)));
      const canFall = () => unit.every((point) =>
        point.y + 1 < BOARD_HEIGHT &&
        (settled[point.y + 1][point.x] === null || own.has(key(point.x, point.y + 1))),
      );
      while (canFall()) {
        const cells = unit.map((point) => settled[point.y][point.x]);
        for (const point of unit) settled[point.y][point.x] = null;
        own.clear();
        for (const [index, point] of unit.entries()) {
          point.y += 1;
          settled[point.y][point.x] = cells[index];
          own.add(key(point.x, point.y));
        }
        moved = true;
      }
    }
  }
  return settled;
}

export interface ResolveResult {
  board: Board;
  destroyed: number;
  destroyedCells: DestroyedCell[];
  sameColorDestroyed: boolean;
  /** Squares whose piece broke apart, at the positions where it broke (before falling). */
  loosenedCells: DestroyedCell[];
  /** The lock made a new same-color contact or completed a row. */
  hit: boolean;
  /** Rows that were completed and turned the landing piece's color. */
  recoloredRows: number[];
  /** The color complete rows turned, when any did. */
  rowColor?: number;
}

export function resolveLock(
  board: Board,
  beforeLock: Board,
  lockedPieceCells: Point[],
): ResolveResult {
  const resolved = cloneBoard(board);
  // A completed row takes the landing piece's color, so it then resolves like one big color match.
  const landingColor = lockedPieceCells.length > 0
    ? resolved[lockedPieceCells[0].y][lockedPieceCells[0].x]?.color
    : undefined;
  const recoloredRows = landingColor === undefined ? [] : recolorFullRows(resolved, landingColor);
  const rowCells = recoloredRows.flatMap((y) => Array.from({ length: BOARD_WIDTH }, (_, x) => ({ x, y })));
  const contacts = getSameColorContacts(resolved, beforeLock, [...lockedPieceCells, ...rowCells], lockedPieceCells);
  // Only a color match breaks pieces into loose squares: the landing piece and the pieces it touched.
  const loosenedOnLock = loosenContactPieces(resolved, contacts);
  const contactAffected = applyContacts(resolved, contacts);

  const destroyedBeforeGravity = destroyResolved(resolved);
  const sameColorDestroyedBeforeGravity = destroyedBeforeGravity.some((cell) =>
    contactAffected.has(key(cell.x, cell.y)),
  );
  const fallen = applyGravity(resolved);

  // A fall can create a new adjacency. Resolve each such adjacency once.
  const gravityContacts = getSameColorContacts(fallen, resolved);
  const loosenedAfterGravity = loosenContactPieces(fallen, gravityContacts);
  const gravityContactAffected = applyContacts(fallen, gravityContacts);
  const destroyedAfterGravity = destroyResolved(fallen);
  const sameColorDestroyedAfterGravity = destroyedAfterGravity.some((cell) =>
    gravityContactAffected.has(key(cell.x, cell.y)),
  );
  const destroyedCells = [...destroyedBeforeGravity, ...destroyedAfterGravity];

  return {
    board: applyGravity(fallen),
    destroyed: destroyedCells.length,
    destroyedCells,
    sameColorDestroyed: sameColorDestroyedBeforeGravity || sameColorDestroyedAfterGravity,
    loosenedCells: [...loosenedOnLock, ...loosenedAfterGravity],
    hit: contacts.length > 0 || gravityContacts.length > 0 || recoloredRows.length > 0,
    recoloredRows,
    rowColor: recoloredRows.length > 0 ? landingColor : undefined,
  };
}

export function rotateBlocks(blocks: Point[]): Point[] {
  const rotated = blocks.map((block) => ({ x: -block.y, y: block.x }));
  const minX = Math.min(...rotated.map((block) => block.x));
  const minY = Math.min(...rotated.map((block) => block.y));
  return rotated.map((block) => ({ x: block.x - minX, y: block.y - minY }));
}

export const SHAPES: Point[][] = [
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
  [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
  [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
  [{ x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
  [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
];

export function createPiece(shapeIndex: number, color: number, random: RandomSource = Math.random): ActivePiece {
  const blocks = SHAPES[shapeIndex % SHAPES.length].map((block) => ({ ...block }));
  return {
    blocks,
    resolves: blocks.map(() => randomResolve(random)),
    x: 3,
    y: 0,
    color,
  };
}
