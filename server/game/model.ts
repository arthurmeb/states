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
  gdpMonthly: number[]
  ledger: Ledger
  mods: Mods
  brain: AIBrain | null
  issue: (Issue & { key: string }) | null
  nextIssue: number
  // derived each tick
  gdp: number; gdpReal: number; pop: number; provinces: number; troops: number; casualties: number
  sectorOut: number[]; sectorJobs: number[]; exports: number[]; imports: number[]
  aidReceived: number; tariffRevenue: number; shortage: number
  projectNational: Record<string, number>
}

export const HISTORY_KEYS = ['gdp', 'gdppc', 'growth', 'inflation', 'unemployment', 'debt', 'hdi', 'happiness', 'approval', 'stability', 'softPower', 'military', 'cnp', 'influence', 'gini', 'education', 'lifeExp', 'democracy']
