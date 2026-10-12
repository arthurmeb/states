// Industry sectors. Output = jobs × base value-added × sector VA × productivity × world price.
// Higher-tier sectors unlock as a nation develops (income, human capital, technology, infrastructure, institutions).

export type SectorId =
  | 'agriculture' | 'mining' | 'oil' | 'energy' | 'light' | 'heavy' | 'auto' | 'electronics' | 'pharma' | 'aerospace'
  | 'construction' | 'retail' | 'finance' | 'software' | 'tourism' | 'media' | 'logistics'

export interface SectorReq { gdppc?: number; hc?: number; tech?: number; infra?: number; inst?: number }
export interface SectorDef {
  id: SectorId
  label: string
  icon: string
  group: 'primary' | 'industry' | 'services'
  tradable: boolean
  /** value added per worker relative to the economy-wide base */
  va: number
  /** income elasticity of world demand */
  elasticity: number
  tier: number
  req: SectorReq
  resource?: 'fertility' | 'metals' | 'oil' | 'attraction' | 'coast'
  pollution: number
  color: string
  desc: string
}

export const SECTORS: SectorDef[] = [
  { id: 'agriculture', label: 'Agriculture & food', icon: '🌾', group: 'primary', tradable: true, va: 0.35, elasticity: 0.5, tier: 0, req: {}, resource: 'fertility', pollution: 0.3, color: '#8bc34a', desc: 'Farming, fisheries and food processing. Employs most people in poor nations; shrinks as a share as you develop.' },
  { id: 'mining', label: 'Mining & metals', icon: '⛏', group: 'primary', tradable: true, va: 1.6, elasticity: 0.9, tier: 0, req: {}, resource: 'metals', pollution: 1.0, color: '#ff9800', desc: 'Ores, rare earths and minerals. Requires deposits.' },
  { id: 'oil', label: 'Oil & gas', icon: '🛢', group: 'primary', tradable: true, va: 5.0, elasticity: 0.9, tier: 0, req: {}, resource: 'oil', pollution: 1.2, color: '#9c27b0', desc: 'Hydrocarbon extraction. Enormous value per worker, volatile prices, few jobs.' },
  { id: 'energy', label: 'Energy & utilities', icon: '⚡', group: 'industry', tradable: false, va: 1.4, elasticity: 1.0, tier: 1, req: { infra: 10 }, pollution: 1.0, color: '#ffeb3b', desc: 'Power generation, water and grids. Pollution depends on your energy mix.' },
  { id: 'light', label: 'Textiles & light manufacturing', icon: '🧵', group: 'industry', tradable: true, va: 0.55, elasticity: 0.8, tier: 1, req: { infra: 10 }, pollution: 0.5, color: '#f48fb1', desc: 'Garments, toys, furniture. Thrives on cheap labour; migrates away as wages rise.' },
  { id: 'heavy', label: 'Steel & chemicals', icon: '🏭', group: 'industry', tradable: true, va: 1.0, elasticity: 0.9, tier: 1, req: { infra: 30, hc: 30 }, pollution: 1.3, color: '#795548', desc: 'Heavy industry. Benefits from metals and cheap energy; pollutes heavily.' },
  { id: 'auto', label: 'Automotive & machinery', icon: '🚗', group: 'industry', tradable: true, va: 1.35, elasticity: 1.1, tier: 2, req: { gdppc: 9000, hc: 45, infra: 45 }, pollution: 0.6, color: '#607d8b', desc: 'Cars, machine tools, industrial equipment. The classic middle-income ladder.' },
  { id: 'electronics', label: 'Electronics & semiconductors', icon: '💾', group: 'industry', tradable: true, va: 1.8, elasticity: 1.3, tier: 3, req: { gdppc: 14000, hc: 60, tech: 45, infra: 55 }, pollution: 0.4, color: '#00bcd4', desc: 'Chips, devices, components. Strategic and hugely valuable.' },
  { id: 'pharma', label: 'Pharmaceuticals & biotech', icon: '💊', group: 'industry', tradable: true, va: 2.0, elasticity: 1.3, tier: 3, req: { gdppc: 20000, hc: 65, tech: 55 }, pollution: 0.3, color: '#26a69a', desc: 'Drugs, vaccines, life sciences. Needs top research and health systems.' },
  { id: 'aerospace', label: 'Aerospace & defence', icon: '✈', group: 'industry', tradable: true, va: 2.2, elasticity: 1.2, tier: 4, req: { gdppc: 25000, hc: 65, tech: 65 }, pollution: 0.4, color: '#3f51b5', desc: 'Aircraft, satellites, arms. Boosts military technology and prestige.' },
  { id: 'construction', label: 'Construction & real estate', icon: '🏗', group: 'services', tradable: false, va: 0.8, elasticity: 1.0, tier: 0, req: {}, pollution: 0.4, color: '#a1887f', desc: 'Builds with your infrastructure spending and urbanisation.' },
  { id: 'retail', label: 'Retail & consumer services', icon: '🛍', group: 'services', tradable: false, va: 0.7, elasticity: 1.0, tier: 0, req: {}, pollution: 0.1, color: '#ba68c8', desc: 'Shops, restaurants, personal services. Grows with incomes.' },
  { id: 'finance', label: 'Finance & banking', icon: '🏦', group: 'services', tradable: true, va: 2.6, elasticity: 1.4, tier: 3, req: { gdppc: 22000, inst: 60 }, pollution: 0.05, color: '#ffc107', desc: 'Banking, insurance, capital markets. Needs trusted institutions and open capital.' },
  { id: 'software', label: 'Software & tech services', icon: '💻', group: 'services', tradable: true, va: 2.3, elasticity: 1.4, tier: 3, req: { hc: 55, tech: 45, infra: 50 }, pollution: 0.05, color: '#42a5f5', desc: 'Software, cloud, IT outsourcing. Needs talent and connectivity.' },
  { id: 'tourism', label: 'Tourism & hospitality', icon: '🏖', group: 'services', tradable: true, va: 0.75, elasticity: 1.3, tier: 0, req: {}, resource: 'attraction', pollution: 0.2, color: '#4dd0e1', desc: 'Hotels, resorts, heritage. Needs attractions, safety and stability.' },
  { id: 'media', label: 'Media, entertainment & culture', icon: '🎬', group: 'services', tradable: true, va: 1.5, elasticity: 1.3, tier: 2, req: { gdppc: 6000 }, pollution: 0.05, color: '#ef5350', desc: 'Film, music, games, publishing, broadcasting. The engine of cultural soft power.' },
  { id: 'logistics', label: 'Logistics & shipping', icon: '🚢', group: 'services', tradable: true, va: 1.0, elasticity: 1.0, tier: 1, req: { infra: 25 }, resource: 'coast', pollution: 0.5, color: '#78909c', desc: 'Ports, shipping, freight, warehousing. Straits and coastlines are gold.' },
]
export const SECTOR_IDS = SECTORS.map(s => s.id)
export const SECTOR_INDEX = Object.fromEntries(SECTORS.map((s, i) => [s.id, i])) as Record<SectorId, number>
export const NS = SECTORS.length

/** $B of value added per 1,000 workers per month at productivity 1 (≈ $50k per worker per year). */
export const BASE_VA = 0.0042
