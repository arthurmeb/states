import { server } from '../game/instance'

// Boot the world simulation as soon as the server starts, not on first connection,
// and persist it when the server shuts down (including dev hot-reloads).
export default defineNitroPlugin(nitroApp => {
  // socket errors from departed clients must not crash the shared world
  process.on('unhandledRejection', e => console.warn('[states] ignored rejection:', (e as Error)?.message ?? e))
  const s = server()
  nitroApp.hooks.hook('close', () => {
    clearInterval(s.timer)
    try { s.game.save() } catch (e) { console.error('[states] save on close failed', e) }
    delete (globalThis as { __states?: unknown }).__states
  })
})
