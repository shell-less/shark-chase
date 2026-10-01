import type { JoinRoom, Peer, Presence, Room } from './room'

interface ClaudePeer {
  isMe: boolean
  kind?: string
  presence: Presence
}

interface ClaudeRoom extends Omit<Room, 'peers'> {
  peers(): ClaudePeer[]
}

declare global {
  interface Window {
    claude?: { use(cap: 'room'): Promise<{ join(name: string): Promise<ClaudeRoom> } | null> }
  }
}

/** Rooms only exist inside the claude.ai Artifact runtime. */
export const claudeRoomsAvailable = () => !!window.claude

/** Joins through the claude.ai Artifact runtime. Resolves null when opened anywhere else. */
export const joinClaudeRoom: JoinRoom = async name => {
  const R = window.claude ? await window.claude.use('room') : null
  if (!R) return null
  const room = await R.join(name)
  return {
    presence: patch => room.presence(patch),
    onPeers: cb => room.onPeers(cb),
    // Only viewers are players; other peer kinds aren't part of the duel.
    peers: (): Peer[] => room.peers().filter(p => p.kind === 'viewer'),
    leave: () => room.leave(),
  }
}
