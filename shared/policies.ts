// Every national policy is data: each option carries modifiers ("mods") that the simulation sums every day.
// Mod keys are documented in MOD_KEYS. Bloc approvals use `bloc:<id>`, sector attractiveness uses `sector:<id>`.

export type Mods = Record<string, number>

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

export interface PolicyOption { id: string; label: string; desc: string; mods: Mods }
export interface ChoicePolicy { kind: 'choice'; id: string; category: PolicyCategory; label: string; desc: string; options: PolicyOption[]; default: string; cooldown?: number; ai?: Partial<Record<Ideology, string>> }
export interface SliderPolicy { kind: 'slider'; id: string; category: PolicyCategory; label: string; desc: string; min: number; max: number; step: number; default: number; unit: string; mods: (v: number) => Mods }
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

export const POLICIES: PolicyDef[] = [
  // ───────── economy ─────────
  { kind: 'slider', id: 'incomeTax', category: 'economy', label: 'Income tax (top rate)', desc: 'Progressive taxation of wages. Funds the state; erodes middle-class goodwill and work incentives.', min: 0, max: 70, step: 1, default: 30, unit: '%',
    mods: v => ({ gini: -d(v, 30) * 0.12, happiness: -d(v, 30) * 0.06, laborPart: -d(v, 30) * 0.0008, 'bloc:middle': -d(v, 30) * 0.5, 'bloc:business': -d(v, 30) * 0.25, 'bloc:workers': d(v, 30) * 0.15, migration: -d(v, 30) * 0.15 }) },
  { kind: 'slider', id: 'corporateTax', category: 'economy', label: 'Corporate tax', desc: 'Taxes on company profits. Low rates attract multinationals; high rates fund welfare.', min: 0, max: 50, step: 1, default: 22, unit: '%',
    mods: v => ({ fdi: -d(v, 22) * 0.025, growth: -d(v, 22) * 0.02, gini: -d(v, 22) * 0.05, 'bloc:business': -d(v, 22) * 0.7, 'bloc:workers': d(v, 22) * 0.15, 'sector:finance': -d(v, 22) * 0.01 }) },
  { kind: 'slider', id: 'vat', category: 'economy', label: 'Sales tax / VAT', desc: 'Broad consumption tax. Efficient to collect, but regressive.', min: 0, max: 30, step: 1, default: 12, unit: '%',
    mods: v => ({ gini: d(v, 12) * 0.1, happiness: -d(v, 12) * 0.08, inflation: d(v, 12) * 0.03, 'bloc:workers': -d(v, 12) * 0.35, 'bloc:rural': -d(v, 12) * 0.2, 'sector:retail': -d(v, 12) * 0.008 }) },
  { kind: 'slider', id: 'tariff', category: 'economy', label: 'General import tariff', desc: 'Baseline tariff on all imports (bilateral overrides in Trade). Protects domestic industry, raises prices, invites retaliation.', min: 0, max: 80, step: 1, default: 5, unit: '%',
    mods: v => ({ tradeOpen: -d(v, 5) * 0.012, inflation: d(v, 5) * 0.03, productivity: -d(v, 5) * 0.0015, 'bloc:workers': Math.min(d(v, 5), 25) * 0.25, 'bloc:rural': Math.min(d(v, 5), 25) * 0.2, 'bloc:business': -d(v, 5) * 0.25, 'sector:light': d(v, 5) * 0.005, 'sector:heavy': d(v, 5) * 0.006, 'sector:auto': d(v, 5) * 0.004, 'sector:agriculture': d(v, 5) * 0.004 }) },
  { kind: 'choice', id: 'economicSystem', category: 'economy', label: 'Economic system', desc: 'Who owns the commanding heights.', default: 'social', cooldown: 24, ai: { right: 'free', left: 'social', auth: 'statecap' }, options: [
    { id: 'free', label: 'Free market', desc: 'Minimal state ownership, privatised utilities.', mods: { growth: 0.4, bizEase: 12, fdi: 0.2, gini: 4, stateShare: -0.15, 'bloc:business': 15, 'bloc:workers': -10, 'bloc:progressives': -4, corruption: -2 } },
    { id: 'social', label: 'Social market', desc: 'Markets with strong regulation and safety nets.', mods: { gini: -2, happiness: 2, 'bloc:middle': 5, 'bloc:workers': 4 } },
    { id: 'statecap', label: 'State capitalism', desc: 'National champions and state-owned giants.', mods: { growth: 0.1, stateShare: 0.25, corruption: 6, fdi: -0.1, 'bloc:business': -5, 'bloc:military': 4, 'sector:heavy': 0.15, 'sector:energy': 0.1, brand: -3 } },
    { id: 'planned', label: 'Planned economy', desc: 'Central planning and collective ownership.', mods: { growth: -1.0, stateShare: 0.5, corruption: 10, gini: -10, unemployment: -3, bizEase: -30, fdi: -0.6, innovation: -15, 'bloc:business': -40, 'bloc:workers': 8, 'bloc:middle': -15, happiness: -5 } },
  ] },
  { kind: 'choice', id: 'labor', category: 'economy', label: 'Labour regulation', desc: 'Hiring, firing, working hours and union power.', default: 'balanced', ai: { right: 'flexible', left: 'protective' }, options: [
    { id: 'flexible', label: 'Flexible', desc: 'Hire and fire at will.', mods: { unemployment: -1.2, bizEase: 10, gini: 3, happiness: -2, 'bloc:business': 12, 'bloc:workers': -15, 'sector:light': 0.1 } },
    { id: 'balanced', label: 'Balanced', desc: 'Standard protections.', mods: {} },
    { id: 'protective', label: 'Protective', desc: 'Strong job security, short working weeks.', mods: { unemployment: 1.5, bizEase: -10, gini: -3, happiness: 3, 'bloc:workers': 15, 'bloc:business': -14, productivity: -0.02 } },
    { id: 'codetermination', label: 'Co-determination', desc: 'Workers sit on company boards.', mods: { unemployment: 0.3, gini: -4, productivity: 0.02, 'bloc:workers': 18, 'bloc:business': -8, cohesion: 4 } },
  ] },
  { kind: 'choice', id: 'minWage', category: 'economy', label: 'Minimum wage', desc: 'A floor under pay.', default: 'moderate', ai: { right: 'none', left: 'living' }, options: [
    { id: 'none', label: 'None', desc: 'Market wages.', mods: { unemployment: -0.8, poverty: 4, gini: 3, 'bloc:workers': -12, 'bloc:business': 8, 'sector:light': 0.12 } },
    { id: 'low', label: 'Low', desc: 'Symbolic floor.', mods: { unemployment: -0.3, poverty: 1, 'bloc:business': 3, 'bloc:workers': -3 } },
    { id: 'moderate', label: 'Moderate', desc: '≈45% of median wage.', mods: {} },
    { id: 'living', label: 'Living wage', desc: '≈60% of median wage.', mods: { unemployment: 1.2, poverty: -4, gini: -2.5, happiness: 2, 'bloc:workers': 12, 'bloc:business': -9, 'sector:light': -0.15 } },
  ] },
  { kind: 'choice', id: 'centralBank', category: 'economy', label: 'Central bank', desc: 'Who sets interest rates.', default: 'independent', options: [
    { id: 'independent', label: 'Independent', desc: 'Targets 2% inflation. Credible.', mods: { inflation: -1, fdi: 0.1, institutions: 3, 'bloc:business': 4 } },
    { id: 'coordinated', label: 'Coordinated', desc: 'Balances growth and prices with the government.', mods: { inflation: 0.8, growth: 0.1 } },
    { id: 'political', label: 'Political', desc: 'Prints money when the government needs it.', mods: { inflation: 4, growth: 0.2, fdi: -0.25, institutions: -5, 'bloc:business': -8, 'bloc:workers': 3 } },
  ] },
  { kind: 'choice', id: 'fdiPolicy', category: 'economy', label: 'Foreign investment', desc: 'Openness to foreign capital and ownership.', default: 'open', ai: { nat: 'restricted', glob: 'incentives' }, options: [
    { id: 'closed', label: 'Closed', desc: 'No foreign ownership.', mods: { fdi: -0.8, growth: -0.4, innovation: -8, 'bloc:workers': 4, 'bloc:religious': 3, brand: -4 } },
    { id: 'restricted', label: 'Restricted', desc: 'Joint ventures only, strategic sectors protected.', mods: { fdi: -0.3, growth: -0.1, 'bloc:military': 2 } },
    { id: 'open', label: 'Open', desc: 'Equal treatment for foreign firms.', mods: {} },
    { id: 'incentives', label: 'Aggressive incentives', desc: 'Tax holidays and free land for multinationals.', mods: { fdi: 0.5, growth: 0.3, taxEff: -0.05, gini: 1.5, 'bloc:business': 6, 'bloc:workers': -3 } },
  ] },
  { kind: 'choice', id: 'capitalControls', category: 'economy', label: 'Capital controls', desc: 'Restrictions on money crossing borders.', default: 'open', options: [
    { id: 'open', label: 'Open capital account', desc: 'Money flows freely.', mods: { capitalFlow: 1, 'sector:finance': 0.2, inflation: 0.3, stability: -1 } },
    { id: 'managed', label: 'Managed', desc: 'Some limits on hot money.', mods: { capitalFlow: 0.5, 'sector:finance': -0.1 } },
    { id: 'strict', label: 'Strict', desc: 'Currency controls.', mods: { capitalFlow: 0, 'sector:finance': -0.5, fdi: -0.3, corruption: 4, stability: 2 } },
  ] },

  // ───────── welfare ─────────
  { kind: 'choice', id: 'healthcare', category: 'welfare', label: 'Healthcare system', desc: 'How people pay for care.', default: 'insurance', ai: { right: 'private', left: 'universal' }, options: [
    { id: 'private', label: 'Private', desc: 'Pay or insure yourself.', mods: { health: -8, gini: 3, lifeExp: -1.5, 'bloc:business': 6, 'bloc:workers': -10, 'sector:pharma': 0.1 } },
    { id: 'insurance', label: 'Mandatory insurance', desc: 'Regulated multi-payer system.', mods: { health: 2 } },
    { id: 'universal', label: 'Universal single payer', desc: 'Free at the point of use.', mods: { health: 6, gini: -2, happiness: 3, lifeExp: 1.5, 'bloc:workers': 10, 'bloc:middle': 4, 'bloc:business': -4 } },
  ] },
  { kind: 'choice', id: 'tuition', category: 'welfare', label: 'Higher education', desc: 'Who pays for university.', default: 'subsidized', options: [
    { id: 'private', label: 'Full tuition', desc: 'Students pay.', mods: { eduQuality: -4, mobility: -6, gini: 2, 'bloc:progressives': -10 } },
    { id: 'subsidized', label: 'Subsidised', desc: 'Means-tested support.', mods: {} },
    { id: 'free', label: 'Free university', desc: 'Tuition-free for all citizens.', mods: { eduQuality: 5, mobility: 7, gini: -2, 'bloc:progressives': 12, 'bloc:middle': 4 } },
  ] },
  { kind: 'choice', id: 'pensions', category: 'welfare', label: 'Retirement age', desc: 'When people stop working.', default: 'standard', options: [
    { id: 'early', label: 'Early (60)', desc: 'Generous, expensive.', mods: { laborPart: -0.04, happiness: 3, 'bloc:workers': 10, 'bloc:religious': 4, 'bloc:progressives': -3 } },
    { id: 'standard', label: 'Standard (65)', desc: '', mods: {} },
    { id: 'late', label: 'Late (68)', desc: 'Sustainable, unpopular.', mods: { laborPart: 0.03, happiness: -2, 'bloc:workers': -10, 'bloc:business': 5 } },
  ] },
  { kind: 'choice', id: 'welfareModel', category: 'welfare', label: 'Social safety net', desc: 'Support for the poor and unemployed.', default: 'targeted', ai: { right: 'minimal', left: 'generous' }, options: [
    { id: 'minimal', label: 'Minimal', desc: 'Charity and family.', mods: { poverty: 8, gini: 4, laborPart: 0.02, happiness: -4, 'bloc:workers': -12, 'bloc:business': 6, safety: -3 } },
    { id: 'targeted', label: 'Targeted', desc: 'Means-tested benefits.', mods: {} },
    { id: 'generous', label: 'Generous', desc: 'Nordic-style welfare state.', mods: { poverty: -6, gini: -4, happiness: 4, laborPart: -0.015, cohesion: 4, 'bloc:workers': 10, 'bloc:business': -6 } },
    { id: 'ubi', label: 'Universal basic income', desc: 'A cheque for every citizen.', mods: { poverty: -10, gini: -6, happiness: 6, laborPart: -0.04, 'bloc:progressives': 14, 'bloc:business': -10, 'bloc:religious': -4 } },
  ] },
  { kind: 'choice', id: 'housing', category: 'welfare', label: 'Housing', desc: 'How homes are provided.', default: 'market', options: [
    { id: 'market', label: 'Free market', desc: 'Developers build what sells.', mods: { housing: -3, 'sector:construction': 0.1, 'bloc:business': 3 } },
    { id: 'social', label: 'Social housing', desc: 'Public housing programmes.', mods: { housing: 8, gini: -1.5, 'bloc:workers': 6, 'sector:construction': 0.08 } },
    { id: 'rentcontrol', label: 'Rent control', desc: 'Caps on rent increases.', mods: { housing: 3, 'sector:construction': -0.15, 'bloc:progressives': 6, 'bloc:business': -6 } },
  ] },
  { kind: 'choice', id: 'family', category: 'welfare', label: 'Family policy', desc: 'Childcare, parental leave and births.', default: 'support', options: [
    { id: 'none', label: 'Hands off', desc: '', mods: { fertility: -0.2, laborPart: -0.01 } },
    { id: 'support', label: 'Family support', desc: 'Childcare and parental leave.', mods: { fertility: 0.1, laborPart: 0.015, genderEq: 4, happiness: 1 } },
    { id: 'natalist', label: 'Natalist', desc: 'Baby bonuses and tax breaks for large families.', mods: { fertility: 0.4, 'bloc:religious': 8, genderEq: -3 } },
    { id: 'limit', label: 'Birth limits', desc: 'Enforced family size limits.', mods: { fertility: -0.8, freedom: -10, happiness: -4, 'bloc:religious': -12, 'bloc:rural': -8 } },
  ] },

  // ───────── society ─────────
  { kind: 'choice', id: 'immigration', category: 'society', label: 'Immigration', desc: 'Who may come to live and work.', default: 'selective', ai: { nat: 'closed', glob: 'open' }, options: [
    { id: 'closed', label: 'Closed borders', desc: 'Near-zero immigration.', mods: { migration: -40, cohesion: 3, laborPart: -0.01, 'bloc:religious': 8, 'bloc:workers': 4, 'bloc:business': -8, 'bloc:progressives': -10, values: -4 } },
    { id: 'selective', label: 'Selective', desc: 'Points-based skilled migration.', mods: { migration: 5, 'bloc:middle': 2 } },
    { id: 'open', label: 'Open', desc: 'Easy work visas and settlement.', mods: { migration: 30, growth: 0.25, cohesion: -4, 'bloc:business': 8, 'bloc:progressives': 8, 'bloc:religious': -10, values: 4 } },
  ] },
  { kind: 'choice', id: 'refugees', category: 'society', label: 'Refugees', desc: 'Asylum for those fleeing war.', default: 'quota', options: [
    { id: 'reject', label: 'Reject', desc: '', mods: { values: -6, 'bloc:religious': 4, 'bloc:progressives': -8, diplomacy: -3 } },
    { id: 'quota', label: 'Quota', desc: '', mods: {} },
    { id: 'welcome', label: 'Welcome', desc: '', mods: { values: 8, cohesion: -2, 'bloc:progressives': 8, 'bloc:religious': -5, diplomacy: 4 } },
  ] },
  { kind: 'choice', id: 'gender', category: 'society', label: 'Gender equality', desc: 'Rights and roles of women.', default: 'equal', ai: { trad: 'traditional', prog: 'parity' }, options: [
    { id: 'traditional', label: 'Traditional roles', desc: 'Legal and social restrictions on women.', mods: { genderEq: -35, laborPart: -0.06, fertility: 0.3, values: -12, 'bloc:religious': 12, 'bloc:progressives': -18 } },
    { id: 'equal', label: 'Equal rights', desc: 'Legal equality.', mods: {} },
    { id: 'parity', label: 'Active parity', desc: 'Quotas, pay transparency, mandated leave.', mods: { genderEq: 15, laborPart: 0.02, values: 5, 'bloc:progressives': 10, 'bloc:religious': -8, 'bloc:business': -3 } },
  ] },
  { kind: 'choice', id: 'lgbt', category: 'society', label: 'LGBT rights', desc: 'Legal status of sexual minorities.', default: 'tolerated', ai: { trad: 'criminalized', prog: 'equal' }, options: [
    { id: 'criminalized', label: 'Criminalised', desc: '', mods: { freedom: -10, values: -15, migration: -6, 'bloc:religious': 12, 'bloc:progressives': -20, tourism: -4 } },
    { id: 'tolerated', label: 'Tolerated', desc: 'Legal, without recognition.', mods: {} },
    { id: 'equal', label: 'Full equality', desc: 'Marriage equality and anti-discrimination law.', mods: { freedom: 5, values: 8, migration: 4, 'bloc:progressives': 14, 'bloc:religious': -12, culture: 3 } },
  ] },
  { kind: 'choice', id: 'religion', category: 'society', label: 'Religion & state', desc: 'The place of faith in public life.', default: 'secular', options: [
    { id: 'theocratic', label: 'Religious law', desc: 'Scripture is the constitution.', mods: { freedom: -15, values: -10, cohesion: 4, genderEq: -15, 'bloc:religious': 25, 'bloc:progressives': -25, innovation: -6, legitimacy: 6 } },
    { id: 'state', label: 'State church', desc: 'An established national faith.', mods: { cohesion: 2, 'bloc:religious': 10, 'bloc:progressives': -5 } },
    { id: 'secular', label: 'Secular', desc: 'Separation of church and state.', mods: {} },
    { id: 'atheist', label: 'State atheism', desc: 'Religion suppressed.', mods: { freedom: -12, cohesion: -5, 'bloc:religious': -30, 'bloc:progressives': 2, values: -6 } },
  ] },
  { kind: 'choice', id: 'drugs', category: 'society', label: 'Drug policy', desc: 'How the state treats narcotics.', default: 'prohibition', options: [
    { id: 'war', label: 'War on drugs', desc: 'Harsh sentences, militarised policing.', mods: { safety: -2, freedom: -6, corruption: 3, 'bloc:religious': 8, 'bloc:progressives': -10, values: -3 } },
    { id: 'prohibition', label: 'Prohibition', desc: '', mods: {} },
    { id: 'decriminalized', label: 'Decriminalised', desc: 'Treatment, not prison.', mods: { safety: 2, health: 2, 'bloc:progressives': 8, 'bloc:religious': -8 } },
    { id: 'legal', label: 'Legal & regulated', desc: 'Taxed and licensed.', mods: { safety: 3, taxEff: 0.01, tourism: 3, 'bloc:progressives': 12, 'bloc:religious': -14, health: -1 } },
  ] },
  { kind: 'choice', id: 'deathPenalty', category: 'society', label: 'Death penalty', desc: '', default: 'abolished', options: [
    { id: 'abolished', label: 'Abolished', desc: '', mods: { values: 3, 'bloc:progressives': 3 } },
    { id: 'rare', label: 'Rarely used', desc: '', mods: { 'bloc:religious': 3, values: -3 } },
    { id: 'active', label: 'Widely used', desc: '', mods: { safety: 1, freedom: -5, values: -10, 'bloc:religious': 6, 'bloc:progressives': -10 } },
  ] },
  { kind: 'choice', id: 'guns', category: 'society', label: 'Firearms', desc: 'Civilian gun ownership.', default: 'licensed', options: [
    { id: 'banned', label: 'Banned', desc: '', mods: { safety: 4, freedom: -2, 'bloc:rural': -10, 'bloc:progressives': 4 } },
    { id: 'licensed', label: 'Licensed', desc: '', mods: {} },
    { id: 'permissive', label: 'Permissive', desc: 'Carry rights for all.', mods: { safety: -6, freedom: 2, 'bloc:rural': 10, 'bloc:progressives': -8, tourism: -2 } },
  ] },
  { kind: 'choice', id: 'minorityRights', category: 'society', label: 'Minorities & languages', desc: 'How the state treats regional cultures and conquered peoples.', default: 'equal', options: [
    { id: 'assimilate', label: 'Forced assimilation', desc: 'One language, one culture.', mods: { cohesion: -6, freedom: -8, values: -8, 'bloc:minorities': -30, 'bloc:religious': 4, stability: -3 } },
    { id: 'equal', label: 'Equal citizenship', desc: '', mods: {} },
    { id: 'autonomy', label: 'Multicultural autonomy', desc: 'Official regional languages and self-rule.', mods: { cohesion: 6, values: 5, 'bloc:minorities': 22, 'bloc:military': -4, stability: 3 } },
  ] },

  // ───────── governance ─────────
  { kind: 'choice', id: 'government', category: 'governance', label: 'System of government', desc: 'The constitution of the state.', default: 'democracy', cooldown: 36, options: [
    { id: 'democracy', label: 'Liberal democracy', desc: 'Free elections every 4 years. Losing an election forces concessions.', mods: { democracy: 30, freedom: 10, institutions: 6, legitimacy: 10, values: 15, 'bloc:middle': 6, 'bloc:progressives': 8, 'bloc:military': -6, taxEff: 0.03 } },
    { id: 'monarchy', label: 'Constitutional monarchy', desc: 'Elected parliament under a crown. Very stable.', mods: { democracy: 25, freedom: 8, institutions: 6, stability: 6, legitimacy: 12, values: 12, 'bloc:religious': 6, culture: 3 } },
    { id: 'technocracy', label: 'Technocracy', desc: 'Rule by appointed experts.', mods: { democracy: 5, institutions: 8, growth: 0.2, innovation: 8, taxEff: 0.05, 'bloc:business': 6, 'bloc:religious': -10, 'bloc:progressives': -4, legitimacy: -4 } },
    { id: 'oneparty', label: 'One-party state', desc: 'The party leads everything.', mods: { democracy: -30, freedom: -15, corruption: 8, stability: 4, surveillance: 15, values: -15, 'bloc:progressives': -15, 'bloc:middle': -6, 'bloc:military': 5, legitimacy: -5 } },
    { id: 'junta', label: 'Military junta', desc: 'Generals in charge.', mods: { democracy: -40, freedom: -20, corruption: 12, military: 0.1, manpower: 0.2, values: -20, 'bloc:military': 25, 'bloc:progressives': -25, 'bloc:middle': -10, fdi: -0.3, legitimacy: -15 } },
    { id: 'theocracy', label: 'Theocracy', desc: 'Clerics hold ultimate authority.', mods: { democracy: -25, freedom: -18, cohesion: 3, values: -15, 'bloc:religious': 30, 'bloc:progressives': -30, innovation: -8, legitimacy: 4 } },
  ] },
  { kind: 'choice', id: 'press', category: 'governance', label: 'Press freedom', desc: 'Independence of journalism.', default: 'free', ai: { auth: 'state', lib: 'free' }, options: [
    { id: 'free', label: 'Free press', desc: 'Scandals surface; trust is earned.', mods: { press: 30, corruption: -6, values: 8, culture: 4, 'bloc:progressives': 6, stability: -2 } },
    { id: 'regulated', label: 'Regulated', desc: 'Licensing and "fake news" laws.', mods: { press: 5, stability: 1 } },
    { id: 'state', label: 'State-controlled', desc: 'The news is what we say it is.', mods: { press: -30, corruption: 8, values: -12, stability: 4, legitimacy: 3, 'bloc:progressives': -14, culture: -6 } },
  ] },
  { kind: 'choice', id: 'internet', category: 'governance', label: 'Internet', desc: 'Online freedom.', default: 'open', options: [
    { id: 'open', label: 'Open internet', desc: '', mods: { innovation: 4, freedom: 3, 'sector:software': 0.1 } },
    { id: 'filtered', label: 'Filtered', desc: 'Blocks on "harmful" sites.', mods: { freedom: -4, stability: 1, 'sector:software': -0.05 } },
    { id: 'firewall', label: 'National firewall', desc: 'A sovereign walled internet.', mods: { freedom: -12, innovation: -6, stability: 3, surveillance: 10, 'sector:software': -0.15, values: -6, 'bloc:progressives': -12 } },
  ] },
  { kind: 'choice', id: 'surveillance', category: 'governance', label: 'Surveillance', desc: 'How closely the state watches its people.', default: 'targeted', options: [
    { id: 'limited', label: 'Limited', desc: 'Warrants required.', mods: { freedom: 4, safety: -2, 'bloc:progressives': 4 } },
    { id: 'targeted', label: 'Targeted', desc: '', mods: {} },
    { id: 'mass', label: 'Mass surveillance', desc: 'Cameras and data everywhere.', mods: { freedom: -10, safety: 5, surveillance: 25, stability: 4, values: -8, 'bloc:progressives': -12, 'bloc:military': 4 } },
  ] },
  { kind: 'choice', id: 'judiciary', category: 'governance', label: 'Judiciary', desc: 'Independence of the courts.', default: 'independent', options: [
    { id: 'independent', label: 'Independent', desc: '', mods: { institutions: 10, corruption: -6, fdi: 0.15, values: 5 } },
    { id: 'influenced', label: 'Influenced', desc: 'Judges appointed by the ruling party.', mods: { institutions: -5, corruption: 3 } },
    { id: 'captured', label: 'Captured', desc: 'Courts serve the regime.', mods: { institutions: -18, corruption: 10, fdi: -0.25, freedom: -8, values: -10, stability: 2 } },
  ] },
  { kind: 'choice', id: 'antiCorruption', category: 'governance', label: 'Anti-corruption', desc: '', default: 'standard', options: [
    { id: 'lax', label: 'Lax', desc: 'Grease the wheels.', mods: { corruption: 10, 'bloc:business': 4, institutions: -4 } },
    { id: 'standard', label: 'Standard', desc: '', mods: {} },
    { id: 'crusade', label: 'Anti-graft crusade', desc: 'Purges and prosecutions.', mods: { corruption: -12, institutions: 4, stability: -3, 'bloc:business': -6, 'bloc:middle': 6, taxEff: 0.04 } },
  ] },
  { kind: 'choice', id: 'federalism', category: 'governance', label: 'Territorial organisation', desc: 'How much power provinces hold.', default: 'devolved', options: [
    { id: 'unitary', label: 'Unitary', desc: 'Everything decided in the capital.', mods: { taxEff: 0.03, 'bloc:minorities': -10, cohesion: -2 } },
    { id: 'devolved', label: 'Devolved', desc: '', mods: {} },
    { id: 'federal', label: 'Federal', desc: 'Provinces have their own legislatures.', mods: { 'bloc:minorities': 12, cohesion: 4, taxEff: -0.03, institutions: 3, stability: 2 } },
  ] },
  { kind: 'choice', id: 'policing', category: 'governance', label: 'Policing', desc: '', default: 'standard', options: [
    { id: 'community', label: 'Community policing', desc: '', mods: { safety: 2, freedom: 3, 'bloc:progressives': 4 } },
    { id: 'standard', label: 'Standard', desc: '', mods: {} },
    { id: 'militarized', label: 'Militarised', desc: '', mods: { safety: 4, freedom: -6, values: -4, 'bloc:military': 4, 'bloc:progressives': -8, stability: 2 } },
  ] },

  // ───────── environment ─────────
  { kind: 'choice', id: 'carbonTax', category: 'environment', label: 'Carbon pricing', desc: '', default: 'none', ai: { green: 'high' }, options: [
    { id: 'none', label: 'None', desc: '', mods: {} },
    { id: 'moderate', label: 'Moderate', desc: '$40 per tonne.', mods: { pollution: -12, renewables: 6, growth: -0.1, 'sector:heavy': -0.08, 'sector:oil': -0.04, values: 4, 'bloc:progressives': 6, 'bloc:business': -4 } },
    { id: 'high', label: 'High', desc: '$120 per tonne.', mods: { pollution: -25, renewables: 14, growth: -0.3, 'sector:heavy': -0.2, 'sector:oil': -0.1, values: 8, 'bloc:progressives': 12, 'bloc:business': -10, 'bloc:rural': -6 } },
  ] },
  { kind: 'choice', id: 'envRegulation', category: 'environment', label: 'Environmental regulation', desc: '', default: 'standard', options: [
    { id: 'lax', label: 'Lax', desc: '', mods: { pollution: 20, bizEase: 6, 'sector:heavy': 0.12, 'sector:mining': 0.1, health: -4, 'bloc:business': 5 } },
    { id: 'standard', label: 'Standard', desc: '', mods: {} },
    { id: 'strict', label: 'Strict', desc: '', mods: { pollution: -20, bizEase: -6, 'sector:heavy': -0.1, 'sector:mining': -0.1, health: 3, tourism: 3, 'bloc:progressives': 6 } },
  ] },
  { kind: 'choice', id: 'energyMix', category: 'environment', label: 'Energy strategy', desc: 'What powers the grid.', default: 'mixed', options: [
    { id: 'fossil', label: 'Fossil fuels', desc: 'Coal and gas. Cheap now.', mods: { pollution: 15, renewables: -10, productivity: 0.01, 'bloc:workers': 3 } },
    { id: 'mixed', label: 'Mixed', desc: '', mods: {} },
    { id: 'nuclear', label: 'Nuclear', desc: 'Clean baseload, costly plants.', mods: { pollution: -12, renewables: 5, innovation: 3, 'bloc:progressives': -3 } },
    { id: 'renewable', label: 'Renewables push', desc: 'Solar, wind and storage.', mods: { pollution: -15, renewables: 25, productivity: -0.01, values: 4, 'bloc:progressives': 8 } },
  ] },

  // ───────── defense ─────────
  { kind: 'choice', id: 'conscription', category: 'defense', label: 'Conscription', desc: 'Who serves.', default: 'volunteer', options: [
    { id: 'volunteer', label: 'All-volunteer', desc: 'Small, professional, elite.', mods: { manpower: -0.5, military: 0.08, 'bloc:progressives': 3 } },
    { id: 'selective', label: 'Selective service', desc: '', mods: { manpower: 0 } },
    { id: 'universal', label: 'Universal service', desc: 'Everyone serves 12 months.', mods: { manpower: 1.2, military: -0.03, cohesion: 3, laborPart: -0.01, 'bloc:military': 8, 'bloc:progressives': -8 } },
    { id: 'total', label: 'Total mobilisation', desc: 'A nation in arms.', mods: { manpower: 3, military: -0.1, laborPart: -0.04, growth: -0.5, happiness: -6, 'bloc:military': 12, 'bloc:workers': -10, 'bloc:middle': -8 } },
  ] },
  { kind: 'choice', id: 'doctrine', category: 'defense', label: 'Military doctrine', desc: 'How the defence budget is spent.', default: 'balanced', options: [
    { id: 'defensive', label: 'Territorial defence', desc: 'Fortify the homeland.', mods: { navy: -0.3, air: -0.1, diplomacy: 3 } },
    { id: 'balanced', label: 'Balanced', desc: '', mods: {} },
    { id: 'navy', label: 'Blue-water navy', desc: 'Command the seas, blockade enemies.', mods: { navy: 0.8, air: -0.1 } },
    { id: 'projection', label: 'Power projection', desc: 'Carriers, bases abroad, expeditionary forces.', mods: { navy: 0.4, air: 0.5, diplomacy: -2, 'bloc:military': 6 } },
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
    { id: 'broadcaster', label: 'Global broadcaster', desc: 'A state-funded international news & TV network.', mods: { culture: 10, diplomacy: 4, 'sector:media': 0.12, press: -2 } },
  ] },
  { kind: 'choice', id: 'universities', category: 'culture', label: 'International education', desc: 'Attracting foreign students and researchers.', default: 'domestic', options: [
    { id: 'domestic', label: 'Domestic focus', desc: '', mods: {} },
    { id: 'international', label: 'Open to the world', desc: 'Student visas and English-language programmes.', mods: { students: 12, innovation: 3, migration: 3 } },
    { id: 'elite', label: 'Global scholarships', desc: 'Fully funded scholarships for the world\'s best.', mods: { students: 22, innovation: 6, diplomacy: 4 } },
  ] },
  { kind: 'choice', id: 'tourismPolicy', category: 'culture', label: 'Tourism & visas', desc: '', default: 'standard', options: [
    { id: 'restricted', label: 'Restricted entry', desc: 'Visas hard to get.', mods: { tourism: -15, 'sector:tourism': -0.3, stability: 1 } },
    { id: 'standard', label: 'Standard', desc: '', mods: {} },
    { id: 'open', label: 'Visa-free & campaigns', desc: 'Global marketing and easy visas.', mods: { tourism: 12, 'sector:tourism': 0.25, culture: 2, 'bloc:religious': -3 } },
  ] },
  { kind: 'choice', id: 'sportsPolicy', category: 'culture', label: 'Sport', desc: '', default: 'grassroots', options: [
    { id: 'grassroots', label: 'Grassroots', desc: 'Sport for health.', mods: { health: 1, happiness: 1 } },
    { id: 'elite', label: 'Elite programmes', desc: 'Medal factories and academies.', mods: { sports: 12, happiness: 1, cohesion: 2 } },
    { id: 'megaevents', label: 'Mega-events & clubs', desc: 'Buy clubs, host tournaments, sign stars.', mods: { sports: 20, tourism: 4, culture: 2, corruption: 2 } },
  ] },
]
export const POLICY_MAP = Object.fromEntries(POLICIES.map(p => [p.id, p])) as Record<string, PolicyDef>

// ───────── budget (percent of GDP) ─────────
export interface BudgetLine { id: string; label: string; icon: string; default: number; max: number; desc: string }
export const BUDGET: BudgetLine[] = [
  { id: 'defense', label: 'Defence', icon: '🎖', default: 1.8, max: 12, desc: 'Pays troops (upkeep first), recruitment, navy, air force and military R&D.' },
  { id: 'health', label: 'Health', icon: '🏥', default: 4.5, max: 15, desc: 'Hospitals and public health → life expectancy, productivity, happiness.' },
  { id: 'education', label: 'Education', icon: '🎓', default: 4, max: 10, desc: 'Schools and universities → human capital, slowly (a generation).' },
  { id: 'welfare', label: 'Social protection', icon: '🤝', default: 4.5, max: 20, desc: 'Benefits and pensions → poverty, inequality, approval.' },
  { id: 'infrastructure', label: 'Infrastructure', icon: '🛤', default: 2.5, max: 10, desc: 'Transport, energy, broadband → productivity, distributed across provinces by priority.' },
  { id: 'rnd', label: 'Research & development', icon: '🔬', default: 0.8, max: 6, desc: 'Technology stock → innovation, high-tech industries.' },
  { id: 'security', label: 'Police & justice', icon: '🚓', default: 1.2, max: 5, desc: 'Public safety, rule of law, suppression of unrest.' },
  { id: 'culture', label: 'Culture & media', icon: '🎭', default: 0.25, max: 3, desc: 'Arts, heritage, public broadcasting → cultural soft power.' },
  { id: 'sports', label: 'Sport', icon: '🏟', default: 0.1, max: 2, desc: 'Facilities and athletes → sports soft power, health.' },
  { id: 'environment', label: 'Environment', icon: '🌳', default: 0.4, max: 4, desc: 'Clean-up, conservation, green transition → pollution, renewables.' },
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
