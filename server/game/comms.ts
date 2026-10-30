// Player-to-player communication: public café threads, direct messages between nations, private
// group rooms (coalitions, summits…) and automatic rooms for every trade bloc. Every message carries
// the nation and the player's username. `/` commands query the world.
import { INDEX_MAP, formatIndex } from '../../shared/indices'
import type { Room, RoomMsg, RoomView } from '../../shared/types'
import { GameError } from './military'
import { partyName } from './power'
import { attitude } from './ai'
import type { Game } from './world'
import type { Nation } from './model'

const MAX_MSGS = 200, MAX_TEXT = 600
const clean = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n)

export interface Comms { rooms: Room[]; msgs: Record<number, RoomMsg[]>; nextRoom: number; nextMsg: number }
export const newComms = (): Comms => ({ rooms: [], msgs: {}, nextRoom: 1, nextMsg: 1 })

/** Members of a room right now (bloc rooms follow the bloc's membership). */
export function membersOf(g: Game, r: Room): number[] | null {
  if (r.kind === 'thread') return null
  if (r.bloc != null) return g.tradeBlocs.find(b => b.id === r.bloc)?.members ?? []
  return r.members
}
export function canSee(g: Game, r: Room, n: Nation | undefined) {
  const m = membersOf(g, r)
  return m === null || (!!n && m.includes(n.id))
}

/** Bloc rooms appear and disappear with the trade blocs. */
export function syncBlocRooms(g: Game) {
  const C = g.comms
  for (const b of g.tradeBlocs) if (!C.rooms.some(r => r.bloc === b.id)) C.rooms.push({ id: C.nextRoom++, kind: 'group', title: `🌐 ${b.name}`, owner: b.founder, members: [], bloc: b.id, created: g.tick, last: g.tick, lastTs: Date.now(), count: 0 })
  C.rooms = C.rooms.filter(r => r.bloc == null || g.tradeBlocs.some(b => b.id === r.bloc))
}

export function roomsFor(g: Game, n: Nation | undefined): RoomView[] {
  return g.comms.rooms.filter(r => canSee(g, r, n)).map(r => {
    const last = g.comms.msgs[r.id]?.at(-1)
    const mem = membersOf(g, r)
    const other = r.kind === 'dm' && n ? g.nation(mem?.find(id => id !== n.id)) : undefined
    return { ...r, members: mem ?? [], title: other ? other.name : r.title, preview: last ? `${last.nation}: ${last.text}`.slice(0, 90) : '', color: other?.color ?? r.color }
  }).sort((a, b) => b.lastTs - a.lastTs)
}

function post(g: Game, r: Room, n: Nation | null, user: string | null, text: string, bot = false): RoomMsg {
  const C = g.comms
  const msg: RoomMsg = { id: C.nextMsg++, room: r.id, nation: bot ? 'World Bureau' : n?.name ?? 'Observer', nationId: n?.id ?? null, color: bot ? '#ffd43b' : n?.color ?? '#888', user: bot ? null : user, text, tick: g.tick, ts: Date.now(), bot }
  const list = (C.msgs[r.id] ??= [])
  list.push(msg)
  if (list.length > MAX_MSGS) list.splice(0, list.length - MAX_MSGS)
  r.last = g.tick; r.lastTs = msg.ts; r.count++
  return msg
}

export function createThread(g: Game, n: Nation, user: string | null, title: string, text: string) {
  title = clean(title, 80); text = clean(text, MAX_TEXT)
  if (title.length < 2) throw new GameError('Give your thread a title.')
  const C = g.comms
  if (C.rooms.filter(r => r.kind === 'thread' && r.owner === n.id && g.tick - r.created < 30).length >= 3) throw new GameError('Slow down: at most three new threads a month.')
  const r: Room = { id: C.nextRoom++, kind: 'thread', title, owner: n.id, members: [], created: g.tick, last: g.tick, lastTs: Date.now(), count: 0, color: n.color }
  C.rooms.push(r)
  const msgs = text ? [post(g, r, n, user, text)] : []
  pruneThreads(g)
  return { room: r, msgs }
}
function pruneThreads(g: Game) {
  const threads = g.comms.rooms.filter(r => r.kind === 'thread').sort((a, b) => b.lastTs - a.lastTs)
  for (const r of threads.slice(150)) { g.comms.rooms = g.comms.rooms.filter(x => x !== r); delete g.comms.msgs[r.id] }
}

export function openDM(g: Game, n: Nation, other: Nation) {
  if (other.id === n.id) throw new GameError('You cannot message yourself.')
  const C = g.comms
  let r = C.rooms.find(x => x.kind === 'dm' && x.members.includes(n.id) && x.members.includes(other.id))
  if (!r) { r = { id: C.nextRoom++, kind: 'dm', title: '', owner: n.id, members: [n.id, other.id], created: g.tick, last: g.tick, lastTs: Date.now(), count: 0 }; C.rooms.push(r) }
  return r
}

export function createGroup(g: Game, n: Nation, title: string, members: number[]) {
  title = clean(title, 60)
  if (title.length < 2) throw new GameError('Name your group.')
  const ids = [...new Set([n.id, ...members.filter(id => g.nation(id)?.alive)])].slice(0, 24)
  if (ids.length < 2) throw new GameError('Invite at least one other nation.')
  const C = g.comms
  const r: Room = { id: C.nextRoom++, kind: 'group', title, owner: n.id, members: ids, created: g.tick, last: g.tick, lastTs: Date.now(), count: 0, color: n.color }
  C.rooms.push(r)
  post(g, r, null, null, `${n.name} created “${title}” with ${ids.filter(id => id !== n.id).map(id => g.nation(id)?.name).join(', ')}.`, true)
  return r
}

export function editGroup(g: Game, n: Nation, roomId: number, add: number[], leave: boolean) {
  const r = g.comms.rooms.find(x => x.id === roomId)
  if (!r || r.kind !== 'group' || r.bloc != null || !r.members.includes(n.id)) throw new GameError('Not a group you belong to.')
  if (leave) {
    r.members = r.members.filter(id => id !== n.id)
    post(g, r, null, null, `${n.name} left the group.`, true)
    if (!r.members.length) g.comms.rooms = g.comms.rooms.filter(x => x !== r)
    return r
  }
  const fresh = add.filter(id => g.nation(id)?.alive && !r.members.includes(id))
  r.members.push(...fresh)
  if (fresh.length) post(g, r, null, null, `${n.name} invited ${fresh.map(id => g.nation(id)?.name).join(', ')}.`, true)
  return r
}

export function say(g: Game, n: Nation, user: string | null, roomId: number, text: string): RoomMsg[] {
  const r = g.comms.rooms.find(x => x.id === roomId)
  if (!r || !canSee(g, r, n)) throw new GameError('You are not in that conversation.')
  text = clean(text, MAX_TEXT)
  if (!text) return []
  const out = [post(g, r, n, user, text)]
  if (text.startsWith('/')) out.push(post(g, r, null, null, command(g, n, text), true))
  else if (r.kind === 'dm') {
    // AI governments answer in character, coloured by how they feel about you
    const ai = g.nation(r.members.find(id => id !== n.id))
    if (ai?.ai && ai.alive) out.push(post(g, r, ai, null, aiReply(g, ai, n)))
  }
  return out
}

export const history = (g: Game, n: Nation | undefined, roomId: number) => {
  const r = g.comms.rooms.find(x => x.id === roomId)
  if (!r || !canSee(g, r, n)) throw new GameError('You are not in that conversation.')
  return g.comms.msgs[r.id] ?? []
}

function aiReply(g: Game, ai: Nation, n: Nation) {
  const att = attitude(g, ai, n)
  const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)]
  const who = `${ai.leader} of ${ai.name}`
  if (ai.wars.includes(n.id)) return pick([`There is nothing to discuss until your troops withdraw.`, `${who} will speak through the battlefield, or across a peace table. Propose terms.`])
  if (att > 40) return pick([`Our friendship is valued in ${g.P[ai.capital]?.name ?? 'our capital'}. Propose an alliance or a trade pact and we will listen.`, `${who} sends warm regards. Our doors are open.`])
  if (att > 10) return pick([`We note your message. Deeper trade would bring our nations closer.`, `Cordial greetings. Our relationship has room to grow.`])
  if (att > -20) return pick([`Your message has been received by the foreign ministry.`, `${ai.name} remains cautious. Actions speak louder than words.`])
  if (n.sanctions.includes(ai.id) || n.embargoes.includes(ai.id) || (n.tariffs[ai.id] ?? 0) > 20) return pick([`Lift your sanctions and tariffs before you write to us again.`, `You strangle our trade and then send letters?`])
  return pick([`${ai.name} has no interest in your overtures.`, `We do not share your values, and we see no reason to pretend otherwise.`, `Our ambassador has nothing further to add.`])
}

// ───────── queries: the World Bureau answers ─────────
function find(g: Game, q: string) {
  q = q.trim().toLowerCase()
  const all = [...g.nations.values()].filter(x => x.alive)
  return all.find(x => x.name.toLowerCase() === q) ?? all.find(x => x.name.toLowerCase().includes(q))
}
const fmt = (k: string, v: number | undefined) => formatIndex(INDEX_MAP[k]?.fmt ?? 'num', v)
function card(n: Nation) {
  const I = n.idx
  return `${n.name} (${n.leader}): GDP ${fmt('gdp', I.gdp)}, ${fmt('gdppc', I.gdppc)} per person, growth ${fmt('growth', I.growth)}, inflation ${fmt('inflation', I.inflation)}, ` +
    `unemployment ${fmt('unemployment', I.unemployment)}, debt ${fmt('debt', I.debt)}, HDI ${fmt('hdi', I.hdi)}, approval ${fmt('approval', I.approval)}, ` +
    `national power ${fmt('cnp', I.cnp)}, soft power ${fmt('softPower', I.softPower)}. Governed by ${n.power ? partyName(n.power, n.power.govParty) : '—'}${n.wars.length ? `; at war with ${n.wars.length}` : ''}.`
}
function command(g: Game, n: Nation, text: string): string {
  const [cmd, ...rest] = text.slice(1).split(' ')
  const arg = rest.join(' ')
  const alive = [...g.nations.values()].filter(x => x.alive)
  switch (cmd.toLowerCase()) {
    case 'nation': case 'n': { const x = find(g, arg); return x ? card(x) : `No nation matches “${arg}”.` }
    case 'compare': {
      const [a, b] = arg.split(/\s+vs\s+|,/i).map(s => find(g, s))
      if (!a || !b) return 'Usage: /compare Nation A vs Nation B'
      return ['gdp', 'gdppc', 'growth', 'hdi', 'cnp', 'softPower', 'military', 'approval', 'debt'].map(k => `${INDEX_MAP[k].label}: ${fmt(k, a.idx[k])} vs ${fmt(k, b.idx[k])}`).join(' · ')
    }
    case 'top': case 'rank': {
      const k = Object.keys(INDEX_MAP).find(x => x.toLowerCase() === arg.toLowerCase() || INDEX_MAP[x].label.toLowerCase().includes(arg.toLowerCase())) ?? 'cnp'
      const def = INDEX_MAP[k]
      const list = alive.filter(x => x.idx[k] != null).sort((a, b) => (def.higher ? 1 : -1) * ((b.idx[k] ?? 0) - (a.idx[k] ?? 0))).slice(0, 8)
      return `Top ${def.label}: ` + list.map((x, i) => `${i + 1}. ${x.name} ${fmt(k, x.idx[k])}`).join(' · ')
    }
    case 'wars': {
      const seen = new Set<string>(), out: string[] = []
      for (const x of alive) for (const w of x.wars) { const key = [x.id, w].sort().join('-'); if (!seen.has(key)) { seen.add(key); out.push(`${x.name} ⚔ ${g.nation(w)?.name}`) } }
      return out.length ? out.join(' · ') : 'The world is at peace.'
    }
    case 'world': {
      const T = g.trends
      return `World: +${T.temp.toFixed(2)}°C warming, ${(T.green * 100).toFixed(0)}% renewable energy, ${(T.automation * 100).toFixed(0)}% of routine work automated, ${alive.length} nations, ${g.tradeBlocs.length} trade blocs.`
    }
    case 'me': return card(n)
    default: return 'Commands: /nation <name> · /compare A vs B · /top <index> · /wars · /world · /me'
  }
}
