// The World Committee: resolutions, influence-weighted votes, a security council veto, floor speeches,
// and enforcement of whatever passes.
import { RES_DEFS, VOTE_DAYS, TABLE_COST, COUNCIL_SEATS, QUORUM, type Resolution, type ResKind, type Vote, type CommitteeView } from '../../shared/committee'
import { DEMOCRATIC } from '../../shared/rules'
import { SECTOR_INDEX } from '../../shared/sectors'
import { GameError } from './military'
import { attitude, revealedIdeology } from './ai'
import { spendPC } from './power'
import type { Game } from './world'
import type { Nation } from './model'

export interface CommitteeStore { next: number; list: Resolution[]; council: number[]; councilAt: number }
export const newCommittee = (): CommitteeStore => ({ next: 1, list: [], council: [], councilAt: -1e9 })

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const alive = (g: Game) => [...g.nations.values()].filter(n => n.alive)
/** Vote weight: a floor so small nations count, plus global influence (0–100). */
export const weightOf = (n: Nation) => 2 + (n.idx.influence ?? 0)

/** The five most powerful nations by comprehensive national power, refreshed every year. */
export function refreshCouncil(g: Game, force = false) {
  const c = g.committee
  if (!force && g.tick - c.councilAt < 360 && c.council.every(id => g.nation(id)?.alive)) return
  const before = new Set(c.council)
  c.council = alive(g).sort((a, b) => (b.idx.cnp ?? 0) - (a.idx.cnp ?? 0)).slice(0, COUNCIL_SEATS).map(n => n.id)
  c.councilAt = g.tick
  const joined = c.council.filter(id => !before.has(id))
  if (before.size && joined.length) g.pushNews('diplo', `🏛 New seats on the security council: ${joined.map(id => g.nation(id)!.name).join(', ')}.`, joined)
}

export function committeeView(g: Game): CommitteeView {
  const c = g.committee
  if (!c.council.length) refreshCouncil(g)
  const recent = c.list.filter(r => r.status === 'open' || (r.status === 'passed' && r.until != null && r.until > g.tick) || g.tick - r.closes < 720).slice(-40)
  const weights: Record<number, number> = {}
  for (const n of alive(g)) weights[n.id] = Math.round(weightOf(n) * 10) / 10
  return { council: c.council, list: recent, weights }
}

/** Active (passed, still in force) resolutions of a kind. */
export const inForce = (g: Game, kind: ResKind) => g.committee.list.filter(r => r.kind === kind && r.status === 'passed' && r.until != null && r.until > g.tick)
/** Sanctions pressure from the committee on a nation (added to bilateral sanctions). */
export const committeeSanctions = (g: Game, id: number) => (inForce(g, 'sanctions').some(r => r.target === id) ? 0.5 : 0)

export interface TableOpts { kind: ResKind; target?: number | null; target2?: number | null; title?: string; text?: string; rate?: number; years?: number }

export function table(g: Game, n: Nation, o: TableOpts): Resolution {
  const def = RES_DEFS[o.kind]
  if (!def) throw new GameError('Unknown kind of resolution.')
  const c = g.committee
  if (c.list.some(r => r.status === 'open' && r.by === n.id)) throw new GameError('You already have a resolution on the floor. Wait for the vote.')
  if (c.list.filter(r => r.status === 'open').length >= 8) throw new GameError('The committee’s agenda is full. Try again when a vote closes.')
  const t1 = o.target != null ? g.nation(+o.target) : undefined, t2 = o.target2 != null ? g.nation(+o.target2) : undefined
  if (def.target !== 'none' && !t1?.alive) throw new GameError('Choose a nation.')
  if (def.target === 'two') {
    if (!t2?.alive || t2.id === t1!.id) throw new GameError('Choose the two warring nations.')
    if (!t1!.wars.includes(t2.id)) throw new GameError(`${t1!.name} and ${t2.name} are not at war.`)
  }
  if (def.target !== 'none' && c.list.some(r => r.status === 'open' && r.kind === o.kind && r.target === t1!.id)) throw new GameError('A resolution like that is already on the floor.')
  if ((o.kind === 'climate' || o.kind === 'devfund' || o.kind === 'tradeRound') && (inForce(g, o.kind).length || c.list.some(r => r.status === 'open' && r.kind === o.kind))) throw new GameError(`A ${def.label.toLowerCase()} is already ${inForce(g, o.kind).length ? 'in force' : 'on the floor'}.`)
  const text = String(o.text ?? '').trim().slice(0, 600)
  if (o.kind === 'declaration' && text.length < 8) throw new GameError('Write the declaration: what should the world declare?')
  if (!n.ai) {
    if (n.power.office !== 'governing') throw new GameError('Only a government can table a resolution.')
    const err = spendPC(n, TABLE_COST, 'tabling a resolution')
    if (err) throw new GameError(err)
  }
  const years = def.maxYears ? clamp(Math.round(o.years ?? def.defaultYears), 1, def.maxYears) : 0
  const rate = o.kind === 'tradeRound' ? clamp(Math.round(o.rate ?? 10), 0, 30) : 0
  const auto = def.target === 'two' ? `${def.label}: ${t1!.name} and ${t2!.name}` : def.target === 'one' ? `${def.label} ${o.kind === 'condemn' ? 'of' : 'on'} ${t1!.name}` : o.kind === 'tradeRound' ? `${def.label}: tariffs capped at ${rate}%` : def.label
  const r: Resolution = {
    id: c.next++, kind: o.kind, title: String(o.title ?? '').trim().slice(0, 80) || auto, text,
    by: n.id, byName: n.name, target: t1?.id ?? null, targetName: t1?.name ?? null, target2: t2?.id ?? null, target2Name: t2?.name ?? null,
    rate, years, opened: g.tick, closes: g.tick + VOTE_DAYS, votes: { [n.id]: 'yes' }, tally: null, status: 'open', vetoBy: [], until: null, parties: [], breached: [], speeches: [],
  }
  c.list.push(r)
  for (const a of alive(g)) if (a.ai && a.id !== n.id) r.votes[a.id] = aiVote(g, a, r)
  g.pushNews('diplo', `🏛 ${n.name} tables a resolution at the World Committee: “${r.title}”. The vote closes in a month.`, [n.id, ...(t1 ? [t1.id] : []), ...(t2 ? [t2.id] : [])])
  return r
}

export function vote(g: Game, n: Nation, id: number, v: Vote) {
  const r = g.committee.list.find(x => x.id === id)
  if (!r || r.status !== 'open') throw new GameError('That vote has closed.')
  if (!['yes', 'no', 'abstain'].includes(v)) throw new GameError('Vote yes, no or abstain.')
  if (!n.ai && n.power.office !== 'governing') throw new GameError('Only the government casts your nation’s vote.')
  r.votes[n.id] = v
}

export function speak(g: Game, n: Nation, user: string | null, id: number, text: string) {
  const r = g.committee.list.find(x => x.id === id)
  if (!r) throw new GameError('Unknown resolution.')
  if (r.status !== 'open') throw new GameError('The debate is over: the vote has closed.')
  text = text.trim().slice(0, 500)
  if (text.length < 2) throw new GameError('Say something.')
  if (r.speeches.filter(s => s.nation === n.id).length >= 4) throw new GameError('You have already addressed the floor four times on this resolution.')
  r.speeches.push({ nation: n.id, name: n.name, user, color: n.color, text, tick: g.tick, stance: r.votes[n.id] ?? null })
  if (r.speeches.length > 60) r.speeches.shift()
}

// ───────── how AI nations vote ─────────
function oilShare(n: Nation) { return (n.sectorOut[SECTOR_INDEX.oil] ?? 0) / Math.max(0.001, n.gdp) }

export function aiVote(g: Game, a: Nation, r: Resolution): Vote {
  const ide = a.brain?.ideology ?? revealedIdeology(a)
  const t = r.target != null ? g.nation(r.target) : undefined, t2 = r.target2 != null ? g.nation(r.target2) : undefined
  const sponsor = g.nation(r.by)
  const toSponsor = sponsor && sponsor.id !== a.id ? attitude(g, a, sponsor) : 50
  const pick = (score: number, band = 8): Vote => (score > band ? 'yes' : score < -band ? 'no' : 'abstain')
  switch (r.kind) {
    case 'sanctions':
    case 'condemn': {
      if (!t) return 'abstain'
      if (t.id === a.id || a.allies.includes(t.id)) return 'no'
      let s = -attitude(g, a, t) * 0.6 + toSponsor * 0.15
      if (g.aggressorRecently(t.id)) s += DEMOCRATIC.has(String(a.policy.government)) ? 25 : 8
      if (r.kind === 'sanctions') s -= 6 + (g.flowBetween(a.id, t.id) + g.flowBetween(t.id, a.id)) / Math.max(0.01, a.gdp) * 40 // sanctions cost the sanctioner too
      return pick(s, 10)
    }
    case 'ceasefire': {
      if (!t || !t2) return 'abstain'
      if (a.id === t.id || a.id === t2.id) {
        const enemy = a.id === t.id ? t2 : t
        return (a.idx.power ?? 0) < (enemy.idx.power ?? 0) * 1.2 || a.warWeariness > 40 ? 'yes' : 'no'
      }
      const s = 15 - ide.hawk * 15 + (ide.lib - ide.auth) * 5 + (a.allies.includes(t.id) || a.allies.includes(t2.id) ? -12 : 0) + toSponsor * 0.1
      return pick(s)
    }
    case 'climate': {
      const hit = Math.max(0, (g.trends.temp - 1) * 10)
      return pick(4 + ide.green * 35 + (ide.left - ide.right) * 5 + hit - oilShare(a) * 120 - (a.policy.carbonTax === 'none' ? 6 : -6) + toSponsor * 0.1, 4)
    }
    case 'devfund': {
      const poor = g.gdppc(a) < g.worldGdppc * 0.35
      if (poor) return 'yes'
      return pick(5 + (ide.left - ide.right) * 25 + (ide.glob - ide.nat) * 15 + toSponsor * 0.15 - (g.gdppc(a) > g.worldGdppc ? 3 : 0), 4)
    }
    case 'tradeRound': {
      const exportShare = a.exports.reduce((x, y) => x + y, 0) / Math.max(0.001, a.gdp)
      // bilateral tariffs on enemies are exempt; what matters is the general tariff and tariff wars with friends
      const friendly = Object.entries(a.tariffs).filter(([k, v]) => v > r.rate && !a.wars.includes(+k)).length
      return pick(4 + (ide.glob - ide.nat) * 15 + exportShare * 40 + (+a.policy.tariff <= r.rate ? 5 : -Math.min(12, (+a.policy.tariff - r.rate) * 0.8)) - friendly * 2 + toSponsor * 0.1, 4)
    }
    // symbolic: most delegates go along unless they dislike the sponsor
    case 'declaration': return pick(12 + toSponsor * 0.25, 6)
  }
}

// ───────── closing a vote ─────────
function close(g: Game, r: Resolution) {
  const c = g.committee
  for (const a of alive(g)) if (a.ai && a.id !== r.by) r.votes[a.id] = aiVote(g, a, r) // final positions
  const tally = { yes: 0, no: 0, abstain: 0, total: 0 }
  for (const n of alive(g)) {
    const w = weightOf(n)
    tally.total += w
    const v = r.votes[n.id] ?? 'abstain'
    tally[v] += w
  }
  for (const k of ['yes', 'no', 'abstain', 'total'] as const) tally[k] = Math.round(tally[k] * 10) / 10
  r.tally = tally
  const def = RES_DEFS[r.kind]
  r.vetoBy = def.security ? c.council.filter(id => r.votes[id] === 'no' && g.nation(id)?.alive) : []
  const carried = tally.yes > tally.no && tally.yes >= tally.total * QUORUM
  const pct = `${Math.round((tally.yes / tally.total) * 100)}% yes, ${Math.round((tally.no / tally.total) * 100)}% no`
  if (carried && r.vetoBy.length) {
    r.status = 'vetoed'
    g.pushNews('diplo', `🛑 Vetoed: “${r.title}” carried the floor (${pct}) but ${r.vetoBy.map(id => g.nation(id)!.name).join(' and ')} used the security council veto.`, [r.by, ...r.vetoBy])
    return
  }
  if (!carried) {
    r.status = 'failed'
    g.pushNews('diplo', `🏛 The World Committee rejects “${r.title}” (${pct}).`, [r.by])
    return
  }
  r.status = 'passed'
  r.parties = alive(g).filter(n => r.votes[n.id] === 'yes').map(n => n.id)
  if (def.maxYears) r.until = g.tick + r.years * 360
  g.pushNews('diplo', `🏛 Adopted: “${r.title}” (${pct}).`, [r.by, ...(r.target != null ? [r.target] : [])])
  enact(g, r)
}

function enact(g: Game, r: Resolution) {
  const t = r.target != null ? g.nation(r.target) : undefined, t2 = r.target2 != null ? g.nation(r.target2) : undefined
  const sponsor = g.nation(r.by)
  if (sponsor) sponsor.stocks.diplomacy = Math.min(100, sponsor.stocks.diplomacy + 3)
  switch (r.kind) {
    case 'sanctions':
      if (t) { t.legitimacy = Math.max(0, t.legitimacy - 6); g.pushNews('trade', `⛔ The world sanctions ${t.name} for ${r.years} years.`, [t.id]) }
      break
    case 'condemn':
      if (t) {
        t.legitimacy = Math.max(0, t.legitimacy - 8)
        t.stocks.diplomacy = Math.max(0, t.stocks.diplomacy - 10)
        for (const o of g.nations.values()) if (o.brain && o.id !== t.id) o.brain.grievances[t.id] = (o.brain.grievances[t.id] ?? 0) + 6
      }
      break
    case 'ceasefire':
      if (t && t2 && t.wars.includes(t2.id)) { g.makePeace(t, t2); g.pushNews('peace', `🕊 By order of the World Committee, ${t.name} and ${t2.name} lay down their arms.`, [t.id, t2.id]) }
      break
    case 'climate':
      for (const id of r.parties) { const n = g.nation(id); if (n && n.policy.carbonTax === 'none') { n.policy.carbonTax = 'moderate'; n.cooldowns.carbonTax = g.tick + 360 } }
      break
    case 'tradeRound':
      for (const id of r.parties) {
        const n = g.nation(id)
        if (!n) continue
        if (+n.policy.tariff > r.rate) n.policy.tariff = r.rate
        for (const [k, v] of Object.entries(n.tariffs)) if (v > r.rate && !exempt(g, n, +k)) n.tariffs[+k] = r.rate
      }
      break
    case 'declaration':
      if (sponsor) { sponsor.stocks.culture = Math.min(100, sponsor.stocks.culture + 3); sponsor.legitimacy = Math.min(100, sponsor.legitimacy + 2) }
      break
  }
}

/** Tariffs on enemies and on nations under world sanctions don't count against a trade round. */
const exempt = (g: Game, n: Nation, other: number) => n.wars.includes(other) || committeeSanctions(g, other) > 0

function breakAccord(g: Game, r: Resolution, n: Nation, what: string) {
  r.parties = r.parties.filter(id => id !== n.id)
  r.breached.push(n.id)
  n.legitimacy = Math.max(0, n.legitimacy - 4)
  n.stocks.diplomacy = Math.max(0, n.stocks.diplomacy - 6)
  for (const o of g.nations.values()) if (o.brain && o.id !== n.id && r.parties.includes(o.id)) o.brain.grievances[n.id] = (o.brain.grievances[n.id] ?? 0) + 5
  g.pushNews('diplo', `💔 ${n.name} breaks the World Committee’s “${r.title}”: ${what}.`, [n.id])
}

// ───────── the daily and monthly rhythm ─────────
export function committeeDay(g: Game) {
  for (const r of g.committee.list) if (r.status === 'open' && g.tick >= r.closes) close(g, r)
}

export function committeeMonth(g: Game) {
  const c = g.committee
  refreshCouncil(g)
  const world = g.worldGdppc
  for (const r of c.list) {
    if (r.status !== 'passed' || r.until == null) continue
    if (g.tick >= r.until) { r.status = 'ended'; g.pushNews('diplo', `🏛 “${r.title}” has run its course.`, []); continue }
    const parties = r.parties.map(id => g.nation(id)).filter((n): n is Nation => !!n?.alive)
    switch (r.kind) {
      case 'climate':
        for (const n of parties) if (n.policy.carbonTax === 'none') breakAccord(g, r, n, 'it scrapped carbon pricing')
        break
      case 'tradeRound':
        for (const n of parties) {
          const over = +n.policy.tariff > r.rate + 0.5 ? 'its general tariff' : Object.entries(n.tariffs).find(([k, v]) => v > r.rate + 0.5 && !exempt(g, n, +k)) ? 'a tariff' : null
          if (over) breakAccord(g, r, n, `it raised ${over} above ${r.rate}%`)
        }
        break
      case 'devfund': {
        const donors = parties.filter(n => g.gdppc(n) > world)
        const poor = alive(g).filter(n => g.gdppc(n) < world * 0.35)
        const pot = donors.reduce((a, n) => a + n.gdp * 0.003, 0)
        const people = poor.reduce((a, n) => a + n.pop, 0)
        if (!pot || !people) break
        for (const n of donors) { n.treasury -= n.gdp * 0.003; n.stocks.diplomacy = Math.min(100, n.stocks.diplomacy + 0.15) }
        for (const n of poor) { n.treasury += pot * (n.pop / people); n.aidReceived += pot * (n.pop / people) }
        break
      }
    }
  }
  aiTable(g)
  if (c.list.length > 300) c.list = c.list.filter(r => r.status === 'open' || (r.until != null && r.until > g.tick) || g.tick - r.closes < 360 * 4)
}

/** Now and then an AI nation brings something to the floor. */
function aiTable(g: Game) {
  const c = g.committee
  if (c.list.filter(r => r.status === 'open').length >= 4) return
  const ais = alive(g).filter(n => n.ai && n.brain && !c.list.some(r => r.status === 'open' && r.by === n.id))
  if (!ais.length) return
  const any = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]
  const tryTable = (n: Nation | undefined, o: TableOpts) => { if (!n) return false; try { table(g, n, o); return true } catch { return false } }
  // aggressors: someone who started a war in the last year
  for (const x of alive(g)) {
    const t = g.aggressors.get(x.id)
    if (t == null || g.tick - t > 360 || c.list.some(r => r.target === x.id && (r.status === 'open' || g.tick - r.closes < 360))) continue
    if (Math.random() > 0.35) continue
    const accuser = any(ais.filter(a => a.id !== x.id && attitude(g, a, x) < -25))
    if (tryTable(accuser, { kind: Math.random() < 0.5 ? 'condemn' : 'sanctions', target: x.id, years: 3 })) return
  }
  // long wars: someone calls for a ceasefire
  for (const x of alive(g)) for (const y of x.wars) {
    if (x.id > y || Math.random() > 0.08) continue
    if (c.list.some(r => r.kind === 'ceasefire' && r.target === x.id && r.target2 === y && g.tick - r.opened < 360)) continue
    const broker = any(ais.filter(a => a.id !== x.id && a.id !== y && !a.wars.length))
    if (tryTable(broker, { kind: 'ceasefire', target: x.id, target2: y })) return
  }
  // don't re-table an accord that was voted on in the last two years
  const recent = (k: ResKind) => c.list.some(x => x.kind === k && g.tick - x.opened < 720)
  const r = Math.random()
  if (r < 0.04 && !recent('climate')) tryTable(any(ais.filter(a => a.brain!.ideology.green > 0.55)), { kind: 'climate', years: 10 })
  else if (r < 0.07 && !recent('devfund')) tryTable(any(ais.filter(a => a.brain!.ideology.left > 0.55 || g.gdppc(a) < g.worldGdppc * 0.35)), { kind: 'devfund', years: 5 })
  else if (r < 0.10 && !recent('tradeRound')) tryTable(any(ais.filter(a => a.brain!.ideology.glob > 0.55)), { kind: 'tradeRound', rate: 10, years: 10 })
}
