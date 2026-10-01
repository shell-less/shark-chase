/** Validation for presence patches. Anything that doesn't match is dropped whole. */

const isRole = (v: unknown) => v === 'turtle' || v === 'shark'
const isCount = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1e6
const isCoord = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e4

const CHECKS: Record<string, (v: unknown) => boolean> = {
  base: v => v === null || isRole(v),
  rd: isCount,
  res: v =>
    v === null ||
    (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 2 && isCount((v as { r: unknown }).r) && isRole((v as { w: unknown }).w)),
  x: isCoord,
  y: isCoord,
  a: isCoord,
  dd: v => v === 0 || v === 1,
  role: isRole,
}

export function validPatch(p: unknown): p is Record<string, unknown> {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false
  const keys = Object.keys(p)
  return keys.length > 0 && keys.every(k => Object.hasOwn(CHECKS, k) && CHECKS[k]((p as Record<string, unknown>)[k]))
}
