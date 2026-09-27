import { ActivePiece, Point } from './board';

export const PREVIEW_WIDTH = 4;
export const PREVIEW_HEIGHT = 2;

export interface PreviewCell extends Point {
  color: number;
  resolve: number;
}

export function getPiecePreview(piece: ActivePiece): PreviewCell[] {
  const minX = Math.min(...piece.blocks.map((block) => block.x));
  const minY = Math.min(...piece.blocks.map((block) => block.y));
  const width = Math.max(...piece.blocks.map((block) => block.x)) - minX + 1;
  const height = Math.max(...piece.blocks.map((block) => block.y)) - minY + 1;
  const offsetX = Math.floor((PREVIEW_WIDTH - width) / 2);
  const offsetY = Math.floor((PREVIEW_HEIGHT - height) / 2);

  return piece.blocks.map((block, index) => ({
    x: block.x - minX + offsetX,
    y: block.y - minY + offsetY,
    color: piece.colors[index],
    resolve: piece.resolves[index] ?? 1,
  }));
}
