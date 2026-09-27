import { describe, expect, it } from 'vitest';
import { nextMultiplier } from './multiplier';

describe('score multiplier', () => {
  it('increases once for a lock that destroys through a same-color contact', () => {
    expect(nextMultiplier(1, true)).toBe(2);
    expect(nextMultiplier(4, true)).toBe(5);
  });

  it('resets to one when a lock has no same-color destruction', () => {
    expect(nextMultiplier(4, false)).toBe(1);
  });
});
