import { RandomSource } from './board';

/** Multi-color pieces start appearing at this speed... */
export const MULTI_COLOR_FROM_SPEED = 2;
/** ...become more likely until this speed... */
export const MULTI_COLOR_FULL_SPEED = 5;
/** ...up to this chance per piece. */
export const MAX_MULTI_COLOR_CHANCE = 0.6;
/** From this speed a multi-color piece can have three colors instead of two. */
export const THREE_COLORS_FROM_SPEED = 3.5;

export function multiColorChance(speed: number): number {
  const progress = (speed - MULTI_COLOR_FROM_SPEED) / (MULTI_COLOR_FULL_SPEED - MULTI_COLOR_FROM_SPEED);
  return Math.min(MAX_MULTI_COLOR_CHANCE, Math.max(0, progress * MAX_MULTI_COLOR_CHANCE));
}

/**
 * Picks one color per block for a new piece. At low speed every block shares one color; as speed
 * rises, pieces are more often split into two (later up to three) distinct colors.
 */
export function pieceColors(
  speed: number,
  blockCount: number,
  paletteSize: number,
  random: RandomSource = Math.random,
): number[] {
  const pick = (max: number) => Math.min(max - 1, Math.floor(random() * max));
  const base = pick(paletteSize);
  if (random() >= multiColorChance(speed)) return Array<number>(blockCount).fill(base);

  const distinct = speed >= THREE_COLORS_FROM_SPEED && random() < 0.5 ? 3 : 2;
  const palette = [base];
  while (palette.length < Math.min(distinct, paletteSize, blockCount)) {
    const color = pick(paletteSize);
    if (!palette.includes(color)) palette.push(color);
  }

  // Every chosen color appears at least once; the remaining blocks draw from the chosen colors.
  const colors = palette.concat(
    Array.from({ length: blockCount - palette.length }, () => palette[pick(palette.length)]),
  );
  for (let index = colors.length - 1; index > 0; index -= 1) {
    const swap = pick(index + 1);
    [colors[index], colors[swap]] = [colors[swap], colors[index]];
  }
  return colors;
}
