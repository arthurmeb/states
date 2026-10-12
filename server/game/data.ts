import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { City, CountryData, ProvinceStatic } from '../../shared/types'

export interface WorldData { P: ProvinceStatic[]; cities: City[]; countries: Record<string, CountryData> }

export function loadWorldData(publicDir: string): WorldData {
  const read = (f: string) => JSON.parse(readFileSync(join(publicDir, 'world', f), 'utf8'))
  return { P: read('provinces.json'), cities: read('cities.json'), countries: read('countries.json') }
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/** Real-world indicators → simulation stocks (0-100 scales unless noted). */
export interface Baseline {
  gdppc: number; hc: number; health: number; infra: number; tech: number; inst: number; corruption: number
  voice: number; wgiStability: number; pollution: number; renewables: number; urban: number; lfp: number
  unemployment: number; inflation: number; gini: number; fertility: number; lifeExp: number; homicide: number
  taxRev: number; debt: number; milSpend: number; eduSpend: number; healthSpend: number; armedForces: number
  shares: { agri: number; industry: number; manuf: number; services: number; oilRents: number; mineralRents: number; hightech: number; tourismGdp: number }
  internet: number; genderParl: number; femaleLabor: number; exportsGdp: number; popGrowth: number; age65: number
  co2: number; population: number
}

export function baselineOf(c: CountryData | undefined): Baseline {
  const d = c?.data ?? {}
  const v = (k: string, def: number) => (d[k] != null && isFinite(d[k]) ? d[k] : def)
  const gdppc = v('gdppc_ppp', 12000)
  const mys = v('undp_mys', 8), eys = v('undp_eys', 12)
  const internet = v('internet', 60), electricity = v('electricity', 90)
  return {
    gdppc,
    hc: clamp((mys / 14) * 55 + (eys / 18) * 45, 3, 100),
    health: clamp((v('life_exp', 72) - 45) * 2.2 + v('health_spend', 6) * 1.2, 5, 100),
    infra: clamp(electricity * 0.35 + internet * 0.35 + Math.min(30, gdppc / 2500), 3, 100),
    tech: clamp(v('rnd', 0.5) * 14 + v('hightech_exports', 10) * 0.25 + internet * 0.25 + Math.log10(v('patents', 10) + 1) * 3, 2, 100),
    inst: clamp((v('effectiveness', 50) + v('rule_of_law', 50) + v('regulatory', 50)) / 3, 2, 100),
    corruption: clamp(100 - v('corruption_control', 50), 0, 100),
    voice: v('voice', 50), wgiStability: v('stability', 50),
    pollution: clamp(v('pm25', 25) * 1.4, 2, 100),
    renewables: clamp(v('renewables', 20), 0, 100),
    urban: clamp(v('urban', 55) / 100, 0.05, 1),
    lfp: clamp((v('labor_part', 60) / 100) * (1 - v('age014', 25) / 100), 0.25, 0.65),
    unemployment: clamp(v('unemployment', 6) / 100, 0.005, 0.4),
    inflation: clamp(v('inflation', 4), -2, 60),
    gini: clamp(v('gini', 36), 22, 65),
    fertility: clamp(v('fertility', 2.2), 0.7, 7.5),
    lifeExp: v('life_exp', 72),
    homicide: v('homicide', 5),
    taxRev: v('tax_rev', 16), debt: v('debt_gdp', 55), milSpend: v('mil_spend', 1.8),
    eduSpend: v('edu_spend', 4.3), healthSpend: v('health_spend', 6.5),
    armedForces: v('armed_forces', 0) / 1000,
    shares: {
      agri: v('agri_va', 8) / 100, industry: v('industry_va', 28) / 100, manuf: v('manuf_va', 13) / 100, services: v('services_va', 55) / 100,
      oilRents: v('oil_rents', 0) / 100, mineralRents: v('mineral_rents', 0) / 100, hightech: v('hightech_exports', 10) / 100,
      tourismGdp: clamp((v('tourism_receipts', 0) / Math.max(1, v('gdp_usd', 1e11))), 0, 0.4),
    },
    internet, genderParl: v('women_parl', 25), femaleLabor: v('female_labor', 50), exportsGdp: v('exports_gdp', 35),
    popGrowth: v('pop_growth', 1), age65: v('age65', 10),
    co2: v('co2_pc', 4), population: v('population', 1e7) / 1000,
  }
}
