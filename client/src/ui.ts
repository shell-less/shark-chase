import { bestScoresText } from './scores'

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

/** Every DOM element the game touches. */
export const ui = {
  canvas: el<HTMLCanvasElement>('c'),
  overlay: el('ov'),
  title: el('t'),
  message: el('m'),
  best: el('hs'),
  shop: el('shop'),
  dash: el<HTMLButtonElement>('dash'),
  pause: el<HTMLButtonElement>('pause'),
  soloRow: el('solo'),
  playTurtle: el<HTMLButtonElement>('b'),
  playShark: el<HTMLButtonElement>('bs'),
  duel: el<HTMLButtonElement>('bd'),
  pauseRow: el('pz'),
  resume: el<HTMLButtonElement>('resume'),
  quit: el<HTMLButtonElement>('quit'),
  duelPanel: el('dp'),
  duelStatus: el('ds'),
  duelNotice: el('dn'),
  createRow: el('d1'),
  joinRow: el('d2'),
  createTurtle: el<HTMLButtonElement>('dct'),
  createShark: el<HTMLButtonElement>('dcs'),
  codeInput: el<HTMLInputElement>('ci'),
  join: el<HTMLButtonElement>('dj'),
  ready: el<HTMLButtonElement>('dr'),
  back: el<HTMLButtonElement>('dx'),
}

export const MENU_TEXT = ui.message.textContent ?? ''

export const showOverlay = () => (ui.overlay.style.display = 'flex')
export function hideOverlay() {
  ui.overlay.style.display = 'none'
  ui.best.hidden = true
}

/** Puts the overlay back to the main menu, with the current high scores. */
export function showMainMenu() {
  ui.title.textContent = 'Shark Chase'
  ui.message.textContent = MENU_TEXT
  const best = bestScoresText()
  ui.best.textContent = best ?? ''
  ui.best.hidden = !best
  showOverlay()
}
export const overlayVisible = () => ui.overlay.style.display !== 'none'
