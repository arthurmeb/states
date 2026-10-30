// Every national policy is data. Each option has:
//   mods    – fixed modifiers, summed every day
//   ctx     – situational modifiers: the same law works differently in a poor or rich, young or ageing,
//             indebted, resource-rich, unequal or divided nation, and many effects grow (or decay) the
//             longer a policy stays in force (`yrs`)
//   note    – a one-line explanation of how it plays out *here, now* (shown in the UI)
//   onLeave – the one-off backlash for repealing an entitlement people have come to rely on
// Mod keys are documented in MOD_KEYS. Bloc approvals use `bloc:<id>`, sector attractiveness `sector:<id>`.
import { type Cond, ramp } from './conditions'

export type Mods = Record<string, number>
type Ctx = (c: Cond, yrs: number) => Mods
type Note = (c: Cond, yrs: number) => string | null
type Leave = (c: Cond, yrs: number) => Record<string, number>

export const MOD_KEYS: Record<string, string> = {
  growth: 'Annual productivity growth (percentage points)', productivity: 'Productivity multiplier', fdi: 'Foreign investment attractiveness',
  inflation: 'Inflation (pp)', unemployment: 'Structural unemployment (pp)', laborPart: 'Labour force participation', bizEase: 'Ease of doing business',
  taxEff: 'Tax collection efficiency', tradeOpen: 'Trade openness', capitalFlow: 'Capital mobility', innovation: 'Innovation', stateShare: 'State share of resource rents',
  gini: 'Inequality (Gini points)', poverty: 'Poverty', happiness: 'Happiness', health: 'Health system quality', eduQuality: 'Education quality',
  safety: 'Public safety', lifeExp: 'Life expectancy (years)', cohesion: 'Social cohesion', genderEq: 'Gender equality', fertility: 'Fertility', migration: 'Migration attractiveness',
  housing: 'Housing affordability', mobility: 'Social mobility', corruption: 'Corruption', institutions: 'Institutional quality', freedom: 'Civil liberties',
  press: 'Press freedom', democracy: 'Democratic quality', stability: 'Political stability', legitimacy: 'Regime legitimacy', surveillance: 'State surveillance',
  pollution: 'Pollution', renewables: 'Renewable energy share', culture: 'Cultural soft power', brand: 'Business & brand soft power', tourism: 'Tourism appeal',
  values: 'Values & governance soft power', sports: 'Sports soft power', diplomacy: 'Diplomatic soft power', students: 'International education',
  military: 'Military quality', manpower: 'Recruitable manpower', navy: 'Naval strength growth', air: 'Air power growth',
  spend: 'Mandatory programme spending (% of GDP)', credit: 'Private credit growth (pp of GDP a year)', crisisRisk: 'Banking-crisis risk',
  pension: 'Pension cost multiplier', pc: 'Political capital per month', coupProof: 'Coup-proofing', shortage: 'Shortages',
  deterrence: 'Strategic deterrence', adapt: 'Climate adaptation', retrain: 'Workforce adaptability to automation', urbanization: 'Urbanisation speed',
}

export const BLOCS = [
  { id: 'workers', label: 'Workers & unions', icon: '👷' },
  { id: 'business', label: 'Business & capital', icon: '💼' },
  { id: 'middle', label: 'Urban middle class', icon: '🏙' },
  { id: 'rural', label: 'Farmers & rural', icon: '🚜' },
  { id: 'religious', label: 'Religious & traditional', icon: '⛪' },
  { id: 'progressives', label: 'Youth & progressives', icon: '✊' },
  { id: 'military', label: 'Armed forces', icon: '🎖' },
  { id: 'minorities', label: 'Minorities & regions', icon: '🗺' },
] as const
export type BlocId = (typeof BLOCS)[number]['id']

export interface PolicyOption { id: string; label: string; desc: string; mods: Mods; ctx?: Ctx; note?: Note; onLeave?: Leave }
export interface ChoicePolicy { kind: 'choice'; id: string; category: PolicyCategory; label: string; desc: string; options: PolicyOption[]; default: string; cooldown?: number; ai?: Partial<Record<Ideology, string>>; isNew?: boolean }
export interface SliderPolicy {
  kind: 'slider'; id: string; category: PolicyCategory; label: string; desc: string; min: number; max: number; step: number; default: number; unit: string
  mods: (v: number) => Mods
  ctx?: (v: number, c: Cond, yrs: number) => Mods
  note?: (v: number, c: Cond, yrs: number) => string | null
}
export type PolicyDef = ChoicePolicy | SliderPolicy
export type PolicyCategory = 'economy' | 'welfare' | 'society' | 'governance' | 'environment' | 'defense' | 'culture'
export type Ideology = 'left' | 'right' | 'auth' | 'lib' | 'trad' | 'prog' | 'nat' | 'glob' | 'green' | 'hawk'

export const POLICY_CATEGORIES: { id: PolicyCategory; label: string; icon: string }[] = [
  { id: 'economy', label: 'Economy & fiscal', icon: '📈' }, { id: 'welfare', label: 'Welfare & public services', icon: '🏥' },
  { id: 'society', label: 'Society & rights', icon: '⚖' }, { id: 'governance', label: 'Governance & civil liberties', icon: '🏛' },
  { id: 'environment', label: 'Environment & energy', icon: '🌱' }, { id: 'defense', label: 'Defence', icon: '🛡' },
  { id: 'culture', label: 'Culture & soft power', icon: '🎭' },
]

const d = (v: number, base: number) => v - base
const yrsOf = (y: number) => Math.round(y)
const cap = (y: number, m: number) => Math.min(y, m)

export const POLICIES: PolicyDef[] = [
  // ───────── economy ─────────
  { kind: 'slider', id: 'incomeTax', category: 'economy', label: 'Income tax (top rate)', desc: 'Progressive taxation of wages. Funds the state; erodes middle-class goodwill and work incentives.', min: 0, max: 70, step: 1, default: 30, unit: '%',
    mods: v => ({ gini: -d(v, 30) * 0.12, happiness: -d(v, 30) * 0.06, laborPart: -d(v, 30) * 0.0008, 'bloc:middle': -d(v, 30) * 0.5, 'bloc:business': -d(v, 30) * 0.25, 'bloc:workers': d(v, 30) * 0.15, migration: -d(v, 30) * 0.15 }),
    ctx: (v, c) => ({ taxEff: v > 35 ? -(v - 35) * 0.003 * (1 - c.inst / 100) : 0, migration: v > 40 ? -(v - 40) * 0.25 * c.hc / 60 : 0 }),
    note: (v, c) => v > 45 && c.hc > 55 ? 'Top rates this high push your skilled professionals abroad.' : v > 35 && c.inst < 40 ? 'Weak institutions: much of this tax is simply evaded.' : null },
  { kind: 'slider', id: 'corporateTax', category: 'economy', label: 'Corporate tax', desc: 'Taxes on company profits. Low rates attract multinationals; high rates fund welfare.', min: 0, max: 50, step: 1, default: 22, unit: '%',
    mods: v => ({ fdi: -d(v, 22) * 0.025, growth: -d(v, 22) * 0.02, gini: -d(v, 22) * 0.05, 'bloc:business': -d(v, 22) * 0.7, 'bloc:workers': d(v, 22) * 0.15, 'sector:finance': -d(v, 22) * 0.01 }),
    ctx: (v, c) => ({ fdi: -d(v, 22) * 0.012 * ramp(c.openness, 20, 60) }),
    note: (v, c) => c.openness > 50 && Math.abs(v - 22) > 5 ? 'Your open economy makes capital mobile: the rate matters more than usual.' : null },
  { kind: 'slider', id: 'vat', category: 'economy', label: 'Sales tax / VAT', desc: 'Broad consumption tax. Efficient to collect, but regressive.', min: 0, max: 30, step: 1, default: 12, unit: '%',
    mods: v => ({ gini: d(v, 12) * 0.1, happiness: -d(v, 12) * 0.08, inflation: d(v, 12) * 0.03, 'bloc:workers': -d(v, 12) * 0.35, 'bloc:rural': -d(v, 12) * 0.2, 'sector:retail': -d(v, 12) * 0.008 }),
    ctx: (v, c) => ({ poverty: Math.max(0, d(v, 12)) * 0.25 * (1 - c.dev), taxEff: v > 15 ? -(v - 15) * 0.002 * ramp(60 - c.inst, 0, 30) : 0 }),
    note: (v, c) => v > 15 && c.dev < 0.4 ? 'In a poor, informal economy high VAT hits the poorest and drives trade off the books.' : null },
  { kind: 'slider', id: 'tariff', category: 'economy', label: 'General import tariff', desc: 'Baseline tariff on all imports (bilateral overrides in Trade). Protects domestic industry, raises prices, invites retaliation.', min: 0, max: 80, step: 1, default: 5, unit: '%',
    mods: v => ({ tradeOpen: -d(v, 5) * 0.012, inflation: d(v, 5) * 0.03, productivity: -d(v, 5) * 0.0015, 'bloc:workers': Math.min(d(v, 5), 25) * 0.25, 'bloc:rural': Math.min(d(v, 5), 25) * 0.2, 'bloc:business': -d(v, 5) * 0.25, 'sector:light': d(v, 5) * 0.005, 'sector:heavy': d(v, 5) * 0.006, 'sector:auto': d(v, 5) * 0.004, 'sector:agriculture': d(v, 5) * 0.004 }),
    ctx: (v, c, yrs) => {
      const t = Math.max(0, v - 5), infant = ramp(0.55 - c.dev, 0, 0.3), fade = 1 - ramp(yrs, 8, 18)
      return { growth: Math.min(t, 30) * 0.02 * infant * fade - t * 0.004 * c.dev, productivity: -t * 0.0005 * ramp(yrs, 6, 20), corruption: t * 0.08 * ramp(yrs, 4, 14), 'sector:light': t * 0.004 * infant }
    },
    note: (v, c, yrs) => v <= 12 ? null : yrs >= 10 ? `Protected for ${yrsOf(yrs)} years: sheltered firms have grown lazy and politically connected.` : c.dev < 0.4 ? 'Infant-industry protection: helps young manufacturers grow, but the benefit fades after ~10 years.' : c.dev > 0.7 ? 'At the technology frontier, tariffs mostly raise costs.' : null },
  { kind: 'choice', id: 'economicSystem', category: 'economy', label: 'Economic system', desc: 'Who owns the commanding heights.', default: 'social', cooldown: 24, ai: { right: 'free', left: 'social', auth: 'statecap' }, options: [
    { id: 'free', label: 'Free market', desc: 'Minimal state ownership, privatised utilities.', mods: { growth: 0.25, bizEase: 12, fdi: 0.2, gini: 4, stateShare: -0.15, 'bloc:business': 15, 'bloc:workers': -10, 'bloc:progressives': -4, corruption: -2 },
      ctx: c => { const weak = ramp(45 - c.inst, 0, 25); return { growth: 0.25 * ramp(c.inst, 30, 70) - 0.35 * weak, corruption: 10 * weak, gini: 6 * weak } },
      note: c => c.inst < 40 ? 'Weak institutions: privatisation hands the state’s assets to oligarchs.' : null },
    { id: 'social', label: 'Social market', desc: 'Markets with strong regulation and safety nets.', mods: { gini: -2, happiness: 2, 'bloc:middle': 5, 'bloc:workers': 4 },
      ctx: c => ({ happiness: 2 * ramp(c.inst, 40, 75), growth: -0.25 * ramp(c.debt, 90, 140) }),
      note: c => c.debt > 100 ? 'Your debt load makes the social model hard to finance.' : null },
    { id: 'statecap', label: 'State capitalism', desc: 'National champions and state-owned giants.', mods: { stateShare: 0.25, corruption: 6, fdi: -0.1, 'bloc:business': -5, 'bloc:military': 4, 'sector:heavy': 0.15, 'sector:energy': 0.1, brand: -3 },
      ctx: (c, yrs) => ({ growth: 0.6 * ramp(0.62 - c.dev, 0, 0.3) - 0.5 * ramp(c.dev, 0.62, 0.85), corruption: 0.25 * cap(yrs, 24), productivity: -0.0015 * cap(yrs, 20) }),
      note: (c, yrs) => c.dev > 0.65 ? 'At high income, national champions crowd out the innovators you now need.' : c.dev < 0.5 ? 'State-led catch-up works while you are copying proven technology.' : yrs > 12 ? 'Decades of state ownership breed cronyism.' : null },
    { id: 'planned', label: 'Planned economy', desc: 'Central planning and collective ownership.', mods: { growth: -1.0, stateShare: 0.5, corruption: 10, gini: -10, unemployment: -3, bizEase: -30, fdi: -0.6, innovation: -15, 'bloc:business': -40, 'bloc:workers': 8, 'bloc:middle': -15, happiness: -5 },
      ctx: (c, yrs) => ({ growth: -0.6 * c.complexity / 60, shortage: 0.05 * cap(yrs, 10), happiness: -0.15 * cap(yrs, 20) }),
      note: () => 'Shortages build up the longer planners set prices, and the more complex the economy.' },
  ] },
  { kind: 'choice', id: 'labor', category: 'economy', label: 'Labour regulation', desc: 'Hiring, firing, working hours and union power.', default: 'balanced', ai: { right: 'flexible', left: 'protective' }, options: [
    { id: 'flexible', label: 'Flexible', desc: 'Hire and fire at will.', mods: { unemployment: -1.2, bizEase: 10, gini: 3, happiness: -2, 'bloc:business': 12, 'bloc:workers': -15, 'sector:light': 0.1 },
      ctx: c => ({ unemployment: -0.08 * Math.max(0, c.unemployment - 5), gini: 3 * c.automation }),
      note: c => c.unemployment > 9 ? 'With unemployment this high, easier hiring brings people back to work fast.' : null },
    { id: 'balanced', label: 'Balanced', desc: 'Standard protections.', mods: {} },
    { id: 'protective', label: 'Protective', desc: 'Strong job security, short working weeks.', mods: { unemployment: 1.5, bizEase: -10, gini: -3, happiness: 3, 'bloc:workers': 15, 'bloc:business': -14, productivity: -0.02 },
      ctx: (c, yrs) => ({ unemployment: 12 * Math.max(0, c.young - 0.18), productivity: -0.0015 * cap(yrs, 15) }),
      note: c => c.young > 0.24 ? 'Insiders keep their jobs; your many young job-seekers can’t get one.' : null },
    { id: 'codetermination', label: 'Co-determination', desc: 'Workers sit on company boards.', mods: { unemployment: 0.3, gini: -4, 'bloc:workers': 18, 'bloc:business': -8, cohesion: 4 },
      ctx: c => ({ productivity: 0.02 * ramp(c.hc, 50, 80) - 0.02 * ramp(50 - c.hc, 0, 20) }),
      note: c => c.hc < 45 ? 'Works best with a skilled, educated workforce.' : null },
  ] },
  { kind: 'choice', id: 'minWage', category: 'economy', label: 'Minimum wage', desc: 'A floor under pay.', default: 'moderate', ai: { right: 'none', left: 'living' }, options: [
    { id: 'none', label: 'None', desc: 'Market wages.', mods: { unemployment: -0.8, poverty: 4, gini: 3, 'bloc:workers': -12, 'bloc:business': 8, 'sector:light': 0.12 },
      ctx: c => ({ poverty: 0.1 * Math.max(0, c.gini - 35), 'bloc:workers': -0.4 * Math.max(0, c.inflation - 5) }),
      note: c => c.inflation > 7 ? 'With prices rising this fast, unprotected wages are collapsing in real terms.' : null },
    { id: 'low', label: 'Low', desc: 'Symbolic floor.', mods: { unemployment: -0.3, poverty: 1, 'bloc:business': 3, 'bloc:workers': -3 } },
    { id: 'moderate', label: 'Moderate', desc: '≈45% of median wage.', mods: {} },
    { id: 'living', label: 'Living wage', desc: '≈60% of median wage.', mods: { unemployment: 1.2, poverty: -4, gini: -2.5, happiness: 2, 'bloc:workers': 12, 'bloc:business': -9, 'sector:light': -0.15 },
      ctx: c => ({ unemployment: 2.5 * ramp(0.55 - c.dev, 0, 0.3) - 0.6 * ramp(c.dev, 0.7, 0.9) }),
      note: c => c.dev < 0.45 ? 'In a poor economy most work is informal: a high floor destroys formal jobs.' : c.dev > 0.75 ? 'Productive firms absorb it easily.' : null },
  ] },
  { kind: 'choice', id: 'centralBank', category: 'economy', label: 'Central bank', desc: 'Who sets interest rates.', default: 'independent', options: [
    { id: 'independent', label: 'Independent', desc: 'Targets 2% inflation. Credible.', mods: { inflation: -1, fdi: 0.1, institutions: 3, 'bloc:business': 4 },
      ctx: c => ({ inflation: 0.9 * ramp(40 - c.inst, 0, 25) }),
      note: c => c.inst < 35 ? 'Markets doubt the bank’s independence while institutions are this weak.' : null },
    { id: 'coordinated', label: 'Coordinated', desc: 'Balances growth and prices with the government.', mods: { inflation: 0.8, growth: 0.1 } },
    { id: 'political', label: 'Political', desc: 'Prints money when the government needs it.', mods: { inflation: 4, growth: 0.2, fdi: -0.25, institutions: -5, 'bloc:business': -8, 'bloc:workers': 3, credit: 2 },
      ctx: (c, yrs) => ({ inflation: 0.35 * cap(yrs, 12) * (0.5 + ramp(c.debt, 40, 120)), growth: -0.25 * ramp(yrs, 2, 6) }),
      note: (c, yrs) => yrs > 2 ? `After ${yrsOf(yrs)} years of printing, inflation expectations are de-anchoring.` : 'The boost comes first; the inflation follows.' },
  ] },
  { kind: 'choice', id: 'fdiPolicy', category: 'economy', label: 'Foreign investment', desc: 'Openness to foreign capital and ownership.', default: 'open', ai: { nat: 'restricted', glob: 'incentives' }, options: [
    { id: 'closed', label: 'Closed', desc: 'No foreign ownership.', mods: { fdi: -0.8, growth: -0.4, innovation: -8, 'bloc:workers': 4, 'bloc:religious': 3, brand: -4 },
      ctx: c => ({ innovation: -8 * c.automation, growth: -0.25 * c.automation }),
      note: c => c.automation > 0.3 ? 'The technology frontier is moving fast: closed economies fall behind faster.' : null },
    { id: 'restricted', label: 'Restricted', desc: 'Joint ventures only, strategic sectors protected.', mods: { fdi: -0.3, growth: -0.1, 'bloc:military': 2 } },
    { id: 'open', label: 'Open', desc: 'Equal treatment for foreign firms.', mods: {} },
    { id: 'incentives', label: 'Aggressive incentives', desc: 'Tax holidays and free land for multinationals.', mods: { fdi: 0.5, growth: 0.15, taxEff: -0.05, gini: 1.5, 'bloc:business': 6, 'bloc:workers': -3 },
      ctx: (c, yrs) => ({ growth: 0.3 * ramp(0.65 - c.dev, 0, 0.3), taxEff: -0.03 * ramp(yrs, 5, 15) }),
      note: c => c.dev > 0.7 ? 'Rich economies gain little from tax giveaways.' : c.dev < 0.5 ? 'Foreign factories bring technology and know-how you can’t yet build.' : null },
  ] },
  { kind: 'choice', id: 'capitalControls', category: 'economy', label: 'Capital controls', desc: 'Restrictions on money crossing borders.', default: 'open', options: [
    { id: 'open', label: 'Open capital account', desc: 'Money flows freely.', mods: { capitalFlow: 1, 'sector:finance': 0.2, inflation: 0.3, stability: -1, credit: 1.5 },
      ctx: c => ({ stability: -0.12 * Math.max(0, c.creditGap) - 3 * ramp(c.debt, 80, 140), crisisRisk: 0.3 * ramp(c.creditGap, 5, 20) }),
      note: c => c.debt > 90 || c.creditGap > 8 ? 'Hot money can flee overnight: your debt and credit boom make you vulnerable.' : null },
    { id: 'managed', label: 'Managed', desc: 'Some limits on hot money.', mods: { capitalFlow: 0.5, 'sector:finance': -0.1, credit: 0.5 } },
    { id: 'strict', label: 'Strict', desc: 'Currency controls.', mods: { capitalFlow: 0, 'sector:finance': -0.5, fdi: -0.3, corruption: 4, stability: 2, credit: -1, crisisRisk: -0.3 },
      ctx: (_c, yrs) => ({ corruption: 0.2 * cap(yrs, 15) }),
      note: (_c, yrs) => yrs > 6 ? 'Years of currency controls have built a black market.' : null },
  ] },
  { kind: 'choice', id: 'bankingReg', category: 'economy', isNew: true, label: 'Financial regulation', desc: 'How tightly banks and lending are supervised.', default: 'standard', ai: { right: 'light', left: 'strict' }, options: [
    { id: 'light', label: 'Light touch', desc: 'Cheap, abundant credit.', mods: { credit: 3, crisisRisk: 0.7, 'sector:finance': 0.2, growth: 0.1, 'bloc:business': 6, housing: -2 },
      note: c => c.creditGap > 6 ? 'Lending is already booming: light rules let the bubble grow.' : 'Fast growth now; a bigger crash when the cycle turns.' },
    { id: 'standard', label: 'Standard', desc: 'Capital requirements and stress tests.', mods: {} },
    { id: 'strict', label: 'Strict', desc: 'High capital buffers, lending caps.', mods: { credit: -2, crisisRisk: -0.6, 'sector:finance': -0.15, growth: -0.1, 'bloc:business': -4, institutions: 2, housing: 2 },
      note: c => c.creditGap < -5 ? 'Credit is already scarce: tighter rules deepen the slump.' : null },
  ] },
  { kind: 'choice', id: 'currency', category: 'economy', isNew: true, label: 'Exchange-rate regime', desc: 'Whether your currency floats or is tied to a strong anchor.', default: 'float', options: [
    { id: 'float', label: 'Free float', desc: 'The exchange rate absorbs shocks.', mods: {} },
    { id: 'managed', label: 'Managed float', desc: 'The central bank leans against big swings.', mods: { inflation: -0.4, stability: 1 } },
    { id: 'peg', label: 'Hard peg', desc: 'Fixed to a major currency: imported credibility.', mods: { inflation: -1.5, 'bloc:business': 5, fdi: 0.1 },
      ctx: c => ({ inflation: -1.5 * ramp(45 - c.inst, 0, 25), crisisRisk: 0.5 * ramp(-c.deficit, 3, 8) + 0.3 * ramp(c.debt, 70, 120) }),
      note: c => c.deficit < -4 ? 'Big deficits under a peg invite a speculative attack.' : c.inst < 40 ? 'The peg borrows credibility your own institutions lack.' : null },
  ] },
  { kind: 'choice', id: 'fiscalRule', category: 'economy', isNew: true, label: 'Fiscal rule', desc: 'A legal limit on deficits. Lowers borrowing costs; breaking it costs credibility.', default: 'none', options: [
    { id: 'none', label: 'None', desc: 'Borrow as needed.', mods: {} },
    { id: 'brake', label: 'Debt brake', desc: 'Deficits capped at 3% of GDP while debt exceeds 60%.', mods: { 'bloc:business': 3, institutions: 1 },
      note: c => c.debt > 60 && c.deficit < -3 ? 'You are breaking your own rule: credibility is draining every month.' : null },
    { id: 'balanced', label: 'Balanced budget', desc: 'Deficits capped at 0.5% of GDP.', mods: { 'bloc:business': 5, institutions: 2, 'bloc:workers': -3 },
      note: c => c.deficit < -0.5 ? 'You are breaking your own rule: credibility is draining every month.' : c.unemployment > 9 ? 'No room to spend your way out of this slump.' : null },
  ] },
  { kind: 'choice', id: 'swf', category: 'economy', isNew: true, label: 'Resource revenue', desc: 'What happens to oil and mineral money.', default: 'spend', options: [
    { id: 'spend', label: 'Spend it', desc: 'Into the budget as it arrives.', mods: {},
      ctx: c => ({ inflation: 4 * c.resource, 'sector:light': -0.6 * c.resource, 'sector:agriculture': -0.4 * c.resource }),
      note: c => c.resource > 0.08 ? 'Dutch disease: resource cash inflates prices and kills your other exports.' : null },
    { id: 'fund', label: 'Sovereign wealth fund', desc: 'Save half of resource revenue abroad; spend the returns.', mods: { institutions: 2, 'bloc:workers': -3 },
      ctx: c => ({ inflation: 1.5 * c.resource }),
      note: c => c.resource < 0.03 ? 'You have little resource income to save.' : 'Builds a buffer for when the oil runs out or the price collapses.' },
    { id: 'diversify', label: 'Diversification fund', desc: 'Channel a third of resource revenue into new industries.', mods: { 'bloc:business': 4 },
      ctx: c => ({ 'sector:light': 0.6 * c.resource, 'sector:electronics': 0.5 * c.resource, 'sector:tourism': 0.5 * c.resource, 'sector:finance': 0.3 * c.resource, 'sector:software': 0.3 * c.resource, inflation: 2.5 * c.resource }),
      note: c => c.resource < 0.03 ? 'You have little resource income to invest.' : 'Builds the economy that will replace oil.' },
  ] },
  { kind: 'choice', id: 'fuelSubsidy', category: 'economy', isNew: true, label: 'Fuel & energy prices', desc: 'Whether the state keeps petrol and power cheap.', default: 'market', ai: { left: 'subsidized' }, options: [
    { id: 'market', label: 'Market prices', desc: '', mods: {} },
    { id: 'subsidized', label: 'Subsidised fuel', desc: 'Cheap petrol and power for all.', mods: { 'bloc:workers': 6, 'bloc:rural': 6, inflation: -0.6, pollution: 6, renewables: -4 },
      ctx: (c, yrs) => ({ spend: (0.8 + 0.4 * ramp(yrs, 0, 15)) * c.oilPrice * (c.oilImport > 0 ? 1.3 : 0.7) }),
      note: c => `Costs ≈${((0.8) * c.oilPrice * (c.oilImport > 0 ? 1.3 : 0.7)).toFixed(1)}% of GDP at today’s oil price, more every year as people come to rely on it.`,
      onLeave: (_c, yrs) => ({ workers: -6 - cap(yrs, 15) * 0.6, rural: -6 - cap(yrs, 15) * 0.6, stability: -3 - cap(yrs, 15) * 0.3, inflation: 2 }) },
    { id: 'heavy', label: 'Near-free energy', desc: 'Fuel cheaper than water.', mods: { 'bloc:workers': 10, 'bloc:rural': 10, inflation: -1.2, pollution: 12, renewables: -8, productivity: -0.01 },
      ctx: (c, yrs) => ({ spend: (1.6 + 0.8 * ramp(yrs, 0, 15)) * c.oilPrice * (c.oilImport > 0 ? 1.3 : 0.7) }),
      note: c => `Costs ≈${(1.6 * c.oilPrice * (c.oilImport > 0 ? 1.3 : 0.7)).toFixed(1)}% of GDP at today’s oil price. Removing it later will cause riots.`,
      onLeave: (_c, yrs) => ({ workers: -10 - cap(yrs, 15), rural: -10 - cap(yrs, 15), stability: -6 - cap(yrs, 15) * 0.4, inflation: 4 }) },
  ] },
  { kind: 'choice', id: 'priceControls', category: 'economy', isNew: true, label: 'Price controls', desc: 'Caps on what shops may charge.', default: 'none', ai: { left: 'essentials', auth: 'essentials' }, options: [
    { id: 'none', label: 'None', desc: '', mods: {} },
    { id: 'essentials', label: 'Essentials capped', desc: 'Bread, fuel and medicine at fixed prices.', mods: { inflation: -1, 'bloc:workers': 6, 'bloc:rural': -3, poverty: -2 },
      ctx: (c, yrs) => ({ shortage: 0.02 * cap(yrs, 10) * (1 + c.inflation / 10), corruption: 0.15 * cap(yrs, 15) }),
      note: (c, yrs) => yrs > 3 ? `After ${yrsOf(yrs)} years of caps, empty shelves and black markets are spreading.` : c.inflation > 10 ? 'With inflation this high, the caps will bind hard: expect shortages.' : null,
      onLeave: () => ({ workers: -6, stability: -2, inflation: 2 }) },
    { id: 'broad', label: 'Broad controls', desc: 'Most prices set by decree.', mods: { inflation: -2.5, 'bloc:workers': 8, 'bloc:business': -12, bizEase: -10 },
      ctx: (c, yrs) => ({ shortage: 0.05 * cap(yrs, 10) * (1 + c.inflation / 10), happiness: -0.2 * cap(yrs, 15), corruption: 0.3 * cap(yrs, 15) }),
      note: () => 'Suppresses measured inflation; the cost shows up as queues, shortages and a black market.',
      onLeave: () => ({ workers: -10, stability: -4, inflation: 6 }) },
  ] },
  { kind: 'choice', id: 'antitrust', category: 'economy', isNew: true, label: 'Competition policy', desc: 'How hard the state polices monopolies.', default: 'standard', options: [
    { id: 'lax', label: 'Lax', desc: 'National champions may dominate.', mods: { 'bloc:business': 8, innovation: -4, gini: 2 },
      ctx: (_c, yrs) => ({ corruption: 0.15 * cap(yrs, 20), productivity: -0.0008 * cap(yrs, 20) }),
      note: (_c, yrs) => yrs > 8 ? 'Dominant firms have stopped competing and started lobbying.' : null },
    { id: 'standard', label: 'Standard', desc: '', mods: {} },
    { id: 'aggressive', label: 'Trust-busting', desc: 'Break up dominant firms.', mods: { innovation: 5, growth: 0.1, 'bloc:business': -8, 'bloc:middle': 3, fdi: -0.05 },
      ctx: c => ({ growth: -0.15 * ramp(40 - c.inst, 0, 20) }),
      note: c => c.inst < 35 ? 'Without independent courts, “trust-busting” targets the regime’s rivals.' : null },
  ] },
  { kind: 'choice', id: 'landReform', category: 'economy', isNew: true, label: 'Land ownership', desc: 'Who owns the farmland.', default: 'none', options: [
    { id: 'none', label: 'Status quo', desc: '', mods: {},
      ctx: c => ({ 'bloc:rural': -10 * ramp(c.gini, 45, 60) * ramp(0.45 - c.dev, 0, 0.3) }),
      note: c => c.gini > 48 && c.dev < 0.4 ? 'Landless peasants work great estates: rural anger is building.' : null },
    { id: 'titling', label: 'Land titling', desc: 'Formal deeds for smallholders: land becomes collateral.', mods: { 'sector:agriculture': 0.08, credit: 0.5, institutions: 2, 'bloc:rural': 5 },
      ctx: c => ({ growth: 0.2 * ramp(0.45 - c.dev, 0, 0.3) }) },
    { id: 'redistribution', label: 'Redistribute estates', desc: 'Break up large holdings.', mods: { gini: -5, 'bloc:rural': 15, 'bloc:business': -12, fdi: -0.15, stability: -2 },
      ctx: (c, yrs) => ({ 'sector:agriculture': -0.2 * (1 - ramp(yrs, 0, 8)) + 0.12 * ramp(0.4 - c.dev, 0, 0.3) * ramp(yrs, 4, 10), stability: 4 * ramp(c.gini, 45, 60) }),
      note: (_c, yrs) => yrs < 6 ? 'Harvests fall for a few years while new owners find their feet.' : null },
  ] },

  // ───────── welfare ─────────
  { kind: 'choice', id: 'healthcare', category: 'welfare', label: 'Healthcare system', desc: 'How people pay for care.', default: 'insurance', ai: { right: 'private', left: 'universal' }, options: [
    { id: 'private', label: 'Private', desc: 'Pay or insure yourself.', mods: { health: -8, gini: 3, lifeExp: -1.5, 'bloc:business': 6, 'bloc:workers': -10, 'sector:pharma': 0.1 },
      ctx: c => ({ poverty: 15 * c.old, 'bloc:workers': -10 * c.old }),
      note: c => c.old > 0.15 ? 'An ageing population can’t afford private care: medical bills drive pensioners into poverty.' : null },
    { id: 'insurance', label: 'Mandatory insurance', desc: 'Regulated multi-payer system.', mods: { health: 2 } },
    { id: 'universal', label: 'Universal single payer', desc: 'Free at the point of use.', mods: { health: 6, gini: -2, happiness: 3, lifeExp: 1.5, 'bloc:workers': 10, 'bloc:middle': 4, 'bloc:business': -4 },
      ctx: c => ({ happiness: c.healthSpend < 5 ? -2.5 : 0, health: c.healthSpend < 4 ? -4 : 0 }),
      note: c => c.healthSpend < 5 ? 'Underfunded single payer: free care, long queues. Raise the health budget.' : null,
      onLeave: () => ({ workers: -8, middle: -4 }) },
  ] },
  { kind: 'choice', id: 'tuition', category: 'welfare', label: 'Higher education', desc: 'Who pays for university.', default: 'subsidized', options: [
    { id: 'private', label: 'Full tuition', desc: 'Students pay.', mods: { eduQuality: -4, mobility: -6, gini: 2, 'bloc:progressives': -10 } },
    { id: 'subsidized', label: 'Subsidised', desc: 'Means-tested support.', mods: {} },
    { id: 'free', label: 'Free university', desc: 'Tuition-free for all citizens.', mods: { eduQuality: 5, mobility: 7, gini: -2, 'bloc:progressives': 12, 'bloc:middle': 4 },
      ctx: c => ({ eduQuality: -3 * ramp(0.4 - c.dev, 0, 0.3), gini: 3 * ramp(0.4 - c.dev, 0, 0.3) }),
      note: c => c.dev < 0.3 ? 'Free degrees for the few who finish school, paid by everyone: primary schools would do more.' : null,
      onLeave: () => ({ progressives: -8, middle: -3 }) },
  ] },
  { kind: 'choice', id: 'pensions', category: 'welfare', label: 'Retirement age', desc: 'When people stop working. Drives pension costs as the population ages.', default: 'standard', options: [
    { id: 'early', label: 'Early (60)', desc: 'Generous, expensive.', mods: { happiness: 3, pension: 0.3, 'bloc:workers': 10, 'bloc:religious': 4, 'bloc:progressives': -3 },
      ctx: c => ({ laborPart: -0.25 * c.old }),
      note: c => c.dep > 0.28 ? 'With so many retirees, early pensions are crushing the budget.' : c.old < 0.07 ? 'Few people are old yet: cheap today, expensive in 30 years.' : null,
      onLeave: (_c, yrs) => ({ workers: -6 - cap(yrs, 10) * 0.5, religious: -3, stability: -2 }) },
    { id: 'standard', label: 'Standard (65)', desc: '', mods: {} },
    { id: 'late', label: 'Late (68)', desc: 'Sustainable, unpopular.', mods: { happiness: -2, pension: -0.2, 'bloc:workers': -10, 'bloc:business': 5 },
      ctx: c => ({ laborPart: 0.2 * c.old, 'bloc:workers': -6 * (1 - c.dev) }),
      note: c => c.dev < 0.4 ? 'Many workers won’t live to collect it: deeply resented.' : null },
  ] },
  { kind: 'choice', id: 'pensionSystem', category: 'welfare', isNew: true, label: 'Pension financing', desc: 'Who pays for retirement: today’s workers, or savings built up over a career.', default: 'payg', options: [
    { id: 'payg', label: 'Pay-as-you-go', desc: 'Today’s workers fund today’s pensioners.', mods: {},
      ctx: c => ({ 'bloc:workers': -10 * ramp(c.dep, 0.3, 0.5) }),
      note: c => c.dep > 0.3 ? `Each pensioner is supported by just ${(1 / Math.max(0.05, c.dep)).toFixed(1)} workers.` : null },
    { id: 'mixed', label: 'Mixed', desc: 'A public floor plus mandatory savings accounts.', mods: { pension: -0.15, credit: 1, 'sector:finance': 0.05 },
      ctx: (_c, yrs) => ({ spend: 0.6 * (1 - ramp(yrs, 0, 12)) }),
      note: (_c, yrs) => yrs < 12 ? 'Transition cost: paying current pensions while funding new accounts.' : null },
    { id: 'funded', label: 'Funded accounts', desc: 'Everyone saves for their own retirement.', mods: { pension: -0.35, credit: 2, 'sector:finance': 0.12, gini: 2, 'bloc:business': 6, 'bloc:workers': -6 },
      ctx: (_c, yrs) => ({ spend: 1.4 * (1 - ramp(yrs, 0, 18)) }),
      note: (_c, yrs) => yrs < 18 ? 'A generation of double payments before the savings take over.' : null },
  ] },
  { kind: 'choice', id: 'welfareModel', category: 'welfare', label: 'Social safety net', desc: 'Support for the poor and unemployed.', default: 'targeted', ai: { right: 'minimal', left: 'generous' }, options: [
    { id: 'minimal', label: 'Minimal', desc: 'Charity and family.', mods: { poverty: 8, gini: 4, laborPart: 0.02, happiness: -4, 'bloc:workers': -12, 'bloc:business': 6, safety: -3, pension: -0.45 },
      ctx: c => ({ safety: -0.45 * Math.max(0, c.unemployment - 6), 'bloc:workers': -0.8 * Math.max(0, c.unemployment - 7) }),
      note: c => c.unemployment > 10 ? 'No safety net in a downturn: crime and anger are rising.' : null },
    { id: 'targeted', label: 'Targeted', desc: 'Means-tested benefits.', mods: { pension: -0.2 } },
    { id: 'generous', label: 'Generous', desc: 'Nordic-style welfare state.', mods: { poverty: -6, gini: -4, happiness: 4, laborPart: -0.008, cohesion: 4, 'bloc:workers': 10, 'bloc:business': -6, pension: 0.1 },
      ctx: c => ({ laborPart: -0.012 * (c.corruption / 50), happiness: 2 * ramp(c.inst, 40, 75) }),
      note: c => c.corruption > 55 ? 'Corruption leaks benefits to the well-connected.' : null,
      onLeave: (_c, yrs) => ({ workers: -8 - cap(yrs, 10) * 0.3, stability: -2 }) },
    { id: 'ubi', label: 'Universal basic income', desc: 'A cheque for every citizen.', mods: { poverty: -10, gini: -6, happiness: 4, laborPart: -0.04, 'bloc:progressives': 14, 'bloc:business': -10, 'bloc:religious': -4 },
      ctx: c => ({ laborPart: 0.035 * c.automation, inflation: 2 * ramp(0.5 - c.dev, 0, 0.3), happiness: 4 * c.automation, 'bloc:workers': 12 * c.automation }),
      note: c => c.dev < 0.35 ? 'Printing cheques in a poor economy fuels inflation.' : c.automation > 0.4 ? 'Automation is eliminating routine jobs: a basic income cushions the shock.' : null,
      onLeave: () => ({ workers: -10, progressives: -12, stability: -3 }) },
  ] },
  { kind: 'choice', id: 'housing', category: 'welfare', label: 'Housing', desc: 'How homes are provided.', default: 'market', options: [
    { id: 'market', label: 'Free market', desc: 'Developers build what sells.', mods: { housing: -3, 'sector:construction': 0.1, 'bloc:business': 3 },
      ctx: c => ({ housing: -0.25 * Math.max(0, c.creditGap) }),
      note: c => c.creditGap > 8 ? 'Cheap credit is inflating a property bubble.' : null },
    { id: 'social', label: 'Social housing', desc: 'Public housing programmes.', mods: { housing: 8, gini: -1.5, 'bloc:workers': 6, 'sector:construction': 0.08, spend: 0.4 } },
    { id: 'rentcontrol', label: 'Rent control', desc: 'Caps on rent increases.', mods: { housing: 4, 'sector:construction': -0.1, 'bloc:progressives': 6, 'bloc:business': -6 },
      ctx: (_c, yrs) => ({ housing: -13 * ramp(yrs, 2, 16), 'sector:construction': -0.1 * ramp(yrs, 2, 12), mobility: -3 * ramp(yrs, 4, 12), fertility: -0.1 * ramp(yrs, 6, 16) }),
      note: (_c, yrs) => yrs > 4 ? `Rent control in force ${yrsOf(yrs)} years: landlords have stopped building and maintaining.` : 'Relief for tenants now. Supply dries up over the next decade.',
      onLeave: () => ({ progressives: -8, workers: -4 }) },
  ] },
  { kind: 'choice', id: 'zoning', category: 'welfare', isNew: true, label: 'Planning & zoning', desc: 'How easy it is to build homes.', default: 'standard', options: [
    { id: 'restrictive', label: 'Restrictive', desc: 'Protect neighbourhoods and green belts.', mods: { housing: -6, 'bloc:middle': 6, 'bloc:rural': 4, 'sector:construction': -0.15, pollution: -3 },
      ctx: (c, yrs) => ({ housing: -0.4 * cap(yrs, 15) * ramp(c.urban, 0.5, 0.85), fertility: -0.12 * ramp(c.urban, 0.6, 0.9) }),
      note: c => c.urban > 0.7 ? 'In a nation this urban, blocking construction makes cities unaffordable and young people delay children.' : null },
    { id: 'standard', label: 'Standard', desc: '', mods: {} },
    { id: 'permissive', label: 'Build, build, build', desc: 'Upzoning and fast permits.', mods: { housing: 8, 'sector:construction': 0.15, 'bloc:middle': -4, 'bloc:business': 5, pollution: 3, credit: 0.5 } },
  ] },
  { kind: 'choice', id: 'family', category: 'welfare', label: 'Family policy', desc: 'Childcare, parental leave and births.', default: 'support', options: [
    { id: 'none', label: 'Hands off', desc: '', mods: { fertility: -0.2, laborPart: -0.01 } },
    { id: 'support', label: 'Family support', desc: 'Childcare and parental leave.', mods: { fertility: 0.1, laborPart: 0.015, genderEq: 4, happiness: 1 },
      ctx: c => ({ fertility: 0.15 * ramp(c.dev, 0.5, 0.9) }),
      note: c => c.dev > 0.7 ? 'In rich societies childcare and leave do more for birth rates than cash.' : null },
    { id: 'natalist', label: 'Natalist', desc: 'Baby bonuses and tax breaks for large families.', mods: { fertility: 0.4, 'bloc:religious': 8, genderEq: -3, spend: 0.3 },
      ctx: c => ({ fertility: -0.28 * ramp(c.dev, 0.55, 0.95) }),
      note: c => c.dev > 0.7 ? 'Baby bonuses barely move birth rates in rich societies: housing and childcare matter more.' : null },
    { id: 'limit', label: 'Birth limits', desc: 'Enforced family size limits.', mods: { fertility: -0.8, freedom: -10, happiness: -4, 'bloc:religious': -12, 'bloc:rural': -8 },
      note: () => 'Fewer children now means a much older population in 30 years.' },
  ] },
  { kind: 'choice', id: 'educationFocus', category: 'welfare', isNew: true, label: 'Curriculum', desc: 'What schools and universities emphasise.', default: 'balanced', options: [
    { id: 'academic', label: 'Academic', desc: 'Humanities, law and the classics.', mods: { culture: 3, 'bloc:progressives': 4, students: 4 },
      ctx: c => ({ unemployment: 1.5 * ramp(0.6 - c.dev, 0, 0.3) }),
      note: c => c.dev < 0.45 ? 'Graduates without jobs: your economy doesn’t yet need so many humanities degrees.' : null },
    { id: 'balanced', label: 'Balanced', desc: '', mods: {} },
    { id: 'vocational', label: 'Vocational', desc: 'Apprenticeships and technical colleges.', mods: { 'sector:light': 0.05, 'sector:auto': 0.08, 'sector:heavy': 0.05, unemployment: -0.6, 'bloc:workers': 5, 'bloc:business': 4 },
      ctx: c => ({ unemployment: 1.5 * ramp(c.automation, 0.25, 0.7), innovation: -4 }),
      note: c => c.automation > 0.4 ? 'Automation is eating the trades you are training for.' : null },
    { id: 'stem', label: 'STEM drive', desc: 'Science, engineering and code.', mods: { innovation: 8, retrain: 0.3, 'sector:software': 0.1, 'sector:electronics': 0.08, 'sector:pharma': 0.06, 'bloc:progressives': -2 },
      ctx: c => ({ innovation: -10 * ramp(50 - c.hc, 0, 20) }),
      note: c => c.hc < 45 ? 'STEM needs strong schools first.' : c.automation > 0.4 ? 'The skills automation can’t replace.' : null },
  ] },

  // ───────── society ─────────
  { kind: 'choice', id: 'immigration', category: 'society', label: 'Immigration', desc: 'Who may come to live and work.', default: 'selective', ai: { nat: 'closed', glob: 'open' }, options: [
    { id: 'closed', label: 'Closed borders', desc: 'Near-zero immigration.', mods: { migration: -40, cohesion: 3, laborPart: -0.01, 'bloc:religious': 8, 'bloc:workers': 4, 'bloc:business': -8, 'bloc:progressives': -10, values: -4 },
      ctx: c => ({ growth: -0.5 * ramp(c.dep, 0.22, 0.45), laborPart: -0.03 * ramp(c.dep, 0.25, 0.45) }),
      note: c => c.dep > 0.28 ? 'Ageing and shrinking: closing the doors deepens your labour shortage.' : null },
    { id: 'selective', label: 'Selective', desc: 'Points-based skilled migration.', mods: { migration: 5, 'bloc:middle': 2 },
      ctx: c => ({ growth: 0.15 * ramp(c.dep, 0.22, 0.45) }) },
    { id: 'open', label: 'Open', desc: 'Easy work visas and settlement.', mods: { migration: 30, growth: 0.1, cohesion: -4, 'bloc:business': 8, 'bloc:progressives': 8, 'bloc:religious': -10, values: 4 },
      ctx: c => ({ growth: 0.35 * ramp(c.dep, 0.2, 0.45) - 0.2 * ramp(c.unemployment, 8, 15), cohesion: -5 * ramp(55 - c.cohesion, 0, 20), 'bloc:workers': -0.8 * Math.max(0, c.unemployment - 7), migration: -20 * ramp(0.4 - c.dev, 0, 0.3) }),
      note: c => c.dev < 0.3 ? 'Few people migrate to a poor country, whatever the rules.' : c.unemployment > 9 ? 'With unemployment high, newcomers are seen as competition.' : c.dep > 0.28 ? 'Young workers are exactly what an ageing nation needs.' : null },
  ] },
  { kind: 'choice', id: 'refugees', category: 'society', label: 'Refugees', desc: 'Asylum for those fleeing war.', default: 'quota', options: [
    { id: 'reject', label: 'Reject', desc: '', mods: { values: -6, 'bloc:religious': 4, 'bloc:progressives': -8, diplomacy: -3 } },
    { id: 'quota', label: 'Quota', desc: '', mods: {} },
    { id: 'welcome', label: 'Welcome', desc: '', mods: { values: 8, cohesion: -2, 'bloc:progressives': 8, 'bloc:religious': -5, diplomacy: 4 },
      ctx: c => ({ cohesion: -3 * ramp(55 - c.cohesion, 0, 20) }) },
  ] },
  { kind: 'choice', id: 'internalMigration', category: 'society', isNew: true, label: 'Internal migration', desc: 'Whether people may move freely from the countryside to the cities.', default: 'free', options: [
    { id: 'registered', label: 'Household registration', desc: 'Permits to live in the cities.', mods: { urbanization: -0.5, stability: 2, gini: 3, 'bloc:rural': -4, 'bloc:middle': 4 },
      ctx: c => ({ growth: -0.3 * ramp(0.55 - c.urban, 0, 0.3) }),
      note: c => c.urban < 0.45 ? 'Keeping farmers on the land blocks the move to factories that drives catch-up growth.' : null },
    { id: 'free', label: 'Free movement', desc: '', mods: {} },
    { id: 'promote', label: 'Urbanisation drive', desc: 'New cities, land conversion, hukou reform.', mods: { urbanization: 0.6, housing: -4, cohesion: -2, 'bloc:rural': -6, 'sector:construction': 0.1 },
      ctx: c => ({ growth: 0.3 * ramp(0.6 - c.urban, 0, 0.3) }),
      note: c => c.urban > 0.75 ? 'Already urban: little left to gain.' : 'Moving workers from farms to factories is the fastest growth there is.' },
  ] },
  { kind: 'choice', id: 'gender', category: 'society', label: 'Gender equality', desc: 'Rights and roles of women.', default: 'equal', ai: { trad: 'traditional', prog: 'parity' }, options: [
    { id: 'traditional', label: 'Traditional roles', desc: 'Legal and social restrictions on women.', mods: { genderEq: -35, laborPart: -0.06, fertility: 0.3, values: -12, 'bloc:religious': 12, 'bloc:progressives': -18 },
      ctx: c => ({ growth: -0.3 * c.dev }),
      note: c => c.dev > 0.6 ? 'An economy this advanced is wasting half its talent.' : null },
    { id: 'equal', label: 'Equal rights', desc: 'Legal equality.', mods: {} },
    { id: 'parity', label: 'Active parity', desc: 'Quotas, pay transparency, mandated leave.', mods: { genderEq: 15, laborPart: 0.02, values: 5, 'bloc:progressives': 10, 'bloc:religious': -8, 'bloc:business': -3 } },
  ] },
  { kind: 'choice', id: 'lgbt', category: 'society', label: 'LGBT rights', desc: 'Legal status of sexual minorities.', default: 'tolerated', ai: { trad: 'criminalized', prog: 'equal' }, options: [
    { id: 'criminalized', label: 'Criminalised', desc: '', mods: { freedom: -10, values: -15, migration: -6, 'bloc:religious': 12, 'bloc:progressives': -20, tourism: -4 } },
    { id: 'tolerated', label: 'Tolerated', desc: 'Legal, without recognition.', mods: {} },
    { id: 'equal', label: 'Full equality', desc: 'Marriage equality and anti-discrimination law.', mods: { freedom: 5, values: 8, migration: 4, 'bloc:progressives': 14, 'bloc:religious': -12, culture: 3 } },
  ] },
  { kind: 'choice', id: 'religion', category: 'society', label: 'Religion & state', desc: 'The place of faith in public life.', default: 'secular', options: [
    { id: 'theocratic', label: 'Religious law', desc: 'Scripture is the constitution.', mods: { freedom: -15, values: -10, cohesion: 4, genderEq: -15, 'bloc:religious': 25, 'bloc:progressives': -15, innovation: -6, legitimacy: 6 },
      ctx: c => ({ 'bloc:progressives': -15 * c.urban, migration: -10 * c.hc / 100, innovation: -6 * c.dev }),
      note: c => c.urban > 0.6 ? 'Your cities are secular: this will be bitterly resisted.' : null },
    { id: 'state', label: 'State church', desc: 'An established national faith.', mods: { cohesion: 2, 'bloc:religious': 10, 'bloc:progressives': -5 } },
    { id: 'secular', label: 'Secular', desc: 'Separation of church and state.', mods: {} },
    { id: 'atheist', label: 'State atheism', desc: 'Religion suppressed.', mods: { freedom: -12, cohesion: -5, 'bloc:religious': -30, 'bloc:progressives': 2, values: -6 } },
  ] },
  { kind: 'choice', id: 'drugs', category: 'society', label: 'Drug policy', desc: 'How the state treats narcotics.', default: 'prohibition', options: [
    { id: 'war', label: 'War on drugs', desc: 'Harsh sentences, militarised policing.', mods: { safety: -2, freedom: -6, corruption: 3, 'bloc:religious': 8, 'bloc:progressives': -10, values: -3 },
      ctx: (c, yrs) => ({ corruption: 0.25 * cap(yrs, 16) * ramp(c.corruption, 35, 70) }),
      note: (c, yrs) => yrs > 5 && c.corruption > 45 ? 'Cartel money is corrupting the police and courts fighting them.' : null },
    { id: 'prohibition', label: 'Prohibition', desc: '', mods: {} },
    { id: 'decriminalized', label: 'Decriminalised', desc: 'Treatment, not prison.', mods: { safety: 2, health: 2, 'bloc:progressives': 8, 'bloc:religious': -8 } },
    { id: 'legal', label: 'Legal & regulated', desc: 'Taxed and licensed.', mods: { safety: 3, taxEff: 0.01, tourism: 3, 'bloc:progressives': 12, 'bloc:religious': -14, health: -1 },
      ctx: c => ({ corruption: -3 * ramp(c.corruption, 40, 70), safety: 2 * ramp(c.corruption, 40, 70) }),
      note: c => c.corruption > 55 ? 'Legalisation starves the cartels that fund your corruption.' : null },
  ] },
  { kind: 'choice', id: 'deathPenalty', category: 'society', label: 'Death penalty', desc: '', default: 'abolished', options: [
    { id: 'abolished', label: 'Abolished', desc: '', mods: { values: 3, 'bloc:progressives': 3 } },
    { id: 'rare', label: 'Rarely used', desc: '', mods: { 'bloc:religious': 3, values: -3 } },
    { id: 'active', label: 'Widely used', desc: '', mods: { safety: 1, freedom: -5, values: -10, 'bloc:religious': 6, 'bloc:progressives': -10 } },
  ] },
  { kind: 'choice', id: 'guns', category: 'society', label: 'Firearms', desc: 'Civilian gun ownership.', default: 'licensed', options: [
    { id: 'banned', label: 'Banned', desc: '', mods: { safety: 4, freedom: -2, 'bloc:rural': -10, 'bloc:progressives': 4 } },
    { id: 'licensed', label: 'Licensed', desc: '', mods: {} },
    { id: 'permissive', label: 'Permissive', desc: 'Carry rights for all.', mods: { safety: -6, freedom: 2, 'bloc:rural': 10, 'bloc:progressives': -8, tourism: -2 },
      ctx: c => ({ safety: -0.12 * Math.max(0, c.gini - 35) - 0.1 * Math.max(0, c.unemployment - 6) }),
      note: c => c.gini > 42 ? 'Guns plus deep inequality: violent crime climbs.' : null },
  ] },
  { kind: 'choice', id: 'minorityRights', category: 'society', label: 'Minorities & languages', desc: 'How the state treats regional cultures and conquered peoples.', default: 'equal', options: [
    { id: 'assimilate', label: 'Forced assimilation', desc: 'One language, one culture.', mods: { cohesion: -3, freedom: -8, values: -8, 'bloc:minorities': -30, 'bloc:religious': 4, stability: -1 },
      ctx: c => ({ cohesion: -25 * c.nonCore, stability: -12 * c.nonCore }),
      note: c => c.nonCore > 0.1 ? 'A large share of your people are not from the heartland: forced assimilation radicalises them.' : null },
    { id: 'equal', label: 'Equal citizenship', desc: '', mods: {} },
    { id: 'autonomy', label: 'Multicultural autonomy', desc: 'Official regional languages and self-rule.', mods: { cohesion: 3, values: 5, 'bloc:minorities': 22, 'bloc:military': -4, stability: 1 },
      ctx: c => ({ cohesion: 12 * c.nonCore, stability: 6 * c.nonCore }) },
  ] },
  { kind: 'choice', id: 'civilSociety', category: 'society', isNew: true, label: 'Civil society', desc: 'NGOs, unions, charities and associations.', default: 'free', options: [
    { id: 'free', label: 'Free association', desc: '', mods: { freedom: 3, institutions: 2, values: 3 },
      ctx: c => ({ stability: -2 * ramp(45 - c.stability, 0, 25) }) },
    { id: 'registered', label: 'Registered & monitored', desc: '', mods: { freedom: -3, stability: 1 } },
    { id: 'restricted', label: '“Foreign agents” law', desc: 'NGOs with foreign funding are banned.', mods: { freedom: -8, values: -6, institutions: -3, stability: 3, corruption: 3, 'bloc:progressives': -10, 'bloc:military': 3 },
      ctx: (_c, yrs) => ({ corruption: 0.15 * cap(yrs, 20) }),
      note: (_c, yrs) => yrs > 6 ? 'With no watchdogs left, graft goes unreported.' : null },
  ] },

  // ───────── governance ─────────
  { kind: 'choice', id: 'government', category: 'governance', label: 'System of government', desc: 'The constitution of the state.', default: 'democracy', cooldown: 36, options: [
    { id: 'democracy', label: 'Liberal democracy', desc: 'Free elections every 4 years. Lose one and you go into opposition.', mods: { democracy: 30, freedom: 10, institutions: 6, legitimacy: 10, values: 15, 'bloc:middle': 6, 'bloc:progressives': 8, 'bloc:military': -6, taxEff: 0.03 },
      ctx: c => ({ stability: -10 * ramp(40 - c.inst, 0, 25) - 6 * ramp(0.3 - c.dev, 0, 0.2) }),
      note: c => c.inst < 35 ? 'Democracy without strong institutions is fragile: expect turbulence and coup plots.' : null },
    { id: 'monarchy', label: 'Constitutional monarchy', desc: 'Elected parliament under a crown. Very stable.', mods: { democracy: 25, freedom: 8, institutions: 6, stability: 6, legitimacy: 12, values: 12, 'bloc:religious': 6, culture: 3 },
      ctx: c => ({ stability: -5 * ramp(40 - c.inst, 0, 25) }) },
    { id: 'technocracy', label: 'Technocracy', desc: 'Rule by appointed experts. No elections.', mods: { democracy: 5, institutions: 8, innovation: 8, taxEff: 0.05, 'bloc:business': 6, 'bloc:religious': -10, 'bloc:progressives': -4, legitimacy: -4 },
      ctx: c => ({ legitimacy: -8 * ramp(50 - c.hc, 0, 20), growth: 0.25 * ramp(c.hc, 55, 80) }),
      note: c => c.hc < 45 ? 'Rule by experts lacks legitimacy where few people are educated.' : null },
    { id: 'oneparty', label: 'One-party state', desc: 'The party leads everything.', mods: { democracy: -30, freedom: -15, corruption: 8, stability: 4, surveillance: 15, values: -15, 'bloc:progressives': -15, 'bloc:middle': -6, 'bloc:military': 5, legitimacy: -5, pc: 2 },
      ctx: (c, yrs) => ({ growth: -0.6 * ramp(c.dev, 0.55, 0.85), corruption: 0.3 * cap(yrs, 25), legitimacy: -0.3 * cap(yrs, 25) }),
      note: (c, yrs) => c.dev > 0.6 ? 'Middle-income trap: control stifles the innovation you now need.' : yrs > 15 ? 'An ageing regime: the founding legitimacy is wearing thin.' : null },
    { id: 'junta', label: 'Military junta', desc: 'Generals in charge.', mods: { democracy: -40, freedom: -20, corruption: 12, military: 0.1, manpower: 0.2, values: -20, 'bloc:military': 25, 'bloc:progressives': -25, 'bloc:middle': -10, fdi: -0.3, legitimacy: -15, pc: 3 },
      ctx: (c, yrs) => ({ legitimacy: -0.5 * cap(yrs, 20), growth: -0.4 * c.dev }),
      note: (_c, yrs) => yrs > 5 ? 'The generals promised a temporary regime.' : null },
    { id: 'theocracy', label: 'Theocracy', desc: 'Clerics hold ultimate authority.', mods: { democracy: -25, freedom: -18, cohesion: 3, values: -15, 'bloc:religious': 30, 'bloc:progressives': -30, innovation: -8, legitimacy: 4, pc: 2 },
      ctx: c => ({ growth: -0.4 * c.dev, stability: -8 * c.urban * c.hc / 100 }) },
  ] },
  { kind: 'choice', id: 'electoralSystem', category: 'governance', isNew: true, label: 'Electoral system', desc: 'How votes become seats (democracies).', default: 'pr', options: [
    { id: 'fptp', label: 'First past the post', desc: 'Winner takes each district.', mods: { stability: 2, pc: 1, 'bloc:minorities': -6 },
      note: () => 'Big swings: a modest lead wins a majority, a modest loss wipes you out.' },
    { id: 'mixed', label: 'Mixed-member', desc: 'Half districts, half lists.', mods: {} },
    { id: 'pr', label: 'Proportional', desc: 'Seats match votes.', mods: { 'bloc:minorities': 4, legitimacy: 3, pc: -0.5 },
      note: () => 'Coalitions are the norm: stable, but every reform needs partners.' },
  ] },
  { kind: 'choice', id: 'termLimits', category: 'governance', isNew: true, label: 'Term limits', desc: 'How long a leader may hold office.', default: 'two', options: [
    { id: 'none', label: 'No limits', desc: 'Rule as long as you win.', mods: { democracy: -8, pc: 1 },
      ctx: (_c, yrs) => ({ corruption: 0.2 * cap(yrs, 20), legitimacy: -0.2 * cap(yrs, 20) }),
      note: (_c, yrs) => yrs > 10 ? 'Incumbents entrench: patronage networks grow with every term.' : null },
    { id: 'two', label: 'Two terms', desc: '', mods: {} },
    { id: 'one', label: 'Single term', desc: '', mods: { democracy: 3, corruption: -2, pc: -1.5 }, note: () => 'Lame-duck governments: less capital to spend.' },
  ] },
  { kind: 'choice', id: 'campaignFinance', category: 'governance', isNew: true, label: 'Campaign finance', desc: 'Money in politics.', default: 'capped', options: [
    { id: 'unlimited', label: 'Unlimited donations', desc: '', mods: { 'bloc:business': 8, corruption: 4, pc: 1.5, democracy: -4 } },
    { id: 'capped', label: 'Capped', desc: '', mods: {} },
    { id: 'public', label: 'Public funding', desc: 'Parties funded by the state.', mods: { corruption: -3, democracy: 3, spend: 0.05, 'bloc:business': -4, legitimacy: 2 } },
  ] },
  { kind: 'choice', id: 'civilService', category: 'governance', isNew: true, label: 'Civil service', desc: 'How officials are hired.', default: 'merit', options: [
    { id: 'patronage', label: 'Patronage', desc: 'Jobs for loyalists.', mods: { corruption: 8, institutions: -6, pc: 2, 'bloc:military': 3, taxEff: -0.04 },
      ctx: (_c, yrs) => ({ institutions: -0.2 * cap(yrs, 20) }),
      note: () => 'Buys political support today and hollows out the state.' },
    { id: 'merit', label: 'Merit-based', desc: 'Exams and tenure.', mods: {} },
    { id: 'elite', label: 'Elite technocrats', desc: 'Well-paid, highly selective mandarins.', mods: { institutions: 6, corruption: -4, taxEff: 0.04, pc: -1, legitimacy: -2, spend: 0.2 },
      ctx: c => ({ institutions: -6 * ramp(45 - c.hc, 0, 20) }),
      note: c => c.hc < 40 ? 'There aren’t enough graduates to staff an elite service.' : null },
  ] },
  { kind: 'choice', id: 'press', category: 'governance', label: 'Press freedom', desc: 'Independence of journalism.', default: 'free', ai: { auth: 'state', lib: 'free' }, options: [
    { id: 'free', label: 'Free press', desc: 'Scandals surface; trust is earned.', mods: { press: 30, corruption: -6, values: 8, culture: 4, 'bloc:progressives': 6, stability: -2 },
      ctx: c => ({ stability: -3 * ramp(c.corruption, 50, 75) }),
      note: c => c.corruption > 55 ? 'A free press will keep exposing your corruption: painful, but it cleans up the state.' : null },
    { id: 'regulated', label: 'Regulated', desc: 'Licensing and "fake news" laws.', mods: { press: 5, stability: 1 } },
    { id: 'state', label: 'State-controlled', desc: 'The news is what we say it is.', mods: { press: -30, corruption: 8, values: -12, stability: 4, legitimacy: 3, 'bloc:progressives': -14, culture: -6 },
      ctx: (c, yrs) => ({ stability: -0.3 * cap(yrs, 15), corruption: 0.25 * cap(yrs, 20), innovation: -3 * c.dev }),
      note: (_c, yrs) => yrs > 6 ? 'Nobody believes the state news any more; the propaganda dividend is gone.' : null },
  ] },
  { kind: 'choice', id: 'internet', category: 'governance', label: 'Internet', desc: 'Online freedom.', default: 'open', options: [
    { id: 'open', label: 'Open internet', desc: '', mods: { innovation: 4, freedom: 3, 'sector:software': 0.1 } },
    { id: 'filtered', label: 'Filtered', desc: 'Blocks on "harmful" sites.', mods: { freedom: -4, stability: 1, 'sector:software': -0.05 } },
    { id: 'firewall', label: 'National firewall', desc: 'A sovereign walled internet.', mods: { freedom: -12, innovation: -6, stability: 3, surveillance: 10, 'sector:software': -0.15, values: -6, 'bloc:progressives': -12 },
      ctx: c => ({ innovation: -8 * c.automation, 'sector:software': -0.15 * c.automation }),
      note: c => c.automation > 0.35 ? 'The digital economy is now most of the frontier: walling it off costs more every year.' : null },
  ] },
  { kind: 'choice', id: 'surveillance', category: 'governance', label: 'Surveillance', desc: 'How closely the state watches its people.', default: 'targeted', options: [
    { id: 'limited', label: 'Limited', desc: 'Warrants required.', mods: { freedom: 4, safety: -2, 'bloc:progressives': 4 } },
    { id: 'targeted', label: 'Targeted', desc: '', mods: {} },
    { id: 'mass', label: 'Mass surveillance', desc: 'Cameras and data everywhere.', mods: { freedom: -10, safety: 5, surveillance: 25, stability: 4, values: -8, coupProof: 0.15, 'bloc:progressives': -12, 'bloc:military': 4 },
      ctx: c => ({ migration: -12 * c.hc / 100 }),
      note: c => c.hc > 60 ? 'Your professionals resent being watched; many are leaving.' : null },
  ] },
  { kind: 'choice', id: 'intelligence', category: 'governance', isNew: true, label: 'Security services', desc: 'Intelligence agencies and secret police.', default: 'standard', options: [
    { id: 'limited', label: 'Overseen', desc: 'Parliamentary oversight.', mods: { freedom: 2, coupProof: -0.1 } },
    { id: 'standard', label: 'Standard', desc: '', mods: {} },
    { id: 'expansive', label: 'Expansive', desc: 'Informants in every barracks.', mods: { coupProof: 0.35, freedom: -6, surveillance: 10, spend: 0.2, 'bloc:military': -3, values: -3 },
      ctx: (_c, yrs) => ({ corruption: 0.1 * cap(yrs, 20) }) },
  ] },
  { kind: 'choice', id: 'judiciary', category: 'governance', label: 'Judiciary', desc: 'Independence of the courts.', default: 'independent', options: [
    { id: 'independent', label: 'Independent', desc: '', mods: { institutions: 10, corruption: -6, fdi: 0.15, values: 5 },
      ctx: c => ({ stability: -2 * (1 - c.democratic) }) },
    { id: 'influenced', label: 'Influenced', desc: 'Judges appointed by the ruling party.', mods: { institutions: -5, corruption: 3, pc: 0.5 } },
    { id: 'captured', label: 'Captured', desc: 'Courts serve the regime.', mods: { institutions: -18, corruption: 10, fdi: -0.25, freedom: -8, values: -10, stability: 2, pc: 1 },
      ctx: (_c, yrs) => ({ corruption: 0.3 * cap(yrs, 20) }) },
  ] },
  { kind: 'choice', id: 'antiCorruption', category: 'governance', label: 'Anti-corruption', desc: '', default: 'standard', options: [
    { id: 'lax', label: 'Lax', desc: 'Grease the wheels.', mods: { corruption: 10, 'bloc:business': 4, institutions: -4, pc: 0.5 } },
    { id: 'standard', label: 'Standard', desc: '', mods: {} },
    { id: 'crusade', label: 'Anti-graft crusade', desc: 'Purges and prosecutions.', mods: { corruption: -8, institutions: 4, stability: -3, 'bloc:business': -6, 'bloc:middle': 6, taxEff: 0.04 },
      ctx: (c, yrs) => ({ corruption: -6 * ramp(c.inst, 30, 70), stability: 3 * ramp(yrs, 0, 3), 'bloc:military': -4 * (1 - c.democratic) }),
      note: c => c.inst < 35 ? 'Without independent courts, the crusade becomes a purge of rivals.' : null },
  ] },
  { kind: 'choice', id: 'federalism', category: 'governance', label: 'Territorial organisation', desc: 'How much power provinces hold.', default: 'devolved', options: [
    { id: 'unitary', label: 'Unitary', desc: 'Everything decided in the capital.', mods: { taxEff: 0.03, 'bloc:minorities': -10, cohesion: -1 },
      ctx: c => ({ cohesion: -30 * c.nonCore, 'bloc:minorities': -20 * c.nonCore }),
      note: c => c.nonCore > 0.15 ? 'A diverse nation run from one capital breeds separatism.' : null },
    { id: 'devolved', label: 'Devolved', desc: '', mods: {} },
    { id: 'federal', label: 'Federal', desc: 'Provinces have their own legislatures.', mods: { 'bloc:minorities': 12, cohesion: 2, taxEff: -0.02, institutions: 3, stability: 2 },
      ctx: c => ({ cohesion: 15 * c.nonCore, taxEff: -0.02 * ramp(0.3 - c.nonCore, 0, 0.3) }) },
  ] },
  { kind: 'choice', id: 'policing', category: 'governance', label: 'Policing', desc: '', default: 'standard', options: [
    { id: 'community', label: 'Community policing', desc: '', mods: { safety: 2, freedom: 3, 'bloc:progressives': 4 } },
    { id: 'standard', label: 'Standard', desc: '', mods: {} },
    { id: 'militarized', label: 'Militarised', desc: '', mods: { safety: 4, freedom: -6, values: -4, 'bloc:military': 4, 'bloc:progressives': -8, stability: 2 },
      ctx: c => ({ stability: -3 * ramp(c.gini, 42, 55) }) },
  ] },

  // ───────── environment ─────────
  { kind: 'choice', id: 'carbonTax', category: 'environment', label: 'Carbon pricing', desc: '', default: 'none', ai: { green: 'high' }, options: [
    { id: 'none', label: 'None', desc: '', mods: {},
      ctx: c => ({ 'sector:heavy': -0.25 * c.green * ramp(c.openness, 15, 50), 'sector:auto': -0.12 * c.green * ramp(c.openness, 15, 50), values: -5 * c.green }),
      note: c => c.green > 0.4 ? 'Your trading partners now levy carbon border tariffs on dirty exports.' : null },
    { id: 'moderate', label: 'Moderate', desc: '$40 per tonne.', mods: { pollution: -12, renewables: 6, growth: -0.12, 'sector:heavy': -0.08, 'sector:oil': -0.04, values: 4, 'bloc:progressives': 6, 'bloc:business': -4 },
      ctx: c => ({ growth: 0.1 * c.green, brand: 3 * c.green }) },
    { id: 'high', label: 'High', desc: '$120 per tonne.', mods: { pollution: -25, renewables: 14, growth: -0.35, 'sector:heavy': -0.2, 'sector:oil': -0.1, values: 8, 'bloc:progressives': 12, 'bloc:business': -10, 'bloc:rural': -6 },
      ctx: c => ({ growth: 0.3 * c.green, brand: 6 * c.green, 'bloc:workers': -8 * c.resource * 5 }),
      note: c => c.green > 0.45 ? 'Clean technology is cheap now: the cost of carbon pricing has fallen.' : c.resource > 0.1 ? 'A heavy blow to a fossil-fuel economy.' : null },
  ] },
  { kind: 'choice', id: 'envRegulation', category: 'environment', label: 'Environmental regulation', desc: '', default: 'standard', options: [
    { id: 'lax', label: 'Lax', desc: '', mods: { pollution: 20, bizEase: 6, 'sector:heavy': 0.12, 'sector:mining': 0.1, health: -4, 'bloc:business': 5 },
      ctx: c => ({ health: -2 * c.urban, 'bloc:progressives': -8 * c.dev, tourism: -3 }) },
    { id: 'standard', label: 'Standard', desc: '', mods: {} },
    { id: 'strict', label: 'Strict', desc: '', mods: { pollution: -20, bizEase: -6, 'sector:heavy': -0.1, 'sector:mining': -0.1, health: 3, tourism: 3, 'bloc:progressives': 6 },
      ctx: c => ({ growth: -0.25 * ramp(0.5 - c.dev, 0, 0.3) }),
      note: c => c.dev < 0.35 ? 'Rich-country rules in a poor economy cost jobs.' : null },
  ] },
  { kind: 'choice', id: 'energyMix', category: 'environment', label: 'Energy strategy', desc: 'What powers the grid.', default: 'mixed', options: [
    { id: 'fossil', label: 'Fossil fuels', desc: 'Coal and gas. Cheap now.', mods: { pollution: 15, renewables: -10, productivity: 0.01, 'bloc:workers': 3 },
      ctx: c => ({ inflation: 2.5 * Math.max(0, c.oilPrice - 1) * ramp(c.oilImport, 0, 0.04), productivity: -0.02 * Math.max(0, c.oilPrice - 1.2) * ramp(c.oilImport, 0, 0.03) - 0.015 * ramp(c.green, 0.3, 0.7) }),
      note: c => c.oilImport > 0.01 && c.oilPrice > 1.2 ? 'You import your fuel at today’s high prices.' : c.green > 0.45 ? 'Renewables now undercut coal: fossil power is the expensive option.' : null },
    { id: 'mixed', label: 'Mixed', desc: '', mods: {} },
    { id: 'nuclear', label: 'Nuclear', desc: 'Clean baseload, costly plants.', mods: { pollution: -12, renewables: 5, innovation: 3, 'bloc:progressives': -3 },
      ctx: c => ({ productivity: 0.01 * ramp(c.hc, 55, 80) - 0.01 * ramp(45 - c.hc, 0, 20), spend: 0.2 }) },
    { id: 'renewable', label: 'Renewables push', desc: 'Solar, wind and storage.', mods: { pollution: -15, renewables: 25, values: 4, 'bloc:progressives': 8 },
      ctx: c => ({ productivity: 0.03 * c.green - 0.012, inflation: -1 * Math.max(0, c.oilPrice - 1) * ramp(c.oilImport, 0, 0.04) }),
      note: c => c.green > 0.4 ? 'Renewables are now the cheapest power there is.' : c.green < 0.28 ? 'Early adopter: costs are still high, but falling every year.' : null },
  ] },
  { kind: 'choice', id: 'landUse', category: 'environment', isNew: true, label: 'Forests & land', desc: 'Clear land for farms and timber, or protect it.', default: 'sustainable', options: [
    { id: 'exploit', label: 'Clear & exploit', desc: 'Farms, timber, mines.', mods: { 'sector:agriculture': 0.12, 'sector:mining': 0.08, pollution: 6, tourism: -6, values: -5, adapt: -0.15, 'bloc:rural': 6, 'bloc:progressives': -8 },
      note: c => c.heat > 0.25 ? 'Stripped land floods and burns more easily as the climate heats.' : null },
    { id: 'sustainable', label: 'Sustainable use', desc: '', mods: {} },
    { id: 'protect', label: 'Protect & rewild', desc: 'National parks, carbon sinks.', mods: { 'sector:agriculture': -0.06, tourism: 6, values: 5, adapt: 0.12, pollution: -4, 'bloc:rural': -5, 'bloc:progressives': 6 } },
  ] },
  { kind: 'choice', id: 'adaptation', category: 'environment', isNew: true, label: 'Climate adaptation', desc: 'Sea walls, drought-proof crops, heat-ready cities.', default: 'none', options: [
    { id: 'none', label: 'None', desc: '', mods: {},
      note: c => c.heat > 0.25 ? 'Heatwaves, floods and failed harvests are hitting you unprotected.' : null },
    { id: 'basic', label: 'Early warning & defences', desc: '', mods: { adapt: 0.3, spend: 0.25 } },
    { id: 'full', label: 'Climate-proof the nation', desc: '', mods: { adapt: 0.6, spend: 0.7, 'sector:construction': 0.06 },
      note: c => c.heat < 0.1 ? 'Your climate is still mild: an expensive insurance policy.' : null },
  ] },

  // ───────── defense ─────────
  { kind: 'choice', id: 'conscription', category: 'defense', label: 'Conscription', desc: 'Who serves.', default: 'volunteer', options: [
    { id: 'volunteer', label: 'All-volunteer', desc: 'Small, professional, elite.', mods: { manpower: -0.5, military: 0.08, 'bloc:progressives': 3 } },
    { id: 'selective', label: 'Selective service', desc: '', mods: { manpower: 0 } },
    { id: 'universal', label: 'Universal service', desc: 'Everyone serves 12 months.', mods: { manpower: 1.2, military: -0.03, cohesion: 3, laborPart: -0.01, 'bloc:military': 8, 'bloc:progressives': -8 },
      ctx: c => ({ productivity: -0.015 * c.hc / 60, unemployment: -1.5 * ramp(c.young, 0.22, 0.35) }),
      note: c => c.young > 0.27 ? 'Soaks up idle young men who would otherwise be on the streets.' : null },
    { id: 'total', label: 'Total mobilisation', desc: 'A nation in arms.', mods: { manpower: 3, military: -0.1, laborPart: -0.04, growth: -0.5, happiness: -6, 'bloc:military': 12, 'bloc:workers': -10, 'bloc:middle': -8 },
      ctx: c => ({ productivity: -0.04 * c.hc / 60, happiness: c.wars ? 4 : 0 }),
      note: c => !c.wars ? 'Total mobilisation in peacetime is deeply resented.' : null },
  ] },
  { kind: 'choice', id: 'doctrine', category: 'defense', label: 'Military doctrine', desc: 'How the defence budget is spent.', default: 'balanced', options: [
    { id: 'defensive', label: 'Territorial defence', desc: 'Fortify the homeland.', mods: { navy: -0.3, air: -0.1, diplomacy: 3 } },
    { id: 'balanced', label: 'Balanced', desc: '', mods: {} },
    { id: 'navy', label: 'Blue-water navy', desc: 'Command the seas, blockade enemies.', mods: { navy: 0.8, air: -0.1 } },
    { id: 'projection', label: 'Power projection', desc: 'Carriers, bases abroad, expeditionary forces.', mods: { navy: 0.4, air: 0.5, diplomacy: -2, 'bloc:military': 6 } },
  ] },
  { kind: 'choice', id: 'nuclear', category: 'defense', isNew: true, label: 'Nuclear weapons', desc: 'The ultimate deterrent, and the ultimate pariah status.', default: 'none', options: [
    { id: 'none', label: 'Non-nuclear', desc: 'Signed the non-proliferation treaty.', mods: { values: 2 } },
    { id: 'threshold', label: 'Latent capability', desc: 'Could build a bomb within a year.', mods: { deterrence: 0.3, spend: 0.15, innovation: 2, values: -3, 'bloc:military': 4 } },
    { id: 'arsenal', label: 'Nuclear arsenal', desc: 'Deployable warheads.', mods: { spend: 0.5, values: -10, diplomacy: -4, 'bloc:military': 10, 'bloc:progressives': -8, legitimacy: 3 },
      ctx: (_c, yrs) => ({ deterrence: 0.2 + 0.7 * ramp(yrs, 0, 5) }),
      note: (_c, yrs) => yrs < 5 ? 'The programme takes years; until it is finished you are a target.' : 'Nobody invades a nuclear power lightly. Democracies will shun you.' },
  ] },
  { kind: 'choice', id: 'armsExports', category: 'defense', label: 'Arms exports', desc: '', default: 'restricted', options: [
    { id: 'banned', label: 'Banned', desc: '', mods: { 'sector:aerospace': -0.25, values: 4 } },
    { id: 'restricted', label: 'Allies only', desc: '', mods: {} },
    { id: 'aggressive', label: 'Sell to anyone', desc: '', mods: { 'sector:aerospace': 0.3, values: -6, diplomacy: 2, 'bloc:military': 4, 'bloc:business': 4 } },
  ] },

  // ───────── culture & soft power ─────────
  { kind: 'choice', id: 'culturalDiplomacy', category: 'culture', label: 'Cultural diplomacy', desc: 'Projecting language, arts and ideas abroad.', default: 'none', options: [
    { id: 'none', label: 'None', desc: '', mods: {} },
    { id: 'institutes', label: 'Cultural institutes', desc: 'Language schools and arts councils abroad.', mods: { culture: 6, diplomacy: 3, 'sector:media': 0.05 } },
    { id: 'broadcaster', label: 'Global broadcaster', desc: 'A state-funded international news & TV network.', mods: { culture: 10, diplomacy: 4, 'sector:media': 0.12, press: -2, spend: 0.05 } },
  ] },
  { kind: 'choice', id: 'universities', category: 'culture', label: 'International education', desc: 'Attracting foreign students and researchers.', default: 'domestic', options: [
    { id: 'domestic', label: 'Domestic focus', desc: '', mods: {} },
    { id: 'international', label: 'Open to the world', desc: 'Student visas and English-language programmes.', mods: { students: 12, innovation: 3, migration: 3 } },
    { id: 'elite', label: 'Global scholarships', desc: 'Fully funded scholarships for the world\'s best.', mods: { students: 22, innovation: 6, diplomacy: 4, spend: 0.08 } },
  ] },
  { kind: 'choice', id: 'tourismPolicy', category: 'culture', label: 'Tourism & visas', desc: '', default: 'standard', options: [
    { id: 'restricted', label: 'Restricted entry', desc: 'Visas hard to get.', mods: { tourism: -15, 'sector:tourism': -0.3, stability: 1 } },
    { id: 'standard', label: 'Standard', desc: '', mods: {} },
    { id: 'open', label: 'Visa-free & campaigns', desc: 'Global marketing and easy visas.', mods: { tourism: 12, 'sector:tourism': 0.25, culture: 2, 'bloc:religious': -3 } },
  ] },
  { kind: 'choice', id: 'sportsPolicy', category: 'culture', label: 'Sport', desc: '', default: 'grassroots', options: [
    { id: 'grassroots', label: 'Grassroots', desc: 'Sport for health.', mods: { health: 1, happiness: 1 } },
    { id: 'elite', label: 'Elite programmes', desc: 'Medal factories and academies.', mods: { sports: 12, happiness: 1, cohesion: 2 } },
    { id: 'megaevents', label: 'Mega-events & clubs', desc: 'Buy clubs, host tournaments, sign stars.', mods: { sports: 20, tourism: 4, culture: 2, corruption: 2, spend: 0.1 } },
  ] },
]
export const POLICY_MAP = Object.fromEntries(POLICIES.map(p => [p.id, p])) as Record<string, PolicyDef>

/** Fixed + situational modifiers of one option. `yrs` = years it has been in force. */
export function optionMods(p: PolicyDef, value: string | number | undefined, c?: Cond, yrs = 0): Mods {
  if (p.kind === 'slider') {
    const v = typeof value === 'number' ? value : p.default
    const base = p.mods(v)
    if (!c || !p.ctx) return base
    return addMods({ ...base }, p.ctx(v, c, yrs))
  }
  const o = p.options.find(x => x.id === value) ?? p.options.find(x => x.id === p.default)!
  if (!c || !o.ctx) return o.mods
  return addMods({ ...o.mods }, o.ctx(c, yrs))
}
export function optionNote(p: PolicyDef, value: string | number | undefined, c: Cond, yrs = 0): string | null {
  if (p.kind === 'slider') return p.note ? p.note(typeof value === 'number' ? value : p.default, c, yrs) : null
  const o = p.options.find(x => x.id === value)
  return o?.note ? o.note(c, yrs) : null
}
export function addMods(a: Mods, b: Mods) {
  for (const [k, v] of Object.entries(b)) if (v) a[k] = (a[k] ?? 0) + v
  return a
}

// ───────── budget (percent of GDP) ─────────
export interface BudgetLine { id: string; label: string; icon: string; default: number; max: number; desc: string }
export const BUDGET: BudgetLine[] = [
  { id: 'defense', label: 'Defence', icon: '🎖', default: 1.8, max: 12, desc: 'Pays troops (upkeep first), recruitment, navy, air force and military R&D.' },
  { id: 'health', label: 'Health', icon: '🏥', default: 4.5, max: 15, desc: 'Hospitals and public health → life expectancy, productivity, happiness. An older population needs more for the same care.' },
  { id: 'education', label: 'Education', icon: '🎓', default: 4, max: 10, desc: 'Schools and universities → human capital, slowly (a generation).' },
  { id: 'welfare', label: 'Social protection', icon: '🤝', default: 2.2, max: 20, desc: 'Unemployment, disability and family benefits → poverty, inequality, approval. Pensions are paid separately and automatically.' },
  { id: 'infrastructure', label: 'Infrastructure', icon: '🛤', default: 2.5, max: 10, desc: 'Transport, energy, broadband → productivity, distributed across provinces by priority.' },
  { id: 'rnd', label: 'Research & development', icon: '🔬', default: 0.8, max: 6, desc: 'Technology stock → innovation, high-tech industries.' },
  { id: 'security', label: 'Police & justice', icon: '🚓', default: 1.2, max: 5, desc: 'Public safety, rule of law, suppression of unrest and coups.' },
  { id: 'culture', label: 'Culture & media', icon: '🎭', default: 0.25, max: 3, desc: 'Arts, heritage, public broadcasting → cultural soft power.' },
  { id: 'sports', label: 'Sport', icon: '🏟', default: 0.1, max: 2, desc: 'Facilities and athletes → sports soft power, health.' },
  { id: 'environment', label: 'Environment', icon: '🌳', default: 0.4, max: 4, desc: 'Clean-up, conservation, green transition → pollution, renewables, climate resilience.' },
  { id: 'diplomacy', label: 'Diplomacy & foreign aid', icon: '🕊', default: 0.3, max: 3, desc: 'Embassies and development aid → diplomatic soft power, influence over recipients.' },
  { id: 'subsidies', label: 'Industrial subsidies', icon: '🏭', default: 0.2, max: 5, desc: 'Directed to your target industries → faster sector growth.' },
  { id: 'admin', label: 'Public administration', icon: '🗂', default: 2.2, max: 6, desc: 'Civil service capacity → tax efficiency, government effectiveness.' },
]

// ───────── provincial policies ─────────
export const LOCAL_POLICIES = [
  { id: 'focus', label: 'Development focus', options: [
    { id: 'none', label: 'Balanced', desc: '' },
    { id: 'agriculture', label: 'Agriculture', desc: '+40% farming growth' },
    { id: 'industry', label: 'Industry', desc: '+35% manufacturing growth' },
    { id: 'services', label: 'Services', desc: '+35% services growth' },
    { id: 'tourism', label: 'Tourism', desc: '+50% tourism growth' },
    { id: 'resources', label: 'Resources', desc: '+40% mining & oil growth' },
  ] },
  { id: 'sez', label: 'Special economic zone', options: [
    { id: 'off', label: 'No', desc: '' },
    { id: 'on', label: 'Yes', desc: 'Tax holidays: +foreign investment and tradable industry growth, −local tax revenue, +inequality' },
  ] },
  { id: 'autonomy', label: 'Autonomy', options: [
    { id: 'direct', label: 'Direct rule', desc: 'Full tax collection, more unrest in non-core regions' },
    { id: 'devolved', label: 'Devolved', desc: '' },
    { id: 'autonomous', label: 'Autonomous', desc: '−25% taxes from this province, large unrest reduction, +minorities approval' },
  ] },
  { id: 'priority', label: 'Investment priority', options: [
    { id: 'low', label: 'Low', desc: '0.5× share of national infrastructure, health & education spending' },
    { id: 'normal', label: 'Normal', desc: '' },
    { id: 'high', label: 'High', desc: '2× share of national spending' },
  ] },
  { id: 'security', label: 'Security', options: [
    { id: 'normal', label: 'Normal', desc: '' },
    { id: 'heightened', label: 'Heightened', desc: '−unrest, −local happiness' },
    { id: 'martial', label: 'Martial law', desc: 'Crushes unrest; −freedom nationally, −happiness, −economy' },
  ] },
  { id: 'environment', label: 'Land use', options: [
    { id: 'standard', label: 'Standard', desc: '' },
    { id: 'protected', label: 'Protected area', desc: '−50% mining/oil/heavy industry, −pollution, +tourism' },
  ] },
] as const
export type LocalPolicyId = (typeof LOCAL_POLICIES)[number]['id']
export const DEFAULT_LOCAL = { focus: 'none', sez: 'off', autonomy: 'devolved', priority: 'normal', security: 'normal', environment: 'standard' } as Record<LocalPolicyId, string>
