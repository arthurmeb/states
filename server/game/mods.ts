import { POLICIES, BUDGET, optionMods, type Mods, type Ideology, type BlocId } from '../../shared/policies'
import type { PolicyValues } from '../../shared/types'
import type { Nation } from './model'

export { optionMods }

export function defaultPolicy(): PolicyValues {
  return Object.fromEntries(POLICIES.map(p => [p.id, p.default]))
}
export function defaultBudget(): Record<string, number> {
  return Object.fromEntries(BUDGET.map(b => [b.id, b.default]))
}

/** Years a policy has held its current value. */
export const policyYears = (n: Nation, id: string, tick: number) => Math.max(0, (tick - (n.since?.[id] ?? n.founded)) / 360)

/**
 * Sum of every active policy modifier, given the nation's current situation and how long each policy
 * has been in force. Also records the biggest policy contributions to each key (for "why?" panels).
 */
export function computeMods(n: Nation, tick: number): Mods {
  const m: Mods = {}
  const src: Record<string, [string, number][]> = {}
  n.since ??= {}; n.sinceVal ??= {}
  for (const p of POLICIES) {
    const v = n.policy[p.id]
    // detect changes from any source (player, AI, events, coups): restart the clock, and repealing an
    // entitlement people relied on causes a one-off backlash
    const prev = n.sinceVal[p.id]
    if (prev === undefined) { n.sinceVal[p.id] = v; n.since[p.id] ??= n.founded }
    else if (p.kind === 'slider' ? Math.abs(+v - +prev) >= 5 : prev !== v) {
      if (p.kind === 'choice') {
        const old = p.options.find(o => o.id === prev)
        if (old?.onLeave) applyShock(n, old.onLeave(n.cond, policyYears(n, p.id, tick)))
      }
      n.sinceVal[p.id] = v; n.since[p.id] = tick
    }
    const mods = optionMods(p, v, n.cond, policyYears(n, p.id, tick))
    const label = p.kind === 'slider' ? `${p.label} ${v}${p.unit}` : p.options.find(o => o.id === v)?.label ?? p.label
    for (const [k, x] of Object.entries(mods)) {
      if (!x) continue
      m[k] = (m[k] ?? 0) + x
      ;(src[k] ??= []).push([label, x])
    }
  }
  for (const k of Object.keys(src)) src[k] = src[k].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 5)
  n.modSrc = src
  return m
}
export const M = (mods: Mods, k: string) => mods[k] ?? 0

/** One-off reaction to a policy change: faction anger, instability, a price jump. */
export function applyShock(n: Nation, shock: Record<string, number>) {
  const clamp = (v: number) => Math.max(0, Math.min(100, v))
  for (const [k, v] of Object.entries(shock)) {
    if (k === 'stability') n.stability = clamp(n.stability + v)
    else if (k === 'inflation') n.inflation += v
    else if (k in n.blocs) n.blocs[k as BlocId] = clamp(n.blocs[k as BlocId] + v)
  }
}

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
  // new levers: costs, risks and resilience
  spend: { base: -2.5, right: -1.5 }, crisisRisk: { base: -2 }, pension: { base: -4, right: -2 }, shortage: { base: -30 }, housing: { base: 0.25, left: 0.1 },
  deterrence: { hawk: 8, nat: 4, base: 1 }, adapt: { base: 4, green: 4 }, coupProof: { auth: 6, base: 1 }, credit: { base: 0.15, right: 0.2 },
  legitimacy: { base: 0.5 }, fertility: { base: 3, trad: 3 }, laborPart: { base: 40 }, mobility: { left: 0.2, lib: 0.2 },
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
