import type { LogEntry, Risk } from '../../shared/types'
import type { Cond } from '../../shared/conditions'
import type { Tracker } from './trajectory'
import type { SectorId } from '../../shared/sectors'
import type { BlocId, Ideology, LocalPolicyId, Mods } from '../../shared/policies'
import type { Budget, Issue, Ledger, PolicyValues } from '../../shared/types'

export interface Prov {
  owner: number
  /** nation whose heartland this is (cohesion); -1 none */
  core: number
  pop: number
  urban: number
  lfp: number
  tfp: number
  infra: number; edu: number; health: number; safety: number; housing: number; pollution: number
  jobs: number[]
  output: number[]
  gdp: number
  unemployment: number
  happiness: number
  unrest: number
  garrison: number
  occupiedUntil: number
  /** tick when the current owner took it */
  since: number
  policy: Record<LocalPolicyId, string>
  projects: { id: string; progress: number; done: boolean }[]
  /** remaining share of the original oil and mineral reserves (depletes with extraction) */
  res?: { oil: number; metals: number }
}

/** Age structure (population shares) and vital rates (per year). */
export interface Demo {
  young: number; prime: number; mature: number; old: number
  /** working-age share and old share at founding (labour force and health costs are scaled relative to these) */
  w0: number; old0: number
  births: number; deaths: number; mig: number
  /** pensions, % of GDP */
  pensions: number
}

/** Private credit cycle, crises, sovereign wealth. */
export interface Fin {
  /** private credit, % of GDP, and its slow-moving trend */
  credit: number; trend: number
  /** months left of a banking crisis, and how deep it cut */
  crisis: number; depth: number
  /** demand multiplier on output from the credit cycle (1 = neutral) */
  cycle: number
  /** sovereign wealth fund, $B */
  fund: number
  /** months of a currency crisis left */
  fx: number
  /** months the fiscal rule has been broken in a row */
  breach: number
  /** probability (per year) of a banking crisis, for the UI */
  risk: number
  lastCrisis: number
}

export interface Power {
  /** political capital 0-100 */
  pc: number
  /** for players: governing, in opposition after an election defeat, or ousted by a coup */
  office: 'governing' | 'opposition' | 'exile'
  /** the player's own party (archetype) and its name */
  party: string; partyName: string
  /** the party (archetype) currently governing, and its coalition partners */
  govParty: string; coalition: string[]
  /** latest poll: vote share and seat share per party (0-100) */
  votes: Record<string, number>; seats: Record<string, number>
  lastElection: number; terms: number; honeymoonUntil: number
  /** campaign effort: extra pull per party per faction (decays) */
  campaign: Record<string, Partial<Record<BlocId, number>>>
  /** monthly probabilities, for the UI */
  coupRisk: number; revoRisk: number
  /** temporary protection after purging the officer corps */
  coupShield: number
  history: { tick: number; votes: Record<string, number>; seats: Record<string, number>; gov: string; coalition: string[] }[]
  /** tick the current government came to power */
  since: number
}

export interface Stocks {
  /** human capital 0-100 (pop-weighted avg of provinces) */
  hc: number; health: number; infra: number
  tech: number; inst: number; corruption: number; cohesion: number
  culture: number; sports: number; brand: number; diplomacy: number
  milTech: number; navy: number; air: number
  renewables: number; pollution: number
  fertility: number
}

export interface AIBrain {
  ideology: Record<Ideology, number>
  aggression: number
  ambition: number
  strategy: string
  nextReview: number
  grievances: Record<number, number>
  /** Hand-written rival: strategy never changes. */
  locked?: string
  persona?: string
}

export interface Nation {
  id: number; name: string; leader: string; motto: string; color: string
  ai: boolean; token: string | null; capital: number; founded: number; alive: boolean; iso3: string
  policy: PolicyValues
  budget: Budget
  subsidies: SectorId[]
  cooldowns: Record<string, number>
  treasury: number
  stocks: Stocks
  /** calibration offsets so founding values match real-world data; decay over decades */
  stockOff: Record<string, number>
  /** real-world reference values at founding (not decaying) */
  ref: Record<string, number>
  baseU: number; baseRenewables: number
  inflation: number; interest: number; unemployment: number
  blocs: Record<BlocId, number>
  blocWeights: Record<BlocId, number>
  stability: number; legitimacy: number
  reserve: number; manpower: number; manpowerCap: number; quality: number; warWeariness: number
  wars: number[]; allies: number[]; pacts: number[]; truces: Record<number, number>
  embargoes: number[]; sanctions: number[]; tariffs: Record<number, number>; blockades: number[]; aidTargets: number[]
  tradeBloc: number | null
  protectedUntil: number
  nextElection: number | null
  idx: Record<string, number>
  history: { t: number[]; series: Record<string, number[]> }
  log: LogEntry[]
  tracker?: Tracker
  /** the nation's situation (drives context-dependent policy effects) */
  cond: Cond
  /** tick each policy took its current value, and that value (to detect changes from any source) */
  since: Record<string, number>
  sinceVal: Record<string, string | number>
  /** save migrated to the v3 simulation */
  v3?: boolean
  demo: Demo
  fin: Fin
  power: Power
  /** causal decomposition of key outcomes: [label, contribution] */
  drivers: Record<string, [string, number][]>
  /** largest policy contributions to each modifier */
  modSrc: Record<string, [string, number][]>
  risks: Risk[]
  gdpMonthly: number[]
  ledger: Ledger
  mods: Mods
  brain: AIBrain | null
  issue: (Issue & { key: string }) | null
  nextIssue: number
  /** last tick each issue was raised (urgent crises repeat at most every few years) */
  issueSeen?: Record<string, number>
  // derived each tick
  gdp: number; gdpReal: number; pop: number; provinces: number; troops: number; casualties: number
  sectorOut: number[]; sectorJobs: number[]; exports: number[]; imports: number[]
  aidReceived: number; tariffRevenue: number; shortage: number
  projectNational: Record<string, number>
}

export const HISTORY_KEYS = ['pc', 'poll', 'old', 'privateCredit', 'pensions', 'gdp', 'gdppc', 'growth', 'inflation', 'unemployment', 'debt', 'hdi', 'happiness', 'approval', 'stability', 'softPower', 'military', 'cnp', 'influence', 'gini', 'education', 'lifeExp', 'democracy',
  'deficit', 'revenue', 'exports', 'complexity', 'competitiveness', 'innovation', 'fdi', 'credit', 'poverty', 'safety', 'cpi', 'freedom', 'renewables', 'airQuality', 'health', 'infrastructure']
