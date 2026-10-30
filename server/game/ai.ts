import { POLICIES, type Ideology } from '../../shared/policies'
import { PROJECT_MAP } from '../../shared/projects'
import { SECTOR_INDEX as S, type SectorId } from '../../shared/sectors'
import { claimCost, TERRAIN, DEMOCRATIC } from '../../shared/rules'
import type { Game } from './world'
import type { Nation } from './model'
import type { Baseline } from './data'
import { scoreMods, optionMods, ideologyScore, policyYears } from './mods'
import { PARTY_MAP } from '../../shared/power'
import type { Mods } from '../../shared/policies'
import { influenceOf } from './trade'
import { GameError, launchAttack, defensePower } from './military'

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]
const safe = (f: () => void) => { try { f() } catch (e) { if (!(e instanceof GameError)) throw e } }

// ───────── ideology ─────────
export function ideologyFromData(b: Baseline): Record<Ideology, number> {
  const econ = clamp((22 - b.taxRev) / 14 + (b.gini - 38) / 30, -1, 1)
  const auth = clamp((55 - b.voice) / 40, -1, 1)
  const trad = clamp((b.fertility - 2.1) / 1.8 + (25 - b.genderParl) / 40 + (45 - b.femaleLabor) / 60, -1, 1)
  const nat = clamp((40 - b.exportsGdp) / 40, -1, 1)
  return {
    right: Math.max(0, econ), left: Math.max(0, -econ), auth: Math.max(0, auth), lib: Math.max(0, -auth),
    trad: Math.max(0, trad), prog: Math.max(0, -trad), nat: Math.max(0, nat), glob: Math.max(0, -nat),
    green: clamp(b.renewables / 60 + (b.voice > 70 && b.gdppc > 35000 ? 0.3 : 0), 0, 1), hawk: clamp(b.milSpend / 4, 0, 1),
  }
}

/** What a nation's policies reveal about its ideology (works for players too). */
export function revealedIdeology(n: Nation): Record<Ideology, number> {
  if (n.brain) return n.brain.ideology
  const econ = clamp((30 - +n.policy.incomeTax) / 20 + (n.policy.economicSystem === 'free' ? 0.4 : n.policy.economicSystem === 'planned' ? -0.8 : 0), -1, 1)
  const auth = clamp((5 - (n.idx.democracy ?? 5)) / 4, -1, 1)
  const trad = clamp((n.policy.religion === 'theocratic' ? 0.8 : 0) + (n.policy.gender === 'traditional' ? 0.5 : n.policy.gender === 'parity' ? -0.5 : 0) + (n.policy.lgbt === 'criminalized' ? 0.4 : n.policy.lgbt === 'equal' ? -0.4 : 0), -1, 1)
  const nat = clamp((+n.policy.tariff - 10) / 25 + (n.policy.immigration === 'closed' ? 0.4 : n.policy.immigration === 'open' ? -0.4 : 0), -1, 1)
  return {
    right: Math.max(0, econ), left: Math.max(0, -econ), auth: Math.max(0, auth), lib: Math.max(0, -auth), trad: Math.max(0, trad), prog: Math.max(0, -trad),
    nat: Math.max(0, nat), glob: Math.max(0, -nat), green: clamp((n.stocks.renewables - 20) / 50, 0, 1), hawk: clamp(n.budget.defense / 4, 0, 1),
  }
}
function ideologyDistance(a: Record<Ideology, number>, b: Record<Ideology, number>) {
  const ax = (x: Record<Ideology, number>) => [x.right - x.left, x.auth - x.lib, x.trad - x.prog, x.nat - x.glob]
  const A = ax(a), B = ax(b)
  return Math.sqrt(A.reduce((s, v, i) => s + (v - B[i]) ** 2, 0)) / 4
}

// ───────── founding an AI nation from real-world data ─────────
export function aiGovernment(b: Baseline, iso3: string, region: string): string {
  if (b.voice >= 62) return ['GBR', 'JPN', 'NLD', 'SWE', 'NOR', 'DNK', 'ESP', 'BEL', 'THA', 'CAN', 'AUS'].includes(iso3) ? 'monarchy' : 'democracy'
  if (b.voice >= 42) return 'democracy'
  if (['IRN', 'AFG'].includes(iso3)) return 'theocracy'
  // absolute monarchies rule without elections
  if (['SAU', 'ARE', 'QAT', 'KWT', 'OMN', 'BHR'].includes(iso3)) return 'oneparty'
  if (['JOR', 'MAR'].includes(iso3)) return 'monarchy'
  if (b.milSpend > 3.5 || ['MMR', 'SDN', 'MLI', 'BFA', 'NER', 'TCD', 'GIN', 'EGY'].includes(iso3)) return 'junta'
  if (region.includes('Middle East') && b.voice < 20) return 'theocracy'
  return 'oneparty'
}

export function setupAINation(g: Game, n: Nation, b: Baseline) {
  const ide = ideologyFromData(b)
  const gov = aiGovernment(b, n.iso3, g.countries[n.iso3]?.region ?? '')
  n.brain = { ideology: ide, aggression: clamp(0.1 + ide.hawk * 0.45 + ide.auth * 0.3 + Math.random() * 0.2, 0, 1), ambition: clamp(0.2 + Math.random() * 0.5 + (b.gdppc > 30000 ? 0.2 : 0), 0, 1), strategy: 'welfare', nextReview: 0, grievances: {} }
  // policies that best fit this ideology, judged by their full effects in this country's situation
  // (a strong status-quo bias: most countries keep most institutions as they are)
  const SET_BY_HISTORY = new Set(['nuclear', 'currency', 'fiscalRule', 'electoralSystem', 'termLimits', 'swf', 'fuelSubsidy', 'priceControls', 'pensionSystem', 'adaptation'])
  for (const p of POLICIES) {
    if (p.kind !== 'choice' || SET_BY_HISTORY.has(p.id)) continue
    const bias = p.isNew ? 1.4 : 0.6
    let best = p.default, bs = scoreMods(seen(n, p, p.default, 0), ide) + bias
    for (const o of p.options) {
      if (o.id === p.default) continue
      const s = scoreMods(seen(n, p, o.id, 0), ide)
      if (s > bs) { bs = s; best = o.id }
    }
    n.policy[p.id] = best
  }
  // institutions that come from each country's history
  const iso = n.iso3
  n.policy.nuclear = ['USA', 'RUS', 'CHN', 'IND', 'PAK', 'FRA', 'GBR', 'ISR', 'PRK'].includes(iso) ? 'arsenal' : ['IRN', 'JPN', 'KOR', 'SAU'].includes(iso) ? 'threshold' : 'none'
  n.policy.currency = ['SAU', 'ARE', 'QAT', 'KWT', 'OMN', 'BHR', 'JOR', 'DNK', 'HKG', 'BGR', 'PAN', 'ECU', 'SLV'].includes(iso) ? 'peg' : ['CHN', 'VNM', 'SGP', 'IND', 'EGY', 'NGA', 'ARG'].includes(iso) ? 'managed' : 'float'
  n.policy.fiscalRule = ['DEU', 'CHE', 'SWE', 'NLD', 'DNK', 'NOR', 'POL', 'CHL'].includes(iso) ? 'brake' : 'none'
  n.policy.electoralSystem = ['USA', 'GBR', 'CAN', 'IND', 'PAK', 'BGD', 'NGA', 'MYS', 'KEN', 'GHA', 'FRA', 'AUS'].includes(iso) ? 'fptp' : ['DEU', 'JPN', 'KOR', 'MEX', 'NZL', 'HUN', 'ITA', 'RUS', 'TWN', 'PHL', 'THA'].includes(iso) ? 'mixed' : 'pr'
  n.policy.swf = b.shares.oilRents + b.shares.mineralRents > 0.08 ? (['NOR', 'SAU', 'ARE', 'QAT', 'KWT', 'KAZ', 'AZE', 'BWA', 'CHL'].includes(iso) ? 'fund' : 'spend') : 'spend'
  n.policy.fuelSubsidy = ['VEN', 'IRN', 'SAU', 'KWT', 'DZA', 'LBY', 'IRQ', 'EGY', 'NGA', 'TKM', 'QAT', 'ARE', 'OMN', 'BHR'].includes(iso) ? (b.shares.oilRents > 0.1 ? 'heavy' : 'subsidized') : ['IDN', 'IND', 'MYS', 'PAK', 'BGD', 'ECU', 'BOL'].includes(iso) ? 'subsidized' : 'market'
  n.policy.priceControls = ['VEN', 'ARG', 'EGY', 'CUB', 'PRK', 'IRN'].includes(iso) ? 'essentials' : 'none'
  n.policy.pensionSystem = ['CHL', 'AUS', 'CHE', 'SWE', 'NLD', 'DNK', 'MEX', 'COL', 'PER'].includes(iso) ? 'mixed' : 'payg'
  n.policy.adaptation = ['NLD', 'SGP', 'BGD', 'JPN'].includes(iso) ? 'basic' : 'none'
  n.policy.government = gov
  n.policy.termLimits = gov === 'democracy' ? 'two' : 'none'
  const auth = gov !== 'democracy' && gov !== 'monarchy'
  if (auth) { n.policy.press = b.voice < 25 ? 'state' : 'regulated'; n.policy.judiciary = b.voice < 25 ? 'captured' : 'influenced'; n.policy.internet = b.voice < 20 ? 'firewall' : 'filtered' }
  if (gov === 'theocracy') { n.policy.religion = 'theocratic'; n.policy.gender = 'traditional' }
  n.policy.incomeTax = Math.round(clamp(18 + ide.left * 25 + b.taxRev * 0.4, 5, 55))
  n.policy.corporateTax = Math.round(clamp(14 + ide.left * 12 - ide.glob * 4, 5, 35))
  n.policy.vat = Math.round(clamp(b.taxRev - 6, 3, 25))
  n.policy.tariff = Math.round(clamp(3 + ide.nat * 18, 0, 35))
  n.budget = {
    defense: clamp(b.milSpend, 0.5, 8), health: clamp(b.healthSpend * 0.6, 1, 10), education: clamp(b.eduSpend, 1.5, 8),
    welfare: clamp(3 + ide.left * 8 + (b.gdppc > 25000 ? 4 : 0), 1, 16), infrastructure: 2.8, rnd: clamp(b.tech / 25, 0.2, 4),
    security: 1.5, culture: 0.3, sports: 0.15, environment: clamp(0.3 + ide.green, 0.2, 2.5), diplomacy: 0.3, subsidies: 0.4, admin: 3,
  }
}

// ───────── national strategy ─────────
export function strategyScores(g: Game, n: Nation): Record<string, number> {
  const gdp = Math.max(0.001, n.gdp)
  const share = (s: number) => n.sectorOut[s] / gdp
  const ide = n.brain!.ideology
  const gdppc = g.gdppc(n)
  const attraction = g.owned(n.id).reduce((a, p) => a + g.P[p].attraction, 0) / Math.max(1, g.owned(n.id).length)
  const scores: Record<string, number> = {
    rentier: (share(S.oil) + share(S.mining)) * 8,
    exportMfg: (gdppc < 25000 ? 1 : 0.3) * (n.stocks.infra / 60) + share(S.light) * 5 + ide.glob * 0.3,
    knowledge: (n.stocks.hc / 70) * (gdppc > 15000 ? 1.2 : 0.4) + share(S.software) * 8,
    welfare: (gdppc > 25000 ? 1 : 0.2) * (ide.left + ide.lib) * 0.8,
    militarist: ide.hawk * 0.8 + n.brain!.aggression * 0.6,
    tourism: attraction * 0.35 + share(S.tourism) * 8,
    agrarian: (gdppc < 6000 ? 1 : 0) + share(S.agriculture) * 3,
    finance: (n.stocks.inst > 65 ? 0.8 : 0) + share(S.finance) * 8 + ide.right * 0.3,
  }
  return scores
}
export function chooseStrategy(g: Game, n: Nation): string {
  return Object.entries(strategyScores(g, n)).sort((a, b) => b[1] - a[1])[0][0]
}
const STRAT_SUBSIDY: Record<string, SectorId[]> = {
  rentier: ['oil', 'mining', 'heavy'], exportMfg: ['light', 'auto', 'electronics'], knowledge: ['software', 'electronics', 'pharma'],
  welfare: ['pharma', 'software', 'media'], militarist: ['aerospace', 'heavy', 'auto'], tourism: ['tourism', 'media', 'logistics'],
  agrarian: ['agriculture', 'light', 'construction'], finance: ['finance', 'software', 'logistics'],
}
const STRAT_PROJECTS: Record<string, string[]> = {
  rentier: ['refinery', 'mine', 'port', 'airport', 'heritage'], exportMfg: ['industrial', 'port', 'rail', 'solar', 'university'],
  knowledge: ['university', 'techpark', 'fab', 'hospital', 'spaceport'], welfare: ['hospital', 'housing', 'university', 'rail', 'solar'],
  militarist: ['base', 'airbase', 'navalbase', 'industrial', 'spaceport'], tourism: ['resort', 'airport', 'heritage', 'studios', 'stadium'],
  agrarian: ['agritech', 'rail', 'hospital', 'industrial'], finance: ['financial', 'airport', 'techpark', 'university'],
}
export function applyStrategy(n: Nation) {
  const s = n.brain!.strategy
  n.subsidies = STRAT_SUBSIDY[s] ?? []
  const b = n.budget
  if (s === 'knowledge') { b.education = Math.max(b.education, 5.5); b.rnd = Math.max(b.rnd, 2.5) }
  if (s === 'welfare') { b.health = Math.max(b.health, 7); b.welfare = Math.max(b.welfare, 12) }
  if (s === 'militarist') b.defense = Math.max(b.defense, 4)
  if (s === 'tourism') { b.culture = Math.max(b.culture, 0.8); n.policy.tourismPolicy = 'open' }
  if (s === 'exportMfg') { b.infrastructure = Math.max(b.infrastructure, 4); n.policy.fdiPolicy = 'incentives' }
  if (s === 'finance') { n.policy.capitalControls = 'open'; n.policy.corporateTax = Math.min(+n.policy.corporateTax, 15) }
  if (s === 'agrarian') b.subsidies = Math.max(b.subsidies, 1)
}

// ───────── attitudes ─────────
export function attitude(g: Game, a: Nation, b: Nation): number {
  if (a.wars.includes(b.id)) return -100
  let v = 0
  v -= 35 * ideologyDistance(revealedIdeology(a), revealedIdeology(b)) * 2
  v += 0.4 * influenceOf(g, b.id, a.id)
  const ex = a.exports.reduce((s, x) => s + x, 0)
  v += ex ? 30 * (g.flowBetween(a.id, b.id) / ex) : 0
  v += (b.idx.softPower ?? 20) * 0.15
  if (a.allies.includes(b.id)) v += 30
  if (a.pacts.includes(b.id)) v += 10
  if (a.tradeBloc != null && a.tradeBloc === b.tradeBloc) v += 15
  if (a.wars.some(w => b.wars.includes(w))) v += 20
  if (b.wars.some(w => a.allies.includes(w))) v -= 40
  if (b.sanctions.includes(a.id) || b.embargoes.includes(a.id)) v -= 35
  if ((b.tariffs[a.id] ?? 0) > 25) v -= 10
  if (g.aggressorRecently(b.id) && DEMOCRATIC.has(String(a.policy.government))) v -= 20
  v -= a.brain?.grievances[b.id] ?? 0
  if (g.neighboursOf(a.id).includes(b.id) && (b.idx.power ?? 0) > (a.idx.power ?? 0) * 1.5) v -= 10
  return clamp(v, -100, 100)
}

export function aiAccepts(g: Game, ai: Nation, other: Nation, kind: string): boolean {
  const att = attitude(g, ai, other)
  if (kind === 'peace') return ai.warWeariness > 25 || (ai.idx.power ?? 0) < (other.idx.power ?? 0) * 0.8 || Math.random() < 0.1
  if (kind === 'pact') return att > -10
  if (kind === 'bloc') return att > 15
  return att > 35 && ai.allies.length < 4
}

// ───────── the weekly brain ─────────
export function aiWeek(g: Game, n: Nation) {
  const B = n.brain!
  const I = n.idx
  // yearly strategy review
  if (g.tick >= B.nextReview) {
    B.nextReview = g.tick + 360
    const sc = strategyScores(g, n)
    const s = B.locked ?? chooseStrategy(g, n)
    if (s !== B.strategy && sc[s] > (sc[B.strategy] ?? 0) * 1.3 + 0.1) { B.strategy = s; applyStrategy(n); g.pushNews('event', `${n.name} adopts a new national strategy: ${s === 'knowledge' ? 'the knowledge economy' : s}.`, [n.id]) }
  }
  for (const k of Object.keys(B.grievances)) { B.grievances[+k] *= 0.97; if (B.grievances[+k] < 1) delete B.grievances[+k] }

  fiscal(n, B.ideology)
  if (Math.random() < 0.06) reviewPolicy(g, n, B.ideology)
  if (Math.random() < 0.15) buildSomething(g, n)
  if (Math.random() < 0.25 * (0.5 + B.ambition)) expand(g, n)
  if (n.reserve > 3) g.autodeploy(n, n.wars.length ? 0.35 : 0.3)
  diplomacy(g, n)
  war(g, n)
  void I
}

/** A rival party governs a player's nation while the player is in opposition or exile. */
export function caretakerWeek(g: Game, n: Nation) {
  const P = n.power
  const ide = PARTY_MAP[P.govParty]?.ideology ?? { left: 0.2, right: 0.5, auth: 0.9, lib: 0, trad: 0.5, prog: 0, nat: 0.8, glob: 0.1, green: 0, hawk: 0.9 }
  fiscal(n, ide)
  const fresh = g.tick - P.since < 360
  if (Math.random() < (fresh ? 0.12 : 0.05)) reviewPolicy(g, n, ide, true)
}

function fiscal(n: Nation, ideology: Record<Ideology, number>) {
  const I = n.idx, P = n.policy, b = n.budget
  const debt = I.debt ?? 0, deficit = I.deficit ?? 0
  // consolidation scales with how bad things are
  const pressure = Math.max(0, (debt - 70) / 40) + Math.max(0, (-deficit - 2) / 3) + ((I.credit ?? 12) < 8 ? 1 : 0)
  if (pressure > 0) {
    const k = Math.min(2, pressure)
    P.vat = Math.min(25, +P.vat + 0.6 * k); P.incomeTax = Math.min(55, +P.incomeTax + 0.6 * k)
    // spare health and education; trim the rest down to sensible floors
    const FLOOR: Record<string, number> = { welfare: 3, infrastructure: 1.5, subsidies: 0, culture: 0.1, rnd: 0.4, defense: 1 }
    for (const [line, fl] of Object.entries(FLOOR)) b[line] = Math.max(Math.min(fl, b[line]), b[line] * (1 - 0.015 * k))
  }
  else if (deficit > 2 && debt < 40) {
    if ((ideology.right ?? 0) > 0.3) P.incomeTax = Math.max(5, +P.incomeTax - 1)
    else b.education = Math.min(8, b.education + 0.1)
    b.infrastructure = Math.min(6, b.infrastructure + 0.1)
  }
  if ((I.unemployment ?? 5) > 10) b.infrastructure = Math.min(7, b.infrastructure + 0.15)
  if (n.wars.length) b.defense = Math.min(10, b.defense + 0.15)
  else if (b.defense > (ideology.hawk * 4 + 1)) b.defense -= 0.05
}

/** Situational modifiers as the AI sees them: pension costs scale with how old the population is. */
function seen(n: Nation, p: (typeof POLICIES)[number], v: string | number, yrs: number): Mods {
  const m = optionMods(p, v, n.cond, yrs)
  if (m.pension) return { ...m, pension: m.pension * (n.demo.old / 0.12) }
  return m
}

function reviewPolicy(g: Game, n: Nation, ide: Record<Ideology, number>, caretaker = false) {
  // target the angriest important faction most of the time
  const angry = Object.entries(n.blocs).map(([k, v]) => ({ k, s: (50 - v) * (n.blocWeights[k as keyof typeof n.blocWeights] ?? 0.1) })).sort((a, b) => b.s - a.s)[0]
  // constitutional choices, the bomb and the currency regime are not everyday politics
  const FROZEN = new Set(['government', 'nuclear', 'currency', 'fiscalRule', 'electoralSystem', 'termLimits'])
  const candidates = POLICIES.filter(p => p.kind === 'choice' && !FROZEN.has(p.id) && (n.cooldowns[p.id] ?? 0) <= g.tick)
  const IDENTITY = new Set(['religion', 'gender', 'lgbt', 'deathPenalty', 'minorityRights', 'economicSystem', 'family', 'press', 'judiciary', 'internet', 'drugs', 'guns'])
  let best: { id: string; v: string; gain: number } | null = null
  for (const p of candidates) {
    if (p.kind !== 'choice') continue
    const yrs = policyYears(n, p.id, g.tick)
    const curMods = seen(n, p, n.policy[p.id], yrs)
    const cur = scoreMods(curMods, ide, n.blocWeights) + (angry && angry.s > 3 ? (curMods['bloc:' + angry.k] ?? 0) * 0.08 : 0)
    for (const o of p.options) {
      if (o.id === n.policy[p.id]) continue
      const om = seen(n, p, o.id, 0)
      // identity politics only move in the direction of the nation's ideology
      if (IDENTITY.has(p.id) && ideologyScore(om, ide) <= ideologyScore(curMods, ide) + 0.3) continue
      const upheaval = Object.entries(om).filter(([k]) => k.startsWith('bloc:')).reduce((a, [, v]) => a + Math.abs(v), 0) * 0.015
      const leave = p.options.find(x => x.id === n.policy[p.id])?.onLeave?.(n.cond, yrs)
      const backlash = leave ? Object.values(leave).reduce((a, v) => a + Math.max(0, -v), 0) * 0.03 : 0
      const s = scoreMods(om, ide, n.blocWeights) - upheaval - backlash + (angry && angry.s > 3 ? (om['bloc:' + angry.k] ?? 0) * 0.08 : 0) + (Math.random() - 0.5) * 0.4
      const gain = s - cur
      if (!best || gain > best.gain) best = { id: p.id, v: o.id, gain }
    }
  }
  if (best && best.gain > (caretaker ? 0.8 : 1.2)) {
    n.policy[best.id] = best.v
    if (!caretaker) n.cooldowns[best.id] = g.tick + 360 * 2
    const def = POLICIES.find(p => p.id === best!.id)!
    const label = def.kind === 'choice' ? def.options.find(o => o.id === best!.v)?.label : best.v
    if (caretaker || Math.random() < 0.35) g.pushNews('event', `${n.name}${caretaker ? `'s ${PARTY_MAP[n.power.govParty]?.name ?? 'new'} government` : ''} changes ${def.label.toLowerCase()}: ${label}.`, [n.id])
  }
}

function buildSomething(g: Game, n: Nation) {
  const list = STRAT_PROJECTS[n.brain!.strategy] ?? []
  const gdp = n.gdp * 12
  if ((n.idx.debt ?? 0) > 80) return
  for (const id of list) {
    const def = PROJECT_MAP[id]
    const provs = g.owned(n.id).filter(pid => g.canBuild(n, pid, id) === null).sort((a, b) => g.prov[b].pop - g.prov[a].pop)
    const pid = provs[0]
    if (pid === undefined) continue
    const cost = g.projectCost(pid, def)
    if (cost > gdp * 0.02 && n.treasury < cost) continue
    safe(() => g.build(n, pid, id))
    return
  }
}

function expand(g: Game, n: Nation) {
  const options = new Set<number>()
  for (const pid of g.owned(n.id)) for (const q of g.P[pid].nb) if (g.prov[q].owner === -1 && g.P[q].terrain !== 'ice') options.add(q)
  let best = -1, bv = -Infinity
  for (const q of options) {
    const P = g.P[q]
    const v = g.prov[q].pop / 500 + P.oil * 4 + P.metals * 3 + P.fertility * 2 + (P.strait ? 5 : 0) + TERRAIN[P.terrain].prod + (P.iso3 === n.iso3 ? 6 : 0) + Math.random() * 3
    if (v > bv) { bv = v; best = q }
  }
  if (best >= 0 && n.treasury > claimCost(n.provinces, g.prov[best].pop) * 1.6) safe(() => g.claim(n, best))
}

function diplomacy(g: Game, n: Nation) {
  const others = [...g.nations.values()].filter(o => o.alive && o.id !== n.id)
  const B = n.brain!
  const pending = (o: Nation, kind: string) => g.proposals.some(p => p.from === n.id && p.to === o.id && p.kind === kind)
  const dem = DEMOCRATIC.has(String(n.policy.government))
  for (const o of others) {
    const att = attitude(g, n, o)
    const trade = g.flowBetween(n.id, o.id) + g.flowBetween(o.id, n.id)
    const dep = trade / Math.max(0.01, n.gdp)
    // trade pacts with friendly trade partners
    if (!n.pacts.includes(o.id) && !n.wars.includes(o.id) && att > 10 && trade > 0 && Math.random() < 0.05 && !pending(o, 'pact')) g.proposeOrEnact(n, o, 'pact')
    // alliances
    if (!n.allies.includes(o.id) && !n.wars.includes(o.id) && att > 45 && n.allies.length < 4 && Math.random() < 0.02 && !pending(o, 'alliance')) g.proposeOrEnact(n, o, 'alliance')
    // tariff wars
    const t = n.tariffs[o.id]
    if (att < -40 && dep < 0.08 && t == null && Math.random() < 0.1) { n.tariffs[o.id] = 35; g.pushNews('trade', `${n.name} slaps 35% tariffs on goods from ${o.name}.`, [n.id, o.id]) }
    else if (t != null && att > 0 && Math.random() < 0.1) { delete n.tariffs[o.id]; g.pushNews('trade', `${n.name} lifts punitive tariffs on ${o.name}.`, [n.id, o.id]) }
    // retaliation
    if ((o.tariffs[n.id] ?? 0) > 25 && t == null && B.ideology.nat > 0.2 && Math.random() < 0.2) { n.tariffs[o.id] = o.tariffs[n.id]; g.pushNews('trade', `${n.name} retaliates with matching tariffs on ${o.name}.`, [n.id, o.id]) }
    // sanctions against aggressors and enemies of allies
    const enemyOfAlly = o.wars.some(w => n.allies.includes(w))
    if (!n.sanctions.includes(o.id) && ((dem && g.aggressorRecently(o.id) && att < -10) || enemyOfAlly) && dep < 0.12 && Math.random() < 0.15) {
      n.sanctions.push(o.id); g.pushNews('trade', `${n.name} imposes financial sanctions on ${o.name}.`, [n.id, o.id])
    } else if (n.sanctions.includes(o.id) && att > -5 && !o.wars.length && Math.random() < 0.05) {
      n.sanctions = n.sanctions.filter(x => x !== o.id); g.pushNews('trade', `${n.name} lifts sanctions on ${o.name}.`, [n.id, o.id])
    }
    if (!n.embargoes.includes(o.id) && att < -70 && dep < 0.05 && Math.random() < 0.05) { n.embargoes.push(o.id); g.pushNews('trade', `⛔ ${n.name} declares a full trade embargo on ${o.name}.`, [n.id, o.id]) }
    // foreign aid to poorer friends
    if (!n.aidTargets.includes(o.id) && n.aidTargets.length < 3 && att > 20 && g.gdppc(o) < g.gdppc(n) * 0.4 && n.budget.diplomacy >= 0.25 && Math.random() < 0.03) n.aidTargets.push(o.id)
    // blockades
    if (n.wars.includes(o.id) && !n.blockades.includes(o.id) && n.stocks.navy > o.stocks.navy * 1.2) { n.blockades.push(o.id); g.pushNews('war', `⚓ ${n.name}'s navy blockades the ports of ${o.name}.`, [n.id, o.id]) }
  }
  // trade blocs: globalists found or join them
  if (n.tradeBloc == null && B.ideology.nat < 0.5 && Math.random() < 0.03) {
    const friends = others.filter(o => attitude(g, n, o) > 12 && o.tradeBloc == null && (o.brain ? o.brain.ideology.nat < 0.5 : true))
      .sort((a, b) => (g.flowBetween(n.id, b.id) + g.flowBetween(b.id, n.id)) - (g.flowBetween(n.id, a.id) + g.flowBetween(a.id, n.id)))
    // join a friendly bloc nearby before founding a new one
    const near = g.tradeBlocs.find(b => b.members.some(m => g.neighboursOf(n.id).includes(m)) && b.members.every(m => { const o = g.nation(m); return !o || attitude(g, n, o) > 0 }))
    if (near) { const f = g.nation(near.founder); if (f) g.proposeOrEnact(f, n, 'bloc', near.id) }
    else if (friends.length >= 2) {
      const bloc = g.createBloc(n, blocName(g, n), 6)
      for (const f of friends.slice(0, 4)) g.proposeOrEnact(n, f, 'bloc', bloc.id)
    }
  }
  if (n.tradeBloc != null && Math.random() < 0.02) {
    const bloc = g.tradeBlocs.find(b => b.id === n.tradeBloc)
    if (bloc && bloc.founder === n.id) {
      const cand = others.find(o => o.tradeBloc == null && attitude(g, n, o) > 20 && !pending(o, 'bloc'))
      if (cand) g.proposeOrEnact(n, cand, 'bloc', bloc.id)
    }
  }
}

function blocName(g: Game, n: Nation) {
  const region = g.countries[n.iso3]?.region ?? 'Global'
  const base = region.split(/[&,]/)[0].trim()
  return pick([`${base} Economic Community`, `${base} Free Trade Area`, `${base} Customs Union`, `${base} Common Market`, `${base} Partnership`])
}

function war(g: Game, n: Nation) {
  const B = n.brain!
  if (n.wars.length) {
    for (const enemyId of n.wars) {
      const enemy = g.nation(enemyId)
      if (!enemy) continue
      const targets = g.owned(enemyId).filter(t => g.bordering(n.id, t).all.length)
        .sort((a, b) => defensePower(g, enemy, a) - defensePower(g, enemy, b))
      for (const t of targets.slice(0, 2)) {
        if (g.battles.some(b => b.attacker === n.id && b.to === t)) continue
        const { all } = g.bordering(n.id, t)
        const avail = n.reserve + all.reduce((s, q) => s + g.prov[q].garrison, 0)
        const needed = (defensePower(g, enemy, t) / n.quality) * 1.5 + 1
        if (avail * 0.7 > needed && Math.random() < 0.5) safe(() => launchAttack(g, n, t, Math.min(avail * 0.7, needed * 1.3)))
      }
    }
    if (n.warWeariness > 45 && Math.random() < 0.2) {
      const enemy = g.nation(n.wars[0])
      if (enemy) g.proposeOrEnact(n, enemy, 'peace')
    }
    return
  }
  if (n.stability < 45 || Math.random() > 0.012 * B.aggression * (0.5 + B.ambition)) return
  const prey = g.neighboursOf(n.id).map(id => g.nation(id)!).filter(o => {
    if (!o || n.allies.includes(o.id) || o.protectedUntil > g.tick || (n.truces[o.id] ?? 0) > g.tick) return false
    const theirSide = (o.idx.power ?? 0) + o.allies.reduce((s, a) => s + (g.nation(a)?.idx.power ?? 0) * 0.5, 0)
    const dep = (g.flowBetween(n.id, o.id) + g.flowBetween(o.id, n.id)) / Math.max(0.01, n.gdp)
    return (n.idx.power ?? 0) > theirSide * 1.5 && dep < 0.1 && attitude(g, n, o) < -10
  })
  const target = pick(prey)
  if (target) safe(() => g.declareWar(n, target))
}


/**
 * Real-world data gives tax revenue excluding many levies, and spending including everything, so a
 * freshly seeded country can start with an implausible hole in its budget. Close it the way real
 * governments are financed: broaden consumption and income taxes first, then trim spending, until the
 * deficit is about 2.5% of GDP.
 */
export function balanceAIBudget(n: Nation) {
  const gdp = Math.max(0.001, n.gdp), L = n.ledger
  const rev = Object.values(L.revenue).reduce((a, x) => a + x, 0)
  const spend = Object.values(L.spending).reduce((a, x) => a + x, 0) - (L.spending.interest ?? 0)
  let need = spend - rev - gdp * 0.025
  if (need <= 0) return
  const P = n.policy
  const yV = (L.revenue.vat ?? 0) / Math.max(1, +P.vat) || gdp * 0.0035
  const dv = clamp((need * 0.45) / yV, 0, 20 - +P.vat)
  P.vat = Math.round(+P.vat + dv); need -= dv * yV
  const yI = (L.revenue.income ?? 0) / Math.max(1, +P.incomeTax) || gdp * 0.002
  const di = clamp((need * 0.5) / yI, 0, 48 - +P.incomeTax)
  P.incomeTax = Math.round(+P.incomeTax + di); need -= di * yI
  if (need <= 0) return
  const lines = ['health', 'education', 'welfare', 'infrastructure', 'rnd', 'defense', 'culture', 'sports', 'environment', 'subsidies', 'admin', 'security', 'diplomacy']
  const disc = lines.reduce((a, k) => a + gdp * (n.budget[k] ?? 0) / 100, 0)
  const f = Math.max(0.65, 1 - need / Math.max(0.001, disc))
  for (const k of lines) n.budget[k] = Math.round((n.budget[k] ?? 0) * f * 100) / 100
}
