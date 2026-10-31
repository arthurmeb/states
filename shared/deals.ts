import { POLICY_MAP } from './policies'

// Deals & treaties between nations, built from enforceable clause primitives. Players can write
// anything: a model on the server compiles free text into these clauses; whatever can't be expressed
// becomes a "promise" (a public handshake the game can't enforce, but that can be visibly broken).

/** Which side of the deal a clause binds: the proposer (a) or the counterparty (b). */
export type Side = 'a' | 'b'

export type Clause =
  | { kind: 'payment'; from: Side; amount: number; monthly: boolean; months: number }
  | { kind: 'loan'; from: Side; amount: number; rate: number; years: number }
  | { kind: 'tariff'; from: Side; rate: number; years: number }
  | { kind: 'supply'; from: Side; sector: string; share: number; discount: number; years: number }
  | { kind: 'tech'; from: Side; years: number }
  | { kind: 'province'; from: Side; province: string }
  | { kind: 'policy'; from: Side; policy: string; option: string; years: number }
  | { kind: 'nonaggression'; years: number }
  | { kind: 'alliance' }
  | { kind: 'pact' }
  | { kind: 'aid'; from: Side; years: number }
  | { kind: 'peace' }
  | { kind: 'promise'; from: Side; text: string; years: number }

export type ClauseKind = Clause['kind']

export const CLAUSES: Record<ClauseKind, { icon: string; label: string; help: string }> = {
  payment: { icon: '💵', label: 'Payment', help: 'A one-off sum, or a monthly payment for a number of months ($B).' },
  loan: { icon: '🏦', label: 'Loan', help: 'Lend a sum at an interest rate, repaid monthly. Missed repayments are a public default.' },
  tariff: { icon: '🧾', label: 'Tariff deal', help: 'Cap the tariff charged on the other side’s goods.' },
  supply: { icon: '🛢', label: 'Supply contract', help: 'Deliver a share of an industry’s output at a discount, every month.' },
  tech: { icon: '🔬', label: 'Technology sharing', help: 'The less advanced side catches up 10% of the technology gap each year.' },
  province: { icon: '🗺', label: 'Hand over a province', help: 'Transfer a province, people and all. Immediate and permanent.' },
  policy: { icon: '📜', label: 'Policy commitment', help: 'Adopt (and keep) a national policy for the treaty’s length.' },
  nonaggression: { icon: '🕊', label: 'Non-aggression pact', help: 'Neither side may declare war on the other.' },
  alliance: { icon: '🤝', label: 'Alliance', help: 'A full defensive alliance.' },
  pact: { icon: '📦', label: 'Trade pact', help: 'Halve tariffs both ways and deepen trade.' },
  aid: { icon: '🎁', label: 'Development aid', help: 'Put the other side on the aid list.' },
  peace: { icon: '🏳', label: 'Peace', help: 'End the war between the two sides.' },
  promise: { icon: '🤞', label: 'Promise', help: 'Anything else. Not enforced by the game, but breaking it is public.' },
}

export type DealStatus = 'draft' | 'proposed' | 'active' | 'rejected' | 'done' | 'broken' | 'cancelled'

export interface Deal {
  id: number
  a: number; b: number
  /** party names when the deal was proposed, so it still reads after a party falls */
  names?: [string, string]
  title: string
  /** what the proposer originally wrote, if anything */
  text: string
  clauses: Clause[]
  /** model's notes about what it couldn't express precisely */
  notes: string
  status: DealStatus
  created: number; start: number | null; end: number | null
  /** loan balances etc. per clause index */
  state: Record<number, number>
  /** who broke it, and how */
  breach: { by: number; what: string } | null
}

/** Longest duration in a deal, in years (0 = immediate only). */
export const dealYears = (d: { clauses: Clause[] }) => d.clauses.reduce((m, c) => Math.max(m, 'years' in c ? c.years : 'months' in c && c.monthly ? c.months / 12 : 0), 0)

/** One-line description of a clause, from the reader's point of view. */
export function describe(c: Clause, aName: string, bName: string): string {
  const who = (s: Side) => (s === 'a' ? aName : bName), other = (s: Side) => (s === 'a' ? bName : aName)
  const yrs = (y: number) => `${y} year${y === 1 ? '' : 's'}`
  switch (c.kind) {
    case 'payment': return c.monthly ? `${who(c.from)} pays ${other(c.from)} $${c.amount}B a month for ${c.months} months` : `${who(c.from)} pays ${other(c.from)} $${c.amount}B`
    case 'loan': return `${who(c.from)} lends ${other(c.from)} $${c.amount}B at ${c.rate}% over ${yrs(c.years)}`
    case 'tariff': return `${who(c.from)} charges at most ${c.rate}% tariffs on ${other(c.from)}’s goods for ${yrs(c.years)}`
    case 'supply': return `${who(c.from)} supplies ${other(c.from)} ${Math.round(c.share * 100)}% of its ${c.sector} output at ${Math.round(c.discount * 100)}% off, for ${yrs(c.years)}`
    case 'tech': return `${who(c.from)} shares technology with ${other(c.from)} for ${yrs(c.years)}`
    case 'province': return `${who(c.from)} hands ${c.province} to ${other(c.from)}`
    case 'policy': {
      const p = POLICY_MAP[c.policy]
      const opt = p?.kind === 'choice' ? p.options.find(o => o.id === c.option)?.label ?? c.option : c.option
      return `${who(c.from)} keeps ${p?.label.toLowerCase() ?? c.policy}: ${opt}, for ${yrs(c.years)}`
    }
    case 'nonaggression': return `Neither side declares war on the other for ${yrs(c.years)}`
    case 'alliance': return `${aName} and ${bName} become allies`
    case 'pact': return `${aName} and ${bName} sign a trade pact`
    case 'aid': return `${who(c.from)} sends development aid to ${other(c.from)} for ${yrs(c.years)}`
    case 'peace': return `${aName} and ${bName} make peace`
    case 'promise': return `${who(c.from)} promises: “${c.text}”${c.years ? ` (${yrs(c.years)})` : ''}`
  }
}
