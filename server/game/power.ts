// Holding power. Every government has political capital (PC) to spend on reform. In democracies,
// parties compete for the factions' votes: approval, the economy, time in office and campaigning
// decide elections, and losing one sends a player into opposition until they win back the voters.
// Autocrats face no elections, but must keep the army loyal and the streets quiet.
import { BLOCS, type BlocId } from '../../shared/policies'
import { PARTIES, PARTY_MAP, ELECTORAL, PC_MAX, FOUNDING_DAYS, FOUNDING_DISCOUNT, type CostCtx } from '../../shared/power'
import { DAYS_PER_MONTH, ELECTION_MONTHS } from '../../shared/rules'
import { ramp } from '../../shared/conditions'
import { blocWeights } from './politics'
import { M } from './mods'
import type { Game } from './world'
import type { Nation, Power } from './model'

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const sig = (x: number) => 1 / (1 + Math.exp(-x))
const r1 = (x: number) => Math.round(x * 10) / 10

/** A pseudo-party for military rule. */
export const JUNTA = { id: 'junta', name: 'Military Council', color: '#495057', icon: '🪖' }
export const partyName = (P: Power, id: string) => (id === P.party ? P.partyName : id === 'junta' ? JUNTA.name : PARTY_MAP[id]?.name ?? id)

/** The party whose voters and ideology best match a nation. */
export function closestParty(ide: Record<string, number>) {
  let best = PARTIES[0], bs = -Infinity
  for (const p of PARTIES) {
    let s = 0, na = 0, nb = 0
    for (const k of Object.keys(p.ideology)) { s += (ide[k] ?? 0) * p.ideology[k as keyof typeof p.ideology]; na += (ide[k] ?? 0) ** 2; nb += p.ideology[k as keyof typeof p.ideology] ** 2 }
    const cos = s / Math.sqrt((na || 1) * (nb || 1))
    if (cos > bs) { bs = cos; best = p }
  }
  return best.id
}

/** The party an electorate would most likely put in power: its natural vote, tilted by the nation's ideology. */
function naturalGovernment(g: Game, n: Nation) {
  const w = blocWeights(g, n, true)
  const ide = n.brain?.ideology ?? {}
  let best = 'liberal', bs = -Infinity
  for (const p of PARTIES) {
    let base = 0
    for (const b of BLOCS) {
      const tot = PARTIES.reduce((s, q) => s + (q.blocs[b.id] ?? 0) ** 2, 0) + 0.7
      base += (w[b.id] ?? 0) * ((p.blocs[b.id] ?? 0) ** 2) / tot
    }
    let s = 0, na = 0, nb = 0
    for (const k of Object.keys(p.ideology) as (keyof typeof p.ideology)[]) { s += ((ide as Record<string, number>)[k] ?? 0) * p.ideology[k]; na += ((ide as Record<string, number>)[k] ?? 0) ** 2; nb += p.ideology[k] ** 2 }
    const score = base * (1 + (na ? s / Math.sqrt(na * nb) : 0))
    if (score > bs) { bs = score; best = p.id }
  }
  return best
}

export function initPower(g: Game, n: Nation, party?: string): Power {
  const id = party && PARTY_MAP[party] ? party : n.brain ? naturalGovernment(g, n) : 'liberal'
  return {
    pc: 60, office: 'governing', party: id, partyName: PARTY_MAP[id].name, govParty: id, coalition: [], votes: {}, seats: {},
    lastElection: g.tick, terms: 0, honeymoonUntil: g.tick + 360, campaign: {}, coupRisk: 0, revoRisk: 0, coupShield: 0, history: [], since: g.tick,
  }
}

const electoral = (n: Nation) => ELECTORAL.has(String(n.policy.government))

/** Opinion poll: vote share (and seats) per party for the current government's record. */
export function poll(g: Game, n: Nation, noise = 0) {
  const P = n.power, I = n.idx
  const w = blocWeights(g, n, true)
  const econ = clamp(((I.growth ?? 2) - 2) * 0.07 - ((I.inflation ?? 3) - 3) * 0.05 - ((I.unemployment ?? 6) - 6) * 0.05, -0.7, 0.7)
  const yrs = (g.tick - P.since) / 360
  const limit = String(n.policy.termLimits)
  // voters tire of governments: 'time for a change' grows with years in office and terms won
  let fatigue = -Math.min(0.7, 0.07 * Math.max(0, yrs - 3)) - 0.08 * Math.max(0, P.terms - 1)
  if (limit === 'two' && P.terms >= 2) fatigue = fatigue / 2 - 0.15
  const honey = g.tick < P.honeymoonUntil ? 0.25 : 0
  const scandal = String(n.policy.press) === 'free' ? -Math.max(0, n.stocks.corruption - 50) * 0.008 : 0
  const gov = P.govParty
  const votes: Record<string, number> = Object.fromEntries(PARTIES.map(p => [p.id, 0]))
  if (gov === 'junta') votes.junta = 0
  // the strongest opposition party draws extra defectors (voters rally to the likeliest winner)
  const challenger = Object.entries(P.votes).filter(([k]) => k !== gov && !P.coalition.includes(k)).sort((a, b) => b[1] - a[1])[0]?.[0]
  const SWING = 0.7
  for (const b of BLOCS) {
    const a = n.blocs[b.id] ?? 50, wb = w[b.id] ?? 0
    // partisans: each faction splits into loyal supporters of the parties that represent it, plus swing voters
    const loyal = PARTIES.map(p => ((p.blocs[b.id] ?? 0) + (P.campaign[p.id]?.[b.id] ?? 0) * 0.5) ** 2)
    const tot = loyal.reduce((s, x) => s + x, 0) + SWING
    const jitter = noise ? (Math.random() - 0.5) * noise : 0
    const mood = (a - 62) / 10 + econ + fatigue + honey + scandal + (P.campaign[gov]?.[b.id] ?? 0) + jitter
    // the government's own partisans mostly stay; swing voters judge its record
    const keepLoyal = sig(mood + 1.6), keepSwing = sig(mood)
    let defectors = 0
    PARTIES.forEach((p, i) => {
      const share = (loyal[i] / tot) * wb
      if (p.id === gov) { votes[gov] += share * keepLoyal; defectors += share * (1 - keepLoyal) } else votes[p.id] += share
    })
    if (gov === 'junta') votes.junta += (SWING / tot) * wb * keepSwing
    else votes[gov] += (SWING / tot) * wb * keepSwing
    defectors += (SWING / tot) * wb * (1 - keepSwing)
    // defectors go to the opposition parties that speak to this faction
    const pull = PARTIES.map(p => (p.id === gov ? 0 : ((p.blocs[b.id] ?? 0) + (P.campaign[p.id]?.[b.id] ?? 0) + 0.12) ** 2 * (p.id === challenger ? 1.4 : 1) * (p.id === P.party && P.office !== 'governing' ? 1.15 : 1)))
    const ptot = pull.reduce((s, x) => s + x, 0) || 1
    PARTIES.forEach((p, i) => { votes[p.id] += defectors * (pull[i] / ptot) })
  }
  const sum = Object.values(votes).reduce((a, x) => a + x, 0) || 1
  for (const k of Object.keys(votes)) votes[k] = (votes[k] / sum) * 100
  return { votes, seats: seatsFor(votes, String(n.policy.electoralSystem)) }
}

function seatsFor(votes: Record<string, number>, system: string) {
  const pr: Record<string, number> = {}, fp: Record<string, number> = {}
  let a = 0, b = 0
  for (const [k, v] of Object.entries(votes)) {
    pr[k] = v >= 4 ? v : 0; a += pr[k]
    fp[k] = Math.pow(v, k === 'regional' ? 1.4 : 2.6); b += fp[k]
  }
  const out: Record<string, number> = {}
  for (const k of Object.keys(votes)) {
    const p = a ? (pr[k] / a) * 100 : 0, f = b ? (fp[k] / b) * 100 : 0
    out[k] = system === 'fptp' ? f : system === 'mixed' ? (p + f) / 2 : p
  }
  return out
}

/** Ideological closeness of two parties (−1..1). */
function closeness(a: string, b: string) {
  const A = PARTY_MAP[a]?.ideology, B = PARTY_MAP[b]?.ideology
  if (!A || !B) return 0
  let s = 0, na = 0, nb = 0
  for (const k of Object.keys(A) as (keyof typeof A)[]) { s += A[k] * B[k]; na += A[k] ** 2; nb += B[k] ** 2 }
  return s / Math.sqrt(na * nb)
}
/** Smallest coalition (≤ 2 partners) that gives `leader` a majority, preferring like-minded partners. */
function formCoalition(leader: string, seats: Record<string, number>): string[] | null {
  if ((seats[leader] ?? 0) >= 50) return []
  const cands = Object.keys(seats).filter(k => k !== leader && seats[k] > 0).sort((x, y) => closeness(leader, y) - closeness(leader, x))
  for (const p of cands) if (seats[leader] + seats[p] >= 50 && closeness(leader, p) > 0.2) return [p]
  for (let i = 0; i < cands.length; i++) for (let j = i + 1; j < cands.length; j++) {
    if (seats[leader] + seats[cands[i]] + seats[cands[j]] >= 50 && closeness(leader, cands[i]) > 0 && closeness(leader, cands[j]) > 0) return [cands[i], cands[j]]
  }
  return null
}
export const govSeats = (P: Power) => (P.seats[P.govParty] ?? 0) + P.coalition.reduce((a, c) => a + (P.seats[c] ?? 0), 0)

/** What a change will cost this government. */
export function costCtx(g: Game, n: Nation): CostCtx {
  const P = n.power
  let mult = electoral(n) ? 1 : 0.6
  if (electoral(n)) mult *= 1 + Math.max(0, 50 - (P.seats[P.govParty] ?? 50)) / 50
  if (g.tick < P.honeymoonUntil) mult *= 0.7
  if (g.tick - n.founded < FOUNDING_DAYS) mult *= FOUNDING_DISCOUNT
  const base: Partial<Record<BlocId, number>> = { ...(PARTY_MAP[P.govParty]?.blocs ?? { military: 1 }) }
  for (const c of P.coalition) for (const [b, v] of Object.entries(PARTY_MAP[c]?.blocs ?? {})) base[b as BlocId] = Math.max(base[b as BlocId] ?? 0, v! * 0.7)
  return { weights: n.blocWeights, mult, base }
}

/** Spend political capital, or (autocracies) rule by decree at the cost of legitimacy. */
export function spendPC(n: Nation, cost: number, what: string): string | null {
  const P = n.power
  if (cost <= P.pc + 1e-9) { P.pc -= cost; return null }
  if (!electoral(n)) {
    const short = cost - P.pc
    P.pc = 0
    n.legitimacy = clamp(n.legitimacy - short * 0.5, 0, 100)
    n.stability = clamp(n.stability - short * 0.2, 0, 100)
    return null
  }
  return `Not enough political capital for ${what}: it needs ${cost.toFixed(0)}, you have ${P.pc.toFixed(0)}. Parliament won't pass it. Win back approval, wait, or call an election.`
}

export function powerWeek(g: Game, n: Nation) {
  const P = n.power
  const { votes, seats } = poll(g, n)
  P.votes = Object.fromEntries(Object.entries(votes).map(([k, v]) => [k, r1(v)]))
  P.seats = Object.fromEntries(Object.entries(seats).map(([k, v]) => [k, r1(v)]))
  for (const p of Object.keys(P.campaign)) for (const b of Object.keys(P.campaign[p]) as BlocId[]) { P.campaign[p][b]! *= 0.97; if (P.campaign[p][b]! < 0.02) delete P.campaign[p][b] }
  n.idx.poll = P.votes[P.govParty] ?? 0
  n.idx.pc = P.pc
}

export function powerMonth(g: Game, n: Nation) {
  const P = n.power, I = n.idx
  const dem = electoral(n)
  const approval = I.approval ?? 50
  // ── political capital ──
  const drv: [string, number][] = P.office === 'governing' ? [
    ['Base', 3],
    ['Approval', (approval - 50) * 0.08],
    ['Legitimacy', (n.legitimacy - 50) * 0.04],
    ...(dem ? [['Parliamentary majority', (govSeats(P) - 50) * 0.1] as [string, number]] : [['Army loyalty', (n.blocs.military - 50) * 0.05] as [string, number]]),
    ['Honeymoon', g.tick < P.honeymoonUntil ? 3 : 0],
    ['Founding era', g.tick - n.founded < FOUNDING_DAYS ? 4 : 0],
    ['Instability', n.stability < 35 ? -(35 - n.stability) * 0.1 : 0],
    ['Policies', M(n.mods, 'pc')],
  ] : [
    ['Opposition base', 2],
    ['Government unpopularity', (50 - approval) * 0.08],
  ]
  const gain = drv.reduce((a, [, v]) => a + v, 0)
  P.pc = clamp(P.pc + gain, 0, PC_MAX)
  n.drivers.pc = drv.filter(([, v]) => Math.abs(v) > 0.05).map(([k, v]) => [k, r1(v)])

  // ── coalition strain ──
  if (dem && P.coalition.length && P.office === 'governing') {
    for (const c of [...P.coalition]) {
      const aff = PARTY_MAP[c]?.blocs ?? {}
      let s = 0, t = 0
      for (const [b, v] of Object.entries(aff)) { s += (n.blocs[b as BlocId] ?? 50) * v!; t += v! }
      const mood = t ? s / t : 50
      if (mood < 35 && Math.random() < 0.08) {
        P.coalition = P.coalition.filter(x => x !== c)
        g.pushNews('election', `🤝 ${n.name}: the ${partyName(P, c)} walk out of the governing coalition.`, [n.id])
        if (govSeats(P) < 50) {
          n.nextElection = g.tick + 60
          g.pushNews('election', `🗳 ${n.name}'s government has lost its majority. Snap elections in two months.`, [n.id])
        }
      }
    }
  }

  // ── elections ──
  if (dem) {
    n.nextElection ??= g.tick + ELECTION_MONTHS * DAYS_PER_MONTH
    if (g.tick >= n.nextElection) election(g, n)
  } else n.nextElection = null

  // ── coups ──
  const mil = n.blocs.military
  const weak = dem ? ramp(58 - n.stocks.inst, 0, 30) : 0.6 + 0.4 * ramp(50 - n.stocks.inst, 0, 30)
  const proof = clamp(M(n.mods, 'coupProof') + n.budget.security * 0.05 + (P.coupShield > g.tick ? 0.6 : 0), 0, 0.9)
  P.coupRisk = 0.06 * ramp(40 - mil, 0, 30) * weak * (1 + ramp(40 - n.stability, 0, 30)) * (1 - proof) * (n.policy.government === 'junta' ? 0.5 : 1)
  const repression = clamp(n.budget.security * 0.07 + M(n.mods, 'surveillance') / 60 + (mil - 50) / 150, 0, 0.85)
  P.revoRisk = dem ? 0 : 0.05 * ramp(28 - n.stability, 0, 22) * (1 - repression)
  n.drivers.coup = [['Army discontent', r1(ramp(40 - mil, 0, 30) * 100)], ['Weak institutions', r1(weak * 100)], ['Instability', r1(ramp(40 - n.stability, 0, 30) * 100)], ['Coup-proofing', -r1(proof * 100)]]
  if (Math.random() < P.coupRisk) coup(g, n)
  else if (Math.random() < P.revoRisk) revolution(g, n)
  else if (P.office === 'exile' && n.policy.government === 'junta') {
    const yrs = (g.tick - P.since) / 360
    if (Math.random() < 0.015 + ramp(40 - n.stability, 0, 30) * 0.06 + (yrs > 3 ? 0.03 : 0)) restoreDemocracy(g, n, 'The military council collapses under protests and agrees to hand back power.')
  }
  I.coupRisk = P.coupRisk * 100
  I.pc = P.pc
}

function election(g: Game, n: Nation) {
  const P = n.power
  n.nextElection = g.tick + ELECTION_MONTHS * DAYS_PER_MONTH
  const { votes, seats } = poll(g, n, 0.5)
  P.votes = Object.fromEntries(Object.entries(votes).map(([k, v]) => [k, r1(v)]))
  P.seats = Object.fromEntries(Object.entries(seats).map(([k, v]) => [k, r1(v)]))
  const ranked = Object.keys(seats).sort((a, b) => seats[b] - seats[a])
  const largest = ranked[0], inc = P.govParty
  let gov = largest, coal = formCoalition(largest, seats)
  if (!coal) { const c2 = formCoalition(inc, seats); if (c2 && seats[inc] >= seats[largest] * 0.6) { gov = inc; coal = c2 } else coal = [] }
  const prev = P.govParty, wasMine = P.office === 'governing' && !n.ai
  P.history.unshift({ tick: g.tick, votes: { ...P.votes }, seats: { ...P.seats }, gov, coalition: coal })
  P.history.length = Math.min(P.history.length, 8)
  P.lastElection = g.tick
  const pct = (votes[gov] ?? 0).toFixed(1)
  const partners = coal.length ? ` in coalition with the ${coal.map(c => partyName(P, c)).join(' and ')}` : seats[gov] >= 50 ? ' with an outright majority' : ' as a minority government'
  if (gov === prev) {
    P.terms++
    n.legitimacy = clamp(n.legitimacy + 8, 0, 100)
    P.coalition = coal
    P.honeymoonUntil = g.tick + 180
    if (!n.ai && P.office === 'governing') P.pc = clamp(P.pc + 15 + Math.max(0, seats[gov] - 45) * 0.5, 0, PC_MAX)
    g.pushNews('election', `🗳 ${n.name}: the ${partyName(P, gov)} are re-elected with ${pct}% of the vote${partners}.`, [n.id])
    return
  }
  // a change of government
  P.govParty = gov; P.coalition = coal; P.since = g.tick; P.terms = 1; P.honeymoonUntil = g.tick + 360
  n.legitimacy = clamp(n.legitimacy + 6, 0, 100)
  n.stability = clamp(n.stability - 3, 0, 100)
  g.pushNews('election', `🗳 ${n.name}: the ${partyName(P, gov)} win the election with ${pct}% of the vote${partners}. The ${partyName(P, prev)} go into opposition.`, [n.id])
  if (n.ai) {
    // the new government brings its own ideology
    const ide = PARTY_MAP[gov]?.ideology
    if (n.brain && ide) for (const k of Object.keys(n.brain.ideology) as (keyof typeof ide)[]) n.brain.ideology[k] = n.brain.ideology[k] * 0.45 + ide[k] * 0.55
    if (n.brain) n.brain.nextReview = g.tick
    return
  }
  if (gov === P.party) {
    P.office = 'governing'
    P.pc = clamp(55 + Math.max(0, seats[gov] - 40) * 0.6, 0, PC_MAX)
    g.pushNews('election', `🎉 ${n.leader} returns to power in ${n.name}.`, [n.id])
  } else {
    P.office = 'opposition'
    P.pc = Math.min(P.pc, 30)
    if (wasMine) g.pushNews('election', `📉 ${n.leader} concedes defeat in ${n.name}. A ${partyName(P, gov)} government takes office.`, [n.id])
  }
}

/** Called by the player: snap election. */
export function callElection(g: Game, n: Nation) {
  n.nextElection = g.tick + 60
  g.pushNews('election', `🗳 ${n.leader} calls a snap election in ${n.name}, two months from now.`, [n.id])
}

export function coup(g: Game, n: Nation) {
  const P = n.power
  const wasMine = !n.ai && P.office === 'governing'
  n.policy.government = 'junta'; n.policy.press = 'state'; n.policy.judiciary = 'captured'
  for (const k of ['government', 'press', 'judiciary']) n.since[k] = g.tick
  n.budget.defense = Math.max(n.budget.defense, 4)
  n.stability = 45; n.cooldowns.government = g.tick + 36 * DAYS_PER_MONTH
  n.blocs.military = clamp(n.blocs.military + 30, 0, 100)
  P.govParty = 'junta'; P.coalition = []; P.since = g.tick; P.terms = 0
  n.nextElection = null
  g.pushNews('event', `🪖 Military coup in ${n.name}! The generals suspend the constitution${wasMine ? ` and ${n.leader} flees into exile` : ''}.`, [n.id])
  if (!n.ai) { P.office = 'exile'; P.pc = Math.min(P.pc, 20) }
}

function revolution(g: Game, n: Nation) {
  const P = n.power
  const wasMine = !n.ai && P.office === 'governing'
  n.policy.government = 'democracy'; n.policy.press = 'free'; n.policy.judiciary = 'independent'
  for (const k of ['government', 'press', 'judiciary']) n.since[k] = g.tick
  n.stability = 40; n.cooldowns.government = g.tick + 24 * DAYS_PER_MONTH
  g.pushNews('event', `✊ Revolution in ${n.name}! Crowds topple the regime and proclaim a democratic republic.`, [n.id])
  // the old ruling party is swept aside; a founding election follows
  P.govParty = PARTIES.map(p => p.id).filter(id => id !== P.party).sort(() => Math.random() - 0.5)[0]
  P.coalition = []; P.since = g.tick; P.honeymoonUntil = g.tick + 360
  n.nextElection = g.tick + 6 * DAYS_PER_MONTH
  if (!n.ai && wasMine) { P.office = 'opposition'; P.pc = 20 }
}

function restoreDemocracy(g: Game, n: Nation, why: string) {
  const P = n.power
  n.policy.government = 'democracy'; n.policy.press = 'regulated'; n.policy.judiciary = 'influenced'
  for (const k of ['government', 'press', 'judiciary']) n.since[k] = g.tick
  n.cooldowns.government = g.tick + 24 * DAYS_PER_MONTH
  P.govParty = 'conservative'; P.since = g.tick
  n.nextElection = g.tick + 6 * DAYS_PER_MONTH
  if (!n.ai) P.office = 'opposition'
  g.pushNews('election', `🕊 ${n.name}: ${why} Elections in six months.`, [n.id])
}

/** Campaign among a faction. */
export function campaign(n: Nation, bloc: BlocId) {
  const P = n.power
  const party = P.office === 'governing' ? P.govParty : P.party
  const c = (P.campaign[party] ??= {})
  c[bloc] = Math.min(1.2, (c[bloc] ?? 0) + 0.35)
}

/** Opposition motion of no confidence. Returns whether it passed. */
export function noConfidence(g: Game, n: Nation) {
  const P = n.power
  const approval = n.idx.approval ?? 50
  const chance = clamp(0.25 + (42 - approval) * 0.03 + (govSeats(P) < 55 ? 0.2 : 0), 0.05, 0.9)
  const ok = Math.random() < chance
  if (ok) {
    n.nextElection = g.tick + 60
    g.pushNews('election', `🗳 ${n.name}: the government falls on a vote of no confidence. Elections in two months.`, [n.id])
  } else g.pushNews('election', `🗳 ${n.name}: the government survives a vote of no confidence tabled by the ${P.partyName}.`, [n.id])
  return ok
}
