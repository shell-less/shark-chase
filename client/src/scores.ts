/** Personal bests per solo mode, kept in localStorage. Storage can be unavailable (private windows), so every access is guarded. */

type SoloMode = 'turtle' | 'shark'

const KEYS: Record<SoloMode, string> = { turtle: 'chase-best', shark: 'shark-best' }

export function bestScore(mode: SoloMode): number {
  try {
    return +(localStorage.getItem(KEYS[mode]) ?? 0) || 0
  } catch {
    return 0
  }
}

/** Saves `score` if it beats the stored best. Returns whether it's a new best. */
export function recordScore(mode: SoloMode, score: number): boolean {
  if (score <= bestScore(mode)) return false
  try {
    localStorage.setItem(KEYS[mode], String(score))
  } catch {}
  return true
}

/** The high-score line for the main menu, or null before any scores exist. */
export function bestScoresText(): string | null {
  const t = bestScore('turtle'), s = bestScore('shark')
  const parts = [t && 'Turtle ' + t + ' points', s && 'Shark ' + s + (s === 1 ? ' catch' : ' catches')].filter(Boolean)
  return parts.length ? 'High scores: ' + parts.join(' · ') : null
}
