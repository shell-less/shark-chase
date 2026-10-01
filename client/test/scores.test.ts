import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bestScore, bestScoresText, recordScore } from '../src/scores'

function fakeStorage() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

describe('scores', () => {
  beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()))

  it('keeps the prototype storage keys', () => {
    localStorage.setItem('chase-best', '120')
    localStorage.setItem('shark-best', '7')
    expect([bestScore('turtle'), bestScore('shark')]).toEqual([120, 7])
  })

  it('records only new bests', () => {
    expect(recordScore('turtle', 50)).toBe(true)
    expect(recordScore('turtle', 40)).toBe(false)
    expect(recordScore('turtle', 50)).toBe(false)
    expect(bestScore('turtle')).toBe(50)
    expect(recordScore('shark', 0)).toBe(false)
  })

  it('formats the menu line', () => {
    expect(bestScoresText()).toBeNull()
    recordScore('shark', 1)
    expect(bestScoresText()).toBe('High scores: Shark 1 catch')
    recordScore('turtle', 132)
    recordScore('shark', 9)
    expect(bestScoresText()).toBe('High scores: Turtle 132 points · Shark 9 catches')
  })

  it('treats unavailable storage as no scores', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } })
    expect(bestScore('turtle')).toBe(0)
    // Like the prototype: it still beats the (unknown) best, it just can't be kept.
    expect(recordScore('turtle', 10)).toBe(true)
    expect(bestScoresText()).toBeNull()
  })
})
