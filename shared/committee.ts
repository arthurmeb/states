// The World Committee: every nation has a seat, votes are weighted by global influence, and the five
// most powerful nations sit on a security council that can veto security resolutions.

export type ResKind = 'sanctions' | 'condemn' | 'ceasefire' | 'climate' | 'devfund' | 'tradeRound' | 'declaration'
export type Vote = 'yes' | 'no' | 'abstain'
export type ResStatus = 'open' | 'passed' | 'failed' | 'vetoed' | 'ended'

export interface Speech { nation: number; name: string; user: string | null; color: string; text: string; tick: number; stance: Vote | null }

export interface Resolution {
  id: number
  kind: ResKind
  title: string
  /** the sponsor's preamble, in their own words */
  text: string
  by: number
  byName: string
  target: number | null
  targetName: string | null
  /** second party (ceasefires) */
  target2: number | null
  target2Name: string | null
  /** tariff cap for trade rounds, % */
  rate: number
  years: number
  opened: number
  closes: number
  votes: Record<number, Vote>
  /** vote weights at the close (influence), for the record */
  tally: { yes: number; no: number; abstain: number; total: number } | null
  status: ResStatus
  vetoBy: number[]
  /** in force until (binding resolutions) */
  until: number | null
  /** nations bound by an accord: the ones that voted yes */
  parties: number[]
  /** parties that broke it */
  breached: number[]
  speeches: Speech[]
}

export interface CommitteeView { council: number[]; list: Resolution[]; weights: Record<number, number> }

export interface ResDef { kind: ResKind; icon: string; label: string; desc: string; security: boolean; target: 'none' | 'one' | 'two'; binding: 'world' | 'parties' | 'none'; defaultYears: number; maxYears: number }

export const RES_DEFS: Record<ResKind, ResDef> = {
  sanctions: { kind: 'sanctions', icon: '⛔', label: 'Global sanctions', desc: 'Every nation restricts trade and finance with the target. Its growth, credit and imports suffer for as long as the sanctions last.', security: true, target: 'one', binding: 'world', defaultYears: 3, maxYears: 5 },
  condemn: { kind: 'condemn', icon: '📣', label: 'Condemnation', desc: 'A formal rebuke: the target loses legitimacy and diplomatic standing, and the world remembers.', security: true, target: 'one', binding: 'none', defaultYears: 0, maxYears: 0 },
  ceasefire: { kind: 'ceasefire', icon: '🕊', label: 'Binding ceasefire', desc: 'Orders two warring nations to stop fighting. If it passes, the war ends at once and a truce holds.', security: true, target: 'two', binding: 'world', defaultYears: 0, maxYears: 0 },
  climate: { kind: 'climate', icon: '🌱', label: 'Climate accord', desc: 'Everyone who votes yes commits to carbon pricing (at least moderate) for the duration. Walking away is a public breach.', security: false, target: 'none', binding: 'parties', defaultYears: 10, maxYears: 20 },
  devfund: { kind: 'devfund', icon: '🤝', label: 'Development fund', desc: 'Rich nations that vote yes pay 0.3% of GDP a year into a fund shared by the poorest nations, per person. Donors gain diplomatic standing.', security: false, target: 'none', binding: 'parties', defaultYears: 5, maxYears: 10 },
  tradeRound: { kind: 'tradeRound', icon: '🚢', label: 'Free trade round', desc: 'Everyone who votes yes caps all tariffs at the agreed rate (wars and sanctioned nations excepted). Raising one above the cap is a public breach.', security: false, target: 'none', binding: 'parties', defaultYears: 10, maxYears: 20 },
  declaration: { kind: 'declaration', icon: '📜', label: 'Declaration', desc: 'Anything you want the world to say. Symbolic, but passing one raises the sponsor’s standing and soft power.', security: false, target: 'none', binding: 'none', defaultYears: 0, maxYears: 0 },
}

/** Days a resolution stays open for voting. */
export const VOTE_DAYS = 30
/** Political capital it costs a player to table a resolution. */
export const TABLE_COST = 10
/** Seats on the security council. */
export const COUNCIL_SEATS = 5
/** A resolution passes when yes outweighs no and yes carries at least this share of all the world's votes. */
export const QUORUM = 0.2
