const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

/** Every DOM element the game touches. */
export const ui = {
  canvas: el<HTMLCanvasElement>('c'),
  overlay: el('ov'),
  title: el('t'),
  message: el('m'),
  shop: el('shop'),
  dash: el<HTMLButtonElement>('dash'),
  soloRow: el('solo'),
  playTurtle: el<HTMLButtonElement>('b'),
  playShark: el<HTMLButtonElement>('bs'),
  duel: el<HTMLButtonElement>('bd'),
  duelPanel: el('dp'),
  duelStatus: el('ds'),
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
export const hideOverlay = () => (ui.overlay.style.display = 'none')
export const overlayVisible = () => ui.overlay.style.display !== 'none'
