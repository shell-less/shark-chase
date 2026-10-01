export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Wraps an angle difference into [-PI, PI]. */
export const wrapAngle = (d: number) => Math.atan2(Math.sin(d), Math.cos(d))

/** Turns `angle` toward `target` by at most `maxStep` radians. */
export const turnToward = (angle: number, target: number, maxStep: number) =>
  angle + clamp(wrapAngle(target - angle), -maxStep, maxStep)

/** Distance from a shark's centre to its jaws, along its heading. */
export const JAW_OFFSET = 24

export function jawPoint(x: number, y: number, angle: number) {
  return { x: x + Math.cos(angle) * JAW_OFFSET, y: y + Math.sin(angle) * JAW_OFFSET }
}
