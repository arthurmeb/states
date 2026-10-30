// A nation's situation, recomputed daily. Policy effects read it, so the same law plays out
// differently in a young poor country, an ageing rich one, a petro-state or a nation at war.
// Shared with the client so policy previews show "what this does here, now".

export interface Cond {
  /** development 0..1 (log GDP per capita: $1k → 0, $80k → 1) */
  dev: number
  gdppc: number
  /** human capital, institutions, corruption (0-100) */
  hc: number; inst: number; corruption: number
  /** population shares by age */
  young: number; old: number
  /** old-age dependency: 65+ per working-age person */
  dep: number
  /** % of GDP */
  debt: number; deficit: number
  inflation: number; unemployment: number
  /** private credit % GDP, and its gap above the long-run trend (boom > 0) */
  credit: number; creditGap: number
  /** oil + mining share of GDP (0..1), manufacturing share (0..1) */
  resource: number; industry: number
  /** exports % GDP, economic complexity 0-100 */
  openness: number; complexity: number
  /** world oil price index (1 = 2030), net oil imports as share of GDP */
  oilPrice: number; oilImport: number
  gini: number; cohesion: number
  /** share of population outside the national heartland (0..1) */
  nonCore: number
  urban: number
  wars: number
  /** neighbours' military power relative to ours (1 = parity) */
  threat: number
  /** climate stress on this nation 0..1 */
  heat: number
  /** world trends 0..1: automation of routine work, green energy transition */
  automation: number; green: number
  /** housing affordability 0-100 */
  housing: number
  democratic: number
  stability: number; approval: number
  /** health budget % GDP (quality of a universal system depends on funding) */
  healthSpend: number
}

export const DEFAULT_COND: Cond = {
  dev: 0.5, gdppc: 9000, hc: 50, inst: 45, corruption: 50, young: 0.25, old: 0.09, dep: 0.14, debt: 50, deficit: -2, inflation: 3,
  unemployment: 6, credit: 60, creditGap: 0, resource: 0.03, industry: 0.15, openness: 30, complexity: 40, oilPrice: 1, oilImport: 0.01,
  gini: 36, cohesion: 60, nonCore: 0, urban: 0.55, wars: 0, threat: 0.8, heat: 0.1, automation: 0.15, green: 0.25, housing: 55,
  democratic: 1, stability: 60, approval: 55, healthSpend: 4.5,
}

export const devOf = (gdppc: number) => Math.max(0, Math.min(1.1, (Math.log(Math.max(300, gdppc)) - Math.log(1000)) / (Math.log(80000) - Math.log(1000))))

/** 0 below a, 1 above b, linear in between */
export const ramp = (x: number, a: number, b: number) => Math.max(0, Math.min(1, (x - a) / (b - a)))
