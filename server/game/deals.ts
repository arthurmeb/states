// Treaties and deals between nations: validation, AI judgement, activation, monthly enforcement and
// breaches. Every clause acts on the real simulation (treasuries, tariffs, technology, provinces,
// policies, war), so a deal's consequences ripple through everything else.
import { describe, dealYears, type Clause, type Deal, type Side } from '../../shared/deals'
import { POLICY_MAP, POLICIES } from '../../shared/policies'
import { SECTORS, SECTOR_INDEX } from '../../shared/sectors'
import { GameError } from './military'
import { attitude, aiAccepts } from './ai'
import { scoreMods, optionMods } from './mods'
import { postDealMsg } from './comms'
import type { Game } from './world'
import type { Nation } from './model'
import type { CompileContext } from './llm'

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a))
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(+v) ? +v : d)
const side = (v: unknown): Side => (v === 'b' ? 'b' : 'a')
const yrs = (v: unknown) => clamp(Math.round(num(v, 5)), 1, 30)

export interface DealStore { list: Deal[]; next: number }
export const newDeals = (): DealStore => ({ list: [], next: 1 })

/** Everything the model needs to know to compile a deal between a and b. */
export function compileContext(g: Game, a: Nation, b: Nation): CompileContext {
  const names = (n: Nation) => g.owned(n.id).sort((x, y) => g.prov[y].pop - g.prov[x].pop).slice(0, 40).map(pid => g.P[pid].name)
  return {
    a: a.name, b: b.name, aProvinces: names(a), bProvinces: names(b), sectors: SECTORS.filter(s => s.tradable).map(s => s.id), atWar: a.wars.includes(b.id),
    policies: POLICIES.filter(p => p.kind === 'choice').map(p => `${p.id}: ${p.kind === 'choice' ? p.options.map(o => o.id).join('|') : ''}`),
  }
}

/** Turn untrusted clause objects (from a player or a model) into valid clauses; anything unusable becomes a promise. */
export function normalize(g: Game, a: Nation, b: Nation, raw: Record<string, unknown>[]): Clause[] {
  const out: Clause[] = []
  const ownerOf = (s: Side) => (s === 'a' ? a : b)
  for (const r of raw.slice(0, 16)) {
    const from = side(r.from)
    const promise = (why: string) => out.push({ kind: 'promise', from, text: String(r.text ?? why).slice(0, 200), years: yrs(r.years) })
    switch (r.kind) {
      case 'payment': out.push({ kind: 'payment', from, amount: clamp(num(r.amount), 0.1, 5000), monthly: !!r.monthly, months: clamp(Math.round(num(r.months, 12)), 1, 360) }); break
      case 'loan': out.push({ kind: 'loan', from, amount: clamp(num(r.amount), 0.1, 5000), rate: clamp(num(r.rate, 4), 0, 40), years: yrs(r.years) }); break
      case 'tariff': out.push({ kind: 'tariff', from, rate: clamp(num(r.rate), 0, 80), years: yrs(r.years) }); break
      case 'supply': {
        const sector = SECTORS.find(s => s.tradable && (s.id === r.sector || s.label.toLowerCase().includes(String(r.sector ?? '').toLowerCase())))
        if (!sector) { promise(`supply ${r.sector}`); break }
        out.push({ kind: 'supply', from, sector: sector.id, share: clamp(num(r.share, 0.1), 0.01, 0.5), discount: clamp(num(r.discount, 0.2), 0, 1), years: yrs(r.years) }); break
      }
      case 'tech': out.push({ kind: 'tech', from, years: yrs(r.years) }); break
      case 'province': {
        const want = String(r.province ?? '').trim().toLowerCase()
        const pid = g.owned(ownerOf(from).id).find(p => g.P[p].name.toLowerCase() === want) ?? g.owned(ownerOf(from).id).find(p => g.P[p].name.toLowerCase().includes(want) && want.length > 2)
        if (pid === undefined) { promise(`hand over ${r.province}`); break }
        if (pid === ownerOf(from).capital) { promise(`hand over the capital ${g.P[pid].name}`); break }
        out.push({ kind: 'province', from, province: g.P[pid].name }); break
      }
      case 'policy': {
        const p = POLICY_MAP[String(r.policy)]
        if (!p || p.kind !== 'choice' || !p.options.some(o => o.id === r.option) || r.policy === 'government') { promise(`adopt ${r.option ?? r.policy}`); break }
        out.push({ kind: 'policy', from, policy: p.id, option: String(r.option), years: yrs(r.years) }); break
      }
      case 'nonaggression': out.push({ kind: 'nonaggression', years: yrs(r.years) }); break
      case 'alliance': out.push({ kind: 'alliance' }); break
      case 'pact': out.push({ kind: 'pact' }); break
      case 'aid': out.push({ kind: 'aid', from, years: yrs(r.years) }); break
      case 'peace': out.push({ kind: 'peace' }); break
      default: promise(String(r.text ?? 'an unspecified commitment'))
    }
  }
  return out
}

const of = (d: Deal, s: Side, g: Game) => g.nation(s === 'a' ? d.a : d.b)!

export function propose(g: Game, a: Nation, b: Nation, title: string, text: string, clauses: Clause[], notes = ''): Deal {
  if (a.id === b.id) throw new GameError('A deal needs two nations.')
  if (!clauses.length) throw new GameError('Add at least one clause.')
  if (g.deals.list.filter(d => d.a === a.id && d.status === 'proposed').length >= 5) throw new GameError('You have too many open proposals. Wait for answers first.')
  const d: Deal = { id: g.deals.next++, a: a.id, b: b.id, title: title.trim().slice(0, 60) || 'Agreement', text: text.slice(0, 1500), clauses, notes: notes.slice(0, 300), status: 'proposed', created: g.tick, start: null, end: null, state: {}, breach: null }
  g.deals.list.push(d)
  postDealMsg(g, a, b, `📜 ${a.name} proposes “${d.title}”: ${clauses.map(c => describe(c, a.name, b.name)).join('; ')}.`, d.id)
  if (b.ai) respond(g, b, d.id, aiJudge(g, b, d))
  return d
}

/** How much an AI nation values a deal (positive = worth accepting). */
export function aiJudge(g: Game, ai: Nation, d: Deal): boolean {
  const me: Side = d.a === ai.id ? 'a' : 'b'
  const them = of(d, me === 'a' ? 'b' : 'a', g)
  const gdpYr = Math.max(1, ai.gdp * 12)
  // a pure gift (nothing asked in return) is always welcome, unless you're at war
  if (!ai.wars.includes(them.id) && d.clauses.every(c => 'from' in c && c.from !== me && c.kind !== 'loan')) return true
  let v = attitude(g, ai, them) / 25
  for (const c of d.clauses) {
    const mine = 'from' in c && c.from === me
    const sign = 'from' in c ? (mine ? -1 : 1) : 1
    switch (c.kind) {
      case 'payment': v += sign * ((c.monthly ? c.amount * c.months : c.amount) / gdpYr) * 90; break
      case 'loan': v += mine ? (c.rate - ai.interest) * 0.15 - (c.amount / gdpYr) * 8 : (ai.interest - c.rate) * 0.2 + 0.5; break
      case 'tariff': v += sign * 0.6; break
      case 'supply': v += sign * c.share * (1 + c.discount) * 3; break
      case 'tech': v += sign * Math.max(0, (mine ? ai.stocks.tech - them.stocks.tech : them.stocks.tech - ai.stocks.tech)) / 10; break
      case 'province': v += sign * 6; break
      case 'policy': {
        if (!mine) { v += 0.3; break }
        const p = POLICY_MAP[c.policy]
        const ide = ai.brain?.ideology
        // keeping what you already have costs only a little flexibility
        if (p && ide) v += ai.policy[p.id] === c.option ? -0.1 : (scoreMods(optionMods(p, c.option, ai.cond, 0), ide) - scoreMods(optionMods(p, ai.policy[p.id], ai.cond, 5), ide)) * 0.5 - 0.5
        break
      }
      case 'nonaggression': v += (them.idx.power ?? 0) > (ai.idx.power ?? 0) ? 1 : 0.3; break
      case 'alliance': v += aiAccepts(g, ai, them, 'alliance') ? 2 : -3; break
      case 'pact': v += aiAccepts(g, ai, them, 'pact') ? 1 : -1; break
      case 'aid': v += sign * 1.2; break
      case 'peace': v += aiAccepts(g, ai, them, 'peace') ? 3 : -2; break
      case 'promise': v += sign * 0.2; break
    }
  }
  return v > 0.3
}

export function respond(g: Game, n: Nation, id: number, accept: boolean) {
  const d = g.deals.list.find(x => x.id === id)
  if (!d || d.status !== 'proposed') throw new GameError('That proposal is no longer open.')
  if (d.b !== n.id) throw new GameError('Only the other side can answer this proposal.')
  const a = g.nation(d.a), b = g.nation(d.b)
  if (!a?.alive || !b?.alive) { d.status = 'cancelled'; return d }
  if (!accept) {
    d.status = 'rejected'
    postDealMsg(g, b, a, `❌ ${b.name} rejects “${d.title}”.`, d.id)
    return d
  }
  activate(g, d, a, b)
  return d
}

function activate(g: Game, d: Deal, a: Nation, b: Nation) {
  d.status = 'active'; d.start = g.tick
  const yrsMax = dealYears(d)
  d.end = yrsMax > 0 ? g.tick + Math.round(yrsMax * 360) : null
  d.clauses.forEach((c, i) => {
    const from = 'from' in c ? of(d, c.from, g) : a, to = 'from' in c ? of(d, c.from === 'a' ? 'b' : 'a', g) : b
    switch (c.kind) {
      case 'payment': if (!c.monthly) { from.treasury -= c.amount; to.treasury += c.amount } break
      case 'loan': from.treasury -= c.amount; to.treasury += c.amount; d.state[i] = c.amount; break
      case 'tariff': from.tariffs[to.id] = Math.min(from.tariffs[to.id] ?? c.rate, c.rate); break
      case 'province': {
        const pid = g.owned(from.id).find(p => g.P[p].name === c.province)
        if (pid !== undefined && pid !== from.capital) {
          const p = g.prov[pid]
          p.owner = to.id; p.since = g.tick; p.garrison = 0; p.unrest = Math.max(p.unrest, 25)
          g.ownedDirty = true
          g.pushNews('diplo', `🗺 ${from.name} hands ${c.province} to ${to.name} under the “${d.title}”.`, [from.id, to.id], pid)
        }
        break
      }
      case 'policy': from.policy[c.policy] = c.option; break
      case 'alliance': g.enact(a, b, 'alliance'); break
      case 'pact': g.enact(a, b, 'pact'); break
      case 'aid': if (!from.aidTargets.includes(to.id)) from.aidTargets.push(to.id); break
      case 'peace': g.enact(a, b, 'peace'); break
    }
  })
  g.pushNews('diplo', `📜 ${a.name} and ${b.name} sign the “${d.title}”.`, [a.id, b.id])
  postDealMsg(g, b, a, `✅ ${b.name} accepts “${d.title}”. The treaty is in force${d.end ? ` until ${Math.round(dealYears(d))} years from now` : ''}.`, d.id)
}

/** Breaking a treaty: the world sees it, and the victim gains a just cause against the breaker. */
export function breach(g: Game, d: Deal, by: Nation, what: string) {
  if (d.status !== 'active') return
  d.status = 'broken'; d.breach = { by: by.id, what }
  const victim = g.nation(d.a === by.id ? d.b : d.a)
  by.legitimacy = Math.max(0, by.legitimacy - 5)
  by.stocks.diplomacy = Math.max(0, by.stocks.diplomacy - 8)
  if (victim?.brain) victim.brain.grievances[by.id] = (victim.brain.grievances[by.id] ?? 0) + 35
  for (const o of g.nations.values()) if (o.brain && o.id !== by.id) o.brain.grievances[by.id] = (o.brain.grievances[by.id] ?? 0) + 4
  g.pushNews('diplo', `💔 ${by.name} breaks the “${d.title}” with ${victim?.name ?? 'its partner'}: ${what}.`, [by.id, victim?.id ?? by.id])
  if (victim) postDealMsg(g, by, victim, `💔 ${by.name} has broken “${d.title}”: ${what}. ${victim.name} now has a just cause against it.`, d.id)
}

/** A recent broken treaty gives the victim a just cause for war (no aggressor stigma). */
export const justCause = (g: Game, attacker: number, target: number) =>
  g.deals.list.some(d => d.status === 'broken' && d.breach?.by === target && (d.a === attacker || d.b === attacker) && g.tick - (d.end ?? d.start ?? 0) < 360 * 3)

/** Renouncing a treaty is a breach. */
export function renounce(g: Game, n: Nation, id: number) {
  const d = g.deals.list.find(x => x.id === id)
  if (!d || d.status !== 'active' || (d.a !== n.id && d.b !== n.id)) throw new GameError('Not a treaty you are part of.')
  breach(g, d, n, 'it renounced the treaty')
}

/** Monthly: payments, repayments, deliveries, technology transfer, and checks that promises are kept. */
export function dealsMonth(g: Game) {
  for (const d of g.deals.list) {
    if (d.status === 'proposed' && g.tick - d.created > 90) { d.status = 'cancelled'; continue }
    if (d.status !== 'active') continue
    const a = g.nation(d.a), b = g.nation(d.b)
    if (!a?.alive || !b?.alive) { d.status = 'cancelled'; continue }
    const age = g.tick - (d.start ?? g.tick)
    for (let i = 0; i < d.clauses.length; i++) {
      const c = d.clauses[i]
      const from = 'from' in c ? (c.from === 'a' ? a : b) : a, to = 'from' in c ? (c.from === 'a' ? b : a) : b
      const live = 'years' in c ? age < c.years * 360 : true
      switch (c.kind) {
        case 'payment': if (c.monthly && age < c.months * 30) { from.treasury -= c.amount; to.treasury += c.amount } break
        case 'loan': {
          const bal = d.state[i] ?? 0
          if (bal <= 0.01) break
          const r = c.rate / 1200, n = Math.max(1, c.years * 12 - Math.floor(age / 30))
          const pay = r ? (bal * r) / (1 - Math.pow(1 + r, -n)) : bal / n
          // the borrower is `to`: a bankrupt borrower (debt above 200% of GDP) defaults
          if ((to.idx.debt ?? 0) > 200) { breach(g, d, to, `it defaulted on a $${bal.toFixed(1)}B loan`); break }
          to.treasury -= pay; from.treasury += pay
          d.state[i] = bal * (1 + r) - pay
          break
        }
        case 'supply': if (live) {
          const s = SECTOR_INDEX[c.sector as keyof typeof SECTOR_INDEX]
          const value = (from.sectorOut[s] ?? 0) * c.share * c.discount
          from.treasury -= value; to.treasury += value
          to.shortage = Math.max(0, to.shortage - c.share * 0.2)
        } break
        case 'tech': if (live && from.stocks.tech > to.stocks.tech) to.stocks.tech += (from.stocks.tech - to.stocks.tech) * 0.1 / 12; break
        case 'tariff': if (live && (from.tariffs[to.id] ?? +from.policy.tariff) > c.rate + 0.5) breach(g, d, from, `it raised tariffs above ${c.rate}%`); break
        case 'policy': if (live && from.policy[c.policy] !== c.option) breach(g, d, from, `it abandoned its commitment to ${POLICY_MAP[c.policy]?.label.toLowerCase()}`); break
        case 'nonaggression': if (live && a.wars.includes(b.id)) { const agg = (g.aggressors.get(a.id) ?? -1) >= (g.aggressors.get(b.id) ?? -1) ? a : b; breach(g, d, agg, 'it went to war') } break
        case 'aid': if (!live) from.aidTargets = from.aidTargets.filter(x => x !== to.id); break
      }
      if (d.status !== 'active') break
    }
    if (d.status === 'active' && d.end != null && g.tick >= d.end) {
      d.status = 'done'
      g.pushNews('diplo', `📜 The “${d.title}” between ${a.name} and ${b.name} has run its course.`, [a.id, b.id])
    }
  }
  // keep history manageable
  if (g.deals.list.length > 600) g.deals.list = g.deals.list.filter(d => d.status === 'active' || d.status === 'proposed' || g.tick - d.created < 360 * 5)
}
