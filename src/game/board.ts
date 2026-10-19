export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;
export const POINTS_PER_SQUARE = 10;

export interface Cell {
  color: number;
  /** Id of the block this square belongs to; absent once the square is loose. */
  group?: number;
  /** True once the block has swallowed another block. A merged block is one solid shape; a
   *  piece that has never merged still reads as separate squares. */
  merged?: boolean;
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
function mergeSameColor(board: Board, grew?: Set<number>): number {
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
      // Several blocks in one run means they have just become one, which is what makes it solid.
      const becameSolid = run.some((pt) => board[pt.y][pt.x]!.group !== owner);

      for (const pt of run) {
        const cell = board[pt.y][pt.x]!;
        if (cell.group !== owner) {
          absorbed += 1;
          grew?.add(owner);
        }
        cell.group = owner;
        if (becameSolid) cell.merged = true;
      }
    }
  }

  return absorbed;
}

export interface ClearedRow {
  y: number;
  /** The colour of the block that completed the row. The row is swept in it as it goes. */
  color: number;
}

/**
 * One row clear, as a moment the player can watch: the full rows painted in the clearing colour,
 * before any of them is removed or anything falls.
 */
export interface ClearStage {
  rows: ClearedRow[];
  /** Snapshot with the cleared rows painted. The row is still physically there. */
  painted: Board;
  /**
   * Squares this stage removes, with the colour they were painted in. This is the whole of every
   * block that had a square in a cleared row, not only the squares that sat in the row.
   */
  cells: DestroyedCell[];
}

function rowIsFull(board: Board, y: number): boolean {
  return board[y].every((cell) => cell !== null);
}

/** Indexes of the rows that are completely full. Colours do not matter — a row goes when it is full. */
function fullRowIndexes(board: Board): number[] {
  const rows: number[] = [];
  for (let y = 0; y < BOARD_HEIGHT; y += 1) {
    if (rowIsFull(board, y)) rows.push(y);
  }
  return rows;
}

/** Removes the squares a clear took. */
function removeCells(board: Board, cells: DestroyedCell[]): void {
  for (const cell of cells) board[cell.y][cell.x] = null;
}

/**
 * The colour that completed a row left full by a fall: the colour of the square that dropped into
 * one of its holes. `beforeFalls` is the board as it was with the holes still open.
 */
function completingColor(board: Board, beforeFalls: Board, y: number): number {
  for (let x = 0; x < BOARD_WIDTH; x += 1) {
    const cell = board[y][x];
    if (cell && beforeFalls[y][x] === null) return cell.color;
  }
  return board[y][0]!.color;
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

export interface DestroyedCell extends Point {
  color: number;
  /** True when the square belonged to a block that had already merged. These score double. */
  merged: boolean;
}

export interface ResolveResult {
  board: Board;
  /** Squares removed by row clears. */
  destroyed: number;
  /** Position and colour of destroyed squares. */
  destroyedCells: DestroyedCell[];
  /** Whether this lock cleared any rows. */
  hit: boolean;
  /** The row clears this lock caused, in the order they happen. A cascade adds a stage per clear. */
  stages: ClearStage[];
  /** Squares that joined another block, i.e. how much this lock merged. */
  mergedSquares: number;
  /** Ids of the blocks that swallowed another block during this lock, so the merge can be shown. */
  mergedGroups: number[];
}

/**
 * The squares one clear takes: every square of the full rows, plus the rest of any block that had
 * a square in one of them. A merged blob straddling a cleared row goes whole — the part above the
 * line dies with the part inside it. Each doomed square is painted in the colour of the row that
 * claimed it; the first row down claims its blocks, so a block caught between two clears in the
 * same stage is not painted or scored twice.
 */
function collectClear(
  board: Board,
  rowIndexes: number[],
  beforeFalls: Board,
  lockColor: number,
): { rows: ClearedRow[]; cells: DestroyedCell[] } {
  const rows: ClearedRow[] = [];
  const cells: DestroyedCell[] = [];
  const taken = new Set<string>();
  /** Block id → the colour of the first cleared row that square's block touches. */
  const claimed = new Map<number, number>();

  const take = (x: number, y: number, color: number) => {
    const cell = board[y][x]!;
    cell.color = color;
    cells.push({ x, y, color, merged: cell.merged === true });
    taken.add(key(x, y));
  };

  for (const y of rowIndexes) {
    // The lock that filled the row is the completing block. For a row filled by a fall it is
    // whichever block dropped into its hole. The whole row takes that colour as it goes.
    const color = rowIsFull(beforeFalls, y) ? lockColor : completingColor(board, beforeFalls, y);
    rows.push({ y, color });
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      const group = board[y][x]!.group;
      if (group === undefined) {
        take(x, y, color);
        continue;
      }
      const claimedColor = claimed.get(group);
      if (claimedColor === undefined) {
        claimed.set(group, color);
        take(x, y, color);
      } else {
        take(x, y, claimedColor);
      }
    }
  }

  // Everything else those blocks own, above the rows as well as below them.
  for (let y = 0; y < BOARD_HEIGHT; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      const group = board[y][x]?.group;
      if (group === undefined || taken.has(key(x, y))) continue;
      const claimedColor = claimed.get(group);
      if (claimedColor === undefined) continue;
      take(x, y, claimedColor);
    }
  }

  return { rows, cells };
}

/**
 * Resolves a locked piece. `lockColor` is the colour of the piece that locked, which is what a
 * row it completed gets swept in.
 * 1. Merges same-color contact squares into one solid block.
 * 2. Everything settles, so a piece rests before its row is measured.
 * 3. Clears every full row, taking the whole of any block that reaches into it.
 * 4. Applies gravity so blocks settle, merging anything the falls leave touching, and clears again
 *    — a fall that fills a row completes that row too.
 */
/** Blocks fall and, since a fall can leave two blocks touching, the board merges again. */
function settle(board: Board, grew?: Set<number>): Board {
  const settled = applyGravity(board);
  mergeSameColor(settled, grew);
  return settled;
}

export function resolveLock(board: Board, lockColor: number): ResolveResult {
  let resolved = cloneBoard(board);

  // Step 1: Merge same-color contacts.
  const grew = new Set<number>();
  const mergedSquares = mergeSameColor(resolved, grew);

  // Step 2: everything settles, so a piece rests before its row is measured.
  let beforeFalls = cloneBoard(resolved);
  resolved = settle(resolved, grew);

  // Step 3: a full row goes, whatever colours are in it. The blocks a clear leaves behind fall
  // into the gaps and can complete another row, so this repeats until nothing is full.
  const stages: ClearStage[] = [];
  const destroyedCells: DestroyedCell[] = [];
  while (true) {
    const rowIndexes = fullRowIndexes(resolved);
    if (rowIndexes.length === 0) break;

    const { rows, cells } = collectClear(resolved, rowIndexes, beforeFalls, lockColor);
    stages.push({ rows, painted: cloneBoard(resolved), cells });
    destroyedCells.push(...cells);

    removeCells(resolved, cells);
    beforeFalls = cloneBoard(resolved);
    resolved = settle(resolved, grew);
  }

  return {
    board: resolved,
    destroyed: destroyedCells.length,
    destroyedCells,
    hit: stages.length > 0,
    stages,
    mergedSquares,
    mergedGroups: [...grew],
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
