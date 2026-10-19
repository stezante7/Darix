import { describe, expect, it } from 'vitest';
import { createPiece } from './board';
import { getPiecePreview } from './preview';

describe('next-piece preview', () => {
  it('centers a piece and carries its single color into the preview', () => {
    const piece = createPiece(1, 4);

    expect(getPiecePreview(piece)).toEqual([
      { x: 1, y: 0, color: 4 },
      { x: 2, y: 0, color: 4 },
      { x: 1, y: 1, color: 4 },
      { x: 2, y: 1, color: 4 },
    ]);
  });
});
