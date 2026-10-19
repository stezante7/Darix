import { RandomSource } from './board';

/**
 * Picks the one color of a new piece. Every block shares it, and rotation advances it;
 * difficulty comes from fall speed alone, not from mixed-color pieces.
 */
export function pieceColor(
  paletteSize: number,
  random: RandomSource = Math.random,
): number {
  return Math.min(paletteSize - 1, Math.floor(random() * paletteSize));
}
