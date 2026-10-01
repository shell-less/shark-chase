/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the room Worker, e.g. https://shark-chase.<account>.workers.dev. Duels are hidden without it. */
  readonly VITE_ROOM_URL?: string
}
