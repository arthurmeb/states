import type { Terrain } from './types'

export const TERRAIN: Record<Terrain, { label: string; food: number; defense: number; prod: number; color: string }> = {
  plains: { label: 'Temperate plains', food: 1.0, defense: 1.0, prod: 1.0, color: '#9bbf6a' },
  farmland: { label: 'Fertile farmland', food: 1.7, defense: 0.9, prod: 1.0, color: '#5fae3e' },
  boreal: { label: 'Boreal forest', food: 0.35, defense: 1.3, prod: 0.8, color: '#2f6b4f' },
  tundra: { label: 'Tundra', food: 0.1, defense: 1.2, prod: 0.6, color: '#a7b6b8' },
  ice: { label: 'Ice sheet', food: 0, defense: 1.5, prod: 0.3, color: '#e8f1f5' },
  desert: { label: 'Desert', food: 0.12, defense: 1.15, prod: 0.8, color: '#e2c27a' },
  arid: { label: 'Arid steppe', food: 0.45, defense: 1.05, prod: 0.9, color: '#c9b27a' },
  savanna: { label: 'Savanna', food: 0.9, defense: 1.0, prod: 0.85, color: '#c6c25a' },
  jungle: { label: 'Rainforest', food: 0.6, defense: 1.5, prod: 0.75, color: '#1f8a4c' },
  mountains: { label: 'Mountains', food: 0.35, defense: 1.8, prod: 0.8, color: '#8a7a6a' },
}

// ───────── clock ─────────
// One tick = one game day. A game month is 30 days, a year 360 days.
export const DAYS_PER_MONTH = 30
export const DAYS_PER_YEAR = 360
export const START_YEAR = 2030
/** default real-time length of one game month (1 hour) */
export const DEFAULT_MONTH_MS = 3_600_000

export const PROTECTION_DAYS = 360 * 3
export const TRUCE_DAYS = 360
export const ELECTION_MONTHS = 48

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function dateOf(tick: number, withDay = true) {
  const y = START_YEAR + Math.floor(tick / DAYS_PER_YEAR)
  const m = Math.floor((tick % DAYS_PER_YEAR) / DAYS_PER_MONTH)
  const d = (tick % DAYS_PER_MONTH) + 1
  return withDay ? `${d} ${MONTHS[m]} ${y}` : `${MONTHS[m]} ${y}`
}
export const monthOf = (tick: number) => Math.floor(tick / DAYS_PER_MONTH)

/** Cost in $B to annex an unclaimed province. */
export function claimCost(ownedCount: number, pop: number) {
  return +((3 + ownedCount * 0.8 + pop / 1000) * (1 + ownedCount * 0.05)).toFixed(1)
}

export const GOV_LABEL: Record<string, string> = {
  democracy: 'Liberal democracy', monarchy: 'Constitutional monarchy', technocracy: 'Technocracy',
  oneparty: 'One-party state', junta: 'Military junta', theocracy: 'Theocracy',
}
export const DEMOCRATIC = new Set(['democracy', 'monarchy'])

export const STRATEGIES: Record<string, { label: string; desc: string }> = {
  rentier: { label: 'Resource rentier', desc: 'Pump oil and ore, fund the state from rents.' },
  exportMfg: { label: 'Export manufacturing', desc: 'Cheap labour, industrial zones, open trade.' },
  knowledge: { label: 'Knowledge economy', desc: 'Universities, R&D, tech parks.' },
  welfare: { label: 'Welfare state', desc: 'High taxes, universal services, social peace.' },
  militarist: { label: 'Military power', desc: 'Armies, arms industry, expansion.' },
  tourism: { label: 'Tourism & culture hub', desc: 'Resorts, heritage, open visas.' },
  agrarian: { label: 'Agrarian development', desc: 'Feed the nation first, modernise farms.' },
  finance: { label: 'Financial centre', desc: 'Low taxes, strong institutions, capital flows.' },
  player: { label: 'Player-led', desc: '' },
}
