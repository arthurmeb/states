import { server } from '../game/instance'
export default defineEventHandler(() => { const s = server(); return { ok: true, tick: s.game.tick, clients: s.clients.size } })
