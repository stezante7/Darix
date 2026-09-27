export function nextMultiplier(currentMultiplier: number, sameColorDestroyed: boolean): number {
  return sameColorDestroyed ? currentMultiplier + 1 : 1;
}
