import { POLICIES, BUDGET, type Mods, type PolicyDef, type Ideology, type BlocId } from '../../shared/policies'
import type { PolicyValues } from '../../shared/types'

export function defaultPolicy(): PolicyValues {
  return Object.fromEntries(POLICIES.map(p => [p.id, p.default]))
}
export function defaultBudget(): Record<string, number> {
  return Object.fromEntries(BUDGET.map(b => [b.id, b.default]))
}

export function optionMods(p: PolicyDef, value: string | number | undefined): Mods {
  if (p.kind === 'slider') return p.mods(typeof value === 'number' ? value : p.default)
  return p.options.find(o => o.id === value)?.mods ?? p.options.find(o => o.id === p.default)!.mods
}

/** Sum of every active policy modifier. */
export function computeMods(policy: PolicyValues): Mods {
  const m: Mods = {}
  for (const p of POLICIES) {
    for (const [k, v] of Object.entries(optionMods(p, policy[p.id]))) m[k] = (m[k] ?? 0) + v
  }
  return m
}
export const M = (mods: Mods, k: string) => mods[k] ?? 0

// ───────── AI valuation of policy options ─────────
/** How much a nation of a given ideology likes each faction getting what it wants. */
const BLOC_AFFINITY: Record<BlocId, Partial<Record<Ideology, number>>> = {
  workers: { left: 1, right: -0.6 },
  business: { right: 1, left: -0.6, glob: 0.3 },
  middle: { right: 0.2, lib: 0.3 },
  rural: { trad: 0.5, nat: 0.4 },
  religious: { trad: 1, prog: -0.8 },
  progressives: { prog: 1, lib: 0.6, trad: -0.7, green: 0.4 },
  military: { hawk: 1, auth: 0.6, nat: 0.4 },
  minorities: { glob: 0.4, lib: 0.3, nat: -0.6 },
}
const OUTCOME_AFFINITY: Record<string, Partial<Record<Ideology, number>> & { base?: number }> = {
  growth: { base: 6, right: 2 }, productivity: { base: 60 }, happiness: { base: 0.6 }, stability: { base: 0.6, auth: 0.6 },
  freedom: { lib: 0.6, auth: -0.6 }, democracy: { lib: 0.4, auth: -0.6 }, press: { lib: 0.3, auth: -0.4 }, surveillance: { auth: 0.3, lib: -0.4 },
  gini: { left: -0.6, base: -0.15 }, poverty: { left: -0.4, base: -0.15 }, fdi: { glob: 10, nat: -6, base: 4 }, tradeOpen: { glob: 20, nat: -15 },
  migration: { glob: 0.2, nat: -0.3 }, pollution: { green: -0.6, base: -0.05 }, renewables: { green: 0.5 }, values: { lib: 0.2 },
  corruption: { base: -0.3 }, institutions: { base: 0.3 }, military: { hawk: 30 }, manpower: { hawk: 6 }, cohesion: { base: 0.3, nat: 0.3 },
  genderEq: { prog: 0.3, trad: -0.3 }, culture: { base: 0.2 }, sports: { base: 0.15 }, tourism: { base: 0.15 }, innovation: { base: 0.3 },
  unemployment: { base: -2, left: -1 }, inflation: { base: -1.5, right: -1 }, health: { base: 0.3, left: 0.2 }, eduQuality: { base: 0.3 },
}
export function scoreMods(mods: Mods, ideology: Record<Ideology, number>, blocWeights?: Record<string, number>) {
  let s = 0
  for (const [k, v] of Object.entries(mods)) {
    if (k.startsWith('bloc:')) {
      const b = k.slice(5) as BlocId
      const aff = BLOC_AFFINITY[b]
      let w = 0.15 + (blocWeights?.[b] ?? 0.12) * 1.5
      for (const [ide, a] of Object.entries(aff)) w += (ideology[ide as Ideology] ?? 0) * a * 0.5
      s += v * w * 0.12
      continue
    }
    const o = OUTCOME_AFFINITY[k]
    if (!o) continue
    let w = o.base ?? 0
    for (const [ide, a] of Object.entries(o)) if (ide !== 'base') w += (ideology[ide as Ideology] ?? 0) * (a as number)
    s += v * w * 0.1
  }
  return s
}

/** Pure ideological appeal of a set of modifiers (no pragmatic outcome terms). */
export function ideologyScore(mods: Mods, ideology: Record<Ideology, number>) {
  let s = 0
  for (const [k, v] of Object.entries(mods)) {
    const aff = k.startsWith('bloc:') ? BLOC_AFFINITY[k.slice(5) as BlocId] : OUTCOME_AFFINITY[k]
    if (!aff) continue
    let w = 0
    for (const [ide, a] of Object.entries(aff)) if (ide !== 'base') w += (ideology[ide as Ideology] ?? 0) * (a as number)
    s += v * w * (k.startsWith('bloc:') ? 0.06 : 0.1)
  }
  return s
}
