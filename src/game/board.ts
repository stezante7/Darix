export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;
export const POINTS_PER_SQUARE = 10;

export interface Cell {
  color: number;
  /** Id of the merged piece this square belongs to; absent once the square is loose. */
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
 * When a piece locks, finds all same-color squares connected to the locked piece's
 * squares and merges them into a single solid block (one group ID).
 * Returns the count of squares added to the merge (from the board, not the piece).
 */
function mergeSameColor(board: Board, piece: ActivePiece): number {
  const locked = piece.blocks.map((b) => ({ x: piece.x + b.x, y: piece.y + b.y }));
  const color = piece.color;

  // Find all same-color squares reachable from any locked square.
  const visited = new Set<string>();
  const toMerge: Point[] = [];
  for (const pt of locked) {
    if (visited.has(key(pt.x, pt.y))) continue;
    const cell = board[pt.y]?.[pt.x];
    if (!cell || cell.color !== color) continue;

    toMerge.push(pt);
    visited.add(key(pt.x, pt.y));
    for (let i = 0; i < toMerge.length; i += 1) {
      for (const dir of DIRECTIONS) {
        const nx = toMerge[i].x + dir.x;
        const ny = toMerge[i].y + dir.y;
        if (nx < 0 || nx >= BOARD_WIDTH || ny < 0 || ny >= BOARD_HEIGHT) continue;
        if (visited.has(key(nx, ny))) continue;
        const cell = board[ny]?.[nx];
        if (!cell || cell.color !== color) continue;
        visited.add(key(nx, ny));
        toMerge.push({ x: nx, y: ny });
      }
    }
  }

  if (toMerge.length <= piece.blocks.length) return 0;

  // Reassign all merged squares to the same group.
  const group = board[locked[0].y]?.[locked[0].x]?.group;
  if (group === undefined) return 0;
  for (const pt of toMerge) {
    const cell = board[pt.y]?.[pt.x];
    if (cell) cell.group = group;
  }

  return toMerge.length - piece.blocks.length;
}

export interface ClearedRow {
  y: number;
  color: number;
  /** Count of squares in this row that belong to merged pieces. */
  mergedSquares: number;
}

/**
 * Finds all rows that are completely filled with the same color.
 * Returns them with the count of merged-square cells in each.
 */
function findMonochromeRows(board: Board): ClearedRow[] {
  const rows: ClearedRow[] = [];
  for (let y = 0; y < BOARD_HEIGHT; y += 1) {
    const row = board[y];
    if (!row.every((cell) => cell !== null)) continue;
    const color = row[0]?.color;
    if (color === undefined || !row.every((cell) => cell.color === color)) continue;

    const merged = row.filter((cell) => cell.group !== undefined).length;
    rows.push({ y, color, mergedSquares: merged });
  }
  return rows;
}

/** Removes all monochrome rows, returning their info. */
function clearRows(board: Board, rows: ClearedRow[]): void {
  for (const { y } of rows) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      board[y][x] = null;
    }
  }
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
            if (seen.has(nextX + "," + nextY) || board[nextY][nextX]?.group !== cell.group) continue;
            seen.add(nextX + "," + nextY);
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
      (a, b) => Math.max(...b.map((pt) => pt.y)) - Math.max(...a.map((pt) => pt.y)),
    );
    for (const unit of units) {
      const own = new Set(unit.map((pt) => key(pt.x, pt.y)));
      const canFall = () => unit.every((pt) =>
        pt.y + 1 < BOARD_HEIGHT &&
        (board[pt.y + 1][pt.x] === null || own.has(key(pt.x, pt.y + 1))),
      );
      while (canFall()) {
        const cells = unit.map((pt) => board[pt.y][pt.x]);
        for (const pt of unit) board[pt.y][pt.x] = null;
        own.clear();
        for (const [index, pt] of unit.entries()) {
          pt.y += 1;
          board[pt.y][pt.x] = cells[index];
          own.add(key(pt.x, pt.y));
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
  /** Squares removed from monochrome row clears. */
  destroyed: number;
  /** Position and color of destroyed squares. */
  destroyedCells: Array<Point & { color: number }>;
  /** Whether this lock cleared any rows. */
  hit: boolean;
  /** Rows that were completely monochrome and cleared. */
  clearedRows: ClearedRow[];
  /** Number of squares from merged pieces caught in cleared rows. */
  mergedSquaresDestroyed: number;
}

/**
 * Resolves a locked piece:
 * 1. Merges same-color contact squares into one solid block.
 * 2. Clears any monochrome rows.
 * 3. Applies gravity so blocks settle.
 */
export function resolveLock(
  board: Board,
  piece: ActivePiece,
): ResolveResult {
  const resolved = cloneBoard(board);

  // Step 1: Merge same-color contacts.
  mergeSameColor(resolved, piece);

  // Step 2: Find and clear monochrome rows.
  const clearedRows = findMonochromeRows(resolved);
  const destroyedCells: Array<Point & { color: number }> = [];
  let mergedSquaresDestroyed = 0;
  for (const row of clearedRows) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      const cell = resolved[row.y][x];
      if (cell) {
        destroyedCells.push({ x, y: row.y, color: cell.color });
        if (cell.group !== undefined) mergedSquaresDestroyed += 1;
      }
    }
  }
  if (clearedRows.length > 0) {
    clearRows(resolved, clearedRows);
  }

  // Step 3: Gravity settles remaining blocks.
  const boardAfterGravity = applyGravity(resolved);

  return {
    board: boardAfterGravity,
    destroyed: destroyedCells.length,
    destroyedCells,
    hit: clearedRows.length > 0,
    clearedRows,
    mergedSquaresDestroyed,
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
