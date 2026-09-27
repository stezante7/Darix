import Phaser from 'phaser';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  POINTS_PER_SQUARE,
  ActivePiece,
  Board,
  DestroyedCell,
  canPlace,
  createEmptyBoard,
  createPiece,
  lockPiece,
  resolveLock,
  rotateBlocks,
} from './game/board';
import { MIN_SPEED, dropIntervalForSpeed, nextSpeed } from './game/speed';
import { nextMultiplier } from './game/multiplier';
import { getPiecePreview } from './game/preview';
import './style.css';

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
  private cells: Phaser.GameObjects.Text[] = [];
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
      this.add.text(centerX, centerY - 20, 'RESOLVE THE GRID', {
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
    return createPiece(Phaser.Math.Between(0, 6), Phaser.Math.Between(0, COLORS.length - 1));
  }

  private updateNextPiecePreview(): void {
    const preview = document.querySelector<HTMLDivElement>('#next-piece-preview');
    if (!preview) return;

    preview.replaceChildren();
    for (const cell of getPiecePreview(this.nextPiece)) {
      const tile = document.createElement('span');
      tile.className = 'preview-cell';
      tile.style.gridColumn = String(cell.x + 1);
      tile.style.gridRow = String(cell.y + 1);
      tile.style.backgroundColor = `#${COLORS[cell.color % COLORS.length].toString(16).padStart(6, '0')}`;
      tile.textContent = String(cell.resolve);
      tile.setAttribute('aria-hidden', 'true');
      preview.append(tile);
    }
  }

  private lockActivePiece(): void {
    const cells = this.activePiece.blocks.map((block) => ({
      x: this.activePiece.x + block.x,
      y: this.activePiece.y + block.y,
    }));
    const locked = lockPiece(this.board, this.activePiece);
    const result = resolveLock(locked, this.board, cells);
    this.board = result.board;
    this.multiplier = nextMultiplier(this.multiplier, result.sameColorDestroyed);
    const pointsPerSquare = POINTS_PER_SQUARE * this.multiplier;
    this.score += result.destroyed * pointsPerSquare;
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      saveBestScore(this.bestScore);
    }
    this.updateMultiplier(result.sameColorDestroyed);
    const previousSpeed = this.speed;
    this.speed = nextSpeed(this.speed, result.hit);
    this.updateSpeed(Math.sign(this.speed - previousSpeed));
    this.playSfx(result.destroyed > 0 ? 'clear-combo' : 'button');
    if (this.speed > FAST_MUSIC_SPEED) this.playMusic('game-loop2');
    else if (this.speed <= CALM_MUSIC_SPEED) this.playMusic('game-loop1');
    if (result.rowColor !== undefined) this.sweepRows(result.recoloredRows, result.rowColor);
    this.sendScoreParticles(result.destroyedCells, pointsPerSquare);
    this.shatterLoosened(result.loosenedCells);
    this.spawnPiece();
  }

  private sendScoreParticles(destroyedCells: DestroyedCell[], pointsPerSquare: number): void {
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

  /** Sweeps the new color across each completed row so the recolor is easy to follow. */
  private sweepRows(rows: number[], colorIndex: number): void {
    const width = BOARD_WIDTH * this.cellSize;
    for (const y of rows) {
      const bar = this.add.rectangle(0, y * this.cellSize + this.cellSize / 2, width, this.cellSize, COLORS[colorIndex % COLORS.length], 0.9)
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

  /** Flash each square of a piece that just broke apart and throw off a few shards so the break reads clearly. */
  private shatterLoosened(loosenedCells: DestroyedCell[]): void {
    const size = this.cellSize;
    for (const cell of loosenedCells) {
      const centerX = cell.x * size + size / 2;
      const centerY = cell.y * size + size / 2;
      const flash = this.add.rectangle(centerX, centerY, size - 4, size - 4, 0xffffff, 0.85).setDepth(5);
      this.tweens.add({
        targets: flash,
        alpha: 0,
        scale: 1.35,
        duration: 260,
        ease: 'Quad.Out',
        onComplete: () => flash.destroy(),
      });

      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const shard = this.add.rectangle(centerX + dx * 6, centerY + dy * 6, 8, 8, COLORS[cell.color % COLORS.length])
          .setDepth(5)
          .setStrokeStyle(1, 0xffffff, 0.6);
        this.tweens.add({
          targets: shard,
          x: shard.x + dx * Phaser.Math.Between(10, 16),
          y: shard.y + dy * Phaser.Math.Between(10, 16),
          angle: Phaser.Math.Between(-120, 120),
          alpha: 0,
          scale: 0.4,
          duration: 420,
          ease: 'Cubic.Out',
          onComplete: () => shard.destroy(),
        });
      }
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
    for (const cell of this.cells) cell.destroy();
    this.cells = [];
    this.boardGraphics.clear();
    this.boardGraphics.fillStyle(BACKGROUND, 1);
    this.boardGraphics.fillRect(this.boardOffsetX, this.boardOffsetY, BOARD_WIDTH * this.cellSize, BOARD_HEIGHT * this.cellSize);

    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        this.boardGraphics.lineStyle(1, GRID, 0.9);
        this.boardGraphics.strokeRect(x * this.cellSize, y * this.cellSize, this.cellSize, this.cellSize);
      }
    }

    // Squares of the same intact piece are bridged into one solid shape; loose squares stay separate tiles.
    const sameGroup = (x: number, y: number, group: number | undefined) =>
      group !== undefined && this.board[y]?.[x]?.group === group;
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        const cell = this.board[y][x];
        if (!cell) continue;
        this.drawCell(x, y, cell.color, cell.resolve, {
          right: sameGroup(x + 1, y, cell.group),
          down: sameGroup(x, y + 1, cell.group),
          corner: sameGroup(x + 1, y + 1, cell.group),
        });
      }
    }

    if (!this.gameOver) {
      const piece = this.activePiece;
      const has = (x: number, y: number) => piece.blocks.some((block) => block.x === x && block.y === y);
      for (const [index, block] of piece.blocks.entries()) {
        this.drawCell(piece.x + block.x, piece.y + block.y, piece.color, piece.resolves[index] ?? 1, {
          right: has(block.x + 1, block.y),
          down: has(block.x, block.y + 1),
          corner: has(block.x + 1, block.y + 1),
        });
      }
    }
  }

  private drawCell(
    x: number,
    y: number,
    colorIndex: number,
    resolve: number | string,
    links: { right: boolean; down: boolean; corner: boolean },
  ): void {
    const color = COLORS[colorIndex % COLORS.length];
    const inset = 2;
    const left = x * this.cellSize;
    const top = y * this.cellSize;
    this.boardGraphics.fillStyle(color, 1);
    this.boardGraphics.fillRoundedRect(
      left + inset,
      top + inset,
      this.cellSize - inset * 2,
      this.cellSize - inset * 2,
      5,
    );
    const inner = this.cellSize - inset * 2;
    if (links.right) this.boardGraphics.fillRect(left + this.cellSize - inset - 5, top + inset, inset * 2 + 10, inner);
    if (links.down) this.boardGraphics.fillRect(left + inset, top + this.cellSize - inset - 5, inner, inset * 2 + 10);
    if (links.right && links.down && links.corner) {
      this.boardGraphics.fillRect(left + this.cellSize - inset - 5, top + this.cellSize - inset - 5, inset * 2 + 10, inset * 2 + 10);
    }
    const text = this.add.text(
      x * this.cellSize + this.cellSize / 2,
      y * this.cellSize + this.cellSize / 2,
      String(resolve),
      { color: '#111827', fontFamily: 'Arial Black, sans-serif', fontSize: '16px' },
    ).setOrigin(0.5);
    this.cells.push(text);
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
