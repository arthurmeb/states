import type { SectorId } from './sectors'

// Province-level construction projects. Cost in $B (scaled by the province's price level), build time in months.
export interface ProjectDef {
  id: string
  label: string
  icon: string
  cost: number
  months: number
  desc: string
  req?: { coastal?: boolean; oil?: boolean; metals?: boolean; fertility?: boolean; hc?: number; tech?: number; inst?: number; attraction?: number }
  /** sector attractiveness boost in this province */
  sectors?: Partial<Record<SectorId, number>>
  /** permanent increase to local stock targets */
  local?: { infra?: number; edu?: number; health?: number; housing?: number; safety?: number; pollution?: number }
  /** national effects while standing */
  national?: { culture?: number; sports?: number; students?: number; tourism?: number; tech?: number; navy?: number; air?: number; prestige?: number; brand?: number; renewables?: number; energy?: number }
  defense?: number
  max?: number
}

export const PROJECTS: ProjectDef[] = [
  { id: 'port', label: 'Deep-water port', icon: '⚓', cost: 8, months: 24, desc: 'Container terminals and shipyards. Unlocks large-scale shipping and naval logistics.', req: { coastal: true }, sectors: { logistics: 0.8, heavy: 0.15, auto: 0.1 }, local: { infra: 6 }, national: { navy: 0.5 } },
  { id: 'airport', label: 'International airport', icon: '🛫', cost: 5, months: 18, desc: 'A global hub. Tourism, business travel and air freight.', sectors: { tourism: 0.4, logistics: 0.2, finance: 0.1 }, local: { infra: 5 }, national: { tourism: 3 } },
  { id: 'rail', label: 'High-speed rail & highways', icon: '🚄', cost: 6, months: 30, desc: 'Fast links to the rest of the nation.', local: { infra: 15 }, sectors: { auto: 0.1, retail: 0.1 } },
  { id: 'university', label: 'Research university', icon: '🎓', cost: 4, months: 36, desc: 'Raises local education, feeds high-tech industry and attracts foreign students.', local: { edu: 15 }, sectors: { software: 0.2, pharma: 0.2, electronics: 0.1 }, national: { students: 4, tech: 1.5 } },
  { id: 'hospital', label: 'Hospital network', icon: '🏥', cost: 3, months: 18, desc: 'Regional hospitals and clinics.', local: { health: 15 }, sectors: { pharma: 0.1 } },
  { id: 'housing', label: 'Housing programme', icon: '🏘', cost: 4, months: 24, desc: 'Affordable homes for a growing city.', local: { housing: 20 }, sectors: { construction: 0.3 } },
  { id: 'industrial', label: 'Industrial zone', icon: '🏭', cost: 5, months: 24, desc: 'Serviced land, power and rail sidings for factories.', sectors: { light: 0.4, heavy: 0.4, auto: 0.3 }, local: { pollution: 10 } },
  { id: 'techpark', label: 'Technology park', icon: '🧪', cost: 6, months: 30, desc: 'Incubators, fibre and labs. A Silicon Valley seed.', req: { hc: 45 }, sectors: { software: 0.6, electronics: 0.5, pharma: 0.2 }, national: { tech: 2, brand: 2 } },
  { id: 'fab', label: 'Semiconductor fab', icon: '💠', cost: 20, months: 48, desc: 'Leading-edge chip fabrication. Strategic.', req: { hc: 60, tech: 55 }, sectors: { electronics: 1.2 }, national: { tech: 3, brand: 4, prestige: 3 }, max: 1 },
  { id: 'financial', label: 'Financial district', icon: '🏦', cost: 8, months: 36, desc: 'Towers, exchanges and regulators. A global money centre.', req: { inst: 50 }, sectors: { finance: 0.9 }, national: { brand: 3 } },
  { id: 'refinery', label: 'Refinery & petrochemicals', icon: '🛢', cost: 6, months: 24, desc: 'Captures more value from crude.', req: { oil: true }, sectors: { oil: 0.35, heavy: 0.3 }, local: { pollution: 12 } },
  { id: 'mine', label: 'Mining complex', icon: '⛏', cost: 4, months: 18, desc: 'Modern extraction and smelting.', req: { metals: true }, sectors: { mining: 0.6, heavy: 0.15 }, local: { pollution: 10 } },
  { id: 'agritech', label: 'Agricultural modernisation', icon: '🚜', cost: 3, months: 18, desc: 'Irrigation, mechanisation, cold chains.', req: { fertility: true }, sectors: { agriculture: 0.6 } },
  { id: 'nuclear', label: 'Nuclear power plant', icon: '☢', cost: 12, months: 48, desc: 'Clean, reliable baseload power.', req: { tech: 40 }, sectors: { energy: 0.5, heavy: 0.1 }, national: { renewables: 4, energy: 8 }, local: { pollution: -5 } },
  { id: 'solar', label: 'Solar & wind farms', icon: '☀', cost: 5, months: 18, desc: 'Renewable generation.', sectors: { energy: 0.3 }, national: { renewables: 3, energy: 4 }, local: { pollution: -3 } },
  { id: 'resort', label: 'Resort district', icon: '🏝', cost: 4, months: 24, desc: 'Hotels, beaches, casinos.', req: { attraction: 1 }, sectors: { tourism: 0.8 }, national: { tourism: 3 } },
  { id: 'heritage', label: 'Museums & heritage', icon: '🏛', cost: 1.5, months: 12, desc: 'Restore monuments, build world-class museums.', sectors: { tourism: 0.25, media: 0.1 }, national: { culture: 3, tourism: 2 } },
  { id: 'studios', label: 'Film & media city', icon: '🎬', cost: 4, months: 24, desc: 'Studios, sound stages, game developers. Your Hollywood.', sectors: { media: 0.9 }, national: { culture: 6, brand: 1 } },
  { id: 'stadium', label: 'Stadium & sports complex', icon: '🏟', cost: 3, months: 24, desc: 'World-class venues and academies.', sectors: { tourism: 0.1, media: 0.1 }, national: { sports: 6 }, local: { housing: -2 } },
  { id: 'base', label: 'Military base', icon: '🪖', cost: 3, months: 12, desc: '+40% defence of this province; garrisons recover faster.', defense: 0.4, local: { safety: 3 } },
  { id: 'navalbase', label: 'Naval base', icon: '⚓', cost: 6, months: 24, desc: 'Home port for the fleet.', req: { coastal: true }, national: { navy: 2 }, defense: 0.15 },
  { id: 'airbase', label: 'Air base', icon: '🛩', cost: 5, months: 18, desc: 'Fighter wings and radar.', national: { air: 2 }, defense: 0.15 },
  { id: 'spaceport', label: 'Spaceport', icon: '🚀', cost: 18, months: 60, desc: 'Launch satellites, astronauts and national pride.', req: { tech: 65 }, sectors: { aerospace: 0.8 }, national: { tech: 4, prestige: 10, brand: 4 }, max: 1 },
]
export const PROJECT_MAP = Object.fromEntries(PROJECTS.map(p => [p.id, p])) as Record<string, ProjectDef>
