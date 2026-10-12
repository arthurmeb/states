// Every index the simulation computes for every nation, every day.
// "method" names the real-world index whose methodology we approximate.

export type IndexCategory = 'economy' | 'development' | 'society' | 'governance' | 'environment' | 'power' | 'softpower'
export type IndexFmt = 'num' | 'pct' | 'usd' | 'bn' | 'score' | 'idx' | 'years' | 'ratio' | 'rating'
export interface IndexDef { id: string; label: string; category: IndexCategory; fmt: IndexFmt; higher: boolean; method: string; desc: string }

export const INDEX_CATEGORIES: { id: IndexCategory; label: string; icon: string }[] = [
  { id: 'economy', label: 'Economy', icon: '📈' }, { id: 'development', label: 'Human development', icon: '🌱' },
  { id: 'society', label: 'Society', icon: '👥' }, { id: 'governance', label: 'Governance & freedom', icon: '🏛' },
  { id: 'environment', label: 'Environment', icon: '🌍' }, { id: 'power', label: 'Hard power', icon: '🎖' },
  { id: 'softpower', label: 'Soft power', icon: '🎭' },
]

export const INDICES: IndexDef[] = [
  // economy
  { id: 'gdp', label: 'GDP', category: 'economy', fmt: 'bn', higher: true, method: 'World Bank NY.GDP.MKTP', desc: 'Annual output, $ (PPP-like).' },
  { id: 'gdppc', label: 'GDP per capita', category: 'economy', fmt: 'usd', higher: true, method: 'World Bank NY.GDP.PCAP.PP', desc: 'Average annual output per person.' },
  { id: 'growth', label: 'Real GDP growth', category: 'economy', fmt: 'pct', higher: true, method: 'Annualised, 12-month trailing', desc: '' },
  { id: 'inflation', label: 'Inflation', category: 'economy', fmt: 'pct', higher: false, method: 'CPI, annual', desc: '' },
  { id: 'unemployment', label: 'Unemployment', category: 'economy', fmt: 'pct', higher: false, method: 'ILO definition', desc: '' },
  { id: 'debt', label: 'Public debt', category: 'economy', fmt: 'pct', higher: false, method: '% of GDP', desc: '' },
  { id: 'deficit', label: 'Budget balance', category: 'economy', fmt: 'pct', higher: true, method: '% of GDP, annualised', desc: '' },
  { id: 'revenue', label: 'Government revenue', category: 'economy', fmt: 'pct', higher: true, method: '% of GDP', desc: '' },
  { id: 'exports', label: 'Exports', category: 'economy', fmt: 'pct', higher: true, method: '% of GDP', desc: '' },
  { id: 'tradeBalance', label: 'Trade balance', category: 'economy', fmt: 'pct', higher: true, method: '% of GDP', desc: '' },
  { id: 'complexity', label: 'Economic complexity', category: 'economy', fmt: 'score', higher: true, method: 'Harvard Atlas ECI (approx.)', desc: 'Diversity and sophistication of what you make.' },
  { id: 'competitiveness', label: 'Global competitiveness', category: 'economy', fmt: 'score', higher: true, method: 'WEF GCI 12 pillars', desc: 'Institutions, infrastructure, ICT, macro stability, health, skills, markets, finance, market size, business dynamism, innovation.' },
  { id: 'bizEase', label: 'Ease of doing business', category: 'economy', fmt: 'score', higher: true, method: 'World Bank Doing Business (approx.)', desc: '' },
  { id: 'fdi', label: 'FDI attractiveness', category: 'economy', fmt: 'score', higher: true, method: 'Kearney FDI Confidence (approx.)', desc: '' },
  { id: 'innovation', label: 'Innovation', category: 'economy', fmt: 'score', higher: true, method: 'WIPO Global Innovation Index', desc: 'R&D, human capital, high-tech output.' },
  { id: 'credit', label: 'Credit rating', category: 'economy', fmt: 'rating', higher: true, method: 'S&P/Moody\'s style', desc: 'Determines the interest you pay on debt.' },
  { id: 'interest', label: 'Bond yield', category: 'economy', fmt: 'pct', higher: false, method: '10-year sovereign', desc: '' },
  { id: 'foodSecurity', label: 'Food security', category: 'economy', fmt: 'score', higher: true, method: 'EIU Global Food Security', desc: '' },
  { id: 'energySecurity', label: 'Energy security', category: 'economy', fmt: 'score', higher: true, method: 'WEC Energy Trilemma', desc: '' },
  // development
  { id: 'hdi', label: 'Human Development Index', category: 'development', fmt: 'ratio', higher: true, method: 'UNDP HDI formula', desc: 'Life expectancy, schooling and income, geometric mean.' },
  { id: 'lifeExp', label: 'Life expectancy', category: 'development', fmt: 'years', higher: true, method: 'World Bank SP.DYN.LE00', desc: '' },
  { id: 'education', label: 'Education index', category: 'development', fmt: 'score', higher: true, method: 'UNDP mean/expected years', desc: 'Human capital stock.' },
  { id: 'health', label: 'Health system', category: 'development', fmt: 'score', higher: true, method: 'GHS / UHC coverage index', desc: '' },
  { id: 'infrastructure', label: 'Infrastructure', category: 'development', fmt: 'score', higher: true, method: 'WEF pillar 2', desc: '' },
  { id: 'internet', label: 'Internet users', category: 'development', fmt: 'pct', higher: true, method: 'ITU', desc: '' },
  { id: 'urban', label: 'Urbanisation', category: 'development', fmt: 'pct', higher: true, method: 'UN DESA', desc: '' },
  { id: 'poverty', label: 'Extreme poverty', category: 'development', fmt: 'pct', higher: false, method: '$2.15/day, World Bank', desc: '' },
  // society
  { id: 'gini', label: 'Gini coefficient', category: 'society', fmt: 'num', higher: false, method: 'World Bank SI.POV.GINI', desc: 'Income inequality, 0–100.' },
  { id: 'happiness', label: 'Happiness', category: 'society', fmt: 'num', higher: true, method: 'World Happiness Report (Cantril ladder 0–10)', desc: 'Income, health, social support, freedom, generosity, corruption.' },
  { id: 'safety', label: 'Public safety', category: 'society', fmt: 'score', higher: true, method: 'Gallup Law & Order / homicide rate', desc: '' },
  { id: 'homicide', label: 'Homicide rate', category: 'society', fmt: 'num', higher: false, method: 'per 100k, UNODC', desc: '' },
  { id: 'genderEq', label: 'Gender equality', category: 'society', fmt: 'score', higher: true, method: 'WEF Global Gender Gap', desc: '' },
  { id: 'mobility', label: 'Social mobility', category: 'society', fmt: 'score', higher: true, method: 'WEF Social Mobility Index', desc: '' },
  { id: 'cohesion', label: 'Social cohesion', category: 'society', fmt: 'score', higher: true, method: 'Bertelsmann', desc: '' },
  { id: 'housing', label: 'Housing affordability', category: 'society', fmt: 'score', higher: true, method: 'OECD', desc: '' },
  { id: 'fertility', label: 'Fertility rate', category: 'society', fmt: 'num', higher: true, method: 'births per woman', desc: '' },
  { id: 'migration', label: 'Net migration appeal', category: 'society', fmt: 'score', higher: true, method: 'Gallup Potential Net Migration', desc: '' },
  { id: 'approval', label: 'Government approval', category: 'society', fmt: 'pct', higher: true, method: 'Weighted faction approval', desc: '' },
  // governance
  { id: 'democracy', label: 'Democracy index', category: 'governance', fmt: 'num', higher: true, method: 'EIU Democracy Index (0–10)', desc: '' },
  { id: 'freedom', label: 'Freedom score', category: 'governance', fmt: 'score', higher: true, method: 'Freedom House (0–100)', desc: '' },
  { id: 'press', label: 'Press freedom', category: 'governance', fmt: 'score', higher: true, method: 'RSF World Press Freedom', desc: '' },
  { id: 'cpi', label: 'Corruption perceptions', category: 'governance', fmt: 'score', higher: true, method: 'Transparency International CPI (higher = cleaner)', desc: '' },
  { id: 'ruleOfLaw', label: 'Rule of law', category: 'governance', fmt: 'score', higher: true, method: 'WJP / WGI', desc: '' },
  { id: 'govEffect', label: 'Government effectiveness', category: 'governance', fmt: 'score', higher: true, method: 'World Bank WGI', desc: '' },
  { id: 'stability', label: 'Political stability', category: 'governance', fmt: 'score', higher: true, method: 'WGI political stability', desc: '' },
  { id: 'fragility', label: 'Fragile states', category: 'governance', fmt: 'score', higher: false, method: 'Fund for Peace FSI (0–120)', desc: '' },
  // environment
  { id: 'epi', label: 'Environmental performance', category: 'environment', fmt: 'score', higher: true, method: 'Yale EPI', desc: '' },
  { id: 'co2', label: 'CO₂ per capita', category: 'environment', fmt: 'num', higher: false, method: 'tonnes per person', desc: '' },
  { id: 'renewables', label: 'Renewable energy', category: 'environment', fmt: 'pct', higher: true, method: '% of final energy', desc: '' },
  { id: 'airQuality', label: 'Air quality', category: 'environment', fmt: 'score', higher: true, method: 'inverse PM2.5', desc: '' },
  // hard power
  { id: 'military', label: 'Military strength', category: 'power', fmt: 'score', higher: true, method: 'Global Firepower PowerIndex (inverted, 0–100)', desc: '' },
  { id: 'troops', label: 'Active forces', category: 'power', fmt: 'num', higher: true, method: 'thousand personnel', desc: '' },
  { id: 'navy', label: 'Naval power', category: 'power', fmt: 'score', higher: true, method: '', desc: 'Enables blockades and amphibious assaults.' },
  { id: 'air', label: 'Air power', category: 'power', fmt: 'score', higher: true, method: '', desc: 'Multiplies every battle.' },
  { id: 'milSpend', label: 'Military spending', category: 'power', fmt: 'pct', higher: true, method: '% of GDP, SIPRI', desc: '' },
  { id: 'cnp', label: 'Comprehensive national power', category: 'power', fmt: 'score', higher: true, method: 'Lowy Asia Power Index (global)', desc: 'Economy, military, influence, resilience, future resources.' },
  { id: 'influence', label: 'Global influence', category: 'power', fmt: 'score', higher: true, method: 'Trade dependence, aid, alliances, blocs', desc: 'How much other nations depend on you.' },
  // soft power
  { id: 'softPower', label: 'Soft power', category: 'softpower', fmt: 'score', higher: true, method: 'Brand Finance Global Soft Power Index', desc: 'Attraction without coercion.' },
  { id: 'spCulture', label: 'Culture & media', category: 'softpower', fmt: 'score', higher: true, method: 'pillar', desc: 'Film, music, games, broadcasters, heritage.' },
  { id: 'spSports', label: 'Sport', category: 'softpower', fmt: 'score', higher: true, method: 'pillar', desc: 'Athletes, clubs, mega-events.' },
  { id: 'spEducation', label: 'Education & science', category: 'softpower', fmt: 'score', higher: true, method: 'pillar', desc: 'Universities, foreign students, research.' },
  { id: 'spTourism', label: 'Tourism', category: 'softpower', fmt: 'score', higher: true, method: 'pillar', desc: '' },
  { id: 'spGovernance', label: 'Governance & values', category: 'softpower', fmt: 'score', higher: true, method: 'pillar', desc: 'Freedom, rule of law, human rights.' },
  { id: 'spBusiness', label: 'Business & brands', category: 'softpower', fmt: 'score', higher: true, method: 'pillar', desc: 'Global companies, high-tech exports.' },
  { id: 'spDiplomacy', label: 'International relations', category: 'softpower', fmt: 'score', higher: true, method: 'pillar', desc: 'Embassies, aid, alliances, mediation.' },
]
export const INDEX_MAP = Object.fromEntries(INDICES.map(i => [i.id, i])) as Record<string, IndexDef>

export const RATINGS = ['D', 'C', 'CC', 'CCC', 'B-', 'B', 'B+', 'BB-', 'BB', 'BB+', 'BBB-', 'BBB', 'BBB+', 'A-', 'A', 'A+', 'AA-', 'AA', 'AA+', 'AAA']

export function formatIndex(fmt: IndexFmt, v: number | undefined): string {
  if (v == null || !isFinite(v)) return '—'
  switch (fmt) {
    case 'pct': return `${v.toFixed(Math.abs(v) < 10 ? 1 : 0)}%`
    case 'usd': return `$${Math.round(v).toLocaleString('en-US')}`
    case 'bn': return v >= 1000 ? `$${(v / 1000).toFixed(2)}T` : `$${v.toFixed(0)}B`
    case 'years': return `${v.toFixed(1)} yrs`
    case 'ratio': return v.toFixed(3)
    case 'rating': return RATINGS[Math.max(0, Math.min(RATINGS.length - 1, Math.round(v)))]
    case 'num': return v.toFixed(Math.abs(v) < 10 ? 2 : 1)
    default: return v.toFixed(0)
  }
}
