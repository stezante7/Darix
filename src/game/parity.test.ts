import { describe, it } from 'vitest';
import * as current from './board';
import * as legacy from './boardLegacy';

/** Deterministic RNG so both implementations are dealt exactly the same pieces. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** The rule book behind one implementation, interfaces identical bar the merge result. */
interface Module {
  SHAPES: unknown[];
  createEmptyBoard: () => current.Board;
  createPiece: (shape: number, color: number) => current.ActivePiece;
  canPlace: (board: current.Board, piece: current.ActivePiece, x: number, y: number) => boolean;
  lockPiece: (board: current.Board, piece: current.ActivePiece) => current.Board;
  resolveLock: (board: current.Board, lockColor: number) => current.ResolveResult;
}

const MODULES: [string, Module][] = [
  ['current', current],
  ['legacy', legacy],
];

/** The board as colours on a grid, plus which squares are one block and which are solid. Group ids
 *  are renumbered in the order they first appear, so the two implementations may count differently. */
function fingerprint(board: current.Board): string {
  const ids = new Map<number, number>();
  const next = (id: number) => {
    if (!ids.has(id)) ids.set(id, ids.size);
    return ids.get(id)!;
  };
  const colours = board.map((row) => row.map((cell) => (cell ? String(cell.color) : '.')).join(''));
  const shapes = board.map((row) =>
    row
      .map((cell) => {
        if (!cell) return '.';
        const solid = cell.merged === true ? 'S' : 'o';
        return cell.group === undefined ? `?${solid}` : `${next(cell.group)}${solid}`;
      })
      .join(''),
  );
  return `${colours.join('\n')}\n${shapes.join('\n')}`;
}

function outcomeOf(result: current.ResolveResult): string {
  return JSON.stringify({
    hit: result.hit,
    destroyed: result.destroyed,
    mergedSquares: result.mergedSquares,
    rows: result.stages.map((stage) => ({
      rows: stage.rows,
      cells: [...stage.cells]
        .sort((a, b) => a.y * 100 + a.x - (b.y * 100 + b.x))
        .map((cell) => `${cell.x},${cell.y},${cell.color},${cell.merged}`),
    })),
  });
}

/** Locks one piece: slid to a random column and dropped, so locks land in real places. */
function playLock(
  game: Module,
  random: () => number,
  board: current.Board,
  label: string,
): { board: current.Board; log: string[] } {
  const shape = Math.floor(random() * game.SHAPES.length) % game.SHAPES.length;
  const color = Math.floor(random() * 6);
  const piece: current.ActivePiece = game.createPiece(shape, color);

  const slides = Math.floor(random() * 7) - 3;
  const direction = Math.sign(slides);
  const steps = Math.floor(random() * (Math.abs(slides) + 1));
  for (let step = 0; step < steps; step += 1) {
    if (game.canPlace(board, piece, piece.x + direction, piece.y)) piece.x += direction;
  }
  while (game.canPlace(board, piece, piece.x, piece.y + 1)) piece.y += 1;

  const result = game.resolveLock(game.lockPiece(board, piece), piece.color);
  return {
    board: result.board,
    log: [
      `${label} shape${shape} c${color} x${piece.x} y${piece.y}`,
      outcomeOf(result),
      fingerprint(result.board),
    ],
  };
}

/** One game of 120 pieces, logged every lock: three lines each, so a line pins down one lock. */
function playGame(game: Module, seed: number): string[] {
  const random = rng(seed);
  let board = game.createEmptyBoard();
  const log: string[] = [];
  for (let iteration = 0; iteration < 120; iteration += 1) {
    const played = playLock(game, random, board, `seed ${seed} lock ${iteration}`);
    board = played.board;
    log.push(...played.log);
  }
  return log;
}

const SEEDS = [20261019, 7, 1234567, 99, 424242, 31337, 555, 8181, 606, 1];

describe('the refactor keeps the old rules', () => {
  it('plays the same game, lock for lock, over 10 seeded games', () => {
    const [currentLog, legacyLog] = MODULES.map(([, game]) =>
      SEEDS.flatMap((seed) => playGame(game, seed)),
    );

    const differences = currentLog
      .map((line, index) => (line === legacyLog[index] ? null : index))
      .filter((index) => index !== null);
    if (differences.length === 0) return;

    // The fingerprint is one lock's last line, so show it line by line against the old board.
    const at = differences[0]!;
    const start = at - (at % 3);
    const mine = currentLog[at]!.split('\n');
    const theirs = legacyLog[at]!.split('\n');
    const boardDiff = mine
      .map((line, index) =>
        line === theirs[index] ? `    ${line}` : `- ${line}\n+ ${theirs[index] ?? ''}`,
      )
      .join('\n');
    throw new Error(
      `${differences.length} lines differ over ${SEEDS.length} games, first at ${currentLog[start]}\n` +
        `${currentLog[at - 1]}\n${boardDiff}\n` +
        '(board lines: one per row, colours first then group/solid shapes)',
    );
  });
});
