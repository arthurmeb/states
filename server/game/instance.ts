import { join } from 'node:path'
import type { ClientMsg, ServerMsg } from '../../shared/types'
import { DEFAULT_MONTH_MS, DAYS_PER_MONTH } from '../../shared/rules'
import { Game, GameError } from './world'

/** Real milliseconds per game month (default: one hour). Set GAME_MONTH_MS to speed up for development. */
export const MONTH_MS = Number(process.env.GAME_MONTH_MS) || DEFAULT_MONTH_MS
export const DAY_MS = MONTH_MS / DAYS_PER_MONTH

interface Client { send: (data: string) => void; token: string | null }
interface Server { game: Game; clients: Map<string, Client>; timer?: ReturnType<typeof setInterval> }
const g = globalThis as unknown as { __states?: Server }

export function server(): Server {
  if (!g.__states) {
    const game = new Game(process.env.STATES_DATA_DIR || join(process.cwd(), '.data'), join(process.cwd(), 'public'))
    const s: Server = { game, clients: new Map() }
    s.timer = setInterval(() => {
      try { game.step() } catch (e) { console.error('[states] tick failed', e) }
      broadcast(s)
    }, DAY_MS)
    const shutdown = () => { try { game.save() } catch { /* ignore */ } }
    process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown)
    g.__states = s
    console.log(`[states] world online — 1 game month = ${(MONTH_MS / 60000).toFixed(1)} real minutes (1 day = ${(DAY_MS / 1000).toFixed(1)}s)`)
  }
  return g.__states
}

function send(c: Client, msg: ServerMsg) { try { c.send(JSON.stringify(msg)) } catch { /* closed */ } }
export function broadcast(s: Server) { for (const c of s.clients.values()) send(c, s.game.snapshot(c.token, DAY_MS)) }
export function connect(id: string, sendFn: (d: string) => void) { server().clients.set(id, { send: sendFn, token: null }) }
export function disconnect(id: string) {
  const s = server(), c = s.clients.get(id)
  s.clients.delete(id)
  if (c?.token && ![...s.clients.values()].some(o => o.token === c.token)) s.game.online.delete(c.token)
}

export function handle(id: string, raw: string) {
  const s = server(), game = s.game
  const c = s.clients.get(id)
  if (!c) return
  let msg: ClientMsg
  try { msg = JSON.parse(raw) } catch { return }
  try {
    if (msg.t === 'hello') {
      let token = typeof msg.token === 'string' && msg.token.length >= 16 ? msg.token.slice(0, 64) : ''
      if (!token) token = game.newToken()
      if (!(token in game.players)) game.players[token] = null
      c.token = token
      game.online.add(token)
      send(c, { t: 'welcome', token, nation: game.players[token], chat: game.chat })
      send(c, game.snapshot(token, DAY_MS))
      return
    }
    if (!c.token) return
    if (msg.t === 'inspect') {
      if (game.P[+msg.province]) send(c, { t: 'province', detail: game.provinceDetail(+msg.province) })
      return
    }
    const me = game.playerNation(c.token)
    if (msg.t === 'chat') {
      const m = game.addChat(me, String(msg.text ?? ''))
      if (m) for (const o of s.clients.values()) send(o, { t: 'chat', msg: m })
      return
    }
    if (msg.t === 'found') {
      const n = game.found(c.token, +msg.province, String(msg.name ?? ''), String(msg.leader ?? ''), String(msg.color ?? ''), String(msg.motto ?? ''))
      send(c, { t: 'toast', msg: `Long live ${n.name}!` })
      game.save()
      return broadcast(s)
    }
    if (!me) throw new GameError('Found a nation first.')
    const other = (nid: number) => {
      const o = game.nation(+nid)
      if (!o || o.id === me.id) throw new GameError('Unknown nation.')
      return o
    }
    const toast = (m: string) => send(c, { t: 'toast', msg: m })
    switch (msg.t) {
      case 'policy': game.setPolicy(me, String(msg.id), msg.value); break
      case 'budget': game.setBudget(me, msg.budget ?? {}); break
      case 'subsidies': game.setSubsidies(me, Array.isArray(msg.sectors) ? msg.sectors : []); break
      case 'local': game.setLocal(me, +msg.province, msg.id, String(msg.value)); break
      case 'build': { const cost = game.build(me, +msg.province, String(msg.project)); toast(`Construction begins: $${cost}B committed`); break }
      case 'claim': { const cost = game.claim(me, +msg.province); toast(`Annexed ${game.P[+msg.province].name} for $${cost}B`); break }
      case 'deploy': game.deploy(me, +msg.province, +msg.amount); break
      case 'autodeploy': game.autodeploy(me, 0.1); toast('Reserves deployed to the borders'); break
      case 'attack': game.attack(me, +msg.target, +msg.amount); toast('Offensive launched — troops are on the move'); break
      case 'declare': game.declareWar(me, other(msg.nation)); break
      case 'propose': { const o = other(msg.nation); game.propose(me, o, msg.kind, msg.kind === 'bloc' ? me.tradeBloc ?? undefined : undefined); toast(`Proposal sent to ${o.name}`); break }
      case 'respond': game.respond(me, +msg.proposal, !!msg.accept); break
      case 'cancel': game.cancel(me, other(msg.nation), msg.kind); break
      case 'tariff': game.setTariff(me, other(msg.nation), msg.rate == null ? null : +msg.rate); break
      case 'embargo': game.toggleList(me, other(msg.nation), 'embargoes', !!msg.on); break
      case 'sanction': game.toggleList(me, other(msg.nation), 'sanctions', !!msg.on); break
      case 'blockade': game.toggleList(me, other(msg.nation), 'blockades', !!msg.on); break
      case 'aid': game.toggleList(me, other(msg.nation), 'aidTargets', !!msg.on); break
      case 'createBloc': game.createBloc(me, String(msg.name ?? ''), +msg.cet); break
      case 'inviteBloc': {
        if (me.tradeBloc == null) throw new GameError('Found or join a trade bloc first.')
        const o = other(msg.nation)
        game.propose(me, o, 'bloc', me.tradeBloc)
        toast(`Invitation sent to ${o.name}`)
        break
      }
      case 'leaveBloc': game.leaveBloc(me); break
      case 'bid': game.bid(me, +msg.amount); break
      case 'issue': toast(`Decree issued: ${game.answerIssue(me, +msg.option)}`); break
      case 'capital': game.moveCapital(me, +msg.province); break
      case 'abandon': game.abandon(me); game.save(); break
    }
    broadcast(s)
  } catch (e) {
    if (e instanceof GameError) send(c, { t: 'error', msg: e.message })
    else { console.error('[states] action failed', e); send(c, { t: 'error', msg: 'Something went wrong.' }) }
  }
}
