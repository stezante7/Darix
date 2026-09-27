import { describe, expect, it } from 'vitest';
import { MAX_MULTI_COLOR_CHANCE, multiColorChance, pieceColors } from './colors';

/** Replays a fixed list of random values, then repeats the last one. */
function sequence(...values: number[]) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

describe('piece colors', () => {
  it('keeps every piece single-color at low speed', () => {
    expect(multiColorChance(1)).toBe(0);
    expect(multiColorChance(2)).toBe(0);
    expect(pieceColors(1.2, 4, 6, sequence(0.5, 0))).toEqual([3, 3, 3, 3]);
  });

  it('makes multi-color pieces more likely as speed rises, up to a cap', () => {
    expect(multiColorChance(3.5)).toBeCloseTo(MAX_MULTI_COLOR_CHANCE / 2);
    expect(multiColorChance(5)).toBe(MAX_MULTI_COLOR_CHANCE);
  });

  it('never uses more than two colors below three-color speed', () => {
    let state = 1;
    const random = () => {
      state = (state * 16807) % 2147483647;
      return state / 2147483647;
    };
    const counts = Array.from({ length: 200 }, () => new Set(pieceColors(3.4, 4, 6, random)).size);

    expect(Math.max(...counts)).toBe(2);
    expect(counts).toContain(1);
  });

  it('can split a piece into three colors at high speed', () => {
    // base color, multi-color roll, three-color roll, then extra picks and shuffle.
    const colors = pieceColors(4, 4, 6, sequence(0, 0, 0, 0.2, 0.5, 0.9, 0.1, 0.6));
    expect(new Set(colors).size).toBe(3);
    expect(colors).toHaveLength(4);
  });
});
