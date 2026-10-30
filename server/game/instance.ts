import { join } from 'node:path'
import type { ClientMsg, ServerMsg } from '../../shared/types'
import { DEFAULT_MONTH_MS, DAYS_PER_MONTH } from '../../shared/rules'
import { Game, GameError } from './world'
import { claim, login, accountOf } from './accounts'
import { roomsFor, canSee, createThread, openDM, createGroup, editGroup, say, history } from './comms'
import { propose, respond, renounce, normalize, compileContext } from './deals'
import { compileDeal, llmEnabled } from './llm'
import type { RoomMsg } from '../../shared/types'
import { callElection, campaign, noConfidence, spendPC, partyName } from './power'
import { ELECTORAL, PARTY_MAP } from '../../shared/power'
import { BLOCS, type BlocId } from '../../shared/policies'

/** Real milliseconds per game month (default: one hour). Set GAME_MONTH_MS to speed up for development. */
export const MONTH_MS = Number(process.env.GAME_MONTH_MS) || DEFAULT_MONTH_MS
export const DAY_MS = MONTH_MS / DAYS_PER_MONTH

interface Client { send: (data: string) => void; token: string | null; fails?: number[]; said?: number[] }
interface Server { game: Game; clients: Map<string, Client>; timer?: ReturnType<typeof setTimeout>; speed: number; lastBroadcast: number }
/** Admin accounts (fast-forward, world reset). Comma-separated usernames; defaults to Century. */
const ADMINS = new Set((process.env.STATES_ADMINS ?? 'century').split(',').map(s => s.trim().toLowerCase()).filter(Boolean))
const DEV = process.env.NODE_ENV !== 'production'
/** Admin controls belong to the admin accounts (and anyone on a local dev server). */
export const isAdmin = (token: string | null) => DEV || ADMINS.has((accountOf(server().game.accounts, token) ?? '').toLowerCase())
const MIN_DAY_MS = 60 // the simulation needs ~40 ms per day
const dayMs = (s: Server) => Math.max(MIN_DAY_MS, DAY_MS / s.speed)

function loop(s: Server) {
  s.timer = setTimeout(() => {
    try { s.game.step() } catch (e) { console.error('[states] tick failed', e) }
    // treaty events raised by the simulation (breaches, expiries, AI answers)
    if (s.game.dealMsgs.length) { const m = s.game.dealMsgs.splice(0); pushComms(s, m); for (const c of s.clients.values()) sendDeals(s, c) }
    // at high speed, don't flood clients: at most ~4 snapshots a second
    const now = Date.now()
    if (now - s.lastBroadcast >= 250) { s.lastBroadcast = now; broadcast(s) }
    loop(s)
  }, dayMs(s))
}
export function setSpeed(x: number) {
  const s = server()
  s.speed = Math.max(1, Math.min(2000, Math.round(x)))
  clearTimeout(s.timer); loop(s); broadcast(s)
  console.log(`[states] speed ×${s.speed}`)
}
const g = globalThis as unknown as { __states?: Server }

export function server(): Server {
  if (!g.__states) {
    const game = new Game(process.env.STATES_DATA_DIR || join(process.cwd(), '.data'), join(process.cwd(), 'public'))
    const s: Server = { game, clients: new Map(), speed: 1, lastBroadcast: 0 }
    loop(s)
    const shutdown = () => { try { game.save() } catch { /* ignore */ } }
    process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown)
    g.__states = s
    console.log(`[states] world online — 1 game month = ${(MONTH_MS / 60000).toFixed(1)} real minutes (1 day = ${(DAY_MS / 1000).toFixed(1)}s)`)
  }
  return g.__states
}

function send(c: Client, msg: ServerMsg) { try { c.send(JSON.stringify(msg)) } catch { /* closed */ } }
const snap = (s: Server, token: string | null) => ({ ...s.game.snapshot(token, dayMs(s)), speed: s.speed, canSpeed: isAdmin(token) })
/** The conversations a client can see. */
/** The deals this client's nation is part of, and whether free-text drafting is available. */
function sendDeals(s: Server, c: Client) {
  const n = c.token ? s.game.playerNation(c.token) : undefined
  send(c, { t: 'deals', deals: n ? s.game.deals.list.filter(d => d.a === n.id || d.b === n.id).slice(-80) : [], llm: llmEnabled() })
}
function sendRooms(s: Server, c: Client) { send(c, { t: 'rooms', rooms: roomsFor(s.game, c.token ? s.game.playerNation(c.token) : undefined) }) }
/** Deliver new messages to everyone who can read them, and refresh room lists. */
function pushComms(s: Server, msgs: RoomMsg[]) {
  for (const o of s.clients.values()) {
    const n = o.token ? s.game.playerNation(o.token) : undefined
    const mine = msgs.filter(m => { const r = s.game.comms.rooms.find(x => x.id === m.room); return r && canSee(s.game, r, n) })
    if (mine.length) send(o, { t: 'roomMsgs', msgs: mine })
    sendRooms(s, o)
  }
}

export function broadcast(s: Server) { for (const c of s.clients.values()) send(c, snap(s, c.token)) }
export function connect(id: string, sendFn: (d: string) => void) { server().clients.set(id, { send: sendFn, token: null }) }
export function disconnect(id: string) {
  const s = server(), c = s.clients.get(id)
  s.clients.delete(id)
  if (c?.token && ![...s.clients.values()].some(o => o.token === c.token)) s.game.online.delete(c.token)
}

const userFails = new Map<string, number[]>()

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
      send(c, { t: 'welcome', token, nation: game.players[token], account: accountOf(game.accounts, token) })
      sendRooms(s, c); sendDeals(s, c)
      send(c, snap(s, token))
      return
    }
    if (!c.token) return
    if (msg.t === 'login') {
      // at most 5 failed attempts a minute per connection, and 10 per 10 minutes per username
      const now = Date.now(), who = String(msg.user ?? '').trim().toLowerCase()
      c.fails = (c.fails ?? []).filter(t => now - t < 60_000)
      const uf = (userFails.get(who) ?? []).filter(t => now - t < 600_000)
      userFails.set(who, uf)
      if (c.fails.length >= 5 || uf.length >= 10) throw new GameError('Too many attempts. Wait a few minutes and try again.')
      try { send(c, { t: 'login', token: login(game.accounts, who, String(msg.pass ?? '')) }) } catch (e) { c.fails.push(now); uf.push(now); throw e }
      return
    }
    if (msg.t === 'register') {
      const recovery = claim(game.accounts, c.token, String(msg.user ?? ''), String(msg.pass ?? ''), game.tick)
      game.save()
      send(c, { t: 'account', user: String(msg.user).trim(), recovery })
      return
    }
    if (msg.t === 'trajectory') {
      const data = game.trajectory(+msg.nation)
      if (data) send(c, { t: 'trajectory', data })
      return
    }
    if (msg.t === 'speed') {
      if (!isAdmin(c.token)) throw new GameError('Only the admin can change the speed of time.')
      setSpeed(+msg.x || 1); return
    }
    if (msg.t === 'adminReset') {
      if (!isAdmin(c.token)) throw new GameError('Only the admin can reset the world.')
      setSpeed(1)
      game.resetWorld()
      for (const o of s.clients.values()) if (o.token) { send(o, { t: 'welcome', token: o.token, nation: null, account: accountOf(game.accounts, o.token) }); sendRooms(s, o) }
      console.log('[states] world reset by admin')
      return broadcast(s)
    }
    if (msg.t === 'inspect') {
      if (game.P[+msg.province]) send(c, { t: 'province', detail: game.provinceDetail(+msg.province) })
      return
    }
    const me = game.playerNation(c.token)
    // ── communications (open to everyone with a nation, in or out of office) ──
    if (msg.t === 'history') { send(c, { t: 'history', room: +msg.room, msgs: history(game, me, +msg.room) }); return }
    // ── deals & treaties (any nation may negotiate; signing binds the state, so only governments can) ──
    if (msg.t === 'dealCompile') {
      if (!me) throw new GameError('Found a nation first.')
      const other = game.nation(+msg.to)
      if (!other || other.id === me.id) throw new GameError('Unknown nation.')
      const ctx = compileContext(game, me, other)
      send(c, { t: 'toast', msg: '⚖ Your lawyers are drafting the treaty…' })
      compileDeal(String(msg.text ?? ''), ctx)
        .then(r => send(c, { t: 'dealDraft', to: other.id, title: r.title, clauses: normalize(game, me, other, r.clauses), notes: r.notes }))
        .catch(e => send(c, { t: 'error', msg: `Drafting failed: ${(e as Error).message}` }))
      return
    }
    if (msg.t === 'dealPropose' || msg.t === 'dealRespond' || msg.t === 'dealRenounce') {
      if (!me) throw new GameError('Found a nation first.')
      if (me.power.office !== 'governing') throw new GameError('Only a government can sign treaties.')
      if (msg.t === 'dealPropose') {
        const other = game.nation(+msg.to)
        if (!other?.alive || other.id === me.id) throw new GameError('Unknown nation.')
        propose(game, me, other, String(msg.title ?? ''), String(msg.text ?? ''), normalize(game, me, other, Array.isArray(msg.clauses) ? msg.clauses : []), String(msg.notes ?? ''))
      } else if (msg.t === 'dealRespond') respond(game, me, +msg.id, !!msg.accept)
      else renounce(game, me, +msg.id)
      pushComms(s, game.dealMsgs.splice(0))
      for (const o of s.clients.values()) sendDeals(s, o)
      return broadcast(s)
    }
    if (['thread', 'say', 'dm', 'group', 'groupEdit'].includes(msg.t)) {
      if (!me) throw new GameError('Found a nation to join the conversation.')
      const user = accountOf(game.accounts, c.token)
      const now = Date.now()
      c.said = (c.said ?? []).filter(t => now - t < 10_000)
      if (c.said.length >= 6) throw new GameError('Slow down a little.')
      c.said.push(now)
      let open: number | null = null, msgs: RoomMsg[] = []
      if (msg.t === 'thread') { const r = createThread(game, me, user, String(msg.title ?? ''), String(msg.text ?? '')); open = r.room.id; msgs = r.msgs }
      else if (msg.t === 'say') msgs = say(game, me, user, +msg.room, String(msg.text ?? ''))
      else if (msg.t === 'dm') { const o = game.nation(+msg.nation); if (!o) throw new GameError('Unknown nation.'); open = openDM(game, me, o).id }
      else if (msg.t === 'group') open = createGroup(game, me, String(msg.title ?? ''), Array.isArray(msg.members) ? msg.members.map(Number) : []).id
      else if (msg.t === 'groupEdit') editGroup(game, me, +msg.room, Array.isArray(msg.add) ? msg.add.map(Number) : [], !!msg.leave)
      pushComms(s, msgs)
      if (open != null) send(c, { t: 'openRoom', room: open })
      return
    }
    if (msg.t === 'found') {
      const n = game.found(c.token, +msg.province, String(msg.name ?? ''), String(msg.leader ?? ''), String(msg.color ?? ''), String(msg.motto ?? ''), msg.party ? String(msg.party) : undefined)
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
    const P = me.power
    const pay = (cost: number, what: string) => { const err = spendPC(me, cost, what); if (err) throw new GameError(err) }
    // ── politics: available in and out of office ──
    switch (msg.t) {
      case 'campaign': {
        if (!BLOCS.some(b => b.id === msg.bloc)) throw new GameError('Unknown faction.')
        if (!ELECTORAL.has(String(me.policy.government))) throw new GameError('There are no elections to campaign for.')
        pay(8, 'a campaign')
        campaign(me, msg.bloc as BlocId)
        toast(`Campaigning among ${BLOCS.find(b => b.id === msg.bloc)?.label.toLowerCase()}`)
        return broadcast(s)
      }
      case 'party': {
        const name = String(msg.name ?? '').trim().slice(0, 40)
        if (msg.party !== P.party) {
          if (!PARTY_MAP[msg.party]) throw new GameError('Unknown party.')
          pay(20, 'a change of party platform')
          const wasGov = P.office === 'governing' && P.govParty === P.party
          P.party = msg.party
          if (wasGov) P.govParty = msg.party
        }
        P.partyName = name || PARTY_MAP[P.party].name
        toast(`Your party: ${partyName(P, P.party)}`)
        return broadcast(s)
      }
      case 'snapElection': {
        if (P.office !== 'governing') throw new GameError('Only the government can call an election.')
        if (!ELECTORAL.has(String(me.policy.government))) throw new GameError('Your constitution has no elections.')
        if (game.tick - P.lastElection < 360) throw new GameError('You can call a snap election at most a year after the last one.')
        if (me.nextElection != null && me.nextElection - game.tick < 120) throw new GameError('An election is already imminent.')
        pay(15, 'a snap election')
        callElection(game, me)
        return broadcast(s)
      }
      case 'noConfidence': {
        if (P.office !== 'opposition') throw new GameError('Only the opposition can table a motion of no confidence.')
        pay(25, 'a no-confidence motion')
        toast(noConfidence(game, me) ? 'The government falls! Elections in two months.' : 'The government survives the vote.')
        return broadcast(s)
      }
      case 'purge': {
        if (P.office !== 'governing') throw new GameError('You are not in power.')
        pay(15, 'a purge of the officer corps')
        P.coupShield = game.tick + 720
        me.quality = Math.max(0.3, me.quality * 0.88)
        me.blocs.military = Math.max(0, me.blocs.military - 10)
        toast('The officer corps is purged. Coup-proof for two years; the army is weaker and resentful.')
        return broadcast(s)
      }
    }
    if (P.office !== 'governing' && !['respond', 'abandon'].includes(msg.t)) {
      throw new GameError(P.office === 'exile'
        ? 'You have been ousted by the military. You can only watch, wait and organise until the junta falls.'
        : `You are in opposition. The ${partyName(P, P.govParty)} government runs ${me.name} until you win an election.`)
    }
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
