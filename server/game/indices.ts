import { SECTORS, NS, SECTOR_INDEX as S } from '../../shared/sectors'
import { DEMOCRATIC } from '../../shared/rules'
import type { Game } from './world'
import type { Nation } from './model'
import { M } from './mods'

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const relNorm = (vals: Map<number, number>, floor = 5) => {
  const mx = Math.max(1e-9, ...vals.values())
  const out = new Map<number, number>()
  for (const [k, v] of vals) out.set(k, floor + (100 - floor) * 0.92 * (v / mx))
  return out
}

/** Absolute indices that depend only on a nation's own state. */
export function nationIndices(g: Game, n: Nation) {
  const I = n.idx, mods = n.mods, st = n.stocks, b = n.budget, off = n.stockOff
  const gdp = Math.max(0.001, n.gdp)
  const gdppc = g.gdppc(n)
  I.gdp = gdp * 12
  I.gdppc = gdppc
  const hist = n.gdpMonthly
  const real = n.gdpReal || gdp
  if (hist.length >= 13) I.growth = ((real / hist[hist.length - 13]) - 1) * 100
  else if (hist.length >= 5) I.growth = (Math.pow(real / hist[0], 12 / (hist.length - 1)) - 1) * 100
  else I.growth = n.ref.growth ?? 2
  I.inflation = n.inflation
  I.unemployment = I.unemploymentRaw ?? n.unemployment * 100
  const debt = Math.max(0, -n.treasury)
  I.debt = (debt / (gdp * 12)) * 100
  I.deficit = (n.ledger.net / gdp) * 100
  I.revenue = (Object.values(n.ledger.revenue).reduce((a, x) => a + x, 0) / gdp) * 100
  const ex = n.exports.reduce((a, x) => a + x, 0), im = n.imports.reduce((a, x) => a + x, 0)
  I.exports = (ex / gdp) * 100
  I.tradeBalance = ((ex - im) / gdp) * 100
  // economic complexity: diversity × sophistication of tradable output
  let tradTot = 0
  for (let s = 0; s < NS; s++) if (SECTORS[s].tradable) tradTot += n.sectorOut[s]
  let soph = 0, ent = 0
  for (let s = 0; s < NS; s++) {
    if (!SECTORS[s].tradable || !tradTot) continue
    const sh = n.sectorOut[s] / tradTot
    soph += sh * (SECTORS[s].tier / 4) * (SECTORS[s].group === 'primary' ? 0.2 : 1)
    if (sh > 0) ent -= sh * Math.log(sh)
  }
  I.complexity = clamp((soph * 0.7 + (ent / Math.log(13)) * 0.3) * 130, 0, 100)
  I.bizEase = clamp(55 + M(mods, 'bizEase') + (st.inst - 50) * 0.5 - st.corruption * 0.2 - (+n.policy.corporateTax - 22) * 0.3, 0, 100)
  const sanctioned = g.sanctionPressure(n.id)
  I.fdi = clamp(40 + M(mods, 'fdi') * 40 + (st.inst - 50) * 0.4 + (n.stability - 50) * 0.3 - (+n.policy.corporateTax - 22) * 0.8 + Math.log10(I.gdp + 1) * 4 + (I.growth ?? 0) * 2 - sanctioned * 60, 0, 100)
  const hiTech = (n.sectorOut[S.electronics] + n.sectorOut[S.pharma] + n.sectorOut[S.aerospace] + n.sectorOut[S.software]) / gdp
  I.innovation = clamp(st.tech * 0.6 + st.hc * 0.25 + hiTech * 150 + M(mods, 'innovation') * 0.5, 0, 100)
  I.interest = n.interest
  const agriNet = (n.exports[S.agriculture] - n.imports[S.agriculture]) / Math.max(0.01, gdp * 0.05)
  I.foodSecurity = clamp(55 + clamp(agriNet, -1, 1) * 20 + Math.min(30, gdppc / 2500) - n.shortage * 60, 0, 100)
  const oilNet = (n.exports[S.oil] - n.imports[S.oil]) / gdp
  I.energySecurity = clamp(45 + oilNet * 250 + st.renewables * 0.4 + (n.projectNational.energy ?? 0), 0, 100)
  // development
  I.lifeExp = clamp(42 + st.health * 0.28 + Math.log(gdppc) * 2.2 - st.pollution * 0.05 + (I.safety ?? 50) * 0.03 + M(mods, 'lifeExp') + (off.lifeExp ?? 0), 35, 95)
  I.education = st.hc
  I.health = st.health
  I.infrastructure = st.infra
  I.internet = clamp(st.infra * 0.7 + Math.log10(gdppc) * 8 - 10 + (off.internet ?? 0), 0, 100)
  I.urban = g.urbanShare(n) * 100
  const LEI = clamp((I.lifeExp - 20) / 65, 0, 1), EI = clamp(st.hc / 100, 0, 1)
  const II = clamp((Math.log(gdppc * 0.95) - Math.log(100)) / (Math.log(75000) - Math.log(100)), 0, 1)
  I.hdi = Math.cbrt(LEI * EI * II)
  I.gini = clamp(36 + M(mods, 'gini') - (b.welfare - 6) * 0.8 - (b.education - 4.5) * 0.5 + (off.gini ?? 0), 20, 70)
  I.poverty = clamp(85 * Math.exp(-gdppc / 2500) * (I.gini / 36) + M(mods, 'poverty') * 0.3 + (off.poverty ?? 0), 0, 90)
  // society
  const pw = g.provWeighted(n.id)
  I.happiness = pw.happiness
  I.safety = pw.safety
  I.housing = pw.housing
  I.homicide = clamp((n.ref.homicide ?? 5) * Math.exp(((n.ref.safety ?? I.safety) - I.safety) / 12), 0.1, 80)
  I.genderEq = clamp(62 + M(mods, 'genderEq') + (off.genderEq ?? 0), 0, 100)
  I.mobility = clamp(40 + st.hc * 0.3 + M(mods, 'mobility') - (I.gini - 35) * 0.8 + b.education * 1.5, 0, 100)
  I.cohesion = st.cohesion
  I.fertility = st.fertility
  I.migration = clamp(50 + (gdppc - g.worldGdppc) / 1200 + (I.happiness - 5.5) * 8 + M(mods, 'migration') * 0.5 + (I.safety - 50) * 0.2 - n.wars.length * 10, 0, 100)
  // governance
  I.freedom = clamp(50 + M(mods, 'freedom') * 1.4 + M(mods, 'democracy') * 0.5 - M(mods, 'surveillance') * 0.3 + (off.freedom ?? 0), 0, 100)
  I.press = clamp(50 + M(mods, 'press') * 1.3 + (I.freedom - 50) * 0.2 + (off.press ?? 0), 0, 100)
  I.democracy = clamp(1 + M(mods, 'democracy') * 0.1 + I.freedom * 0.035 + I.press * 0.012 + st.inst * 0.012 + (DEMOCRATIC.has(String(n.policy.government)) ? 0.5 : 0) + (off.democracy ?? 0), 0, 10)
  I.cpi = 100 - st.corruption
  I.ruleOfLaw = clamp(st.inst * 0.7 + I.cpi * 0.3, 0, 100)
  I.govEffect = clamp(st.inst * 0.6 + b.admin * 6 + st.hc * 0.15, 0, 100)
  I.stability = n.stability
  I.fragility = clamp(120 - (n.stability * 0.35 + st.inst * 0.3 + Math.min(25, gdppc / 2000) + st.cohesion * 0.2 + (100 - g.meanUnrest(n.id)) * 0.15), 0, 120)
  // environment
  I.renewables = st.renewables
  I.airQuality = 100 - st.pollution
  const co2base = n.ref.co2 ?? 4, gdpBase = n.ref.gdppc ?? gdppc, renBase = n.ref.renewables ?? 20
  I.co2 = clamp(co2base * Math.pow(gdppc / gdpBase, 0.8) * (1 - st.renewables / 100) / Math.max(0.05, 1 - renBase / 100) * (1 + M(mods, 'pollution') / 200), 0.05, 60)
  I.epi = clamp(100 - st.pollution * 0.6 + st.renewables * 0.25 + b.environment * 5 - I.co2 * 0.6 + 10, 0, 100)
  // hard power basics
  I.troops = n.troops
  I.milSpend = b.defense
  I.power = n.troops * n.quality + n.stocks.navy * 0.3 + n.stocks.air * 0.4 + I.gdp * 0.01
}

/** Indices measured relative to the rest of the world (soft power, military rankings, CNP). */
export function relativeIndices(g: Game) {
  const ns = [...g.nations.values()].filter(n => n.alive)
  if (!ns.length) return
  const raw: Record<string, Map<number, number>> = {}
  const put = (k: string, id: number, v: number) => (raw[k] ??= new Map()).set(id, Math.max(0, v))
  for (const n of ns) {
    const gdp = Math.max(0.001, n.gdp), I = n.idx, st = n.stocks, b = n.budget, nat = n.projectNational, mods = n.mods
    const media = n.sectorOut[S.media] * 12, tourism = n.sectorOut[S.tourism] * 12
    put('spCulture', n.id, Math.sqrt(media + 0.3 * tourism + 1) * (1 + b.culture * 0.8) * (0.6 + st.culture / 60) * (String(n.policy.press) === 'free' ? 1.15 : 0.9) + Math.pow(n.pop / 1000, 0.25) * 0.3)
    put('spSports', n.id, Math.pow(n.pop / 1000 + 1, 0.3) * Math.pow(g.gdppc(n) / 10000 + 0.2, 0.3) * (0.5 + st.sports / 40) * (st.health / 60))
    put('spEducation', n.id, Math.pow(st.hc / 100, 1.5) * (1 + M(mods, 'students') / 30 + (nat.students ?? 0) / 20) * (1 + b.rnd * 0.3) * Math.pow(I.gdp / 1000 + 0.1, 0.25))
    put('spTourism', n.id, Math.pow(tourism + 0.5, 0.6) * ((I.safety ?? 50) / 50) * (1 + (M(mods, 'tourism') + (nat.tourism ?? 0)) / 40))
    put('spBusiness', n.id, Math.sqrt((n.exports[S.finance] + n.exports[S.software] + n.exports[S.electronics] + n.exports[S.pharma] + n.exports[S.auto] + n.exports[S.aerospace]) * 12 + 1) * (st.inst / 50) * (0.6 + st.brand / 60))
    put('spDiplomacy', n.id, Math.sqrt(gdp * b.diplomacy / 100 * 12 + 0.1) + n.allies.length * 0.8 + n.pacts.length * 0.4 + n.aidTargets.length * 0.5 + (g.isBlocLeader(n.id) ? 3 : 0) + st.diplomacy / 20)
    put('military', n.id, n.troops * n.quality + st.navy * 0.3 + st.air * 0.4)
    put('navy', n.id, st.navy)
    put('air', n.id, st.air)
    put('econ', n.id, I.gdp)
  }
  for (const k of ['spCulture', 'spSports', 'spEducation', 'spTourism', 'spBusiness', 'spDiplomacy', 'military', 'navy', 'air']) {
    const norm = relNorm(raw[k])
    for (const n of ns) n.idx[k] = norm.get(n.id) ?? 0
  }
  const econ = relNorm(raw.econ, 0)
  for (const n of ns) {
    const I = n.idx
    I.spGovernance = clamp(0.4 * I.freedom + 0.3 * I.ruleOfLaw + 0.3 * I.cpi + M(n.mods, 'values') / 2, 0, 100)
    I.softPower = 0.2 * I.spCulture + 0.15 * I.spBusiness + 0.15 * I.spGovernance + 0.12 * I.spEducation + 0.15 * I.spDiplomacy + 0.1 * I.spTourism + 0.08 * I.spSports + 0.05 * (econ.get(n.id) ?? 0)
    I.competitiveness = (
      (n.stocks.inst + I.cpi + I.ruleOfLaw) / 3 + n.stocks.infra + I.internet + clamp(100 - Math.abs(I.inflation - 2) * 4 - Math.max(0, I.debt - 60) * 0.3, 0, 100) +
      n.stocks.health + n.stocks.hc + I.bizEase + clamp(100 - I.unemployment * 4, 0, 100) + clamp((n.sectorOut[S.finance] / Math.max(0.001, n.gdp)) * 400 + n.stocks.inst * 0.4 + (I.credit ?? 10) * 2, 0, 100) +
      clamp(20 * Math.log10(I.gdp + 1), 0, 100) + (I.bizEase + I.fdi) / 2 + I.innovation) / 12
    const resilience = (I.stability + I.foodSecurity + I.energySecurity) / 3
    I.cnp = clamp(0.3 * (econ.get(n.id) ?? 0) + 0.25 * I.military + 0.15 * (I.influence ?? 0) + 0.1 * I.softPower + 0.1 * n.stocks.tech + 0.1 * resilience, 0, 100)
  }
}
