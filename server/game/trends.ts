// World-scale forces that shift under every nation over the decades:
//  • Climate: global emissions heat the planet; hot, arid and coastal places suffer, the far north gains a little.
//  • The energy transition: as the world adopts renewables, oil demand (and prices) fall.
//  • Automation: routine work is automated; the cheap-labour path to industrialisation narrows,
//    skilled economies gain, unskilled workers lose.
import { NS, SECTOR_INDEX as S } from '../../shared/sectors'
import { ramp } from '../../shared/conditions'
import type { ProvinceStatic } from '../../shared/types'
import type { Game } from './world'

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

export interface Trends {
  /** warming since pre-industrial, °C */
  temp: number
  /** world renewable share of energy (0..1), and where it started */
  green: number; green0: number
  /** automation of routine work (0..1) */
  automation: number
  /** clean-technology cost decline: extra renewable share everyone can adopt cheaply (points) */
  cleanTech: number
  /** world emissions, Gt CO₂ per year */
  co2: number
  /** oil demand relative to 2030 */
  oilDemand: number
  /** baseline world demand shares and multipliers from booms */
  base: number[]; boost: number[]
}

export const TRENDS_2030 = (): Trends => ({ temp: 1.45, green: 0.2, green0: 0.2, automation: 0.15, cleanTech: 0, co2: 37, oilDemand: 1, base: [], boost: [] })
export function initTrends(g: Game): Trends {
  const { green, co2 } = measure(g)
  return { ...TRENDS_2030(), green, green0: green, co2, base: [...g.demandShare], boost: new Array(NS).fill(1) }
}

/** World emissions (Gt/yr) and output-weighted renewable share, from every province. */
function measure(g: Game) {
  let tonnes = 0, renewW = 0, gdpW = 0
  for (let pid = 0; pid < g.P.length; pid++) {
    const p = g.prov[pid]
    const n = p.owner >= 0 ? g.nation(p.owner) : undefined
    const b = n ? null : g.base(g.P[pid].iso3)
    const co2 = n ? n.idx.co2 ?? 4 : b!.co2 ?? 4
    const ren = n ? n.idx.renewables ?? n.stocks.renewables : b!.renewables ?? 15
    tonnes += co2 * p.pop * 1000
    renewW += ren * p.gdp; gdpW += p.gdp
  }
  return { co2: tonnes / 1e9, green: gdpW ? renewW / gdpW / 100 : 0.2 }
}

/** Relative automation since 2030: 0 now, 1 when routine work is largely automated. */
export const autoRel = (g: Game) => ramp(g.trends.automation, 0.15, 0.85)

/** How exposed a province is to heat: tropical and arid land suffers most. */
export function heatExposure(P: ProvinceStatic) {
  const tropic = ramp(34 - Math.abs(P.lat), 0, 22) * 0.7
  const dry = P.terrain === 'desert' ? 0.4 : P.terrain === 'arid' || P.terrain === 'savanna' ? 0.3 : 0
  return clamp(tropic + dry, 0, 1)
}
/** Climate stress on a province from warming beyond today's (0 in 2030, ~0.8 for exposed land at +0.5°C). */
export const heatOf = (g: Game, P: ProvinceStatic) => Math.max(0, g.trends.temp - 1.45) * 1.6 * heatExposure(P)
/** Warming lengthens growing seasons in the cold north. */
export const coldBonus = (g: Game, P: ProvinceStatic) => (P.terrain === 'boreal' || P.terrain === 'tundra' || Math.abs(P.lat) > 52 ? 0.3 * Math.max(0, g.trends.temp - 1.45) : 0)

export function trendsMonth(g: Game) {
  const T = g.trends
  const m = measure(g)
  T.co2 = m.co2
  T.temp += (T.co2 * 0.00068) / 12
  T.green0 ??= T.green
  T.green += (m.green - T.green) * 0.08
  T.cleanTech = Math.min(40, T.cleanTech + 1.2 / 12)
  T.automation = Math.min(0.95, T.automation + 0.011 / 12)
  // the transition cuts oil demand; the spending moves to electronics, software and pharmaceuticals
  T.oilDemand = 1 - 0.85 * ramp(T.green, T.green0, T.green0 + 0.55)
  for (let s = 0; s < NS; s++) g.demandShare[s] = T.base[s] * T.boost[s]
  const lost = T.base[S.oil] * T.boost[S.oil] * (1 - T.oilDemand)
  g.demandShare[S.oil] -= lost
  g.demandShare[S.electronics] += lost * 0.5; g.demandShare[S.software] += lost * 0.3; g.demandShare[S.pharma] += lost * 0.2
  // structural shifts: digital services and (for an ageing world) medicine grow; food's share shrinks
  T.base[S.software] *= 1 + 0.012 / 12; T.base[S.pharma] *= 1 + 0.006 / 12; T.base[S.agriculture] *= 1 - 0.004 / 12
  // booms fade back towards baseline over a few years
  for (let s = 0; s < NS; s++) T.boost[s] = 1 + (T.boost[s] - 1) * 0.985
}
