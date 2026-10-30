// The private credit cycle. Cheap money, light regulation, open capital accounts and optimism push
// lending above its long-run trend: growth and house prices boom. The further credit runs ahead of
// trend, the likelier a banking crisis: output falls for two years, unemployment jumps and the state
// picks up the bill. Also: currency pegs and speculative attacks, sovereign wealth funds, fiscal rules.
import { DAYS_PER_MONTH } from '../../shared/rules'
import { devOf } from '../../shared/conditions'
import { M } from './mods'
import type { Game } from './world'
import type { Fin, Nation } from './model'

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const round = (x: number) => Math.round(x * 100) / 100

export function initFin(gdppc: number, financeShare: number): Fin {
  const credit = clamp(12 + devOf(gdppc) * 110 + financeShare * 250, 8, 190)
  return { credit, trend: credit, crisis: 0, depth: 0, cycle: 1, fund: 0, fx: 0, breach: 0, risk: 0, lastCrisis: -99999 }
}

/** Daily credit dynamics. dt in months. */
export function financeDay(n: Nation, dt: number) {
  const F = n.fin, mods = n.mods, I = n.idx
  const growth = I.growth ?? 2
  const realRate = n.interest - n.inflation
  const neutral = 1.5 + Math.max(0, growth) * 0.25
  const drv: [string, number][] = [
    ['Financial deepening', 1.0 * (1 - n.cond.dev)],
    ['Interest rates vs neutral', clamp((neutral - realRate) * 0.5, -3, 3)],
    ['Credit policies', M(mods, 'credit')],
    ['Growth optimism', clamp((growth - 3) * 0.25, -1.5, 1.5)],
    ['Pull back to trend', -(F.credit - F.trend) * 0.15],
    ['Post-crisis deleveraging', F.crisis > 0 ? -6 : 0],
    ['Saturation', -Math.max(0, F.credit - 150) * 0.05],
  ]
  const dc = drv.reduce((a, [, v]) => a + v, 0)
  const y = dt / 12
  F.credit = clamp(F.credit + dc * y, 5, 300)
  F.trend += (F.credit - F.trend) * 0.12 * y
  const gap = F.credit - F.trend
  const crisisHit = F.crisis > 0 ? F.depth * Math.min(1, F.crisis / 12) : 0
  const target = 1 + clamp(gap * 0.0025, -0.05, 0.06) - crisisHit - (F.fx > 0 ? 0.03 * Math.min(1, F.fx / 6) : 0)
  F.cycle += (target - F.cycle) * Math.min(1, 0.15 * dt)
  if (F.crisis > 0) F.crisis = Math.max(0, F.crisis - dt)
  if (F.fx > 0) F.fx = Math.max(0, F.fx - dt)
  F.risk = clamp(Math.pow(Math.max(0, gap - 6) / 30, 1.6) * Math.max(0.2, 1 + M(mods, 'crisisRisk')) * (1 + Math.max(0, (I.debt ?? 0) - 90) / 100) +
    (realRate > 5 && gap > 8 ? 0.02 : 0), 0, 0.6)
  n.drivers.credit = drv.filter(([, v]) => Math.abs(v) > 0.05).map(([k, v]) => [k, round(v)])
  I.privateCredit = F.credit
  I.creditGap = gap
}

/** Monthly: banking crises, speculative attacks, fiscal-rule credibility. */
export function financeMonth(g: Game, n: Nation) {
  const F = n.fin, I = n.idx
  const gdpYear = n.gdp * 12
  const gap = F.credit - F.trend
  // banking crisis
  if (F.crisis <= 0 && g.tick - F.lastCrisis > 360 * 6 && Math.random() < F.risk / 12) {
    F.depth = clamp(0.03 + gap * 0.003, 0.03, 0.1)
    F.crisis = 24; F.lastCrisis = g.tick
    F.credit -= Math.max(0, gap) * 0.6
    const bailout = gdpYear * clamp(0.02 + gap * 0.002, 0.02, 0.08)
    n.treasury -= bailout
    n.stability = clamp(n.stability - 8, 0, 100); n.legitimacy = clamp(n.legitimacy - 5, 0, 100)
    n.blocs.business = clamp(n.blocs.business - 10, 0, 100); n.blocs.middle = clamp(n.blocs.middle - 8, 0, 100)
    g.pushNews('market', `🏦 Banking crisis in ${n.name}! A credit bubble bursts; the state spends $${bailout.toFixed(0)}B propping up the banks.`, [n.id])
    if (!n.ai) g.urgentIssue(n, 'bankcrisis')
  }
  // speculative attack on a peg
  if (String(n.policy.currency) === 'peg' && F.fx <= 0) {
    const severity = Math.max(0, -(I.tradeBalance ?? 0) - 3) / 6 + Math.max(0, -(I.deficit ?? 0) - 4) / 6 + Math.max(0, 9 - (I.credit ?? 12)) / 6
    if (severity > 0 && Math.random() < 0.03 * severity * Math.max(0.3, 1 + M(n.mods, 'crisisRisk'))) {
      F.fx = 12
      if (n.ai) {
        n.policy.currency = 'float'; n.since.currency = g.tick
        n.inflation += 12; n.treasury -= Math.max(0, -n.treasury) * 0.15
        n.stability = clamp(n.stability - 10, 0, 100)
        g.pushNews('market', `💱 Speculators break ${n.name}'s currency peg. The currency is devalued; inflation soars.`, [n.id])
      } else {
        g.pushNews('market', `💱 Speculators attack ${n.name}'s currency peg. Reserves are draining.`, [n.id])
        g.urgentIssue(n, 'currencyattack')
      }
    }
  }
  // fiscal rule
  const rule = String(n.policy.fiscalRule)
  const limit = rule === 'balanced' ? -0.5 : rule === 'brake' && (I.debt ?? 0) > 60 ? -3 : -99
  if ((I.deficit ?? 0) < limit) {
    F.breach++
    n.legitimacy = clamp(n.legitimacy - 0.4, 0, 100)
    n.power.pc = clamp(n.power.pc - 1.5, 0, 100)
  } else F.breach = 0
  // sovereign fund returns compound
  F.fund *= 1 + 0.045 / 12
  void DAYS_PER_MONTH
}

/** Interest-rate discount from a credible fiscal rule (percentage points). */
export function ruleCredibility(n: Nation) {
  if (n.fin.breach > 6) return 0
  const rule = String(n.policy.fiscalRule)
  return rule === 'balanced' ? 0.8 : rule === 'brake' ? 0.4 : 0
}
