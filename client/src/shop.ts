import { STAMINA_BONUS_TIME, type GameState, type Mode, type Upgrade } from './state'

/** Buys upgrade `i` from `table` if affordable and not maxed. Returns whether it bought. */
export function tryBuy(s: GameState, table: Upgrade[], i: number): boolean {
  const u = table[i]
  if (!u || s.over) return false
  const lv = s.up[u.key], c = u.cost(lv)
  if (lv >= u.max || s.coins < c) return false
  s.coins -= c
  s.up[u.key]++
  if (u.key === 'stamina') s.timeLeft += STAMINA_BONUS_TIME
  return true
}

/** Rebuilds the shop buttons. Call whenever coins or upgrade levels change. */
export function renderShop(el: HTMLElement, table: Upgrade[], s: GameState, mode: Mode, onBuy: (i: number) => void) {
  el.innerHTML = ''
  table.forEach((u, i) => {
    const lv = s.up[u.key], c = u.cost(lv), b = document.createElement('button')
    b.innerHTML = `${i + 1} ${u.name} ${lv}/${u.max}<br>${lv >= u.max ? 'maxed' : c + (mode === 'shark' ? ' catches' : ' pearls')}`
    b.disabled = lv >= u.max || s.coins < c
    b.onclick = () => onBuy(i)
    el.appendChild(b)
  })
}
