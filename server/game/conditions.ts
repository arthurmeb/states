import { SECTOR_INDEX as S } from '../../shared/sectors'
import { devOf, type Cond } from '../../shared/conditions'
import { ELECTORAL } from '../../shared/power'
import { heatOf } from './trends'
import type { Game } from './world'
import type { Nation } from './model'

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/** The nation's situation today (read by every policy's situational effects). */
export function computeCond(g: Game, n: Nation): Cond {
  const gdp = Math.max(0.001, n.gdp), I = n.idx
  const gdppc = g.gdppc(n)
  const share = (...s: number[]) => s.reduce((a, x) => a + n.sectorOut[x], 0) / gdp
  let threat = 0.3
  const mine = Math.max(1, I.power ?? 1)
  for (const id of g.neighboursOf(n.id)) { const o = g.nation(id); if (o && !n.allies.includes(id)) threat = Math.max(threat, (o.idx.power ?? 0) / mine) }
  let heat = 0, pop = 0
  for (const pid of g.owned(n.id)) { const w = g.prov[pid].pop; heat += heatOf(g, g.P[pid]) * w; pop += w }
  const working = Math.max(0.2, n.demo.prime + n.demo.mature)
  return {
    dev: devOf(gdppc), gdppc, hc: n.stocks.hc, inst: n.stocks.inst, corruption: n.stocks.corruption,
    young: n.demo.young, old: n.demo.old, dep: n.demo.old / working,
    debt: I.debt ?? 50, deficit: I.deficit ?? 0, inflation: n.inflation, unemployment: I.unemployment ?? n.unemployment * 100,
    credit: n.fin.credit, creditGap: n.fin.credit - n.fin.trend,
    resource: share(S.oil, S.mining), industry: share(S.light, S.heavy, S.auto, S.electronics, S.pharma, S.aerospace),
    openness: I.exports ?? 30, complexity: I.complexity ?? 40,
    oilPrice: g.prices[S.oil], oilImport: (n.imports[S.oil] - n.exports[S.oil]) / gdp,
    gini: I.gini ?? 36, cohesion: n.stocks.cohesion, nonCore: g.nonCoreShare(n), urban: g.urbanShare(n), wars: n.wars.length,
    threat: clamp(threat, 0, 5), heat: pop ? heat / pop : 0, automation: g.trends.automation, green: g.trends.green,
    housing: I.housing ?? 55, democratic: ELECTORAL.has(String(n.policy.government)) ? 1 : 0, stability: n.stability, approval: I.approval ?? 50,
    healthSpend: n.budget.health,
  }
}
