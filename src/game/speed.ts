export const BASE_DROP_INTERVAL = 700;
export const MIN_DROP_INTERVAL = 120;
export const MIN_SPEED = 1;
export const MAX_SPEED = 5;
/** A lock that makes a color contact or completes a row speeds the fall up... */
export const SPEED_UP = 0.2;
/** ...and a lock that does neither slows it back down. */
export const SLOW_DOWN = 0.1;

export function nextSpeed(speed: number, hit: boolean): number {
  const next = speed + (hit ? SPEED_UP : -SLOW_DOWN);
  return Math.round(Math.min(MAX_SPEED, Math.max(MIN_SPEED, next)) * 10) / 10;
}

export function dropIntervalForSpeed(speed: number): number {
  return Math.max(MIN_DROP_INTERVAL, Math.round(BASE_DROP_INTERVAL / speed));
}
