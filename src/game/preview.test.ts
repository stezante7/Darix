import { describe, expect, it } from 'vitest';
import { createPiece } from './board';
import { getPiecePreview } from './preview';

describe('next-piece preview', () => {
  it('centers a piece and carries its color and resolve values into the preview', () => {
    const piece = createPiece(1, 4, () => 0.5);

    expect(getPiecePreview(piece)).toEqual([
      { x: 1, y: 0, color: 4, resolve: 3 },
      { x: 2, y: 0, color: 4, resolve: 3 },
      { x: 1, y: 1, color: 4, resolve: 3 },
      { x: 2, y: 1, color: 4, resolve: 3 },
    ]);
  });
});
