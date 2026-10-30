// Staying in power: parties, political capital and what every change costs.
// Shared so the client can show the exact cost before you click.
import { BLOCS, BUDGET, POLICY_MAP, optionMods, type BlocId, type Ideology } from './policies'
import type { Cond } from './conditions'

export interface PartyDef {
  id: string; name: string; color: string; icon: string
  /** how strongly each faction identifies with this party (0..1) */
  blocs: Partial<Record<BlocId, number>>
  ideology: Record<Ideology, number>
  pitch: string
}

const I = (o: Partial<Record<Ideology, number>>): Record<Ideology, number> =>
  ({ left: 0, right: 0, auth: 0, lib: 0, trad: 0, prog: 0, nat: 0, glob: 0, green: 0, hawk: 0, ...o })

export const PARTIES: PartyDef[] = [
  { id: 'labour', name: 'Labour', color: '#e03131', icon: '🌹', blocs: { workers: 1, progressives: 0.45, minorities: 0.4, rural: 0.15 },
    ideology: I({ left: 0.85, prog: 0.45, lib: 0.4, glob: 0.35, green: 0.35, hawk: 0.15, auth: 0.2, trad: 0.15 }), pitch: 'Jobs, wages, public services and the welfare state.' },
  { id: 'green', name: 'Greens', color: '#2f9e44', icon: '🌿', blocs: { progressives: 1, middle: 0.35, minorities: 0.3 },
    ideology: I({ left: 0.6, prog: 0.85, lib: 0.7, glob: 0.6, green: 1, hawk: 0.05 }), pitch: 'Climate, civil liberties and a fairer society.' },
  { id: 'liberal', name: 'Liberals', color: '#fab005', icon: '🕊', blocs: { middle: 1, business: 0.45, progressives: 0.4 },
    ideology: I({ right: 0.45, left: 0.25, lib: 0.9, prog: 0.55, glob: 0.85, green: 0.35, hawk: 0.2 }), pitch: 'Open markets, open society, strong institutions.' },
  { id: 'conservative', name: 'Conservatives', color: '#1c7ed6', icon: '🌳', blocs: { business: 1, religious: 0.6, rural: 0.5, middle: 0.45, military: 0.45 },
    ideology: I({ right: 0.85, trad: 0.6, nat: 0.35, glob: 0.35, hawk: 0.5, auth: 0.35, lib: 0.3 }), pitch: 'Low taxes, family, faith and a strong defence.' },
  { id: 'nationalist', name: 'National Front', color: '#5f3dc4', icon: '🦅', blocs: { rural: 0.7, religious: 0.6, military: 0.75, workers: 0.35 },
    ideology: I({ nat: 0.95, trad: 0.75, hawk: 0.8, auth: 0.65, right: 0.45, left: 0.25 }), pitch: 'Borders, sovereignty and national greatness.' },
  { id: 'regional', name: 'Regional League', color: '#ae3ec9', icon: '🗺', blocs: { minorities: 1, rural: 0.25 },
    ideology: I({ lib: 0.5, left: 0.4, glob: 0.4, prog: 0.3 }), pitch: 'Self-rule, language and a fair deal for the regions.' },
]
export const PARTY_MAP = Object.fromEntries(PARTIES.map(p => [p.id, p])) as Record<string, PartyDef>

/** Constitutions that hold elections. */
export const ELECTORAL = new Set(['democracy', 'monarchy'])

/** Political capital: the room a government has to act. */
export const PC_MAX = 100
/** Founding era: a new state's first leaders have a free hand (cost multiplier). */
export const FOUNDING_DISCOUNT = 0.3
export const FOUNDING_DAYS = 360 * 2

export interface CostCtx {
  /** faction weights (sum 1) */
  weights: Record<string, number>
  /** cost multiplier from regime, coalition and honeymoon */
  mult: number
  /** factions the governing coalition depends on; hurting them costs extra */
  base?: Partial<Record<BlocId, number>>
}

/** Weighted approval loss among factions (only losers count), in approval points. */
function backlash(from: Record<string, number>, to: Record<string, number>, cc: CostCtx) {
  let loss = 0
  for (const b of BLOCS) {
    const dlt = (to['bloc:' + b.id] ?? 0) - (from['bloc:' + b.id] ?? 0)
    if (dlt < 0) loss += -dlt * (cc.weights[b.id] ?? 0.12) * (1 + (cc.base?.[b.id] ?? 0) * 0.8)
  }
  return loss
}

/** Political capital needed to change a national policy. */
export function policyCost(id: string, from: string | number | undefined, to: string | number, c: Cond, yrsFrom: number, cc: CostCtx): number {
  const p = POLICY_MAP[id]
  if (!p || from === to) return 0
  const a = optionMods(p, from, c, yrsFrom), b = optionMods(p, to, c, 0)
  let cost = 2 + backlash(a, b, cc) * 1.3
  if (p.kind === 'slider') {
    const dv = +to - +(from ?? p.default)
    // raising taxes is harder than cutting them
    const unit = id === 'tariff' ? 0.12 : id === 'corporateTax' ? 0.2 : 0.35
    cost = 1 + Math.abs(dv) * (dv > 0 ? unit : unit * 0.4) + backlash(a, b, cc) * 0.6
  } else {
    if (p.cooldown) cost += 4
    if (id === 'government') cost += 30
    // repealing an entitlement costs more the longer people have had it
    const o = p.options.find(x => x.id === from)
    if (o?.onLeave) cost += Object.values(o.onLeave(c, yrsFrom)).reduce((s, v) => s + Math.max(0, -v), 0) * 0.15
  }
  return Math.round(cost * cc.mult * 10) / 10
}

/** Political capital needed for a budget change: cuts to popular programmes are expensive, increases are cheap. */
const CUT_PAIN: Record<string, number> = { welfare: 1.6, health: 1.6, education: 1.2, defense: 1.0, infrastructure: 0.6, security: 0.6, subsidies: 0.8 }
export function budgetCost(from: Record<string, number>, to: Record<string, number>, cc: CostCtx): number {
  let cost = 0
  for (const line of BUDGET) {
    const dv = (to[line.id] ?? from[line.id] ?? 0) - (from[line.id] ?? 0)
    if (Math.abs(dv) < 0.01) continue
    cost += dv < 0 ? -dv * (CUT_PAIN[line.id] ?? 0.4) * 2 : dv * 0.25
  }
  return Math.round(cost * cc.mult * 10) / 10
}

export const OFFICE_LABEL: Record<string, string> = { governing: 'In government', opposition: 'In opposition', exile: 'Ousted' }
