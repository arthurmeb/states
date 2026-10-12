import { SECTORS, NS, BASE_VA, SECTOR_INDEX, type SectorReq } from '../../shared/sectors'
import { PROJECT_MAP } from '../../shared/projects'
import { TERRAIN } from '../../shared/rules'
import type { Mods } from '../../shared/policies'
import type { ProvinceStatic } from '../../shared/types'
import type { Game } from './world'
import type { Nation, Prov } from './model'
import { M } from './mods'
import type { Baseline } from './data'

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const approach = (v: number, t: number, r: number) => v + (t - v) * Math.min(1, r)
export const OFF = { infra: 0, edu: 1, health: 2, safety: 3, housing: 4, pollution: 5, happy: 6 } as const
export const NOFF = 7
const DOMESTIC = new Set(['energy', 'construction', 'retail'])
const S = SECTOR_INDEX

/** The policy context a province lives under: its nation, or the real-world baseline if stateless. */
export interface Ctx {
  nation: Nation | null
  gdppc: number; tech: number; inst: number; corruption: number; freedom: number
  mods: Mods
  /** % of GDP spent on each local service */
  spend: { infra: number; edu: number; health: number; security: number; env: number }
  /** per-province spending multiplier normaliser (Σ pop×priority / Σ pop) */
  prioNorm: number
  subsidies: Set<number>
  subsidyPct: number
  fertility: number
  migration: number
  natU: number
  energyPollution: number
  inflation: number
}

export function statelessCtx(b: Baseline): Ctx {
  return {
    nation: null, gdppc: b.gdppc, tech: b.tech, inst: b.inst, corruption: b.corruption, freedom: b.voice, mods: {},
    spend: { infra: 2.5, edu: b.eduSpend, health: b.healthSpend * 0.6, security: 1.3, env: 0.3 }, prioNorm: 1,
    subsidies: new Set(), subsidyPct: 0, fertility: b.fertility, migration: 0, natU: b.unemployment, energyPollution: 1, inflation: b.inflation,
  }
}

export function nationCtx(g: Game, n: Nation): Ctx {
  const b = n.budget
  let wsum = 0, psum = 0
  for (const pid of g.owned(n.id)) { const p = g.prov[pid]; wsum += p.pop * prioMult(p); psum += p.pop }
  return {
    nation: n, gdppc: g.gdppc(n), tech: n.stocks.tech, inst: n.stocks.inst, corruption: n.stocks.corruption, freedom: n.idx.freedom ?? 50, mods: n.mods,
    spend: { infra: b.infrastructure, edu: b.education, health: b.health, security: b.security, env: b.environment },
    prioNorm: psum ? wsum / psum : 1,
    subsidies: new Set(n.subsidies.map(s => S[s])), subsidyPct: b.subsidies, fertility: n.stocks.fertility ?? 2,
    migration: n.idx.migration ?? 50, natU: n.unemployment, inflation: n.inflation,
    energyPollution: { fossil: 1.4, mixed: 1, nuclear: 0.55, renewable: 0.5 }[String(n.policy.energyMix)] ?? 1,
  }
}

const prioMult = (p: Prov) => (p.policy.priority === 'high' ? 2 : p.policy.priority === 'low' ? 0.5 : 1)

/** Static suitability of a province for each sector (0 = impossible). */
export function staticFit(P: ProvinceStatic, s: number): number {
  const id = SECTORS[s].id
  switch (id) {
    case 'agriculture': return Math.max(0.04, TERRAIN[P.terrain].food * (0.6 + 0.35 * P.fertility))
    case 'mining': return P.metals ? 0.6 + 0.6 * P.metals : 0
    case 'oil': return P.oil ? 0.6 + 0.6 * P.oil : 0
    case 'tourism': return 0.2 + 0.45 * P.attraction
    case 'logistics': return P.coastal ? 0.8 + (P.strait ? 1 : 0) : 0.25
    case 'heavy': return 1 + 0.3 * P.metals + 0.2 * P.oil
    default: return 1
  }
}
export function resMult(P: ProvinceStatic, s: number): number {
  const id = SECTORS[s].id
  if (id === 'oil') return P.oil || 0.3
  if (id === 'mining') return P.metals || 0.3
  if (id === 'agriculture') return Math.max(0.15, TERRAIN[P.terrain].food * (0.7 + 0.3 * P.fertility))
  if (id === 'tourism') return 0.6 + 0.25 * P.attraction
  return 1
}

/** Smooth gate: 0 below 80% of each requirement, 1 above 105%. */
export function unlockFactor(req: SectorReq, v: { gdppc: number; hc: number; tech: number; infra: number; inst: number }) {
  let f = 1
  for (const [k, need] of Object.entries(req) as [keyof SectorReq, number][]) {
    if (!need) continue
    f *= clamp((v[k] - need * 0.8) / (need * 0.25), 0, 1)
  }
  return f
}

function productivityR(p: Prov, ctx: Ctx, tick: number) {
  return Math.pow(0.35 + p.edu / 100, 0.9) * Math.pow(0.35 + p.infra / 100, 0.6) * Math.pow(0.45 + ctx.tech / 100, 0.7) *
    Math.pow(0.45 + ctx.inst / 100, 0.5) * (1 + M(ctx.mods, 'productivity')) * (1 - p.unrest / 300) *
    (p.occupiedUntil > tick ? 0.6 : 1) * (p.policy.security === 'martial' ? 0.85 : 1)
}

function projectBoost(p: Prov): number[] {
  const boost = new Array(NS).fill(0)
  for (const pr of p.projects) {
    if (!pr.done) continue
    const def = PROJECT_MAP[pr.id]
    for (const [s, v] of Object.entries(def?.sectors ?? {})) boost[S[s as keyof typeof S]] += v!
  }
  return boost
}
function projectLocal(p: Prov) {
  const o = { infra: 0, edu: 0, health: 0, housing: 0, safety: 0, pollution: 0 }
  for (const pr of p.projects) {
    if (!pr.done) continue
    const l = PROJECT_MAP[pr.id]?.local
    if (l) for (const k of Object.keys(o) as (keyof typeof o)[]) o[k] += l[k] ?? 0
  }
  return o
}

const FOCUS: Record<string, string[]> = {
  agriculture: ['agriculture'], industry: ['light', 'heavy', 'auto', 'electronics', 'pharma', 'aerospace'],
  services: ['finance', 'software', 'media', 'logistics', 'retail'], tourism: ['tourism'], resources: ['mining', 'oil'],
}

/** Target employment shares for a province (sum = 1). */
export function targetShares(g: Game, pid: number, ctx: Ctx, gdppcLocal: number): number[] {
  const P = g.P[pid], p = g.prov[pid]
  const v = { gdppc: ctx.gdppc, hc: p.edu, tech: ctx.tech, infra: p.infra, inst: ctx.inst }
  const boost = projectBoost(p)
  // real (price-deflated) development; when traded goods get cheap, services become relatively attractive
  const avgP = g.avgTradablePrice || 1
  const dev = clamp(gdppcLocal / avgP / 40000, 0, 1.3)
  const relP = 1 / avgP
  // non-tradable services: development-driven share × calibrated local bias
  const domestic = {
    energy: 0.02 * g.bias[pid * NS + S.energy] * relP,
    construction: (0.045 + ctx.spend.infra * 0.004) * g.bias[pid * NS + S.construction] * relP,
    retail: (0.1 + 0.16 * dev) * g.bias[pid * NS + S.retail] * relP,
  }
  let domSum = domestic.energy + domestic.construction + domestic.retail
  if (domSum > 0.92) { const k = 0.92 / domSum; domestic.energy *= k; domestic.construction *= k; domestic.retail *= k; domSum = 0.92 }
  const a = new Array(NS).fill(0)
  let sum = 0
  for (let s = 0; s < NS; s++) {
    const def = SECTORS[s]
    if (DOMESTIC.has(def.id)) continue
    let x = g.fit[pid * NS + s] * g.bias[pid * NS + s] * unlockFactor(def.req, v)
    if (!x) continue
    const price = def.tradable ? g.prices[s] : 1
    x *= Math.pow(def.va * resMult(P, s), 0.8) * Math.pow(price / avgP, 1.6)
    if (def.id === 'light') x *= clamp(Math.sqrt(15000 / gdppcLocal), 0.3, 2.5)
    if (def.id === 'agriculture') x *= clamp(Math.sqrt(8000 / gdppcLocal), 0.15, 3)
    if (!['agriculture', 'mining', 'oil', 'tourism', 'logistics'].includes(def.id)) x *= 0.3 + p.urban
    if (def.id === 'tourism') x *= (0.5 + (ctx.nation?.idx.softPower ?? 30) / 80) * (p.safety / 60) * (1 + M(ctx.mods, 'tourism') / 40)
    if (ctx.subsidies.has(s)) x *= 1 + ctx.subsidyPct * 0.25
    x *= Math.max(0.05, 1 + M(ctx.mods, 'sector:' + def.id)) * (1 + boost[s])
    if (FOCUS[p.policy.focus]?.includes(def.id)) x *= p.policy.focus === 'tourism' ? 1.5 : 1.35
    if (p.policy.sez === 'on' && def.tradable && def.group !== 'primary') x *= 1.3
    if (p.policy.environment === 'protected' && ['mining', 'oil', 'heavy'].includes(def.id)) x *= 0.5
    if (p.policy.environment === 'protected' && def.id === 'tourism') x *= 1.2
    a[s] = x; sum += x
  }
  const out = new Array(NS).fill(0)
  for (let s = 0; s < NS; s++) {
    const id = SECTORS[s].id as keyof typeof domestic
    out[s] = DOMESTIC.has(id) ? domestic[id] : sum ? (a[s] / sum) * (1 - domSum) : 0
  }
  return out
}

// ───────── world initialisation: calibrate every province to its real country ─────────
export function initProvinces(g: Game) {
  const P = g.P
  // national value-added structure per country
  const vaShares = (b: Baseline) => {
    const sh = b.shares
    const v: Record<string, number> = {}
    v.agriculture = Math.max(0.005, sh.agri)
    v.oil = sh.oilRents; v.mining = sh.mineralRents
    const manuf = Math.max(0.02, sh.manuf)
    const ht = clamp(sh.hightech, 0, 0.7)
    v.electronics = manuf * ht * 0.55
    v.pharma = b.gdppc > 18000 ? manuf * ht * 0.25 : 0
    v.aerospace = b.gdppc > 25000 ? manuf * 0.05 : 0
    v.auto = manuf * 0.25 * clamp((b.gdppc - 6000) / 20000, 0, 1)
    v.heavy = manuf * 0.25 + Math.max(0, sh.industry - manuf - sh.oilRents - sh.mineralRents - 0.085) * 0.5
    v.light = Math.max(manuf * 0.08, manuf - v.electronics - v.pharma - v.aerospace - v.auto - manuf * 0.25)
    v.energy = 0.025; v.construction = 0.06
    const serv = Math.max(0.2, sh.services)
    v.tourism = Math.max(0.008, sh.tourismGdp)
    v.finance = serv * 0.1 * clamp(b.gdppc / 30000, 0.15, 1.3)
    v.software = serv * 0.06 * clamp(b.internet / 80, 0.1, 1.2) * clamp(b.hc / 60, 0.3, 1.3)
    v.media = serv * 0.035 * clamp(b.gdppc / 20000, 0.2, 1.2)
    v.logistics = serv * 0.07
    v.retail = Math.max(0.05, serv - v.tourism - v.finance - v.software - v.media - v.logistics)
    const tot = Object.values(v).reduce((a, x) => a + x, 0)
    return SECTORS.map(s => (v[s.id] ?? 0) / tot)
  }
  // average fit per country (pop-weighted) so the national structure is spread by local suitability
  const avgFit: Record<string, number[]> = {}
  const wsum: Record<string, number> = {}
  for (const pr of P) {
    const af = (avgFit[pr.iso3] ??= new Array(NS).fill(0))
    for (let s = 0; s < NS; s++) af[s] += g.fit[pr.id * NS + s] * resMult(pr, s) * (pr.pop + 1)
    wsum[pr.iso3] = (wsum[pr.iso3] ?? 0) + pr.pop + 1
  }
  const cache: Record<string, number[]> = {}
  for (const pr of P) {
    const b = g.base(pr.iso3)
    const p = g.prov[pr.id]
    const nat = (cache[pr.iso3] ??= vaShares(b))
    const af = avgFit[pr.iso3], w = wsum[pr.iso3]
    // VA share in this province, then jobs = VA / (va × resource)
    const jobsShare = new Array(NS).fill(0)
    let jt = 0
    for (let s = 0; s < NS; s++) {
      const f = g.fit[pr.id * NS + s] * resMult(pr, s)
      const avg = af[s] / w
      const urbanTilt = ['agriculture', 'mining', 'oil', 'tourism', 'logistics'].includes(SECTORS[s].id) ? 1 : 0.4 + p.urban
      const va = avg > 0 ? nat[s] * (f / avg) * urbanTilt : 0
      // farm jobs: poor land lowers output per worker, but not below 60% (avoids millions of desert farmers)
      jobsShare[s] = va / (SECTORS[s].va * (s === S.agriculture ? Math.max(0.6, resMult(pr, s)) : resMult(pr, s)))
      jt += jobsShare[s]
    }
    const E = p.pop * p.lfp * (1 - p.unemployment)
    p.jobs = jobsShare.map(x => (jt ? (x / jt) * E : 0))
    // calibrate tfp so provincial GDP per capita matches the real country (tilted by urbanisation)
    const ctx = g.ctxFor(pr.id)
    const R = productivityR(p, ctx, 0)
    let out0 = 0
    for (let s = 0; s < NS; s++) out0 += p.jobs[s] * BASE_VA * SECTORS[s].va * resMult(pr, s) * R
    const tilt = clamp(1 + 0.8 * (p.urban - b.urban), 0.45, 2)
    const target = (b.gdppc * tilt * p.pop) / 12 / 1e6
    p.tfp = out0 > 0 ? target / out0 : 1
    // sector bias: model targets reproduce today's real structure, then drift with policy
    const gdppcLocal = b.gdppc * tilt
    g.bias.fill(1, pr.id * NS, pr.id * NS + NS)
    const t = targetShares(g, pr.id, ctx, gdppcLocal)
    const jTot = p.jobs.reduce((a, x) => a + x, 0) || 1
    // domestic sectors: bias = real share / formula share
    for (let s = 0; s < NS; s++) {
      if (!DOMESTIC.has(SECTORS[s].id)) continue
      g.bias[pr.id * NS + s] = t[s] > 0 ? clamp(p.jobs[s] / jTot / t[s], 0.1, 6) : 1
    }
    const t2 = targetShares(g, pr.id, ctx, gdppcLocal)
    const nonDom = t2.reduce((a, x, s) => a + (DOMESTIC.has(SECTORS[s].id) ? 0 : x), 0)
    const jNonDom = p.jobs.reduce((a, x, s) => a + (DOMESTIC.has(SECTORS[s].id) ? 0 : x), 0)
    for (let s = 0; s < NS; s++) {
      if (DOMESTIC.has(SECTORS[s].id)) continue
      const want = jNonDom ? p.jobs[s] / jNonDom : 0
      const have = nonDom ? t2[s] / nonDom : 0
      g.bias[pr.id * NS + s] = have > 0 ? clamp(want / have, 0.05, 20) : 1
    }
    p.output = new Array(NS).fill(0)
    provinceEconomy(g, pr.id, ctx, 0)
    // stock offsets so targets equal today's real values
    const tg = localTargets(g, pr.id, ctx)
    const off = pr.id * NOFF
    g.off[off + OFF.infra] = p.infra - tg.infra; g.off[off + OFF.edu] = p.edu - tg.edu; g.off[off + OFF.health] = p.health - tg.health
    g.off[off + OFF.safety] = p.safety - tg.safety; g.off[off + OFF.housing] = 0; g.off[off + OFF.pollution] = p.pollution - tg.pollution
    g.off[off + OFF.happy] = 0
    g.off[off + OFF.happy] = happinessTarget(g, pr.id, ctx, b) - happinessRaw(g, pr.id, ctx)
  }
}

/** Real WHR-calibrated happiness for the province's country (Cantril 0-10). */
function happinessTarget(_g: Game, _pid: number, _ctx: Ctx, b: Baseline) {
  return clamp(1 + 0.95 * Math.log(b.gdppc / 1000) + (b.lifeExp - 70) * 0.06 + (b.voice - 50) * 0.01 - (b.corruption - 50) * 0.01, 2, 8)
}
function happinessRaw(g: Game, pid: number, ctx: Ctx) {
  const p = g.prov[pid]
  const gdppc = p.pop ? (p.gdp * 12e6) / p.pop : 1000
  return 1.1 + 0.62 * Math.log(Math.max(300, gdppc) / 1000) + (p.health - 60) * 0.02 + (p.safety - 60) * 0.012 + (p.housing - 55) * 0.01 -
    p.unemployment * 8 - p.pollution * 0.008 + (ctx.freedom - 50) * 0.012 - ctx.corruption * 0.006 + M(ctx.mods, 'happiness') * 0.1 -
    Math.max(0, ctx.inflation - 4) * 0.05
}

function localTargets(g: Game, pid: number, ctx: Ctx) {
  const p = g.prov[pid]
  const pr = prioMult(p) / ctx.prioNorm
  const lp = projectLocal(p)
  const r = (pct: number) => pct * pr
  let poll = 0
  const E = p.jobs.reduce((a, x) => a + x, 0) || 1
  for (let s = 0; s < NS; s++) poll += p.jobs[s] * SECTORS[s].pollution * SECTORS[s].va * (SECTORS[s].id === 'energy' ? ctx.energyPollution * 3 : 1)
  poll = (poll / E) * 70 * (1 + M(ctx.mods, 'pollution') / 100) * (p.policy.environment === 'protected' ? 0.6 : 1) * (0.3 + p.urban) - ctx.spend.env * 4
  return {
    infra: 100 * (1 - Math.exp(-r(ctx.spend.infra) / 2.5)) + lp.infra,
    edu: 100 * (1 - Math.exp(-r(ctx.spend.edu) / 3.5)) * (1 + M(ctx.mods, 'eduQuality') / 100) + lp.edu,
    health: 100 * (1 - Math.exp(-r(ctx.spend.health) / 4.5)) * (1 + M(ctx.mods, 'health') / 100) + lp.health,
    safety: 45 + ctx.spend.security * 8 + M(ctx.mods, 'safety') - p.unemployment * 50 - p.unrest / 4 + lp.safety + (p.policy.security === 'normal' ? 0 : 5),
    housing: 55 + M(ctx.mods, 'housing') + lp.housing - Math.max(0, p.pop / Math.max(1, g.P[pid].area) - 0.3) * 10,
    pollution: poll + lp.pollution,
  }
}

/** Daily provincial economy: employment, output, local services, people. dt in months. */
export function provinceEconomy(g: Game, pid: number, ctx: Ctx, dt: number) {
  const P = g.P[pid], p = g.prov[pid]
  const mods = ctx.mods
  const L = p.pop * clamp(p.lfp + M(mods, 'laborPart'), 0.2, 0.7)
  const gdppcLocal = p.pop ? Math.max(400, (p.gdp * 12e6) / p.pop) : ctx.gdppc
  // employment
  if (dt > 0) {
    const t = targetShares(g, pid, ctx, p.gdp ? gdppcLocal : ctx.gdppc)
    let mismatch = 0
    const E = L * (1 - p.unemployment)
    for (let s = 0; s < NS; s++) {
      const want = t[s] * E
      mismatch += Math.abs(want - p.jobs[s])
      const rate = 0.02 + (ctx.subsidies.has(s) ? 0.015 * ctx.subsidyPct : 0)
      p.jobs[s] = Math.max(0, p.jobs[s] + (want - p.jobs[s]) * rate * dt)
    }
    const uT = clamp(ctx.natU + Math.min(0.04, (mismatch / Math.max(1, E)) * 0.04) + p.unrest / 1500, 0.01, 0.45)
    p.unemployment = approach(p.unemployment, uT, 0.25 * dt)
    // rescale jobs to employment
    const jt = p.jobs.reduce((a, x) => a + x, 0)
    const E2 = L * (1 - p.unemployment)
    if (jt > 0) for (let s = 0; s < NS; s++) p.jobs[s] *= 1 + ((E2 / jt) - 1) * Math.min(1, 0.5 * dt * 30)
    // trend productivity growth + catch-up
    const conv = 1.6 * clamp(1 - ctx.gdppc / 60000, 0, 1) * clamp(ctx.inst / 60, 0.2, 1.2)
    p.tfp *= 1 + ((0.8 + conv + M(mods, 'growth') + M(mods, 'fdi') * 0.6) / 100 / 12) * dt
  }
  // output
  const R = productivityR(p, ctx, g.tick)
  const boost = projectBoost(p)
  const sell = ctx.nation ? g.sell.get(ctx.nation.id) : g.sell.get(0)
  let gdp = 0
  for (let s = 0; s < NS; s++) {
    const def = SECTORS[s]
    const price = def.tradable ? g.prices[s] : 1
    const st = def.tradable && sell ? sell[s] : 1
    const o = p.jobs[s] * BASE_VA * def.va * p.tfp * R * resMult(P, s) * (1 + 0.3 * boost[s]) * price * st
    p.output[s] = o
    gdp += o
  }
  p.gdp = gdp
  if (dt <= 0) return

  // local stocks
  const tg = localTargets(g, pid, ctx)
  const off = pid * NOFF
  const decay = Math.pow(0.996, dt)
  for (const k of ['infra', 'edu', 'health', 'safety', 'housing', 'pollution'] as const) g.off[off + OFF[k]] *= decay
  p.infra = clamp(approach(p.infra, tg.infra + g.off[off], 0.012 * dt), 1, 100)
  p.edu = clamp(approach(p.edu, tg.edu + g.off[off + 1], 0.008 * dt), 1, 100)
  p.health = clamp(approach(p.health, tg.health + g.off[off + 2], 0.015 * dt), 1, 100)
  p.safety = clamp(approach(p.safety, tg.safety + g.off[off + 3], 0.05 * dt), 1, 100)
  p.housing = clamp(approach(p.housing, tg.housing + g.off[off + 4], 0.03 * dt), 1, 100)
  p.pollution = clamp(approach(p.pollution, tg.pollution + g.off[off + 5], 0.03 * dt), 0, 100)
  p.happiness = clamp(approach(p.happiness, happinessRaw(g, pid, ctx) + g.off[off + OFF.happy], 0.1 * dt), 0.5, 9.5)

  // people: births, deaths, migration, urbanisation
  const n = ctx.nation
  const growth = n
    ? (ctx.fertility - 2.05) * 0.011 + 0.003 + ((ctx.migration - 50) / 50) * 0.004 - (p.occupiedUntil > g.tick ? 0.01 : 0)
    : g.base(P.iso3).popGrowth / 100
  p.pop = Math.max(1, p.pop * (1 + (growth * dt) / 12))
  const cityShare = clamp(P.cities.reduce((a, c) => a + g.cities[c].pop, 0) / Math.max(1, p.pop), 0, 1)
  p.urban = clamp(approach(p.urban, 0.12 + 0.8 * (1 - Math.exp(-gdppcLocal / 14000)) + cityShare * 0.25, 0.003 * dt), 0.03, 0.98)
}
