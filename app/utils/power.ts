// Client mirrors of the server's political-capital costs, so every button can show its price.
import { policyCost, budgetCost, type CostCtx } from '~~/shared/power'
import type { NationPrivate } from '~~/shared/types'

export const costCtxOf = (me: NationPrivate): CostCtx => ({ weights: me.blocWeights, mult: me.power.costMult, base: me.power.base })
export const policyPC = (me: NationPrivate, id: string, to: string | number) =>
  policyCost(id, me.policy[id], to, me.cond, me.since[id] ?? 0, costCtxOf(me))
export const budgetPC = (me: NationPrivate, next: Record<string, number>) => budgetCost(me.budget, next, costCtxOf(me))
export const localPC = (me: NationPrivate, id: string) => Math.round((id === 'sez' || id === 'autonomy' || id === 'security' ? 3 : 1) * me.power.costMult * 10) / 10
export const governing = (me: NationPrivate | null | undefined) => !!me && me.power.office === 'governing'

/** Titles and units for "why?" panels. */
export const DRIVER_INFO: Record<string, { title: string; unit: string; desc: string }> = {
  productivity: { title: 'Productivity growth', unit: 'pp a year', desc: 'Trend growth of output per worker. Add workforce growth and the business cycle to get GDP growth.' },
  inflation: { title: 'Inflation', unit: '% a year (target)', desc: 'Where inflation is heading. It moves towards this target over a few months.' },
  unemployment: { title: 'Unemployment', unit: '% (structural)', desc: 'The jobless rate the economy settles at, before local mismatches.' },
  credit: { title: 'Private credit growth', unit: 'pp of GDP a year', desc: 'How fast household and business borrowing grows. Running far above trend inflates a bubble.' },
  pc: { title: 'Political capital', unit: 'per month', desc: 'What rebuilds (or drains) your room to act.' },
  stability: { title: 'Political stability', unit: 'target', desc: 'Stability drifts towards the sum of these forces.' },
  legitimacy: { title: 'Regime legitimacy', unit: 'target', desc: 'Belief that you have the right to rule. Slow to build, quick to lose.' },
  approval: { title: 'Approval', unit: 'points', desc: 'Each faction’s approval × its political weight.' },
  corruption: { title: 'Corruption', unit: 'target', desc: 'Corruption drifts slowly towards the sum of these forces.' },
  institutions: { title: 'Institutions', unit: 'target', desc: 'Rule of law and state capacity, built over decades.' },
  fertility: { title: 'Fertility', unit: 'children per woman (target)', desc: 'Births per woman drift slowly towards this target.' },
  coup: { title: 'Coup risk factors', unit: '0-100', desc: 'An unhappy army, weak institutions and instability raise the risk; coup-proofing lowers it.' },
}
