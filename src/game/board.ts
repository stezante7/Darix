export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;
/** A connected same-color group of this many squares pops when a piece lands on it. */
export const POP_GROUP_SIZE = 4;
export const POINTS_PER_SQUARE = 10;

export interface Cell {
  color: number;
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
  /** The piece's single color, shared by every block. */
  color: number;
  x: number;
  y: number;
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

export function createCell(color: number): Cell {
  return { color };
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
): Board {
  const locked = cloneBoard(board);
  const group = nextGroupId;
  nextGroupId += 1;
  for (const block of piece.blocks) {
    locked[piece.y + block.y][piece.x + block.x] = {
      color: piece.color,
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

/**
 * Finds every connected same-color group that contains one of `seeds` and holds at least
 * POP_GROUP_SIZE squares. A group is reported once, however many seeds fall inside it.
 * Squares listed in `excluded` (the piece that just landed) still connect the group and pop with
 * it, but don't count towards its size: a piece can complete a group, never clear itself.
 */
export function findColorGroups(board: Board, seeds: Point[], excluded: Point[] = []): Point[][] {
  const seedSet = new Set(seeds.map((point) => key(point.x, point.y)));
  const skip = new Set(excluded.map((point) => key(point.x, point.y)));
  const seen = new Set<string>();
  const groups: Point[][] = [];

  for (const seed of seeds) {
    if (!seedSet.has(key(seed.x, seed.y))) continue;
    const start = board[seed.y]?.[seed.x];
    if (!start || seen.has(key(seed.x, seed.y))) continue;

    const group: Point[] = [{ x: seed.x, y: seed.y }];
    let counted = skip.has(key(seed.x, seed.y)) ? 0 : 1;
    seen.add(key(seed.x, seed.y));
    for (let index = 0; index < group.length; index += 1) {
      for (const direction of DIRECTIONS) {
        const x = group[index].x + direction.x;
        const y = group[index].y + direction.y;
        if (x < 0 || x >= BOARD_WIDTH || y < 0 || y >= BOARD_HEIGHT) continue;
        if (seen.has(key(x, y))) continue;
        const cell = board[y][x];
        if (!cell || cell.color !== start.color) continue;
        seen.add(key(x, y));
        group.push({ x, y });
        if (!skip.has(key(x, y))) counted += 1;
      }
    }
    if (counted >= POP_GROUP_SIZE) groups.push(group);
  }
  return groups;
}

/** A popped square, or a square whose piece broke apart, at the position where it happened. */
export interface DestroyedCell extends Point {
  color: number;
}

interface PopResult {
  popped: DestroyedCell[];
  loosened: DestroyedCell[];
}

/** Removes groups of POP_GROUP_SIZE or more, breaking any intact piece caught in one into loose squares. */
function popGroups(board: Board, seeds: Point[], excluded: Point[] = []): PopResult {
  const popped: DestroyedCell[] = [];
  const loosened: DestroyedCell[] = [];

  for (const group of findColorGroups(board, seeds, excluded)) {
    // Break the pieces caught in the pop first, so their remaining squares fall as loose ones.
    loosened.push(...loosenPiecesInGroups(board, group));
    for (const point of group) {
      const cell = board[point.y][point.x];
      if (!cell) continue;
      board[point.y][point.x] = null;
      popped.push({ ...point, color: cell.color });
    }
  }

  return { popped, loosened };
}

export interface RecoloredRow {
  y: number;
  color: number;
  /** The squares that took the new color: the run the landing piece touched, not the whole row. */
  cells: Point[];
}

/**
 * When a lock completes a row, the same-color run the landing piece touched takes the landing
 * piece's color, so that run then pops as one bigger group. Squares elsewhere in the row keep
 * their own color. A row already all in the landing color gains nothing, so it is not reported.
 */
function recolorFullRows(board: Board, beforeLock: Board, landingPieceCells: Point[]): RecoloredRow[] {
  const rows: RecoloredRow[] = [];
  for (const [y, row] of board.entries()) {
    if (!row.every((cell) => cell !== null)) continue;
    const touched = landingPieceCells.filter((point) => point.y === y);
    const landingCell = touched[0] ?? landingPieceCells[0];
    const color = board[landingCell.y]?.[landingCell.x]?.color;
    if (color === undefined) continue;

    // Grow the run the landing squares joined, outwards while the color matches.
    const run = new Map<string, Point>();
    for (const point of touched.length > 0 ? touched : [landingCell]) {
      const own = board[point.y][point.x];
      if (!own || own.color !== color) continue;
      run.set(key(point.x, point.y), { x: point.x, y: point.y });
      for (const direction of [{ x: -1, y: 0 }, { x: 1, y: 0 }]) {
        let x = point.x;
        for (;;) {
          x += direction.x;
          if (x < 0 || x >= BOARD_WIDTH || board[y][x]?.color !== color) break;
          run.set(key(x, y), { x, y });
        }
      }
    }
    // Only squares that were another color before actually change, so a monochrome row is a no-op.
    const cells = [...run.values()].filter(({ x }) => beforeLock[y]?.[x]?.color !== color);
    if (cells.length === 0) continue;
    rows.push({ y, color, cells });
  }
  return rows;
}

/** Breaks every intact piece caught in a pop into loose squares, and reports those squares. */
function loosenPiecesInGroups(board: Board, points: Point[]): DestroyedCell[] {
  const groups = new Set<number>();
  for (const point of points) {
    const group = board[point.y][point.x]?.group;
    if (group !== undefined) groups.add(group);
  }
  const loosened: DestroyedCell[] = [];
  if (groups.size === 0) return loosened;  for (let y = 0; y < BOARD_HEIGHT; y += 1) {
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
 * Drops every unsupported unit in place until the board settles. Loose squares fall on their own;
 * intact pieces fall rigidly until any of their squares is supported.
 */
function settleUnits(board: Board): void {
  let moved = true;
  while (moved) {
    moved = false;
    const units = fallingUnits(board).sort(
      (a, b) => Math.max(...b.map((point) => point.y)) - Math.max(...a.map((point) => point.y)),
    );
    for (const unit of units) {
      const own = new Set(unit.map((point) => key(point.x, point.y)));
      const canFall = () => unit.every((point) =>
        point.y + 1 < BOARD_HEIGHT &&
        (board[point.y + 1][point.x] === null || own.has(key(point.x, point.y + 1))),
      );
      while (canFall()) {
        const cells = unit.map((point) => board[point.y][point.x]);
        for (const point of unit) board[point.y][point.x] = null;
        own.clear();
        for (const [index, point] of unit.entries()) {
          point.y += 1;
          board[point.y][point.x] = cells[index];
          own.add(key(point.x, point.y));
        }
        moved = true;
      }
    }
  }
}

/** Returns a settled copy of the board. */
export function applyGravity(board: Board): Board {
  const settled = cloneBoard(board);
  settleUnits(settled);
  return settled;
}

export interface ResolveResult {
  board: Board;
  destroyed: number;
  destroyedCells: DestroyedCell[];
  sameColorDestroyed: boolean;
  /** Squares whose piece broke apart, at the positions where it broke (before falling). */
  loosenedCells: DestroyedCell[];
  /** The lock popped a color group or completed a row. */
  hit: boolean;
  /** Rows that were completed and turned the landing piece's color. */
  recoloredRows: RecoloredRow[];
}

/** How many times one lock keeps checking for new groups as squares fall. */
const MAX_POP_PASSES = 8;

export function resolveLock(
  board: Board,
  beforeLock: Board,
  lockedPieceCells: Point[],
): ResolveResult {
  const resolved = cloneBoard(board);
  // A completed row paints the run it touched with the landing color, so that run pops as one group.
  const recoloredRows = lockedPieceCells.length > 0 ? recolorFullRows(resolved, beforeLock, lockedPieceCells) : [];
  const paintedCells = recoloredRows.flatMap(({ cells }) => cells);
  for (const { y, color, cells } of recoloredRows) {
    for (const { x } of cells) {
      const cell = resolved[y][x];
      if (cell) cell.color = color;
    }
  }

  const destroyedCells: DestroyedCell[] = [];
  const loosenedCells: DestroyedCell[] = [];
  let hitAnyPop = false;
  // The squares the player just placed don't count towards a group size; colors already on the
  // board do. Squares a completed row just painted were already there, so they always count.
  const existingOnFirstPass = new Set<string>();
  for (const point of [...lockedPieceCells, ...paintedCells]) {
    if (beforeLock[point.y]?.[point.x]) existingOnFirstPass.add(key(point.x, point.y));
  }
  let excluded = lockedPieceCells.filter((point) => !existingOnFirstPass.has(key(point.x, point.y)));

  // Seed on the squares this lock actually touched: the landing piece and any painted run.
  let seeds = [...lockedPieceCells, ...paintedCells].filter((point) => resolved[point.y][point.x] !== null);

  for (let pass = 0; pass < MAX_POP_PASSES && seeds.length > 0; pass += 1) {
    const pop = popGroups(resolved, seeds, excluded);
    if (pop.popped.length === 0) break;
    hitAnyPop = true;
    destroyedCells.push(...pop.popped);
    loosenedCells.push(...pop.loosened);
    // Only the first pass is a deliberate placement; everything after is falls and chains.
    excluded = [];

    // Everything above the holes falls; only squares the fall brought into first-time contact
    // with their own color can pop again. An intact piece that just falls does not pop itself.
    const beforeFall = positionsOf(resolved);
    settleUnits(resolved);
    seeds = newConnections(resolved, beforeFall);
  }

  return {
    board: applyGravity(resolved),
    destroyed: destroyedCells.length,
    destroyedCells,
    sameColorDestroyed: hitAnyPop,
    loosenedCells,
    hit: hitAnyPop || recoloredRows.length > 0,
    recoloredRows,
  };
}

/** Where each square on the board sits right now; squares keep their identity when they fall. */
function positionsOf(board: Board): Map<Cell, Point> {
  const positions = new Map<Cell, Point>();
  for (let y = 0; y < BOARD_HEIGHT; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      const cell = board[y][x];
      if (cell) positions.set(cell, { x, y });
    }
  }
  return positions;
}

/**
 * Squares that the fall just brought into contact with their own color for the first time: the
 * square moved, its neighbour shares its color, and the two were not touching before the fall.
 * These are the only seeds for further pops; squares that merely fell are left alone.
 */
function newConnections(board: Board, before: Map<Cell, Point>): Point[] {
  const points: Point[] = [];
  for (let y = 0; y < BOARD_HEIGHT; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      const cell = board[y][x];
      if (!cell) continue;
      const was = before.get(cell);
      if (!was || (was.x === x && was.y === y)) continue;
      for (const direction of DIRECTIONS) {
        const nx = x + direction.x;
        const ny = y + direction.y;
        if (nx < 0 || nx >= BOARD_WIDTH || ny < 0 || ny >= BOARD_HEIGHT) continue;
        const other = board[ny][nx];
        if (!other || other.color !== cell.color) continue;
        const otherWas = before.get(other);
        if (!otherWas) continue;
        const touchedBefore = Math.abs(was.x - otherWas.x) + Math.abs(was.y - otherWas.y) === 1;
        if (touchedBefore) continue;
        points.push({ x, y }, { x: nx, y: ny });
      }
    }
  }
  return points;
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

/** Creates a piece in one color; rotation advances that color. */
export function createPiece(
  shapeIndex: number,
  color: number,
): ActivePiece {
  const blocks = SHAPES[shapeIndex % SHAPES.length].map((block) => ({ ...block }));
  return {
    blocks,
    color,
    x: 3,
    y: 0,
  };
}
