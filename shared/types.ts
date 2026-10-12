import type { SectorId } from './sectors'
import type { BlocId, LocalPolicyId, Ideology } from './policies'

export type Terrain = 'plains' | 'farmland' | 'boreal' | 'tundra' | 'ice' | 'desert' | 'arid' | 'savanna' | 'jungle' | 'mountains'

export interface ProvinceStatic {
  id: number
  h3: string
  lat: number
  lon: number
  area: number
  name: string
  region: string
  culture: string
  terrain: Terrain
  coastal: boolean
  strait: string | null
  oil: number
  metals: number
  fertility: number
  attraction: number
  iso3: string
  pop: number
  cities: number[]
  nb: number[]
  sea: number[]
  ring: [number, number][]
}

export interface City { id: number; name: string; lat: number; lon: number; pop: number; capital: boolean; iso3: string; province: number }
export interface CountryData { iso3: string; name: string; region: string; income: string; imputed: string[]; estimated: boolean; data: Record<string, number> }

export type PolicyValues = Record<string, string | number>
export type Budget = Record<string, number>
export type Indices = Record<string, number>

export interface NationPublic {
  id: number
  name: string
  leader: string
  motto: string
  color: string
  ai: boolean
  online: boolean
  capital: number
  founded: number
  provinces: number
  pop: number
  gdp: number
  troops: number
  gov: string
  strategy: string
  wars: number[]
  allies: number[]
  pacts: number[]
  embargoes: number[]
  sanctions: number[]
  bloc: number | null
  protectedUntil: number
  idx: Indices
}

export interface Ledger {
  revenue: Record<string, number>
  spending: Record<string, number>
  net: number
}

export interface PartnerRow { id: number; exports: number; imports: number; tariffOut: number; tariffIn: number; influenceOver: number; influenceBy: number; attitude: number }

export interface NationPrivate extends NationPublic {
  treasury: number
  policy: PolicyValues
  budget: Budget
  subsidies: SectorId[]
  cooldowns: Record<string, number>
  tariffs: Record<number, number>
  aidTargets: number[]
  blockades: number[]
  blocs: Record<BlocId, number>
  blocWeights: Record<BlocId, number>
  stocks: Record<string, number>
  reserve: number
  manpower: number
  manpowerCap: number
  quality: number
  warWeariness: number
  ledger: Ledger
  sectors: { output: number[]; jobs: number[]; exports: number[]; imports: number[] }
  partners: PartnerRow[]
  history: { t: number[]; series: Record<string, number[]> }
  mods: Record<string, number>
  nextElection: number | null
  ideology?: Record<Ideology, number>
}

export interface ProvinceDetail {
  id: number
  owner: number
  pop: number
  urban: number
  gdp: number
  gdppc: number
  unemployment: number
  happiness: number
  unrest: number
  garrison: number
  stocks: { infra: number; edu: number; health: number; safety: number; housing: number; pollution: number }
  jobs: number[]
  output: number[]
  policy: Record<LocalPolicyId, string>
  projects: { id: string; progress: number; done: boolean }[]
  core: number
  occupied: boolean
  baseline: string
}

export interface Issue { id: string; title: string; text: string; options: { label: string; desc: string }[]; expires: number; province?: number }

export type ProposalKind = 'peace' | 'alliance' | 'pact' | 'bloc'
export interface Proposal { id: number; from: number; to: number; kind: ProposalKind; tick: number; bloc?: number }

export interface Battle { id: number; attacker: number; defender: number; from: number; to: number; troops: number; sea: boolean; start: number; arrive: number }
export interface BattleResult { from: number; to: number; attacker: number; defender: number; won: boolean; tick: number }

export type NewsKind = 'war' | 'peace' | 'found' | 'capture' | 'revolt' | 'event' | 'diplo' | 'fall' | 'market' | 'trade' | 'election' | 'games' | 'disaster' | 'build'
export interface News { tick: number; kind: NewsKind; text: string; nations?: number[]; province?: number }
export interface ChatMsg { tick: number; from: string; color: string; text: string }

export interface TradeBloc { id: number; name: string; color: string; founder: number; members: number[]; cet: number }
export interface GamesState { edition: number; nextTick: number; host: number | null; hostCity: string | null; bidsOpen: boolean; bids: { nation: number; amount: number }[]; lastHost: number | null; lastMedals: { nation: number; gold: number; total: number }[] }

export interface MarketState { prices: number[]; oilShock: string[] }

export interface LogEntry { t: number; kind: 'policy' | 'budget' | 'gov' | 'strategy' | 'local' | 'build' | 'war' | 'diplo' | 'territory'; text: string }
export interface Trajectory { nation: number; history: { t: number[]; series: Record<string, number[]> }; log: LogEntry[] }

export interface StateMsg {
  t: 'state'
  tick: number
  dayMs: number
  /** Dev fast-forward multiplier; canSpeed is true when the server allows changing it. */
  speed: number
  canSpeed: boolean
  market: MarketState
  prov: { owner: number[]; pop: number[]; garrison: number[]; unrest: number[]; gdppc: number[]; top: number[]; dev: number[]; build: number[] }
  nations: NationPublic[]
  tradeBlocs: TradeBloc[]
  trade: [number, number, number][]
  battles: Battle[]
  results: BattleResult[]
  news: News[]
  games: GamesState
  me: NationPrivate | null
  myProvinces: ProvinceDetail[]
  proposals: Proposal[]
  issue: Issue | null
}

export type ClientMsg =
  | { t: 'hello'; token: string }
  | { t: 'trajectory'; nation: number }
  | { t: 'speed'; x: number }
  | { t: 'found'; province: number; name: string; leader: string; color: string; motto: string }
  | { t: 'policy'; id: string; value: string | number }
  | { t: 'budget'; budget: Budget }
  | { t: 'subsidies'; sectors: SectorId[] }
  | { t: 'local'; province: number; id: LocalPolicyId; value: string }
  | { t: 'build'; province: number; project: string }
  | { t: 'claim'; province: number }
  | { t: 'deploy'; province: number; amount: number }
  | { t: 'autodeploy' }
  | { t: 'attack'; target: number; amount: number }
  | { t: 'declare'; nation: number }
  | { t: 'propose'; nation: number; kind: ProposalKind }
  | { t: 'respond'; proposal: number; accept: boolean }
  | { t: 'cancel'; nation: number; kind: 'alliance' | 'pact' }
  | { t: 'tariff'; nation: number; rate: number | null }
  | { t: 'embargo'; nation: number; on: boolean }
  | { t: 'sanction'; nation: number; on: boolean }
  | { t: 'blockade'; nation: number; on: boolean }
  | { t: 'aid'; nation: number; on: boolean }
  | { t: 'createBloc'; name: string; cet: number }
  | { t: 'inviteBloc'; nation: number }
  | { t: 'leaveBloc' }
  | { t: 'bid'; amount: number }
  | { t: 'issue'; option: number }
  | { t: 'chat'; text: string }
  | { t: 'capital'; province: number }
  | { t: 'inspect'; province: number }
  | { t: 'abandon' }

export type ServerMsg =
  | StateMsg
  | { t: 'trajectory'; data: Trajectory }
  | { t: 'welcome'; token: string; nation: number | null; chat: ChatMsg[] }
  | { t: 'error'; msg: string }
  | { t: 'toast'; msg: string }
  | { t: 'chat'; msg: ChatMsg }
  | { t: 'province'; detail: ProvinceDetail }
