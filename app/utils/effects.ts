import { BLOCS, type Mods } from '~~/shared/policies'
import { SECTORS } from '~~/shared/sectors'

const LABEL: Record<string, string> = {
  growth: 'growth', productivity: 'productivity', fdi: 'foreign investment', inflation: 'inflation', unemployment: 'unemployment', laborPart: 'labour force',
  bizEase: 'business climate', taxEff: 'tax collection', tradeOpen: 'trade openness', capitalFlow: 'capital mobility', innovation: 'innovation', stateShare: 'state resource rents',
  gini: 'inequality', poverty: 'poverty', happiness: 'happiness', health: 'health', eduQuality: 'education', safety: 'safety', cohesion: 'cohesion', genderEq: 'gender equality',
  fertility: 'birth rate', migration: 'immigration appeal', housing: 'housing', mobility: 'social mobility', corruption: 'corruption', institutions: 'institutions',
  freedom: 'civil liberties', press: 'press freedom', democracy: 'democracy', stability: 'stability', legitimacy: 'legitimacy', surveillance: 'surveillance',
  pollution: 'pollution', renewables: 'renewables', culture: 'culture SP', brand: 'brands SP', tourism: 'tourism', values: 'values SP', sports: 'sports SP',
  diplomacy: 'diplomacy SP', students: 'foreign students', military: 'military quality', manpower: 'manpower', navy: 'navy', air: 'air power', lifeExp: 'life expectancy',
}
/** keys where a lower number is better */
const LOWER_BETTER = new Set(['inflation', 'unemployment', 'gini', 'poverty', 'corruption', 'pollution', 'surveillance'])
const SCALE: Record<string, number> = { growth: 1, productivity: 100, fdi: 100, laborPart: 100, taxEff: 100, tradeOpen: 100, stateShare: 100, manpower: 100, military: 100, navy: 100, air: 100, capitalFlow: 100, fertility: 1 }
const PCT = new Set(['productivity', 'fdi', 'laborPart', 'taxEff', 'tradeOpen', 'stateShare', 'manpower', 'military', 'navy', 'air', 'capitalFlow'])

export interface Chip { text: string; good: boolean; weight: number }

export function effectChips(mods: Mods, limit = 8): Chip[] {
  const chips: Chip[] = []
  for (const [k, raw] of Object.entries(mods)) {
    if (!raw) continue
    if (k.startsWith('bloc:')) {
      const b = BLOCS.find(x => x.id === k.slice(5))
      chips.push({ text: `${raw > 0 ? '+' : '−'}${Math.abs(Math.round(raw))} ${b?.icon ?? ''} ${b?.label.split(' ')[0].toLowerCase() ?? k}`, good: raw > 0, weight: Math.abs(raw) / 2 })
      continue
    }
    if (k.startsWith('sector:')) {
      const s = SECTORS.find(x => x.id === k.slice(7))
      chips.push({ text: `${raw > 0 ? '+' : '−'}${Math.abs(Math.round(raw * 100))}% ${s?.icon ?? ''} ${s?.label.split(' ')[0].toLowerCase()}`, good: raw > 0, weight: Math.abs(raw) * 40 })
      continue
    }
    const v = raw * (SCALE[k] ?? 1)
    const good = LOWER_BETTER.has(k) ? raw < 0 : raw > 0
    const num = Math.abs(v) < 1 ? Math.abs(v).toFixed(2) : Math.abs(v) < 10 ? Math.abs(v).toFixed(1) : Math.round(Math.abs(v)).toString()
    chips.push({ text: `${v > 0 ? '+' : '−'}${num}${PCT.has(k) ? '%' : k === 'growth' ? 'pp' : ''} ${LABEL[k] ?? k}`, good, weight: Math.abs(v) * (k === 'growth' ? 10 : 1) })
  }
  return chips.sort((a, b) => b.weight - a.weight).slice(0, limit)
}
