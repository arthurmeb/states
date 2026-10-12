import { SECTORS, NS, SECTOR_INDEX as S } from '../../shared/sectors'
import { PROJECT_MAP } from '../../shared/projects'
import { DEMOCRATIC } from '../../shared/rules'
import type { Game } from './world'
import type { Nation } from './model'
import { M } from './mods'

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const approach = (v: number, t: number, r: number) => v + (t - v) * Math.min(1, r)

/** Aggregate provinces into national totals. */
export function aggregate(g: Game, n: Nation) {
  let gdp = 0, pop = 0, count = 0, hc = 0, health = 0, infra = 0, poll = 0, jobsTot = 0, unemp = 0
  const out = new Array(NS).fill(0), jobs = new Array(NS).fill(0)
  const nat: Record<string, number> = {}
  for (const pid of g.owned(n.id)) {
    const p = g.prov[pid]
    gdp += p.gdp; pop += p.pop; count++
    hc += p.edu * p.pop; health += p.health * p.pop; infra += p.infra * p.pop; poll += p.pollution * p.pop
    unemp += p.unemployment * p.pop
    for (let s = 0; s < NS; s++) { out[s] += p.output[s]; jobs[s] += p.jobs[s]; jobsTot += p.jobs[s] }
    for (const pr of p.projects) if (pr.done) for (const [k, v] of Object.entries(PROJECT_MAP[pr.id]?.national ?? {})) nat[k] = (nat[k] ?? 0) + v
  }
  n.gdp = gdp; n.pop = pop; n.provinces = count
  // real GDP at base prices (what statistical agencies call constant-price GDP)
  n.gdpReal = out.reduce((a, o, s) => a + (SECTORS[s].tradable ? o / Math.max(0.05, g.prices[s]) : o), 0)
  n.sectorOut = out; n.sectorJobs = jobs
  n.projectNational = nat
  if (pop > 0) {
    n.stocks.hc = hc / pop; n.stocks.health = health / pop; n.stocks.infra = infra / pop; n.stocks.pollution = poll / pop
    n.idx.unemploymentRaw = (unemp / pop) * 100
  }
}

/** One day of national finance, macroeconomics and slow-moving national capital. dt in months. */
export function nationDay(g: Game, n: Nation, dt: number) {
  const mods = n.mods, b = n.budget, P = n.policy
  const gdp = Math.max(0.001, n.gdp)
  const gdppc = g.gdppc(n)
  const wage = Math.pow(clamp(gdppc / 40000, 0.12, 2.5), 0.6)

  // ── revenue ──
  const eff = clamp(0.45 + n.stocks.inst / 200 + b.admin * 0.03 + M(mods, 'taxEff') - n.stocks.corruption / 300, 0.3, 1)
  let taxBase = 0, sezShare = 0
  for (const pid of g.owned(n.id)) {
    const p = g.prov[pid]
    const f = p.policy.autonomy === 'autonomous' ? 0.75 : p.policy.autonomy === 'direct' ? 1.03 : 1
    taxBase += p.gdp * f
    if (p.policy.sez === 'on') sezShare += p.gdp
  }
  sezShare /= gdp
  // labour share ≈ 60% of GDP (effective rate ≈ 60% of top rate), taxable profits ≈ 12%, consumption ≈ 60%
  const payroll = ({ minimal: 0.04, targeted: 0.08, generous: 0.13, ubi: 0.11 } as Record<string, number>)[String(P.welfareModel)] ?? 0.08
  const rev = {
    income: taxBase * 0.6 * (+P.incomeTax / 100) * 0.6 * eff,
    payroll: taxBase * 0.6 * payroll * eff,
    corporate: taxBase * 0.12 * (+P.corporateTax / 100) * eff * (1 - sezShare * 0.7),
    vat: taxBase * 0.6 * (+P.vat / 100) * eff * 0.75,
    tariffs: n.tariffRevenue,
    resources: (n.sectorOut[S.oil] + n.sectorOut[S.mining]) * clamp(0.25 + M(mods, 'stateShare'), 0, 0.9),
    stateEnterprise: gdp * ({ statecap: 0.015, planned: 0.04 } as Record<string, number>)[String(P.economicSystem)] || 0,
    aid: n.aidReceived,
  }
  // ── spending ──
  const sp: Record<string, number> = {}
  for (const [k, pct] of Object.entries(b)) sp[k] = gdp * pct / 100
  const debt = Math.max(0, -n.treasury)
  sp.interest = (debt * n.interest) / 100 / 12
  const revenue = Object.values(rev).reduce((a, x) => a + x, 0)
  const spending = Object.values(sp).reduce((a, x) => a + x, 0)
  const net = revenue - spending
  n.treasury += net * dt
  if (!isFinite(n.treasury)) n.treasury = -gdp * 12
  n.ledger = { revenue: rev, spending: sp, net }

  // ── military economics ──
  const upkeep = n.troops * 0.005 * wage
  const left = sp.defense - upkeep
  if (left < 0) n.reserve = Math.max(0, n.reserve - (n.reserve * 0.03 * Math.min(1, -left / (upkeep + 0.001))) * dt)
  else {
    const recruitCost = 0.02 * wage
    // the defence budget implies a force size; wars double it
    const desired = n.pop * 0.0025 * (1 + b.defense / 3) * Math.max(0.3, 1 + M(mods, 'manpower')) * (n.wars.length ? 2.2 : 1)
    const recruits = n.troops < desired ? Math.min(n.manpower * 0.3 * dt, (left * 0.3 * dt) / recruitCost, desired - n.troops) : 0
    n.manpower -= recruits; n.reserve += recruits
    const navyShare = clamp(0.2 + M(mods, 'navy') * 0.25 + (n.projectNational.navy ?? 0) * 0.02, 0.02, 0.6)
    const airShare = clamp(0.2 + M(mods, 'air') * 0.25 + (n.projectNational.air ?? 0) * 0.02, 0.02, 0.6)
    n.stocks.navy += left * navyShare * dt
    n.stocks.air += left * airShare * dt
  }
  n.stocks.navy *= Math.pow(0.994, dt); n.stocks.air *= Math.pow(0.993, dt)
  n.manpowerCap = n.pop * 0.008 * Math.max(0.2, 1 + M(mods, 'manpower'))
  n.manpower = clamp(n.manpower + n.pop * 0.00035 * Math.max(0.2, 1 + M(mods, 'manpower')) * dt, 0, Math.max(0, n.manpowerCap - n.troops))
  const aeroShare = n.sectorOut[S.aerospace] / gdp
  const off = n.stockOff
  n.stocks.milTech = clamp(approach(n.stocks.milTech, 100 * (1 - Math.exp(-(b.defense * 1.2 + aeroShare * 60 + n.stocks.tech / 25) / 6)) + off.milTech, 0.01 * dt), 0, 100)
  n.quality = clamp(0.5 + n.stocks.milTech / 100 * 0.7 + n.stocks.hc / 100 * 0.3 + M(mods, 'military') + aeroShare * 2, 0.3, 2.2)

  // ── macro ──
  const deficitPct = (net / gdp) * 100
  const cb = String(P.centralBank)
  const monet = deficitPct < 0 ? -deficitPct * ({ independent: 0.05, coordinated: 0.25, political: 0.8 } as Record<string, number>)[cb] : 0
  const oilImportShare = n.imports[S.oil] / gdp
  const tariffAvg = +P.tariff
  const uPct = n.unemployment * 100
  const inflT = 2 + M(mods, 'inflation') + monet + Math.max(0, g.prices[S.oil] - 1) * oilImportShare * 40 + tariffAvg * 0.02 + n.shortage * 8 +
    Math.max(0, 3.5 - uPct) * 0.8 + g.sanctionPressure(n.id) * 6
  n.inflation = clamp(approach(n.inflation, inflT, 0.1 * dt), -3, 300)
  const policyRate = cb === 'independent' ? Math.max(0.25, 2 + 1.3 * (n.inflation - 2)) : cb === 'coordinated' ? Math.max(0.5, 2 + 0.7 * (n.inflation - 2)) : 1.5
  const debtPct = (debt / (gdp * 12)) * 100
  const rating = clamp(19 - debtPct / 14 - Math.max(0, n.inflation - 8) / 2.5 + (n.stocks.inst - 50) / 8 + (n.stability - 50) / 12 - g.sanctionPressure(n.id) * 6 - (n.wars.length ? 1 : 0), 0, 19)
  n.idx.credit = rating
  n.interest = clamp(approach(n.interest, policyRate * 0.5 + 1 + Math.max(0, (debtPct - 60) / 20) + (19 - rating) * 0.35, 0.2 * dt), 0, 30)
  // sovereign default: creditors take a 60% haircut, the nation is shut out of markets
  if (debtPct > 220 && dt > 0) {
    n.treasury *= 0.4
    n.stability = clamp(n.stability - 15, 0, 100); n.legitimacy = clamp(n.legitimacy - 10, 0, 100)
    n.stockOff.inst = (n.stockOff.inst ?? 0) - 5
    g.pushNews('market', `💥 ${n.name} defaults on its sovereign debt. Creditors accept a 60% haircut; the currency collapses.`, [n.id])
    n.inflation += 15
  }
  const growth = n.idx.growth ?? 2
  const natU = clamp(n.baseU + M(mods, 'unemployment') / 100 + Math.max(0, n.inflation - 10) * 0.001 + Math.max(0, -growth) * 0.004, 0.025, 0.4)
  n.unemployment = approach(n.unemployment, natU, 0.1 * dt)

  // ── slow national capital ──
  const nat = n.projectNational
  const hiTech = (n.sectorOut[S.electronics] + n.sectorOut[S.pharma] + n.sectorOut[S.aerospace] + n.sectorOut[S.software]) / gdp
  const decay = Math.pow(0.997, dt)
  for (const k of Object.keys(off)) off[k] *= decay
  const tgt: Record<string, number> = {
    tech: 100 * (1 - Math.exp(-(b.rnd * 1.3 + n.stocks.hc / 35 + hiTech * 6 + (nat.tech ?? 0) + M(mods, 'innovation') / 10 + (n.idx.fdi ?? 40) / 50) / 5)),
    inst: 25 + b.admin * 5 + M(mods, 'institutions') + (100 - n.stocks.corruption) * 0.25 + (DEMOCRATIC.has(String(P.government)) ? 8 : 0),
    corruption: 55 + M(mods, 'corruption') - b.admin * 3 - n.stocks.inst * 0.25,
    cohesion: 65 + M(mods, 'cohesion') - ((n.idx.gini ?? 35) - 35) * 0.6 - g.nonCoreShare(n) * 40 - uPct * 0.4,
    culture: 8 + b.culture * 25 + (n.sectorOut[S.media] / gdp) * 600 + M(mods, 'culture') + (nat.culture ?? 0),
    sports: 8 + b.sports * 30 + M(mods, 'sports') + (nat.sports ?? 0) + g.gamesBonus(n.id),
    brand: 8 + hiTech * 120 + (n.sectorOut[S.finance] / gdp) * 150 + M(mods, 'brand') + (nat.brand ?? 0) + n.stocks.inst * 0.15,
    diplomacy: 8 + b.diplomacy * 20 + n.allies.length * 3 + n.pacts.length * 1.5 + M(mods, 'diplomacy') + (g.isBlocLeader(n.id) ? 8 : 0),
    renewables: n.baseRenewables + M(mods, 'renewables') + b.environment * 4 + (nat.renewables ?? 0),
    fertility: 1.35 + 4.5 * Math.exp(-gdppc / 5000) + M(mods, 'fertility') - ((n.idx.genderEq ?? 60) - 60) * 0.006 - (n.stocks.hc - 50) * 0.006,
  }
  const rate: Record<string, number> = { tech: 0.006, inst: 0.006, corruption: 0.006, cohesion: 0.02, culture: 0.02, sports: 0.02, brand: 0.01, diplomacy: 0.02, renewables: 0.01, fertility: 0.003 }
  for (const [k, t] of Object.entries(tgt)) {
    const key = k as keyof typeof n.stocks
    const lim = k === 'fertility' ? [0.6, 8] : [0, 100]
    n.stocks[key] = clamp(approach(n.stocks[key], t + (off[k] ?? 0), rate[k] * dt), lim[0], lim[1])
  }
}

/** Offsets that make every policy-driven target equal today's real value at founding. */
export function calibrateNation(g: Game, n: Nation) {
  n.stockOff = {}
  const before = { ...n.stocks }
  // run a zero-length update to compute targets, by temporarily applying a full step on a copy
  const saveT = n.treasury, saveInfl = n.inflation, saveInt = n.interest, saveU = n.unemployment, saveRes = n.reserve, saveMp = n.manpower
  const keys = ['tech', 'inst', 'corruption', 'cohesion', 'culture', 'sports', 'brand', 'diplomacy', 'renewables', 'fertility', 'milTech'] as const
  for (const k of keys) n.stockOff[k] = 0
  // targets are approached at rate × dt; with dt huge the stock becomes the target
  nationDay(g, n, 1e6)
  for (const k of keys) n.stockOff[k] = before[k] - n.stocks[k]
  Object.assign(n.stocks, before)
  n.treasury = saveT; n.inflation = saveInfl; n.interest = saveInt; n.unemployment = saveU; n.reserve = saveRes; n.manpower = saveMp
}

export const sectorExportShare = (n: Nation) => {
  const ex = n.exports.reduce((a, x) => a + x, 0)
  return SECTORS.map((_, s) => (ex ? n.exports[s] / ex : 0))
}
