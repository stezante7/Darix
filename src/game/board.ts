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
 * Merges every set of touching same-color squares into one solid block.
 *
 * Each connected run of one color keeps the lowest group id it already had, so the oldest
 * piece owns the merged block. Running this over the whole board rather than only from the
 * locked piece means two blocks that end up touching after a fall merge too — the board
 * never shows same-color squares that are not one block.
 * Returns how many squares changed block, which is how much the player merged.
 */
function mergeSameColor(board: Board): number {
  const seen = new Set<string>();
  let absorbed = 0;

  for (let y = 0; y < BOARD_HEIGHT; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      const start = board[y][x];
      if (!start || seen.has(key(x, y))) continue;

      // Flood-fill this square's same-color run.
      const run: Point[] = [{ x, y }];
      seen.add(key(x, y));
      for (let i = 0; i < run.length; i += 1) {
        for (const dir of DIRECTIONS) {
          const nx = run[i].x + dir.x;
          const ny = run[i].y + dir.y;
          if (nx < 0 || nx >= BOARD_WIDTH || ny < 0 || ny >= BOARD_HEIGHT) continue;
          if (seen.has(key(nx, ny))) continue;
          const cell = board[ny][nx];
          if (!cell || cell.color !== start.color) continue;
          seen.add(key(nx, ny));
          run.push({ x: nx, y: ny });
        }
      }

      const owner = run.reduce(
        (lowest, pt) => Math.min(lowest, board[pt.y][pt.x]!.group ?? Infinity),
        Infinity,
      );
      // A run that never belonged to a block just gets labelled; nothing was merged away.
      if (owner === Infinity) continue;

      for (const pt of run) {
        const cell = board[pt.y][pt.x]!;
        if (cell.group !== owner) absorbed += 1;
        cell.group = owner;
      }
    }
  }

  return absorbed;
}

export interface ClearedRow {
  y: number;
  color: number;
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

    rows.push({ y, color });
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
  /** Squares that joined another block, i.e. how much this lock merged. */
  mergedSquares: number;
}

/**
 * Resolves a locked piece:
 * 1. Merges same-color contact squares into one solid block.
 * 2. Clears any monochrome rows.
 * 3. Applies gravity so blocks settle, then merges anything the falls left touching.
 */
export function resolveLock(board: Board): ResolveResult {
  const resolved = cloneBoard(board);

  // Step 1: Merge same-color contacts.
  let mergedSquares = mergeSameColor(resolved);

  // Step 2: Find and clear monochrome rows.
  const clearedRows = findMonochromeRows(resolved);
  const destroyedCells: Array<Point & { color: number }> = [];
  for (const row of clearedRows) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      const cell = resolved[row.y][x];
      if (cell) destroyedCells.push({ x, y: row.y, color: cell.color });
    }
  }
  if (clearedRows.length > 0) {
    clearRows(resolved, clearedRows);
  }

  // Step 3: Gravity settles remaining blocks; blocks the falls left touching merge too.
  const settled = applyGravity(resolved);
  mergedSquares += mergeSameColor(settled);

  return {
    board: settled,
    destroyed: destroyedCells.length,
    destroyedCells,
    hit: clearedRows.length > 0,
    clearedRows,
    mergedSquares,
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
