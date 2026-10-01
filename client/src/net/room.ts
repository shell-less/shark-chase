import type { Role } from '../state'

/** What each duel player shares. Field names are the wire format, so keep them short and stable. */
export interface Presence {
  /** The room creator's chosen side for round 1. */
  base?: Role | null
  /** Ready for this round number. */
  rd?: number
  /** Round result: round number and winning side. */
  res?: { r: number; w: Role } | null
  x?: number
  y?: number
  a?: number
  /** 1 while dashing. */
  dd?: number
  role?: Role
}

export interface Peer {
  isMe: boolean
  presence: Presence
}

/** A two-player room built on shared presence. */
export interface Room {
  /** Merges `patch` into our presence and shares it. */
  presence(patch: Presence): void
  /** Called whenever any peer's presence changes. */
  onPeers(cb: () => void): void
  /** Every player currently in the room, including us. */
  peers(): Peer[]
  /** Connection changes: `reconnecting` after a drop, `connected` once back, `lost` when it can't get back in. */
  onStatus(cb: (status: RoomStatus) => void): void
  /** Called when the other player leaves on purpose (Back, closing the tab), as opposed to dropping. */
  onPeerLeft(cb: () => void): void
  leave(): void
}

export type RoomStatus = 'connected' | 'reconnecting' | 'lost'
