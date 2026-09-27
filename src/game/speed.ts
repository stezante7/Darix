export const BASE_DROP_INTERVAL = 700;
export const MIN_DROP_INTERVAL = 120;
export const MIN_SPEED = 1;
export const MAX_SPEED = 5;
/** A lock that makes a color contact or completes a row speeds the fall up by this much at 1×... */
export const SPEED_UP = 0.1;
/** ...shrinking linearly to this fraction of it at top speed, so high speeds take more hits to reach. */
export const SPEED_UP_AT_MAX = 0.5;
/** A lock that does neither slows it back down. */
export const SLOW_DOWN = 0.07;

export function nextSpeed(speed: number, hit: boolean): number {
  const progress = (speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED);
  const step = hit ? SPEED_UP * (1 - progress * (1 - SPEED_UP_AT_MAX)) : -SLOW_DOWN;
  return Math.round(Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed + step)) * 100) / 100;
}

export function dropIntervalForSpeed(speed: number): number {
  return Math.max(MIN_DROP_INTERVAL, Math.round(BASE_DROP_INTERVAL / speed));
}
