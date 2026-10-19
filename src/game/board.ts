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

// ── Coordinates ─────────────────────────────────────────────
// The whole board talks about squares as Points, never as a pair of loop indexes.

/** Every column index, left to right. */
export const COLS: number[] = Array.from({ length: BOARD_WIDTH }, (_, x) => x);
/** Every row index, top to bottom. */
export const ROWS: number[] = Array.from({ length: BOARD_HEIGHT }, (_, y) => y);
/** Every square on the board, left to right and top to bottom. */
export const CELLS: Point[] = ROWS.flatMap((y) => COLS.map((x) => ({ x, y })));
/** The four steps to a neighbouring square. */
export const DIRECTIONS: Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/** A square as a map key. */
export const key = (p: Point): string => `${p.x},${p.y}`;

export const inBounds = (p: Point): boolean =>
  p.x >= 0 && p.x < BOARD_WIDTH && p.y >= 0 && p.y < BOARD_HEIGHT;

/** The squares a step away from this one, off-board steps dropped. */
export const neighbours = (p: Point): Point[] =>
  DIRECTIONS.map((d) => ({ x: p.x + d.x, y: p.y + d.y })).filter(inBounds);

/** Two squares one step apart in any direction. */
export const adjacent = (a: Point, b: Point): boolean =>
  neighbours(a).some((p) => p.x === b.x && p.y === b.y);

/** Every square below this one, down to the floor. */
export const below = (p: Point): Point[] =>
  Array.from({ length: BOARD_HEIGHT - p.y - 1 }, (_, step) => ({ x: p.x, y: p.y + step + 1 }));

/** The squares of one row. */
export const rowCells = (y: number): Point[] => COLS.map((x) => ({ x, y }));

/** The cell in a square, or null when it is empty. */
export const at = (board: Board, p: Point): Cell | null => board[p.y][p.x];

/** The cell in a square, or null when it is empty or off the board. */
export const peek = (board: Board, p: Point): Cell | null => (inBounds(p) ? at(board, p) : null);

/** The squares that hold something. */
export const occupiedCells = (board: Board): Point[] =>
  CELLS.filter((p) => at(board, p) !== null);

/**
 * The one flood fill everything shares: points split into connected groups, where two squares
 * land in the same group when a chain of `linked` squares joins them. `linked` has to be
 * symmetric — the merge pass, the falling units and the clear all pass their own.
 */
export function connectedGroups(
  points: Point[],
  linked: (a: Point, b: Point) => boolean,
): Point[][] {
  return points.reduce<Point[][]>((groups, point) => {
    const touched = groups.filter((group) => group.some((p) => linked(point, p)));
    if (touched.length === 0) return [...groups, [point]];
    const others = groups.filter((group) => !touched.includes(group));
    return [...others, [point, ...touched.flat()]];
  }, []);
}

/** A copy of the board with these squares replaced. Nothing passed in is touched. */
export function writeCells(board: Board, entries: Array<[Point, Cell | null]>): Board {
  const next = cloneBoard(board);
  entries.forEach(([point, cell]) => {
    next[point.y][point.x] = cell;
  });
  return next;
}

// ── Pieces ──────────────────────────────────────────────────

export function createEmptyBoard(): Board {
  return ROWS.map(() => COLS.map<Cell | null>(() => null));
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

export function createCell(color: number): Cell {
  return { color };
}

export function canPlace(board: Board, piece: ActivePiece, x = piece.x, y = piece.y): boolean {
  return piece.blocks.every((block) => {
    const placed: Point = { x: x + block.x, y: y + block.y };
    return (
      inBounds(placed) && at(board, placed) === null
    );
  });
}

/** The squares of a piece as they sit on the board. */
export const cellsOf = (piece: ActivePiece): Point[] =>
  piece.blocks.map((block) => ({ x: piece.x + block.x, y: piece.y + block.y }));

let nextGroupId = 1;

/** A copy of the board with the piece written into it as one block. */
export function lockPiece(board: Board, piece: ActivePiece): Board {
  const group = nextGroupId;
  nextGroupId += 1;
  return writeCells(
    board,
    cellsOf(piece).map((point): [Point, Cell] => [point, { color: piece.color, group }]),
  );
}

// ── Merge ───────────────────────────────────────────────────

/** What one run of a single colour becomes: the oldest block in it owns the whole run. */
interface RunPlan {
  owner: number;
  squares: Point[];
  /** The squares that were in another block until now — how much this run merged. */
  absorbed: Point[];
}

/** The board split into runs of touching squares that share a colour. */
const sameColourRuns = (board: Board): Point[][] =>
  connectedGroups(
    occupiedCells(board),
    (a, b) => adjacent(a, b) && at(board, a)!.color === at(board, b)!.color,
  );

/** A run of loose squares has no block to belong to, so it is planned as nothing. */
function planRun(board: Board, run: Point[]): RunPlan | undefined {
  const owner = run.reduce((oldest, p) => Math.min(oldest, at(board, p)!.group ?? Infinity), Infinity);
  if (owner === Infinity) return undefined;
  return {
    owner,
    squares: run,
    absorbed: run.filter((p) => at(board, p)!.group !== owner),
  };
}

export interface MergeOutcome {
  board: Board;
  /** Squares that changed block, i.e. how much the board merged. */
  absorbed: number;
  /** The blocks that swallowed another block, so a merge can be shown. */
  grew: number[];
}

/**
 * Merges every set of touching same-color squares into one solid block.
 *
 * Each run of one color keeps the lowest group id it already had, so the oldest piece owns the
 * merged block. Running this over the whole board rather than only from the locked piece means
 * two blocks that end up touching after a fall merge too — the board never shows same-color
 * squares that are not one block.
 */
export function mergeSameColor(board: Board): MergeOutcome {
  const plans = sameColourRuns(board)
    .map((run) => planRun(board, run))
    .filter((plan): plan is RunPlan => plan !== undefined);

  const solid = (plan: RunPlan) => plan.absorbed.length > 0;
  const rewritten = plans.flatMap(
    (plan) =>
      plan.squares.map((p): [Point, Cell] => [
        p,
        { ...at(board, p)!, group: plan.owner, ...(solid(plan) ? { merged: true } : {}) },
      ]),
  );

  return {
    board: writeCells(board, rewritten),
    absorbed: plans.reduce((count, plan) => count + plan.absorbed.length, 0),
    grew: plans.filter(solid).map((plan) => plan.owner),
  };
}

// ── Gravity ─────────────────────────────────────────────────

/**
 * Squares that fall together: a loose square alone, or a connected run of squares belonging to
 * one block. Two squares are in the same unit when they touch and belong to the same block.
 */
export const fallingUnits = (board: Board): Point[][] =>
  connectedGroups(occupiedCells(board), (a, b) => {
    const group = at(board, a)?.group;
    return (
      group !== undefined && group === at(board, b)?.group && adjacent(a, b)
    );
  });

/** How far one square can drop: the empty run beneath it, stopping at the first foreign square. */
function dropLimit(board: Board, own: Set<string>, p: Point): number {
  const firstBlocker = below(p).findIndex((spot) => at(board, spot) !== null && !own.has(key(spot)));
  return firstBlocker === -1 ? below(p).length : firstBlocker;
}

/** How far a unit drops in one go: as far as its most blocked square can go. */
export function fallDistance(board: Board, unit: Point[]): number {
  const own = new Set(unit.map(key));
  return unit.reduce((farthest, p) => Math.min(farthest, dropLimit(board, own, p)), BOARD_HEIGHT - 1);
}

/** A copy of the board with a unit moved down by `distance`. */
function moveUnit(board: Board, unit: Point[], distance: number): Board {
  const squares = unit.map((point) => ({ point, cell: at(board, point) }));
  return writeCells(board, [
    ...squares.map(({ point }): [Point, Cell | null] => [point, null]),
    ...squares.map(
      ({ point, cell }): [Point, Cell | null] => [
        { x: point.x, y: point.y + distance },
        cell && { ...cell },
      ],
    ),
  ]);
}

const bottomOf = (unit: Point[]): number => Math.max(...unit.map((p) => p.y));

/** Units with their lowest square nearest the floor first, so lower blocks move out of the way. */
const unitsBottomUp = (board: Board): Point[][] =>
  fallingUnits(board).sort((a, b) => bottomOf(b) - bottomOf(a));

/** Drops every unit once, as far as it can go. `moved` counts the units that actually shifted. */
function dropAll(board: Board): { board: Board; moved: number } {
  return unitsBottomUp(board).reduce(
    ({ board: next, moved }, unit) => {
      const distance = fallDistance(next, unit);
      return distance === 0
        ? { board: next, moved }
        : { board: moveUnit(next, unit, distance), moved: moved + 1 };
    },
    { board, moved: 0 },
  );
}

/** Drops everything until nothing can move any more: loose squares on their own, blocks rigidly. */
function dropUntilRest(board: Board): Board {
  const { board: dropped, moved } = dropAll(board);
  return moved === 0 ? dropped : dropUntilRest(dropped);
}

/** Returns a settled copy of the board. */
export function applyGravity(board: Board): Board {
  return dropUntilRest(cloneBoard(board));
}

// ── Row clears ──────────────────────────────────────────────

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
  /** Snapshot with the cleared squares painted. They are still physically there. */
  painted: Board;
  /**
   * Squares this stage removes, with the colour they were painted in. This is the whole of every
   * block that had a square in a cleared row, not only the squares that sat in the row.
   */
  cells: DestroyedCell[];
}

export interface DestroyedCell extends Point {
  color: number;
  /** True when the square belonged to a block that had already merged. These score double. */
  merged: boolean;
}

const rowIsFull = (board: Board, y: number): boolean =>
  board[y].every((cell) => cell !== null);

/** Indexes of the rows that are completely full. Colours do not matter — a row goes when it is full. */
const fullRowIndexes = (board: Board): number[] => ROWS.filter((y) => rowIsFull(board, y));

/**
 * The colour that completed a row left full by a fall: the colour of the square that dropped into
 * one of its holes. `beforeFalls` is the board as it was with the holes still open.
 */
function completingColor(board: Board, beforeFalls: Board, y: number): number {
  const filled = rowCells(y).filter((p) => at(beforeFalls, p) === null);
  return at(board, filled[0] ?? { x: 0, y })!.color;
}

/** The board with the cleared squares gone. */
export const removeCells = (board: Board, cells: DestroyedCell[]): Board =>
  writeCells(board, cells.map((cell): [Point, Cell | null] => [cell, null]));

/**
 * What one clear takes, ready to be shown: the full rows, plus the rest of any block that had a
 * square in one of them. A merged blob straddling a cleared row goes whole — the part above the
 * line dies with the part inside it. Every doomed square gets the colour of the row that claimed
 * it, and the first row down claims its blocks, so a block caught between two clears in the same
 * stage is neither painted nor scored twice.
 */
function collectClear(
  board: Board,
  rowIndexes: number[],
  beforeFalls: Board,
  lockColor: number,
): ClearStage {
  // The lock that filled the row is the completing block. For a row filled by a fall it is
  // whichever block dropped into its hole. The whole row takes that colour as it goes.
  const rows: ClearedRow[] = rowIndexes.map((y) => ({
    y,
    color: rowIsFull(beforeFalls, y) ? lockColor : completingColor(board, beforeFalls, y),
  }));
  /** Block id → the colour of the first cleared row its squares touch. */
  const claimed = new Map<number, number>();
  rows.forEach((row) =>
    rowCells(row.y).forEach((p) => {
      const group = at(board, p)!.group;
      if (group !== undefined && !claimed.has(group)) claimed.set(group, row.color);
    }),
  );

  const doomed = new Map<string, DestroyedCell>();
  const claim = (p: Point, color: number) => {
    if (doomed.has(key(p))) return;
    doomed.set(key(p), { ...p, color, merged: at(board, p)!.merged === true });
  };
  /** A square takes its block's colour when it has one, otherwise the colour of its own row. */
  const colourFor = (p: Point): number | undefined => {
    const group = at(board, p)!.group;
    return group === undefined ? undefined : claimed.get(group);
  };
  // First the rows themselves, then everything those blocks own above and below them.
  rows.forEach((row) =>
    rowCells(row.y).forEach((p) => claim(p, colourFor(p) ?? row.color)),
  );
  CELLS.filter((p) => {
    const group = at(board, p)?.group;
    return group !== undefined && claimed.has(group);
  }).forEach((p) => claim(p, claimed.get(at(board, p)!.group!)!));

  const cells = [...doomed.values()];
  return {
    rows,
    painted: writeCells(
      board,
      cells.map((cell): [Point, Cell] => [cell, { ...at(board, cell)!, color: cell.color }]),
    ),
    cells,
  };
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

/** Blocks fall and, since a fall can leave two blocks touching, the board merges again. */
const settle = (board: Board): MergeOutcome => mergeSameColor(dropUntilRest(board));

interface ClearOutcome {
  board: Board;
  /** The clears this board went through, in the order they happened. */
  stages: ClearStage[];
  /** The settle after each clear, so nothing that merged is lost on the way out. */
  merges: MergeOutcome[];
}

/** Clears every full row, then settles and clears again: a fall that fills a row completes it too. */
function cascade(board: Board, beforeFalls: Board, lockColor: number): ClearOutcome {
  const rowIndexes = fullRowIndexes(board);
  if (rowIndexes.length === 0) return { board, stages: [], merges: [] };

  const stage = collectClear(board, rowIndexes, beforeFalls, lockColor);
  const cleared = removeCells(board, stage.cells);
  const landed = settle(cleared);
  const rest = cascade(landed.board, cleared, lockColor);

  return {
    board: rest.board,
    stages: [stage, ...rest.stages],
    merges: [landed, ...rest.merges],
  };
}

/**
 * Resolves a locked piece. `lockColor` is the colour of the piece that locked, which is what a
 * row it completed gets swept in.
 * 1. Merges same-color contact squares into one solid block.
 * 2. Everything settles, so a piece rests before its row is measured.
 * 3. Clears every full row, taking the whole of any block that reaches into it, then settles and
 *    clears again — a fall that fills a row completes that row too — until nothing is full.
 */
export function resolveLock(board: Board, lockColor: number): ResolveResult {
  // Step 1: same-color contacts become one block; this merge alone is what the lock merged.
  const locked = mergeSameColor(cloneBoard(board));
  // Step 2: everything settles, so a piece rests before its row is measured.
  const resting = settle(locked.board);
  const cleared = cascade(resting.board, locked.board, lockColor);

  const merges = [locked, resting, ...cleared.merges];
  const destroyedCells = cleared.stages.flatMap((stage) => stage.cells);
  return {
    board: cleared.board,
    destroyed: destroyedCells.length,
    destroyedCells,
    hit: cleared.stages.length > 0,
    stages: cleared.stages,
    mergedSquares: locked.absorbed,
    mergedGroups: [...new Set(merges.flatMap((merge) => merge.grew))],
  };
}

// ── Shapes ──────────────────────────────────────────────────

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
