import { BLOCS, POLICIES, type BlocId } from '../../shared/policies'
import { SECTOR_INDEX as S } from '../../shared/sectors'
import { DEMOCRATIC, ELECTION_MONTHS, DAYS_PER_MONTH } from '../../shared/rules'
import type { Game } from './world'
import type { Nation } from './model'
import { M, optionMods } from './mods'

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const approach = (v: number, t: number, r: number) => v + (t - v) * Math.min(1, r)

/** Political weight of each faction from demographics, economy and the system of government. */
export function blocWeights(g: Game, n: Nation): Record<BlocId, number> {
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
  const gov = String(n.policy.government)
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
    workers: -2 * (u - 5) - (infl - 3) * 0.8 + growth * 1.2 - ((idx.gini ?? 35) - 35) * 0.3 + n.budget.welfare * 0.6,
    business: growth * 2 - Math.max(0, infl - 3) * 0.5 + (n.stocks.inst - 50) * 0.2 - g.sanctionPressure(n.id) * 30 + ((idx.credit ?? 12) - 12) * 0.8,
    middle: growth * 1.5 - (infl - 3) * 1 + ((idx.safety ?? 50) - 50) * 0.2 - n.stocks.corruption * 0.15 + 5,
    rural: (g.prices[S.agriculture] - 1) * 20 + n.budget.subsidies * 1.5 - u * 0.3,
    religious: (n.stocks.cohesion - 60) * 0.2,
    progressives: ((idx.freedom ?? 50) - 50) * 0.25 + (40 - n.stocks.pollution) * 0.15 + (n.stocks.hc - 50) * 0.1,
    military: (n.budget.defense - 2) * 6 + (n.wars.length ? 3 : 0) + (n.quality - 1) * 10,
    minorities: (n.stocks.cohesion - 60) * 0.3,
  }
  for (const b of BLOCS) {
    const t = clamp(50 + M(mods, 'bloc:' + b.id) + out[b.id] - ww * 0.3 + (n.legitimacy - 50) * 0.15, 0, 100)
    n.blocs[b.id] = approach(n.blocs[b.id], t, 0.12 * dt * 3)
  }
  let approval = 0
  for (const b of BLOCS) approval += n.blocs[b.id] * n.blocWeights[b.id]
  idx.approval = approval
  const meanUnrest = g.meanUnrest(n.id)
  const repression = (M(mods, 'surveillance') + (String(n.policy.press) === 'state' ? 10 : 0)) * 0.08
  const debtCrisis = (idx.credit ?? 12) < 5 ? (5 - (idx.credit ?? 12)) * 3 : 0
  const stabT = clamp(0.6 * approval + 0.35 * n.legitimacy + M(mods, 'stability') - ww * 0.3 - meanUnrest * 0.15 + repression - debtCrisis - n.shortage * 20 + 5, 0, 100)
  n.stability = approach(n.stability, stabT, 0.08 * dt)
  const demo = DEMOCRATIC.has(String(n.policy.government))
  const legT = clamp(45 + M(mods, 'legitimacy') + (demo ? 15 : 0) + growth * 2 - Math.max(0, infl - 6) * 0.6 - n.stocks.corruption * 0.15 + (approval - 50) * 0.3, 0, 100)
  n.legitimacy = approach(n.legitimacy, legT, 0.03 * dt)
  n.warWeariness = clamp(n.warWeariness + (n.wars.length ? (0.4 * n.wars.length + (n.casualties / (n.pop * 0.0002 + 1)) * 8) : -1.2) * dt, 0, 100)
}

/** Monthly political events: elections, coups, revolutions. */
export function politicsMonth(g: Game, n: Nation) {
  const gov = String(n.policy.government)
  const demo = DEMOCRATIC.has(gov)
  if (demo) {
    n.nextElection ??= g.tick + ELECTION_MONTHS * DAYS_PER_MONTH
    if (g.tick >= n.nextElection) {
      n.nextElection = g.tick + ELECTION_MONTHS * DAYS_PER_MONTH
      const approval = n.idx.approval ?? 50
      const margin = approval - 45 + (Math.random() - 0.5) * 8
      if (margin >= 0) {
        n.legitimacy = clamp(n.legitimacy + 10, 0, 100)
        g.pushNews('election', `🗳 ${n.name}: the governing coalition is re-elected with ${(50 + margin / 2).toFixed(1)}% of the vote.`, [n.id])
      } else {
        // the opposition reverses the most hated policy
        const worst = mostUnpopularPolicy(n)
        if (worst) n.policy[worst.id] = worst.default
        n.stability = clamp(n.stability - 8, 0, 100); n.legitimacy = clamp(n.legitimacy + 6, 0, 100)
        g.pushNews('election', `🗳 ${n.name}: the government loses the election. The new coalition reverses ${worst ? `“${worst.label}”` : 'several policies'}.`, [n.id])
      }
    }
  } else n.nextElection = null

  if (gov !== 'junta' && n.blocs.military < 18 && n.stability < 30 && Math.random() < 0.06) {
    n.policy.government = 'junta'; n.policy.press = 'state'; n.policy.judiciary = 'captured'
    n.budget.defense = Math.max(n.budget.defense, 4)
    n.stability = 45; n.cooldowns.government = g.tick + 36 * DAYS_PER_MONTH
    g.pushNews('event', `🪖 Military coup in ${n.name}! The generals suspend the constitution.`, [n.id])
  } else if (!demo && n.stability < 15 && n.blocs.progressives + n.blocs.workers + n.blocs.middle < 80 && Math.random() < 0.05) {
    n.policy.government = 'democracy'; n.policy.press = 'free'; n.policy.judiciary = 'independent'
    n.stability = 40; n.cooldowns.government = g.tick + 24 * DAYS_PER_MONTH
    g.pushNews('event', `✊ Revolution in ${n.name}! Crowds topple the regime and proclaim a democratic republic.`, [n.id])
  } else if (demo && n.stability < 12 && Math.random() < 0.05) {
    n.budget = { ...n.budget }
    g.pushNews('event', `🏛 Constitutional crisis in ${n.name}: parliament is dissolved amid mass protests.`, [n.id])
    n.stability += 10
  }
}

function mostUnpopularPolicy(n: Nation) {
  let worst: { id: string; label: string; default: string | number } | null = null, worstScore = 0
  for (const p of POLICIES) {
    const v = n.policy[p.id]
    if (v === p.default) continue
    const cur = optionMods(p, v), def = optionMods(p, p.default)
    let s = 0
    for (const b of BLOCS) s += ((cur['bloc:' + b.id] ?? 0) - (def['bloc:' + b.id] ?? 0)) * (n.blocWeights[b.id] ?? 0.1)
    if (s < worstScore) { worstScore = s; worst = { id: p.id, label: p.label, default: p.default } }
  }
  return worst
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
      Math.max(0, 5.5 - p.happiness) * 6 + p.unemployment * 60 - Math.min(20, p.garrison * 1.5) - n.budget.security * 2 - sec - (pid === n.capital ? 10 : 0),
    0, 100)
  p.unrest = approach(p.unrest, target, 0.12 * dt)
  return p.unrest > 88 && pid !== n.capital && Math.random() < 0.03 * dt
}
