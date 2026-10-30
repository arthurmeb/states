import { BLOCS, type BlocId } from '../../shared/policies'
import { SECTOR_INDEX as S } from '../../shared/sectors'
import { DEMOCRATIC } from '../../shared/rules'
import type { Game } from './world'
import type { Nation } from './model'
import { M } from './mods'
import { drv, socialSpend } from './nation'

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const approach = (v: number, t: number, r: number) => v + (t - v) * Math.min(1, r)

/** Political weight of each faction from demographics, economy and the system of government. */
export function blocWeights(g: Game, n: Nation, electorate = false): Record<BlocId, number> {
  const gdp = Math.max(0.001, n.gdp)
  const urban = g.urbanShare(n)
  const ind = (n.sectorOut[S.light] + n.sectorOut[S.heavy] + n.sectorOut[S.auto] + n.sectorOut[S.mining]) / gdp
  const hc = n.stocks.hc / 100
  const relig = { theocratic: 1.6, state: 1.2, secular: 1, atheist: 0.5 }[String(n.policy.religion)] ?? 1
  const w: Record<BlocId, number> = {
    workers: 0.12 + ind * 0.8,
    business: 0.06 + Math.min(0.12, g.gdppc(n) / 400000),
    middle: 0.06 + 0.3 * urban * hc,
    rural: 0.04 + 0.35 * (1 - urban),
    religious: (0.05 + 0.25 * (1 - hc)) * relig,
    progressives: 0.03 + 0.2 * hc * urban,
    military: 0.04 + n.budget.defense * 0.01,
    minorities: 0.02 + g.nonCoreShare(n) * 0.6,
  }
  const gov = electorate ? 'democracy' : String(n.policy.government)
  const tilt: Partial<Record<BlocId, number>> =
    gov === 'junta' ? { military: 4, business: 1.3, progressives: 0.4 }
      : gov === 'oneparty' ? { military: 2, business: 1.4, workers: 1.2, progressives: 0.4, minorities: 0.6 }
        : gov === 'theocracy' ? { religious: 3.5, military: 1.5, progressives: 0.3 }
          : gov === 'technocracy' ? { business: 1.5, middle: 1.3, religious: 0.7 }
            : {}
  for (const [k, f] of Object.entries(tilt)) w[k as BlocId] *= f!
  const sum = Object.values(w).reduce((a, x) => a + x, 0)
  for (const k of Object.keys(w) as BlocId[]) w[k] /= sum
  return w
}

export function politicsDay(g: Game, n: Nation, dt: number) {
  const mods = n.mods, idx = n.idx
  n.blocWeights = blocWeights(g, n)
  const growth = idx.growth ?? 2, infl = n.inflation, u = n.unemployment * 100
  const ww = n.warWeariness
  const out: Record<BlocId, number> = {
    workers: -2 * (u - 5) - (infl - 3) * 0.8 + growth * 1.2 - ((idx.gini ?? 35) - 35) * 0.3 + socialSpend(n) * 0.6 - ((n.fin?.crisis ?? 0) > 0 ? 8 : 0),
    business: growth * 2 - Math.max(0, infl - 3) * 0.5 + (n.stocks.inst - 50) * 0.2 - g.sanctionPressure(n.id) * 30 + ((idx.credit ?? 12) - 12) * 0.8,
    middle: growth * 1.5 - (infl - 3) * 1 + ((idx.safety ?? 50) - 50) * 0.2 - n.stocks.corruption * 0.15 + 5,
    rural: (g.prices[S.agriculture] - 1) * 20 + n.budget.subsidies * 1.5 - u * 0.3,
    religious: (n.stocks.cohesion - 60) * 0.2,
    progressives: ((idx.freedom ?? 50) - 50) * 0.25 + (40 - n.stocks.pollution) * 0.15 + (n.stocks.hc - 50) * 0.1,
    military: (n.budget.defense - 2) * 6 + (n.wars.length ? 3 : 0) + (n.quality - 1) * 10,
    minorities: (n.stocks.cohesion - 60) * 0.3,
  }
  const shortage = M(mods, 'shortage') * 40
  for (const b of BLOCS) {
    const t = clamp(50 + M(mods, 'bloc:' + b.id) + out[b.id] - ww * 0.3 + (n.legitimacy - 50) * 0.15 - shortage * (b.id === 'middle' || b.id === 'workers' ? 1 : 0.5), 0, 100)
    n.blocs[b.id] = approach(n.blocs[b.id], t, 0.12 * dt * 3)
    n.drivers['bloc:' + b.id] = drv([['Baseline', 50], ['Policies', M(mods, 'bloc:' + b.id)], ['Conditions they care about', out[b.id]], ['War weariness', -ww * 0.3], ['Regime legitimacy', (n.legitimacy - 50) * 0.15], ['Shortages', -shortage * (b.id === 'middle' || b.id === 'workers' ? 1 : 0.5)]], 0.2)
  }
  let approval = 0
  for (const b of BLOCS) approval += n.blocs[b.id] * n.blocWeights[b.id]
  idx.approval = approval
  const meanUnrest = g.meanUnrest(n.id)
  const repression = (M(mods, 'surveillance') + (String(n.policy.press) === 'state' ? 10 : 0)) * 0.08
  const debtCrisis = (idx.credit ?? 12) < 5 ? (5 - (idx.credit ?? 12)) * 3 : 0
  const youth = Math.max(0, (n.demo?.young ?? 0.25) - 0.28) * Math.max(0, u - 8) * 2
  const stab: [string, number][] = [['Approval', 0.6 * approval], ['Legitimacy', 0.35 * n.legitimacy], ['Policies', M(mods, 'stability')], ['War weariness', -ww * 0.3],
    ['Provincial unrest', -meanUnrest * 0.15], ['Repression', repression], ['Debt crisis', -debtCrisis], ['Food shortages', -n.shortage * 20], ['Angry young people', -youth],
    ['Banking crisis', (n.fin?.crisis ?? 0) > 0 ? -6 : 0], ['Shortages', -shortage * 0.5], ['Baseline', 5]]
  const stabT = clamp(stab.reduce((a, [, v]) => a + v, 0), 0, 100)
  n.stability = approach(n.stability, stabT, 0.08 * dt)
  n.drivers.stability = drv(stab, 0.2)
  const demo = DEMOCRATIC.has(String(n.policy.government))
  const leg: [string, number][] = [['Baseline', 45], ['Policies', M(mods, 'legitimacy')], ['Elected government', demo ? 15 : 0], ['Economic growth', growth * 2], ['Inflation', -Math.max(0, infl - 6) * 0.6],
    ['Corruption', -n.stocks.corruption * 0.15], ['Approval', (approval - 50) * 0.3]]
  const legT = clamp(leg.reduce((a, [, v]) => a + v, 0), 0, 100)
  n.legitimacy = approach(n.legitimacy, legT, 0.03 * dt)
  n.drivers.legitimacy = drv(leg, 0.2)
  const appr: [string, number][] = BLOCS.map(b => [`${b.icon} ${b.label}`, n.blocs[b.id] * n.blocWeights[b.id]])
  n.drivers.approval = drv(appr, 0.2)
  n.warWeariness = clamp(n.warWeariness + (n.wars.length ? (0.4 * n.wars.length + (n.casualties / (n.pop * 0.0002 + 1)) * 8) : -1.2) * dt, 0, 100)
}

/** Daily unrest per province; returns provinces that revolt. */
export function unrestDay(g: Game, pid: number, dt: number): boolean {
  const p = g.prov[pid]
  if (p.owner === -1) { p.unrest = approach(p.unrest, 5, 0.1 * dt); return false }
  const n = g.nation(p.owner)!
  const occupied = p.occupiedUntil > g.tick
  const nonCore = p.core !== n.id
  const minority = String(n.policy.minorityRights)
  const autonomyRelief = p.policy.autonomy === 'autonomous' ? 0.35 : p.policy.autonomy === 'devolved' ? 1 : 1.3
  const sec = p.policy.security === 'martial' ? 40 : p.policy.security === 'heightened' ? 15 : 0
  const target = clamp(
    Math.max(0, (55 - n.stability) * 0.8) + (occupied ? 30 : 0) + (nonCore ? 18 * autonomyRelief * (minority === 'assimilate' ? 1.6 : minority === 'autonomy' ? 0.5 : 1) : 0) +
      Math.max(0, 5.5 - p.happiness) * 6 + p.unemployment * 60 * (1 + Math.max(0, (n.demo?.young ?? 0.25) - 0.25) * 4) - Math.min(20, p.garrison * 1.5) - n.budget.security * 2 - sec - (pid === n.capital ? 10 : 0),
    0, 100)
  p.unrest = approach(p.unrest, target, 0.12 * dt)
  return p.unrest > 88 && pid !== n.capital && Math.random() < 0.03 * dt
}
