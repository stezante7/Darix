import Phaser from 'phaser';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  POINTS_PER_SQUARE,
  ActivePiece,
  Board,
  ClearedRow,
  Point,
  SHAPES,
  canPlace,
  createEmptyBoard,
  createPiece,
  lockPiece,
  resolveLock,
  rotateBlocks,
} from './game/board';
import { pieceColor } from './game/colors';
import { MIN_SPEED, dropIntervalForSpeed, nextSpeed } from './game/speed';
import { nextMultiplier } from './game/multiplier';
import { getPiecePreview, PREVIEW_HEIGHT, PREVIEW_WIDTH } from './game/preview';
import './style.css';

// Lets the game install as an app and run offline. Skipped in dev so it never caches Vite's dev server.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}

const COLORS = [0xf97316, 0x22d3ee, 0xa78bfa, 0xf43f5e, 0x84cc16, 0xfacc15];
const TITLE_COLORS = [0xf97316, 0xfacc15, 0x22d3ee, 0xa78bfa, 0xf43f5e];
const BACKGROUND = 0x262626;
const GRID = 0x404040;
const BEST_SCORE_KEY = 'darix.best-score';
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
    for (const name of ['button', 'clear-combo', 'gameover', 'game-loop1', 'game-loop2']) {
      this.load.audio(name, `sounds/${name}.mp3`);
    }
  }

  create(): void {
    this.sound.mute = this.muted;
    this.updateMuteButton();
    document.querySelector('#mute-toggle')?.addEventListener('click', () => this.toggleMute());
    this.input.keyboard?.on('keydown-M', () => this.toggleMute());

    this.boardGraphics = this.add.graphics();
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
      this.add.text(centerX, centerY - 20, 'MATCH FOUR OF A COLOUR', {
        align: 'center',
        color: '#22d3ee',
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '16px',
        letterSpacing: 3,
      }).setOrigin(0.5),
      this.add.text(centerX, centerY + 58, 'CLICK  /  TAP  /  SPACE TO START', {
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
    this.draw();
    this.tweens.add({ targets: this.splashTitle, scale: 1, alpha: 1, duration: 500, ease: 'Back.Out' });
  }

  update(_: number, delta: number): void {
    if (!this.started || this.gameOver) return;
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
      for (let step = 0; step < columns; step += 1) this.move(Math.sign(deltaX));
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
    if (!this.started || this.gameOver) return;
    const nextX = this.activePiece.x + direction;
    if (canPlace(this.board, this.activePiece, nextX, this.activePiece.y)) {
      this.activePiece.x = nextX;
      this.draw();
    }
  }

  dropOne(): void {
    if (!this.started || this.gameOver) return;
    if (canPlace(this.board, this.activePiece, this.activePiece.x, this.activePiece.y + 1)) {
      this.activePiece.y += 1;
    } else {
      this.lockActivePiece();
    }
    this.draw();
  }

  hardDrop(): void {
    if (!this.started || this.gameOver) return;
    while (canPlace(this.board, this.activePiece, this.activePiece.x, this.activePiece.y + 1)) {
      this.activePiece.y += 1;
    }
    this.lockActivePiece();
    this.draw();
  }

  rotate(): void {
    if (!this.started || this.gameOver) return;
    const rotated = { ...this.activePiece, blocks: rotateBlocks(this.activePiece.blocks) };
    if (canPlace(this.board, rotated)) {
      this.activePiece = { ...rotated, color: (rotated.color + 1) % COLORS.length };
      this.draw();
    }
  }

  restart(): void {
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
    this.nextPiece = this.createRandomPiece();
    this.spawnPiece();
    this.updateScore();
    this.updateMultiplier();
    this.updateSpeed();
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

    // Build a set of occupied cells for quick lookup
    const occupied = new Set(getPiecePreview(this.nextPiece).map((c) => `${c.x},${c.y}`));

    preview.replaceChildren();
    for (let y = 0; y < PREVIEW_HEIGHT; y += 1) {
      for (let x = 0; x < PREVIEW_WIDTH; x += 1) {
        const tile = document.createElement('span');
        tile.style.gridColumn = String(x + 1);
        tile.style.gridRow = String(y + 1);
        tile.setAttribute('aria-hidden', 'true');
        const key = `${x},${y}`;
        if (occupied.has(key)) {
          tile.className = 'preview-cell';
          const cell = getPiecePreview(this.nextPiece).find((c) => c.x === x && c.y === y)!;
          // Slightly darken for contrast with the border
          tile.style.backgroundColor = `#${this.darkerColor(COLORS[cell.color % COLORS.length], 0.82).toString(16).padStart(6, '0')}`;
        } else {
          tile.className = 'preview-cell preview-empty';
        }
        preview.append(tile);
      }
    }
  }

  private lockActivePiece(): void {
    const locked = lockPiece(this.board, this.activePiece);
    const result = resolveLock(locked, this.activePiece);
    this.board = result.board;
    this.multiplier = nextMultiplier(this.multiplier, result.hit);
    const pointsPerSquare = POINTS_PER_SQUARE * this.multiplier;
    const mergeBonus = result.mergedSquaresDestroyed * this.multiplier;
    this.score += result.destroyed * pointsPerSquare + mergeBonus;
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      saveBestScore(this.bestScore);
    }
    this.updateMultiplier(result.hit);
    const previousSpeed = this.speed;
    this.speed = nextSpeed(this.speed, result.hit);
    this.updateSpeed(Math.sign(this.speed - previousSpeed));
    this.playSfx(result.destroyed > 0 ? 'clear-combo' : 'button');
    if (this.speed > FAST_MUSIC_SPEED) this.playMusic('game-loop2');
    else if (this.speed <= CALM_MUSIC_SPEED) this.playMusic('game-loop1');
    this.sweepRows(result.clearedRows);
    this.sendScoreParticles(result.destroyedCells, pointsPerSquare);
    this.spawnPiece();
  }

  private sendScoreParticles(destroyedCells: Array<Point & { color: number }>, pointsPerSquare: number): void {
    if (destroyedCells.length === 0) return;

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

    destroyedCells.forEach((cell, index) => {
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
        this.displayedScore = Math.min(this.score, this.displayedScore + pointsPerSquare);
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

  /** Sweeps the new color across each completed row so the clear is easy to follow. */
  private sweepRows(rows: ClearedRow[]): void {
    for (const { y, color } of rows) {
      const width = BOARD_WIDTH * this.cellSize;
      const bar = this.add.rectangle(0, y * this.cellSize + this.cellSize / 2, width, this.cellSize, COLORS[color % COLORS.length], 0.9)
        .setOrigin(0, 0.5)
        .setDepth(4)
        .setScale(0, 1)
        .setStrokeStyle(2, 0xffffff, 0.9);
      this.tweens.chain({
        targets: bar,
        tweens: [
          { scaleX: 1, duration: 180, ease: 'Cubic.Out' },
          { alpha: 0, scaleY: 1.6, duration: 320, ease: 'Quad.In', onComplete: () => bar.destroy() },
        ],
      });
    }
  }

  private cancelScoreFlights(): void {
    for (const flight of this.scoreFlights) {
      flight.animation.cancel();
      flight.element.remove();
    }
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

    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        this.boardGraphics.lineStyle(1, GRID, 0.9);
        this.boardGraphics.strokeRect(x * this.cellSize, y * this.cellSize, this.cellSize, this.cellSize);
      }
    }

    // Board cells with visible outlines
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        const cell = this.board[y][x];
        if (!cell) continue;
        this.drawCell(x, y, cell.color, (dx, dy) =>
          cell.group !== undefined && this.board[y + dy]?.[x + dx]?.group === cell.group, !!cell.group);
      }
    }

    if (!this.gameOver) {
      const piece = this.activePiece;
      for (const block of piece.blocks) {
        this.drawCell(piece.x + block.x, piece.y + block.y, piece.color, (dx, dy) =>
          piece.blocks.some((other) => other.x === block.x + dx && other.y === block.y + dy), false, true);
      }
    }
  }

  /** Draws one square; `linked(dx, dy)` says whether the neighbour at that offset belongs to the same piece.
   *  `merged` means this square belongs to a merged group — draw as solid block with outline.
   *  `active` means this square belongs to the falling piece — draw with highlight. */
  private drawCell(
    x: number,
    y: number,
    colorIndex: number,
    linked: (dx: number, dy: number) => boolean,
    merged = false,
    active = false,
  ): void {
    const size = this.cellSize;
    const inset = 2;
    const inner = size - inset * 2;
    const left = x * size;
    const top = y * size;
    const [l, r, u, d] = [linked(-1, 0), linked(1, 0), linked(0, -1), linked(0, 1)];
    const radius = (joined: boolean) => (joined ? 0 : 5);
    const color = merged ? this.darkerColor(COLORS[colorIndex % COLORS.length], 0.75) : COLORS[colorIndex % COLORS.length];
    this.boardGraphics.fillStyle(color, 1);
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
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      if (linked(dx, 0) && linked(0, dy) && linked(dx, dy)) {
        this.boardGraphics.fillRect(dx < 0 ? left : left + size - inset, dy < 0 ? top : top + size - inset, inset, inset);
      }
    }
    // Visible outline
    const outlineColor = active ? 0xffffff : merged ? 0x000000 : 0xffffff;
    const outlineWidth = active ? 3 : merged ? 2 : 1;
    this.boardGraphics.lineStyle(outlineWidth, outlineColor, active ? 1 : merged ? 0.4 : 0.6);
    this.boardGraphics.strokeRect(left + inset - outlineWidth / 2, top + inset - outlineWidth / 2, inner + outlineWidth, inner + outlineWidth);
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
