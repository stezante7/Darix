import Phaser from 'phaser';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  CELLS,
  POINTS_PER_SQUARE,
  ROWS,
  ActivePiece,
  Board,
  ClearStage,
  DestroyedCell,
  Point,
  ResolveResult,
  SHAPES,
  at,
  canPlace,
  cellsOf,
  createEmptyBoard,
  createPiece,
  key,
  lockPiece,
  occupiedCells,
  peek,
  removeCells,
  resolveLock,
  rotateBlocks,
} from './game/board';
import { pieceColor } from './game/colors';
import { MIN_SPEED, dropIntervalForSpeed, nextSpeed } from './game/speed';
import { nextMultiplier } from './game/multiplier';
import {
  PREVIEW_HEIGHT,
  PREVIEW_WIDTH,
  PreviewCell,
  getPiecePreview,
} from './game/preview';
import './style.css';

// Lets the game install as an app and run offline. Skipped in dev so it never caches Vite's dev server.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}

const COLORS = [0xf97316, 0x22d3ee, 0xa78bfa, 0xf43f5e, 0x84cc16, 0xfacc15];
const SHAPE_INSET = 2;
const CORNER_RADIUS = 5;
/** The four pairs of sides whose join makes a corner worth filling between two squares. */
const JOINED_CORNERS: Array<[number, number]> = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];
/** The next-piece grid, every tile once. Its size comes from the shape box, not from the board. */
const PREVIEW_CELLS: Point[] = Array.from({ length: PREVIEW_HEIGHT }, (_, y) =>
  Array.from({ length: PREVIEW_WIDTH }, (_, x) => ({ x, y })),
).flat();

/** A square that a row clear removed, with the points it is worth at the current multiplier. */
type ScoredCell = DestroyedCell & { points: number };

const TITLE_COLORS = [0xf97316, 0xfacc15, 0x22d3ee, 0xa78bfa, 0xf43f5e];
const BACKGROUND = 0x262626;
const GRID = 0x404040;
const BEST_SCORE_KEY = 'darix.best-score';
/* How long the completed row holds its new colour before popping, and how long the pop takes. */
const PAINT_HOLD = 420;
const POP_DURATION = 260;
/** Pause between the pop of one cleared row and the paint of the next, so a cascade reads as steps. */
const STAGE_GAP = 120;
const SCORE_PARTICLE_DURATION = 680;
const SCORE_PARTICLE_STAGGER = 55;
const MUTED_KEY = 'darix.muted';
const MUSIC_VOLUME = 0.35;
const SFX_VOLUME = 0.6;
/** Music switches to the faster loop above this speed, and back once speed drops to the lower mark. */
const FAST_MUSIC_SPEED = 2.5;
const CALM_MUSIC_SPEED = 2;

function loadBestScore(): number {
  try {
    const savedScore = Number(localStorage.getItem(BEST_SCORE_KEY));
    return Number.isFinite(savedScore) && savedScore > 0 ? savedScore : 0;
  } catch {
    return 0;
  }
}

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
  } catch {
    // Mute still works for this session without storage.
  }
}

function saveBestScore(score: number): void {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch {
    // The game still works when browser storage is unavailable.
  }
}

class DarixScene extends Phaser.Scene {
  private board: Board = createEmptyBoard();
  private activePiece!: ActivePiece;
  private nextPiece!: ActivePiece;
  private boardGraphics!: Phaser.GameObjects.Graphics;
  /** Draws the row-clear effects: the white flash that announces a completed row, then the popping squares. */
  private fxGraphics!: Phaser.GameObjects.Graphics;
  /** Draws the pulse over the blocks that grew, so merging is visible without any text. */
  private mergeGraphics!: Phaser.GameObjects.Graphics;
  /** True while a lock is playing out. Input and the fall timer are paused so nothing overlaps the animation. */
  private animating = false;
  /** Bumped whenever the game resets, so a running clear animation stops writing to a dead board. */
  private animationToken = 0;
  private gameOverOverlay!: Phaser.GameObjects.Container;
  private gameOverText!: Phaser.GameObjects.Text;
  private splashOverlay!: Phaser.GameObjects.Container;
  private splashTitle!: Phaser.GameObjects.Container;
  private score = 0;
  private displayedScore = 0;
  private multiplier = 1;
  private speed = MIN_SPEED;
  private scoreFlights: Array<{ element: HTMLElement; animation: Animation }> = [];
  private bestScore = loadBestScore();
  private dropTimer = 0;
  private started = false;
  private gameOver = false;
  private readonly cellSize = 32;
  private readonly boardOffsetX = 0;
  private readonly boardOffsetY = 0;
  private music?: Phaser.Sound.BaseSound;
  private musicKey = '';
  private muted = loadMuted();

  constructor() {
    super('darix');
  }

  preload(): void {
    for (const name of ['button', 'bubble-pop', 'clear-combo', 'gameover', 'game-loop1', 'game-loop2']) {
      this.load.audio(name, `sounds/${name}.mp3`);
    }
  }

  create(): void {
    this.sound.mute = this.muted;
    this.updateMuteButton();
    document.querySelector('#mute-toggle')?.addEventListener('click', () => this.toggleMute());
    this.input.keyboard?.on('keydown-M', () => this.toggleMute());

    this.boardGraphics = this.add.graphics();
    this.fxGraphics = this.add.graphics().setDepth(5);
    this.mergeGraphics = this.add.graphics().setDepth(4);
    const overlay = this.add.container(0, 0).setDepth(10).setVisible(false);
    this.gameOverText = this.add.text(
      (BOARD_WIDTH * this.cellSize) / 2,
      (BOARD_HEIGHT * this.cellSize) / 2,
      '',
      { align: 'center', color: '#f5f5f4', fontFamily: 'Arial Black, sans-serif', fontSize: '21px', lineSpacing: 10 },
    ).setOrigin(0.5);
    overlay.add([
      this.add.rectangle(
        (BOARD_WIDTH * this.cellSize) / 2,
        (BOARD_HEIGHT * this.cellSize) / 2,
        BOARD_WIDTH * this.cellSize,
        BOARD_HEIGHT * this.cellSize,
        0x171717,
        0.88,
      ),
      this.gameOverText,
    ]);
    this.gameOverOverlay = overlay;

    const centerX = (BOARD_WIDTH * this.cellSize) / 2;
    const centerY = (BOARD_HEIGHT * this.cellSize) / 2;
    this.splashTitle = this.add.container(centerX, centerY - 78).setScale(0.88).setAlpha(0);
    for (const [index, letter] of [...'DARIX'].entries()) {
      this.splashTitle.add(
        this.add.text((index - 2) * 36, 0, letter, {
          color: `#${TITLE_COLORS[index].toString(16).padStart(6, '0')}`,
          fontFamily: 'Arial Black, sans-serif',
          fontSize: '48px',
          stroke: '#171717',
          strokeThickness: 3,
        }).setOrigin(0.5).setShadow(0, 4, '#000000', 8),
      );
    }
    this.splashOverlay = this.add.container(0, 0, [
      this.add.rectangle(centerX, centerY, BOARD_WIDTH * this.cellSize, BOARD_HEIGHT * this.cellSize, 0x111827, 0.68),
      this.splashTitle,
      this.add.text(centerX, centerY - 20, 'MERGE. CLEAR. OUTLAST.', {
        align: 'center',
        color: '#22d3ee',
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '16px',
        letterSpacing: 3,
      }).setOrigin(0.5),
      this.add.text(
        centerX,
        centerY + 20,
        'A FULL ROW CLEARS\nMATCHED BLOCKS SCORE DOUBLE',
        {
          align: 'center',
          color: '#d4d4d8',
          fontFamily: 'Arial Black, sans-serif',
          fontSize: '12px',
          lineSpacing: 8,
        },
      ).setOrigin(0.5),
      this.add.text(centerX, centerY + 96, 'CLICK  /  TAP  /  SPACE TO START', {
        align: 'center',
        color: '#d4d4d8',
        fontFamily: 'monospace',
        fontSize: '12px',
      }).setOrigin(0.5),
    ]).setDepth(20).setVisible(true);

    this.input.keyboard?.on('keydown-LEFT', () => this.move(-1));
    this.input.keyboard?.on('keydown-RIGHT', () => this.move(1));
    this.input.keyboard?.on('keydown-DOWN', () => this.dropOne());
    this.input.keyboard?.on('keydown-UP', () => this.rotate());
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (this.started) this.hardDrop();
      else this.startGame();
    });
    this.input.keyboard?.on('keydown-R', () => this.restart());
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => this.handleTouch(pointer));
    this.nextPiece = this.createRandomPiece();
    this.spawnPiece();
    this.updateScore();
    this.updateMultiplier();
    this.updateSpeed();
    this.updateRowProgress();
    this.draw();
    this.tweens.add({ targets: this.splashTitle, scale: 1, alpha: 1, duration: 500, ease: 'Back.Out' });
  }

  update(_: number, delta: number): void {
    if (!this.started || this.gameOver || this.animating) return;
    this.dropTimer += delta;
    if (this.dropTimer >= dropIntervalForSpeed(this.speed)) {
      this.dropTimer = 0;
      this.dropOne();
    }
  }

  private handleTouch(pointer: Phaser.Input.Pointer): void {
    const deltaX = pointer.upX - pointer.downX;
    const deltaY = pointer.upY - pointer.downY;
    const threshold = 18;

    if (!this.started) {
      this.startGame();
    } else if (this.gameOver) {
      this.restart();
    } else if (Math.abs(deltaX) < threshold && Math.abs(deltaY) < threshold) {
      this.rotate();
    } else if (Math.abs(deltaX) > Math.abs(deltaY)) {
      const columns = Math.max(1, Math.floor(Math.abs(deltaX) / this.cellSize));
      Array.from({ length: columns }, () => this.move(Math.sign(deltaX)));
    } else if (deltaY > threshold) {
      this.hardDrop();
    }
  }

  private startGame(): void {
    if (this.started || this.gameOver) return;
    this.started = true;
    this.splashOverlay.setVisible(false);
    this.playSfx('button');
    this.playMusic('game-loop1');
  }

  move(direction: number): void {
    if (!this.started || this.gameOver || this.animating) return;
    const nextX = this.activePiece.x + direction;
    if (canPlace(this.board, this.activePiece, nextX, this.activePiece.y)) {
      this.activePiece.x = nextX;
      this.draw();
    }
  }

  dropOne(): void {
    if (!this.started || this.gameOver || this.animating) return;
    if (canPlace(this.board, this.activePiece, this.activePiece.x, this.activePiece.y + 1)) {
      this.activePiece.y += 1;
    } else {
      this.lockActivePiece();
    }
    this.draw();
  }

  hardDrop(): void {
    if (!this.started || this.gameOver || this.animating) return;
    while (canPlace(this.board, this.activePiece, this.activePiece.x, this.activePiece.y + 1)) {
      this.activePiece.y += 1;
    }
    this.lockActivePiece();
    this.draw();
  }

  rotate(): void {
    if (!this.started || this.gameOver || this.animating) return;
    const rotated = { ...this.activePiece, blocks: rotateBlocks(this.activePiece.blocks) };
    if (canPlace(this.board, rotated)) {
      this.activePiece = { ...rotated, color: (rotated.color + 1) % COLORS.length };
      this.draw();
    }
  }

  restart(): void {
    // Stop any clear animation that is still drawing on the old board.
    this.animationToken += 1;
    this.animating = false;
    this.board = createEmptyBoard();
    this.cancelScoreFlights();
    this.score = 0;
    this.displayedScore = 0;
    this.multiplier = 1;
    this.speed = MIN_SPEED;
    this.started = true;
    this.gameOver = false;
    this.dropTimer = 0;
    this.gameOverOverlay.setVisible(false);
    this.splashOverlay.setVisible(false);
    this.fxGraphics.clear();
    this.mergeGraphics.clear();
    this.nextPiece = this.createRandomPiece();
    this.spawnPiece();
    this.updateScore();
    this.updateMultiplier();
    this.updateSpeed();
    this.updateRowProgress();
    this.draw();
    this.playSfx('button');
    this.playMusic('game-loop1');
  }

  private spawnPiece(): void {
    this.activePiece = this.nextPiece;
    this.nextPiece = this.createRandomPiece();
    this.updateNextPiecePreview();
    if (!canPlace(this.board, this.activePiece)) {
      this.gameOver = true;
      this.stopMusic();
      this.playSfx('gameover');
      this.gameOverText.setText(
        `GAME OVER\nScore: ${this.score}\nBest: ${this.bestScore}\nTry again?`,
      );
      this.gameOverOverlay.setVisible(true);
    }
  }

  private createRandomPiece(): ActivePiece {
    const shape = Phaser.Math.Between(0, SHAPES.length - 1);
    return createPiece(shape, pieceColor(COLORS.length));
  }

  private updateNextPiecePreview(): void {
    const preview = document.querySelector<HTMLDivElement>('#next-piece-preview');
    if (!preview) return;

    const occupied = new Map(getPiecePreview(this.nextPiece).map((c) => [key(c), c]));
    preview.replaceChildren(...PREVIEW_CELLS.map((p) => this.previewTile(p, occupied)));
  }

  /** One tile of the next-piece grid: filled where the piece has a square, empty elsewhere. */
  private previewTile(p: Point, occupied: Map<string, PreviewCell>): HTMLSpanElement {
    const tile = document.createElement('span');
    tile.style.gridColumn = String(p.x + 1);
    tile.style.gridRow = String(p.y + 1);
    tile.setAttribute('aria-hidden', 'true');

    const square = occupied.get(key(p));
    if (!square) {
      tile.className = 'preview-cell preview-empty';
      return tile;
    }
    tile.className = 'preview-cell';
    // Slightly darken for contrast with the border
    const color = this.darkerColor(COLORS[square.color % COLORS.length], 0.82);
    tile.style.backgroundColor = `#${color.toString(16).padStart(6, '0')}`;
    return tile;
  }

  private lockActivePiece(): void {
    const locked = lockPiece(this.board, this.activePiece);
    const result = resolveLock(locked, this.activePiece.color);
    this.multiplier = nextMultiplier(this.multiplier, result.hit);
    // A square in a cleared row scores double when it belongs to a block that has merged, which is
    // the whole reason to bother matching colours. Every other square scores its single value.
    const basePoints = POINTS_PER_SQUARE * this.multiplier;
    // One entry per clear stage, so each popping square carries its own value to the score.
    const scoredStages: ScoredCell[][] = result.stages.map((stage) =>
      stage.cells.map((cell) => ({ ...cell, points: basePoints * (cell.merged ? 2 : 1) })),
    );
    this.score += scoredStages.flat().reduce((total, cell) => total + cell.points, 0);
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      saveBestScore(this.bestScore);
    }
    this.updateMultiplier(result.hit);
    const previousSpeed = this.speed;
    this.speed = nextSpeed(this.speed, result.hit);
    this.updateSpeed(Math.sign(this.speed - previousSpeed));
    if (this.speed > FAST_MUSIC_SPEED) this.playMusic('game-loop2');
    else if (this.speed <= CALM_MUSIC_SPEED) this.playMusic('game-loop1');

    if (result.mergedGroups.length > 0) {
      this.playSfx('bubble-pop');
      this.pulseMergedGroups(result.board, result.mergedGroups, this.animationToken);
    }

    if (result.stages.length === 0) {
      this.board = result.board;
      if (result.mergedGroups.length === 0) this.playSfx('button');
      this.updateRowProgress();
      this.spawnPiece();
      return;
    }

    // The clear is played as a sequence: paint the row, hold, pop, then let the next stage read.
    this.animating = true;
    this.updateRowProgress();
    const token = this.animationToken;
    this.playClearStage(token, result, 0, scoredStages, () => {
      if (token !== this.animationToken) return;
      this.animating = false;
      this.dropTimer = 0;
      this.board = result.board;
      this.draw();
      this.updateRowProgress();
      this.spawnPiece();
    });
  }

  /** Plays one row clear: the row shows its new colour, holds, then its squares pop out. */
  private playClearStage(
    token: number,
    result: ResolveResult,
    index: number,
    scoredStages: ScoredCell[][],
    done: () => void,
  ): void {
    if (token !== this.animationToken) return;
    const stage = result.stages[index];
    this.board = stage.painted;
    this.draw();
    this.playSfx('clear-combo');
    const flash = { alpha: 0.55 };
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: PAINT_HOLD,
      onUpdate: () => this.drawFlash(stage.cells, token, flash.alpha),
      onComplete: () => {
        this.fxGraphics.clear();
        this.popClearStage(token, stage, scoredStages[index] ?? [], () => {
          if (index + 1 < result.stages.length) {
            this.time.delayedCall(STAGE_GAP, () =>
              this.playClearStage(token, result, index + 1, scoredStages, done),
            );
            return;
          }
          done();
        });
      },
    });
  }

  /** Removes the cleared squares from the drawn board and shrinks them away. The whole of any block
   *  the row reached is in `stage.cells`, so that is exactly what leaves the board. */
  private popClearStage(token: number, stage: ClearStage, scored: ScoredCell[], done: () => void): void {
    if (token !== this.animationToken) return;
    this.board = removeCells(stage.painted, stage.cells);
    this.draw();
    this.sendScoreParticles(scored);
    const pop = { scale: 1 };
    this.tweens.add({
      targets: pop,
      scale: 0,
      duration: POP_DURATION,
      ease: 'Back.In',
      onUpdate: () => this.drawPopping(stage.cells, token, pop.scale),
      onComplete: () => {
        this.fxGraphics.clear();
        done();
      },
    });
  }

  /** White wash over the given squares, fading as `alpha` drops. An expired token means the game
   *  restarted underneath this tween, so the effect must stop drawing on the new board. */
  private drawFlash(cells: Point[], token: number, alpha: number): void {
    this.fxGraphics.clear();
    if (token !== this.animationToken || alpha <= 0) return;
    this.fxGraphics.fillStyle(0xffffff, alpha);
    cells.forEach((cell) => this.fillBoardSquare(this.fxGraphics, cell));
  }

  /** One filled square of the board, inset the same way the pieces are. */
  private fillBoardSquare(graphics: Phaser.GameObjects.Graphics, p: Point): void {
    graphics.fillRect(
      p.x * this.cellSize + SHAPE_INSET,
      p.y * this.cellSize + SHAPE_INSET,
      this.cellSize - SHAPE_INSET * 2,
      this.cellSize - SHAPE_INSET * 2,
    );
  }

  /** The cleared squares shrinking out of the board. */
  private drawPopping(
    cells: Array<Point & { color: number }>,
    token: number,
    scale: number,
  ): void {
    this.fxGraphics.clear();
    if (token !== this.animationToken || scale <= 0) return;
    const size = this.cellSize * scale;
    const inset = (this.cellSize - size) / 2;
    cells.forEach((cell) => {
      this.fxGraphics.fillStyle(COLORS[cell.color % COLORS.length], 1);
      this.fxGraphics.fillRoundedRect(
        cell.x * this.cellSize + inset,
        cell.y * this.cellSize + inset,
        size,
        size,
        CORNER_RADIUS,
      );
    });
  }

  /** Flashes the squares of every block that grew, so a merge is visible on the board. */
  private pulseMergedGroups(board: Board, groupIds: number[], token: number): void {
    const cells = CELLS.filter((p) => {
      const group = at(board, p)?.group;
      return group !== undefined && groupIds.includes(group);
    });
    if (cells.length === 0) return;
    const flash = { alpha: 0.8 };
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 420,
      onUpdate: () => {
        this.mergeGraphics.clear();
        if (token !== this.animationToken || flash.alpha <= 0) return;
        this.mergeGraphics.fillStyle(0xffffff, flash.alpha * 0.5);
        cells.forEach((cell) => this.fillBoardSquare(this.mergeGraphics, cell));
      },
      onComplete: () => this.mergeGraphics.clear(),
    });
  }

  private sendScoreParticles(cells: ScoredCell[]): void {
    if (cells.length === 0) return;

    const scoreElement = document.querySelector<HTMLElement>('#score');
    const canvasBounds = this.game.canvas.getBoundingClientRect();
    if (!scoreElement || canvasBounds.width === 0 || canvasBounds.height === 0) {
      this.displayedScore = this.score;
      this.updateScore();
      return;
    }

    const scoreBounds = scoreElement.getBoundingClientRect();
    const targetX = scoreBounds.left + scoreBounds.width / 2;
    const targetY = scoreBounds.top + scoreBounds.height / 2;

    cells.forEach((cell, index) => {
      const points = cell.points;
      const particle = document.createElement('span');
      particle.className = 'score-flight-particle';
      particle.style.left = `${canvasBounds.left + ((cell.x + 0.5) / BOARD_WIDTH) * canvasBounds.width}px`;
      particle.style.top = `${canvasBounds.top + ((cell.y + 0.5) / BOARD_HEIGHT) * canvasBounds.height}px`;
      const particleColor = `#${COLORS[cell.color % COLORS.length].toString(16).padStart(6, '0')}`;
      particle.style.backgroundColor = particleColor;
      particle.style.color = particleColor;
      document.body.append(particle);

      const animation = particle.animate(
        [
          { transform: 'translate(-50%, -50%) scale(0.45)', opacity: 0.35 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.12 },
          {
            left: `${targetX}px`,
            top: `${targetY}px`,
            transform: 'translate(-50%, -50%) scale(0.3)',
            opacity: 0.25,
          },
        ],
        {
          duration: SCORE_PARTICLE_DURATION,
          delay: index * SCORE_PARTICLE_STAGGER,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'forwards',
        },
      );
      const flight = { element: particle, animation };
      this.scoreFlights.push(flight);
      animation.onfinish = () => {
        this.scoreFlights = this.scoreFlights.filter((activeFlight) => activeFlight !== flight);
        particle.remove();
        this.displayedScore = Math.min(this.score, this.displayedScore + points);
        this.updateScore();
        this.pulseScore();
      };
    });
  }

  private playSfx(key: string): void {
    this.sound.play(key, { volume: SFX_VOLUME });
  }

  /** Starts a music loop, cross-fading from the current one; does nothing if it is already playing. */
  private playMusic(key: string): void {
    if (this.musicKey === key && this.music?.isPlaying) return;
    this.stopMusic();
    const music = this.sound.add(key, { loop: true, volume: 0 });
    music.play();
    this.tweens.add({ targets: music, volume: MUSIC_VOLUME, duration: 600 });
    this.music = music;
    this.musicKey = key;
  }

  private stopMusic(): void {
    const music = this.music;
    if (!music) return;
    this.music = undefined;
    this.musicKey = '';
    this.tweens.add({ targets: music, volume: 0, duration: 400, onComplete: () => music.destroy() });
  }

  private toggleMute(): void {
    // Track mute ourselves: Phaser's `sound.mute` getter lags behind its setter under Web Audio.
    this.muted = !this.muted;
    this.sound.mute = this.muted;
    saveMuted(this.muted);
    this.updateMuteButton();
  }

  private updateMuteButton(): void {
    const button = document.querySelector<HTMLButtonElement>('#mute-toggle');
    if (!button) return;
    button.textContent = this.muted ? '🔇' : '🔊';
    button.setAttribute('aria-pressed', String(this.muted));
    button.setAttribute('aria-label', this.muted ? 'Unmute sound' : 'Mute sound');
  }

  private cancelScoreFlights(): void {
    this.scoreFlights.forEach(({ animation, element }) => {
      animation.cancel();
      element.remove();
    });
    this.scoreFlights = [];
  }

  private pulseScore(): void {
    const scoreElement = document.querySelector<HTMLElement>('#score');
    if (!scoreElement) return;
    scoreElement.classList.remove('score-pop');
    void scoreElement.offsetWidth;
    scoreElement.classList.add('score-pop');
  }

  private draw(): void {
    this.boardGraphics.clear();
    this.boardGraphics.fillStyle(BACKGROUND, 1);
    this.boardGraphics.fillRect(this.boardOffsetX, this.boardOffsetY, BOARD_WIDTH * this.cellSize, BOARD_HEIGHT * this.cellSize);

    this.boardGraphics.lineStyle(1, GRID, 0.45);
    CELLS.forEach((p) =>
      this.boardGraphics.strokeRect(p.x * this.cellSize, p.y * this.cellSize, this.cellSize, this.cellSize),
    );

    // A piece that has not merged is separate squares, never one shape. The white edge is painted
    // under the fills so it follows the outside of each square instead of ruling through it.
    const separate = () => false;
    if (!this.gameOver && !this.animating) {
      const piece = this.activePiece;
      this.boardGraphics.fillStyle(0xffffff, 0.95);
      cellsOf(piece).forEach((p) => this.cellOutline(p.x, p.y, separate));
      cellsOf(piece).forEach((p) => this.fillCell(p.x, p.y, piece.color, separate));
    }

    // Only a merged block closes the gaps between its squares and reads as one solid form.
    occupiedCells(this.board).forEach((p) => {
      const cell = at(this.board, p)!;
      const solid = cell.merged === true;
      this.fillCell(p.x, p.y, cell.color, (dx, dy) =>
        solid && peek(this.board, { x: p.x + dx, y: p.y + dy })?.group === cell.group,
      );
    });
  }

  /** Paints one square of a shape. Squares that belong together lose the gutter between them,
   *  so a piece or merged block reads as one solid form with one outline. */
  private fillCell(
    x: number,
    y: number,
    colorIndex: number,
    linked: (dx: number, dy: number) => boolean,
  ): void {
    const size = this.cellSize;
    const inset = SHAPE_INSET;
    const inner = size - inset * 2;
    const left = x * size;
    const top = y * size;
    const [l, r, u, d] = [linked(-1, 0), linked(1, 0), linked(0, -1), linked(0, 1)];
    const radius = (joined: boolean) => (joined ? 0 : CORNER_RADIUS);
    this.boardGraphics.fillStyle(COLORS[colorIndex % COLORS.length], 1);
    this.boardGraphics.fillRoundedRect(left + inset, top + inset, inner, inner, {
      tl: radius(l || u),
      tr: radius(r || u),
      bl: radius(l || d),
      br: radius(r || d),
    });
    // Fill the gutter up to the cell edge on every joined side, and the corner where three neighbours join.
    if (l) this.boardGraphics.fillRect(left, top + inset, inset, inner);
    if (r) this.boardGraphics.fillRect(left + size - inset, top + inset, inset, inner);
    if (u) this.boardGraphics.fillRect(left + inset, top, inner, inset);
    if (d) this.boardGraphics.fillRect(left + inset, top + size - inset, inner, inset);
    JOINED_CORNERS.forEach(([dx, dy]) => {
      if (linked(dx, 0) && linked(0, dy) && linked(dx, dy)) {
        this.boardGraphics.fillRect(dx < 0 ? left : left + size - inset, dy < 0 ? top : top + size - inset, inset, inset);
      }
    });
  }

  /** One square of the shape's edge, drawn the full cell with its corners rounded the same way the
   *  fills are. Tiled across the shape it becomes a single outline that only runs around the outside. */
  private cellOutline(x: number, y: number, linked: (dx: number, dy: number) => boolean): void {
    const size = this.cellSize;
    const left = x * size;
    const top = y * size;
    const [l, r, u, d] = [linked(-1, 0), linked(1, 0), linked(0, -1), linked(0, 1)];
    const radius = (joined: boolean) => (joined ? 0 : CORNER_RADIUS + SHAPE_INSET);
    this.boardGraphics.fillRoundedRect(left, top, size, size, {
      tl: radius(l || u),
      tr: radius(r || u),
      bl: radius(l || d),
      br: radius(r || d),
    });
  }

  /** Darken a colour by a given factor. */
  private darkerColor(rgb: number, factor: number): number {
    const r = ((rgb >> 16) & 0xff) * factor | 0;
    const g = ((rgb >> 8) & 0xff) * factor | 0;
    const b = (rgb & 0xff) * factor | 0;
    return (r << 16) | (g << 8) | b;
  }

  private updateScore(): void {
    const scoreElement = document.querySelector('#score');
    if (scoreElement) scoreElement.textContent = String(this.displayedScore);
  }

  /** Shows the fall speed; `change` flashes it green when it sped up and red when it slowed down. */
  private updateSpeed(change = 0): void {
    const speedElement = document.querySelector<HTMLElement>('#speed');
    if (!speedElement) return;
    speedElement.textContent = `${this.speed.toFixed(1)}×`;
    speedElement.classList.remove('speed-up', 'speed-down');
    if (change === 0) return;
    void speedElement.offsetWidth;
    speedElement.classList.add(change > 0 ? 'speed-up' : 'speed-down');
  }

  private updateMultiplier(pulse = false): void {
    const multiplierElement = document.querySelector<HTMLElement>('#multiplier');
    if (!multiplierElement) return;
    multiplierElement.textContent = `×${this.multiplier}`;
    if (pulse) {
      multiplierElement.classList.remove('multiplier-pop');
      void multiplierElement.offsetWidth;
      multiplierElement.classList.add('multiplier-pop');
    }
  }

  /** Shows how close the nearest-to-complete row is, since a row goes when it is full. */
  private updateRowProgress(): void {
    const container = document.querySelector<HTMLElement>('#row-progress');
    if (!container) return;
    container.innerHTML = '';

    // The row with the fewest gaps is the one the player is most likely closing next.
    const closable = ROWS.map((y) => ({ y, filled: this.board[y].filter((cell) => cell !== null).length })).filter(
      (row) => row.filled < BOARD_WIDTH,
    );
    if (closable.length === 0) return;
    const { filled: bestFilled } = closable.reduce((best, row) => (row.filled > best.filled ? row : best));

    const bar = document.createElement('div');
    bar.className = 'row-progress-bar';
    const fill = document.createElement('div');
    fill.className = 'row-progress-fill';
    fill.style.width = `${(bestFilled / BOARD_WIDTH) * 100}%`;
    bar.appendChild(fill);
    container.appendChild(bar);

    const text = document.createElement('span');
    text.style.cssText = 'color: #a3a3a3; font-size: 0.65rem; font-family: monospace; margin-left: 4px;';
    text.textContent = `${bestFilled}/${BOARD_WIDTH}`;
    container.appendChild(text);
  }

}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-container',
  width: BOARD_WIDTH * 32,
  height: BOARD_HEIGHT * 32,
  backgroundColor: '#262626',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
    width: BOARD_WIDTH * 32,
    height: BOARD_HEIGHT * 32,
  },
  scene: DarixScene,
});
