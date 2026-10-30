// The risk radar: long-run pressures building up in a nation, ranked by urgency, each with a pointer
// to the screen where you can act. Nothing here is scripted: every item reads the live simulation.
import { POLICIES, optionNote } from '../../shared/policies'
import { SECTOR_INDEX as S } from '../../shared/sectors'
import { ELECTORAL } from '../../shared/power'
import type { Risk } from '../../shared/types'
import { projectOld } from './demography'
import { policyYears } from './mods'
import { M } from './mods'
import type { Game } from './world'
import type { Nation } from './model'

const f0 = (x: number) => Math.round(x).toString()
const f1 = (x: number) => (Math.round(x * 10) / 10).toString()

export function computeRisks(g: Game, n: Nation): Risk[] {
  const out: Risk[] = []
  const c = n.cond, I = n.idx, F = n.fin, D = n.demo, P = n.power
  const add = (id: string, level: 1 | 2 | 3, icon: string, title: string, text: string, go: string) => out.push({ id, level, icon, title, text, go })

  // power
  if (!n.ai && P.office !== 'governing') add('office', 3, '🚪', P.office === 'exile' ? 'Ousted by the army' : 'In opposition', P.office === 'exile' ? 'The generals rule. Wait for the junta to falter: protests, a collapsing economy or time will bring elections back.' : 'Another party governs. Campaign among the factions and win the next election to return.', 'power')
  if (ELECTORAL.has(String(n.policy.government)) && n.nextElection && P.office === 'governing') {
    const months = (n.nextElection - g.tick) / 30
    const mine = P.votes[P.govParty] ?? 0
    const best = Math.max(0, ...Object.entries(P.votes).filter(([k]) => k !== P.govParty && !P.coalition.includes(k)).map(([, v]) => v))
    if (months < 14 && mine < best + 4) add('election', mine < best ? 3 : 2, '🗳', mine < best ? 'Losing the next election' : 'A close election ahead', `Election in ${f0(months)} months. You poll ${f1(mine)}%, the main rival ${f1(best)}%.`, 'power')
  }
  if (P.coupRisk > 0.004) add('coup', P.coupRisk > 0.02 ? 3 : 2, '🪖', 'Coup risk', `${f1(P.coupRisk * 1200)}% a year. The army's approval is ${f0(n.blocs.military)}.`, 'power')
  if (P.revoRisk > 0.004) add('revolution', P.revoRisk > 0.02 ? 3 : 2, '✊', 'Revolution brewing', `${f1(P.revoRisk * 1200)}% a year. Stability is ${f0(n.stability)}.`, 'power')
  if (P.pc < 8 && P.office === 'governing' && !n.ai) add('pc', 1, '⚡', 'No political capital', 'You can barely pass anything. Approval, a parliamentary majority and legitimacy rebuild it.', 'power')

  // money
  const debt = I.debt ?? 0, def = I.deficit ?? 0
  if (debt > 80 && def < -2) add('debt', debt > 150 ? 3 : debt > 110 ? 2 : 1, '💸', 'Debt spiral', `Debt is ${f0(debt)}% of GDP and the deficit ${f1(-def)}%. Interest costs ${f1((n.ledger.spending.interest ?? 0) / Math.max(0.001, n.gdp) * 100)}% of GDP. Default comes at 220%.`, 'budget')
  if (F.crisis > 0) add('bankcrisis', 3, '🏦', 'Banking crisis', `Output is depressed and credit is contracting for another ${f0(F.crisis)} months.`, 'dynamics')
  else if (c.creditGap > 6) add('credit', F.risk > 0.08 ? 3 : 2, '🫧', 'Credit bubble', `Private credit is ${f0(F.credit)}% of GDP, ${f0(c.creditGap)} points above trend: a ${f0(F.risk * 100)}% yearly chance of a banking crisis.`, 'dynamics')
  if (n.fin.breach > 0) add('rule', 1, '📏', 'Breaking your fiscal rule', `For ${n.fin.breach} months. Every month costs legitimacy and political capital.`, 'budget')
  if (n.inflation > 8) add('inflation', n.inflation > 20 ? 3 : 2, '📈', 'Inflation', `${f1(n.inflation)}% a year and eroding wages.`, 'economic')
  if ((I.unemployment ?? 0) > 10) add('jobs', (I.unemployment ?? 0) > 16 ? 3 : 2, '👷', 'Mass unemployment', `${f1(I.unemployment)}% out of work.`, 'economic')
  if (M(n.mods, 'shortage') > 0.08) add('shortage', 2, '🛒', 'Shortages', 'Price controls are emptying the shelves; black markets are spreading.', 'economic')

  // people
  const in20 = projectOld(n, 20)
  if (D.pensions > 8 || in20.old > D.old + 0.05) add('ageing', D.pensions > 13 ? 3 : D.pensions > 9 ? 2 : 1, '👵', 'Ageing population', `Pensions cost ${f1(D.pensions)}% of GDP. In 20 years ${f0(in20.old * 100)}% of people will be over 65 (now ${f0(D.old * 100)}%).`, 'dynamics')
  if (D.young > 0.3 && (I.unemployment ?? 0) > 8) add('youth', 2, '🧑', 'Youth bulge', `${f0(D.young * 100)}% of people are under 15 and jobs are scarce: tomorrow's unrest.`, 'dynamics')
  if (n.stocks.fertility < 1.45) add('births', n.stocks.fertility < 1.2 ? 2 : 1, '🍼', 'Birth rate collapse', `${f1(n.stocks.fertility)} children per woman. The workforce will shrink.`, 'dynamics')
  if ((I.housing ?? 60) < 40) add('housing', 2, '🏠', 'Housing crisis', `Affordability is ${f0(I.housing)}/100: young people delay families or leave.`, 'welfare')
  if (n.stocks.hc > 55 && (I.migration ?? 50) < 40) add('braindrain', 1, '✈', 'Brain drain', 'Skilled people are emigrating, slowing productivity growth.', 'society')
  if (c.nonCore > 0.15 && n.stocks.cohesion < 45) add('separatism', 2, '🗺', 'Separatism', `${f0(c.nonCore * 100)}% of people live outside your heartland and cohesion is ${f0(n.stocks.cohesion)}.`, 'governance')
  if (n.warWeariness > 40) add('weary', 2, '⚰', 'War weariness', `${f0(n.warWeariness)}% and climbing.`, 'defense')

  // the world
  if (c.resource > 0.1 && g.trends.green > 0.28) add('transition', c.resource > 0.2 ? 3 : 2, '🛢', 'Oil demand is falling', `Resources are ${f0(c.resource * 100)}% of GDP while the world goes green: oil demand is ${f0(g.trends.oilDemand * 100)}% of its starting level.`, 'economy')
  let res = 0, w = 0
  for (const pid of g.owned(n.id)) {
    const p = g.prov[pid], oil = p.output[S.oil], ore = p.output[S.mining]
    res += oil * (p.res?.oil ?? 1) + ore * (p.res?.metals ?? 1); w += oil + ore
  }
  if (w && c.resource > 0.06 && res / w < 0.6) add('depletion', res / w < 0.35 ? 3 : 2, '⛏', 'Reserves running out', `Your fields and mines have about ${f0((res / w) * 100)}% of their reserves left.`, 'economy')
  if (c.heat > 0.2 && M(n.mods, 'adapt') < 0.2) add('climate', c.heat > 0.5 ? 3 : 2, '🌡', 'Climate damage', `The planet is ${f1(g.trends.temp)}°C warmer. Heat is cutting harvests and productivity here.`, 'environment')
  if (c.automation > 0.3 && c.industry > 0.15 && n.stocks.hc < 55) add('automation', 2, '🤖', 'Automation threat', 'Routine factory jobs are being automated, and your workforce lacks the skills for what replaces them.', 'welfare')

  // policies past their sell-by date
  const stale: string[] = []
  for (const p of POLICIES) {
    const yrs = policyYears(n, p.id, g.tick)
    if (yrs < 6) continue
    const note = optionNote(p, n.policy[p.id], c, yrs)
    if (note && /years|decades|lazy|hollow|black market|nobody believes|entrench|cronyism|stopped/i.test(note)) stale.push(p.kind === 'choice' ? p.options.find(o => o.id === n.policy[p.id])?.label ?? p.label : p.label)
  }
  if (stale.length) add('stale', stale.length > 2 ? 2 : 1, '🕰', 'Policies past their sell-by date', `${stale.slice(0, 4).join(', ')}: long in force and now doing more harm than good.`, 'dynamics')

  return out.sort((a, b) => b.level - a.level).slice(0, 10)
}
