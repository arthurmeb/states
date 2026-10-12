import { connect, disconnect, handle } from '../game/instance'

export default defineWebSocketHandler({
  open(peer) {
    // a client can vanish mid-write; never let that take the world down
    connect(peer.id, data => {
      try {
        const r = peer.send(data) as unknown
        if (r && typeof (r as Promise<unknown>).catch === 'function') (r as Promise<unknown>).catch(() => disconnect(peer.id))
      } catch { disconnect(peer.id) }
    })
  },
  message(peer, message) {
    handle(peer.id, message.text())
  },
  close(peer) {
    disconnect(peer.id)
  },
  error(peer) {
    disconnect(peer.id)
  },
})
