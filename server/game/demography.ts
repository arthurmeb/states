// Population by age: young (0-14), prime (15-44), mature (45-64), old (65+).
// Births come from prime-age adults × fertility; people age through the groups; deaths depend on
// life expectancy; migrants arrive as young adults. The result drives labour supply, pension and
// health costs, youth unrest and long-run growth, decades after the policies that shaped it.
import { M } from './mods'
import type { Game } from './world'
import type { Demo, Nation } from './model'

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/** Initial age structure from real data (shares of population). */
export function initDemo(young: number, old: number): Demo {
  young = clamp(young, 0.08, 0.52); old = clamp(old, 0.015, 0.36)
  const working = Math.max(0.3, 1 - young - old)
  const mature = working * clamp(0.2 + old * 1.0, 0.2, 0.5)
  return { young, prime: working - mature, mature, old, w0: working, old0: old, births: 0, deaths: 0, mig: 0, pensions: 0 }
}

/** Per-year vital rates for a nation's current age structure. */
export function vitalRates(D: Demo, fertility: number, lifeExp: number, migration: number) {
  const births = fertility * D.prime / 60
  const remaining = Math.max(6, (lifeExp - 45) * 0.6)
  const deaths = D.young * Math.max(0.0005, (78 - lifeExp) * 0.0004) + D.prime * Math.max(0.0008, (82 - lifeExp) * 0.00012) +
    D.mature * Math.max(0.004, (90 - lifeExp) * 0.0004) + D.old / remaining
  const mig = ((migration - 50) / 50) * 0.004
  return { births, deaths, mig, remaining }
}

/** One day of ageing, births, deaths and migration. Returns the annual population growth rate. */
export function demographyDay(g: Game, n: Nation, dt: number): number {
  const D = n.demo
  const lifeExp = n.idx.lifeExp ?? 72
  const r = vitalRates(D, n.stocks.fertility, lifeExp, n.idx.migration ?? 50)
  const y = dt / 12
  // flows as shares of the population (per year)
  const youngDeaths = D.young * Math.max(0.0005, (78 - lifeExp) * 0.0004)
  const primeDeaths = D.prime * Math.max(0.0008, (82 - lifeExp) * 0.00012)
  const matureDeaths = D.mature * Math.max(0.004, (90 - lifeExp) * 0.0004)
  const oldDeaths = D.old / r.remaining
  const toPrime = D.young / 15, toMature = D.prime / 30, toOld = D.mature / 20
  const nYoung = D.young + (r.births - youngDeaths - toPrime + r.mig * 0.25) * y
  const nPrime = D.prime + (toPrime - primeDeaths - toMature + r.mig * 0.7) * y
  const nMature = D.mature + (toMature - matureDeaths - toOld + r.mig * 0.05) * y
  const nOld = D.old + (toOld - oldDeaths) * y
  const tot = nYoung + nPrime + nMature + nOld
  D.young = nYoung / tot; D.prime = nPrime / tot; D.mature = nMature / tot; D.old = nOld / tot
  D.births = r.births; D.deaths = r.deaths; D.mig = r.mig
  // pensions: retirees × replacement rate; the retirement age, the generosity of the safety net and
  // the financing system all scale it
  D.pensions = D.old * 42 * Math.max(0.2, 1 + M(n.mods, 'pension'))
  void g
  return r.births - r.deaths + r.mig
}

/** Labour supply relative to founding (fewer working-age people → fewer workers). */
export const laborRatio = (n: Nation) => (n.demo.prime + n.demo.mature) / Math.max(0.3, n.demo.w0)
/** Health spending needed for the same care, relative to founding (older people need more). */
export const healthLoad = (n: Nation) => (1 + 3 * Math.max(0, n.demo.old - 0.1)) / (1 + 3 * Math.max(0, n.demo.old0 - 0.1))

/** Old-age share in `years` if fertility and life expectancy stay as they are. */
export function projectOld(n: Nation, years: number) {
  const D = { ...n.demo }
  const lifeExp = n.idx.lifeExp ?? 72
  for (let i = 0; i < years; i++) {
    const r = vitalRates(D, n.stocks.fertility, lifeExp, n.idx.migration ?? 50)
    const toPrime = D.young / 15, toMature = D.prime / 30, toOld = D.mature / 20
    const yd = D.young * Math.max(0.0005, (78 - lifeExp) * 0.0004), pd = D.prime * Math.max(0.0008, (82 - lifeExp) * 0.00012)
    const md = D.mature * Math.max(0.004, (90 - lifeExp) * 0.0004), od = D.old / r.remaining
    const a = D.young + r.births - yd - toPrime + r.mig * 0.25, b = D.prime + toPrime - pd - toMature + r.mig * 0.7
    const c = D.mature + toMature - md - toOld + r.mig * 0.05, d = D.old + toOld - od
    const t = a + b + c + d
    D.young = a / t; D.prime = b / t; D.mature = c / t; D.old = d / t
  }
  return { old: D.old, young: D.young, working: D.prime + D.mature }
}
