import type { BlocId } from '../../shared/policies'
import { SECTOR_INDEX as S } from '../../shared/sectors'
import { DAYS_PER_MONTH, TERRAIN } from '../../shared/rules'
import type { Game } from './world'
import type { Nation } from './model'

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]
const money = (n: Nation, months: number) => { n.treasury += n.gdp * months }
const blocs = (n: Nation, d: Partial<Record<BlocId, number>>) => { for (const [k, v] of Object.entries(d)) n.blocs[k as BlocId] = clamp(n.blocs[k as BlocId] + v!, 0, 100) }
const stab = (n: Nation, d: number) => { n.stability = clamp(n.stability + d, 0, 100) }
const stock = (n: Nation, k: keyof Nation['stocks'], d: number) => { n.stocks[k] = clamp(n.stocks[k] + d, 0, 100) }
const capital = (n: Nation, g: Game) => g.P[n.capital]?.name ?? 'the capital'
const someProvince = (n: Nation, g: Game, f: (pid: number) => boolean = () => true) => {
  const l = g.owned(n.id).filter(f)
  return l.length ? g.P[pick(l)].name : capital(n, g)
}
const share = (n: Nation, s: number) => n.sectorOut[s] / Math.max(0.001, n.gdp)

export interface IssueTemplate {
  key: string; title: string
  when?: (n: Nation, g: Game) => boolean
  text: (n: Nation, g: Game) => string
  options: { label: string; desc: string; apply: (n: Nation, g: Game) => void }[]
}

export const ISSUES: IssueTemplate[] = [
  { key: 'dockstrike', title: 'The Docks Fall Silent', when: (n, g) => g.owned(n.id).some(p => g.P[p].coastal),
    text: (n, g) => `Dockworkers in ${someProvince(n, g, p => g.P[p].coastal)} have walked out over automation. Ships queue offshore; exporters are furious.`,
    options: [
      { label: 'Meet their demands', desc: '+Workers, −Business, costs ~0.3 months of GDP.', apply: n => { money(n, -0.3); blocs(n, { workers: 12, business: -8 }) } },
      { label: 'Send in the riot police', desc: 'Order restored at a price.', apply: n => { blocs(n, { workers: -15, business: 8, military: 4, progressives: -6 }); stab(n, -3) } },
      { label: 'Automate the ports', desc: 'Costly, modern. +Infrastructure.', apply: (n, g) => { money(n, -0.8); for (const p of g.owned(n.id)) if (g.P[p].coastal) g.prov[p].infra += 3; blocs(n, { workers: -8, business: 6 }) } },
    ] },
  { key: 'oilwindfall', title: 'Black Gold Windfall', when: n => share(n, S.oil) > 0.05,
    text: () => 'Oil prices have spiked and the national petroleum company is swimming in cash. Ministers are fighting over the windfall.',
    options: [
      { label: 'Sovereign wealth fund', desc: '+0.8 months of GDP to treasury.', apply: n => { money(n, 0.8); blocs(n, { business: 4 }) } },
      { label: 'Citizen dividend', desc: 'Cash to every household.', apply: n => { blocs(n, { workers: 14, rural: 8, middle: 6 }); stab(n, 4) } },
      { label: 'Diversify: build a tech city', desc: 'Long-term bet on knowledge industries.', apply: n => { money(n, -0.3); stock(n, 'tech', 4); n.subsidies = [...new Set([...n.subsidies, 'software' as const])].slice(0, 3) } },
    ] },
  { key: 'drought', title: 'The Rains Have Failed', when: n => share(n, S.agriculture) > 0.04,
    text: (n, g) => `A brutal drought scorches the fields of ${someProvince(n, g, p => TERRAIN[g.P[p].terrain].food > 0.5)}. Bread prices are climbing.`,
    options: [
      { label: 'Emergency grain imports', desc: 'Costs ~0.3 months of GDP.', apply: n => { money(n, -0.3); stab(n, 2) } },
      { label: 'Ration bread', desc: 'Cheap but deeply unpopular.', apply: n => { blocs(n, { workers: -10, rural: -8 }); stab(n, -5) } },
      { label: 'Irrigation megaproject', desc: 'Pays off forever. +Infrastructure in farm regions.', apply: (n, g) => { money(n, -1); for (const p of g.owned(n.id)) if (g.P[p].fertility) g.prov[p].infra += 5; blocs(n, { rural: 10 }) } },
    ] },
  { key: 'university', title: 'A University for Every Province?',
    text: n => `The Education Minister of ${n.name} proposes a sweeping expansion of higher education.`,
    options: [
      { label: 'Fund it fully', desc: '+Human capital everywhere. ~0.6 months of GDP.', apply: (n, g) => { money(n, -0.6); for (const p of g.owned(n.id)) g.prov[p].edu += 4; blocs(n, { religious: -5, progressives: 8 }) } },
      { label: 'Technical colleges only', desc: 'Practical, cheaper.', apply: (n, g) => { money(n, -0.25); for (const p of g.owned(n.id)) g.prov[p].edu += 1.5; blocs(n, { business: 4 }) } },
      { label: 'Reject it', desc: 'Students protest.', apply: n => blocs(n, { progressives: -8, religious: 3 }) },
    ] },
  { key: 'protests', title: 'Crowds in the Capital', when: n => n.stability < 55,
    text: (n, g) => `Tens of thousands fill the squares of ${capital(n, g)}, chanting against ${n.leader}. Some carry flags; some carry bricks.`,
    options: [
      { label: 'Crack down hard', desc: 'Short-term order, long-term resentment, −press freedom.', apply: n => { stab(n, 6); blocs(n, { progressives: -16, workers: -6, military: 6 }); n.policy.press = 'state' } },
      { label: 'Announce reforms', desc: 'Concessions to the street.', apply: n => { money(n, -0.3); blocs(n, { workers: 10, progressives: 8 }); stab(n, 4) } },
      { label: 'Call a referendum', desc: 'Let the people decide. Risky.', apply: n => stab(n, Math.random() < 0.6 ? 10 : -8) },
    ] },
  { key: 'techhq', title: 'A Tech Giant Comes Calling', when: n => n.stocks.hc > 45,
    text: n => `OmniCorp wants to put its regional headquarters in ${n.name} — 40,000 jobs — in exchange for a ten-year tax holiday.`,
    options: [
      { label: 'Roll out the red carpet', desc: '+Software sector, +brand, lost revenue.', apply: (n, g) => { money(n, -0.3); stock(n, 'brand', 4); const c = g.prov[n.capital]; c.jobs[S.software] += 40; blocs(n, { business: 10 }) } },
      { label: 'Negotiate hard', desc: 'They come, smaller.', apply: (n, g) => { g.prov[n.capital].jobs[S.software] += 15; blocs(n, { business: 3 }) } },
      { label: 'No special treatment', desc: 'Rules apply to everyone.', apply: n => blocs(n, { workers: 5, business: -6 }) },
    ] },
  { key: 'streaming', title: 'Lights, Camera, Diplomacy', when: n => n.stocks.culture > 15 || share(n, S.media) > 0.01,
    text: (n, g) => `A global streaming platform wants to shoot a blockbuster series in ${someProvince(n, g)} — but the script portrays your history unflatteringly.`,
    options: [
      { label: 'Welcome them, warts and all', desc: '+Cultural soft power, +tourism. Traditionalists fume.', apply: n => { stock(n, 'culture', 6); blocs(n, { religious: -6, progressives: 5 }) } },
      { label: 'Demand script changes', desc: 'They might walk.', apply: n => { if (Math.random() < 0.5) stock(n, 'culture', 3); blocs(n, { religious: 3 }) } },
      { label: 'Fund our own studios instead', desc: 'National cinema subsidy.', apply: n => { money(n, -0.2); n.subsidies = [...new Set([...n.subsidies, 'media' as const])].slice(0, 3); stock(n, 'culture', 2) } },
    ] },
  { key: 'refugees', title: 'Refugees at the Gates',
    text: (n, g) => `War and drought abroad have sent hundreds of thousands of refugees towards ${someProvince(n, g)}.`,
    options: [
      { label: 'Welcome them', desc: '+1.5% population. +Values soft power.', apply: (n, g) => { for (const p of g.owned(n.id)) g.prov[p].pop *= 1.015; money(n, -0.15); blocs(n, { religious: -8, business: 6, progressives: 6 }); n.policy.refugees = 'welcome' } },
      { label: 'Temporary camps', desc: 'A compromise nobody loves.', apply: (n, g) => { for (const p of g.owned(n.id)) g.prov[p].pop *= 1.004; money(n, -0.1) } },
      { label: 'Close the borders', desc: 'Popular with some; damaging abroad.', apply: n => { blocs(n, { religious: 10, rural: 4, progressives: -8 }); n.policy.refugees = 'reject' } },
    ] },
  { key: 'scandal', title: 'Minister Caught with Hand in Till',
    text: n => `The Finance Minister of ${n.name} has been photographed accepting a suitcase of cash from a construction magnate.`,
    options: [
      { label: 'Full public inquiry', desc: '−Corruption, short-term pain.', apply: n => { stab(n, -4); stock(n, 'corruption', -3); blocs(n, { middle: 8, business: -5 }) } },
      { label: 'Quietly reassign him', desc: 'Make it go away.', apply: n => { stock(n, 'corruption', 2); blocs(n, { middle: -6 }) } },
      { label: 'Arrest the journalists', desc: 'What scandal?', apply: n => { n.policy.press = 'state'; stab(n, 3); blocs(n, { progressives: -12 }) } },
    ] },
  { key: 'rail', title: 'High-Speed Ambitions', when: (n, g) => g.owned(n.id).length >= 4,
    text: (n, g) => `Engineers propose high-speed rail linking ${capital(n, g)} to ${someProvince(n, g)}.`,
    options: [
      { label: 'Build it with public money', desc: '~1 month of GDP. Big +infrastructure.', apply: (n, g) => { money(n, -1); for (const p of g.owned(n.id)) g.prov[p].infra += 4 } },
      { label: 'Private concession', desc: 'Cheaper; fares are high.', apply: (n, g) => { for (const p of g.owned(n.id)) g.prov[p].infra += 2; blocs(n, { business: 8, workers: -5 }) } },
      { label: 'Shelve it', desc: 'Not this decade.', apply: n => blocs(n, { business: -4 }) },
    ] },
  { key: 'generals', title: 'The Generals Want Toys', when: n => n.blocs.military < 50,
    text: n => `The Chief of Staff of ${n.name} warns the army is "a museum with rifles". The officer corps is restless.`,
    options: [
      { label: 'Modernisation programme', desc: '~0.7 months of GDP. +Military tech.', apply: n => { money(n, -0.7); stock(n, 'milTech', 8); blocs(n, { military: 14 }) } },
      { label: 'Promote the loudest general', desc: 'Cheap loyalty.', apply: n => blocs(n, { military: 6, progressives: -3 }) },
      { label: 'Remind them who is in charge', desc: 'Civilian control. Coup risk rises.', apply: n => blocs(n, { military: -12, progressives: 4 }) },
    ] },
  { key: 'pandemic', title: 'A Strange Fever',
    text: (n, g) => `Hospitals in ${someProvince(n, g)} report a fast-spreading respiratory illness.`,
    options: [
      { label: 'Strict lockdown', desc: 'Lives saved; ~0.5 months of GDP lost.', apply: n => { money(n, -0.5); blocs(n, { business: -10 }) } },
      { label: 'Masks and testing', desc: 'Middle path.', apply: (n, g) => { money(n, -0.2); for (const p of g.owned(n.id)) g.prov[p].pop *= 0.999 } },
      { label: 'Stay open', desc: 'The economy must go on.', apply: (n, g) => { for (const p of g.owned(n.id)) g.prov[p].pop *= 0.993; blocs(n, { business: 6, workers: -8 }); stab(n, -3) } },
    ] },
  { key: 'minerals', title: 'Treasure Beneath the Mountains', when: (n, g) => g.owned(n.id).some(p => g.P[p].metals > 0),
    text: (n, g) => `Geologists have mapped a rich vein of rare earths beneath ${someProvince(n, g, p => g.P[p].metals > 0)}.`,
    options: [
      { label: 'Nationalise the mines', desc: '+0.5 months of GDP; investors flee.', apply: n => { money(n, 0.5); blocs(n, { business: -10, workers: 6 }) } },
      { label: 'Sell concessions abroad', desc: '+0.3 months of GDP.', apply: n => { money(n, 0.3); blocs(n, { business: 8 }) } },
      { label: 'Protect the land', desc: 'Some things are not for sale.', apply: n => { blocs(n, { rural: 6, progressives: 6 }); stab(n, 2) } },
    ] },
  { key: 'warweary', title: 'Mothers Against the War', when: n => n.wars.length > 0,
    text: (n, g) => `Coffins are coming home to ${capital(n, g)}. Soldiers' families march on parliament.`,
    options: [
      { label: 'Promise victory by spring', desc: '−War weariness for now.', apply: n => { n.warWeariness = Math.max(0, n.warWeariness - 10); blocs(n, { military: 5 }) } },
      { label: 'Raise soldiers\' pay', desc: '~0.3 months of GDP.', apply: n => { money(n, -0.3); n.warWeariness = Math.max(0, n.warWeariness - 6) } },
      { label: 'Ban the marches', desc: 'Silence is not peace.', apply: n => { n.policy.press = 'state'; blocs(n, { progressives: -10 }); stab(n, 2) } },
    ] },
  { key: 'smog', title: 'Airpocalypse', when: n => n.stocks.pollution > 45,
    text: (n, g) => `Smog over ${someProvince(n, g)} is so thick that schools have closed. Photos of the brown sky go viral worldwide.`,
    options: [
      { label: 'Shut the dirtiest factories', desc: '−Heavy industry, −pollution, +progressives.', apply: n => { n.policy.envRegulation = 'strict'; blocs(n, { progressives: 10, workers: -6, business: -6 }) } },
      { label: 'Fund a clean-air plan', desc: 'Environment budget +1% GDP.', apply: n => { n.budget.environment = Math.min(4, n.budget.environment + 1) } },
      { label: 'Blame foreign weather', desc: 'Censor the photos.', apply: n => { stock(n, 'culture', -2); blocs(n, { progressives: -8 }) } },
    ] },
  { key: 'housing', title: 'Priced Out', when: n => (n.idx.housing ?? 60) < 45,
    text: (n, g) => `Rents in ${capital(n, g)} have doubled in five years. Young people are leaving, or living with their parents until 35.`,
    options: [
      { label: 'Rent control now', desc: 'Popular today, fewer homes tomorrow.', apply: n => { n.policy.housing = 'rentcontrol'; blocs(n, { progressives: 8, middle: 4 }) } },
      { label: 'Mass public housing', desc: 'Social housing programme.', apply: (n, g) => { money(n, -0.5); n.policy.housing = 'social'; for (const p of g.owned(n.id)) g.prov[p].housing += 6 } },
      { label: 'Deregulate zoning', desc: 'Let the cranes rise.', apply: (n, g) => { for (const p of g.owned(n.id)) g.prov[p].housing += 3; blocs(n, { business: 6, rural: -3 }) } },
    ] },
  { key: 'braindrain', title: 'The Brain Drain', when: n => n.stocks.hc > 50 && (n.idx.migration ?? 50) < 45,
    text: n => `${n.name}'s best engineers and doctors are emigrating for higher salaries abroad.`,
    options: [
      { label: 'Talent tax breaks', desc: 'Keep them, at a cost.', apply: n => { money(n, -0.2); stock(n, 'tech', 2); blocs(n, { middle: 5 }) } },
      { label: 'Exit fees for graduates', desc: 'They owe the nation.', apply: n => { stock(n, 'tech', 1); blocs(n, { progressives: -8, middle: -6 }) } },
      { label: 'Let them go', desc: 'Remittances will flow home.', apply: n => money(n, 0.1) },
    ] },
  { key: 'separatists', title: 'A Referendum on Independence?', when: (n, g) => g.nonCoreShare(n) > 0.1,
    text: (n, g) => `Leaders in ${someProvince(n, g, p => g.prov[p].core !== n.id)} demand a referendum on independence from ${n.name}.`,
    options: [
      { label: 'Grant broad autonomy', desc: 'All non-core provinces become autonomous.', apply: (n, g) => { for (const p of g.owned(n.id)) if (g.prov[p].core !== n.id) { g.prov[p].policy.autonomy = 'autonomous'; g.prov[p].unrest *= 0.6 } blocs(n, { minorities: 15, military: -5 }) } },
      { label: 'Declare it illegal', desc: 'The constitution is indivisible.', apply: (n, g) => { for (const p of g.owned(n.id)) if (g.prov[p].core !== n.id) g.prov[p].unrest += 15; blocs(n, { minorities: -15, military: 5 }) } },
      { label: 'Flood the region with investment', desc: '~0.4 months of GDP.', apply: (n, g) => { money(n, -0.4); for (const p of g.owned(n.id)) if (g.prov[p].core !== n.id) { g.prov[p].infra += 6; g.prov[p].unrest *= 0.8 } } },
    ] },
  { key: 'chipcontrol', title: 'The Chip War', when: n => share(n, S.electronics) > 0.02,
    text: () => 'A rival superpower demands that you stop selling advanced semiconductors to its adversaries — or face sanctions.',
    options: [
      { label: 'Comply', desc: 'Lose some sales, gain a patron.', apply: n => { stock(n, 'diplomacy', 4); blocs(n, { business: -6 }) } },
      { label: 'Sell to everyone', desc: 'Neutral and rich.', apply: n => { money(n, 0.2); stock(n, 'diplomacy', -4); blocs(n, { business: 8 }) } },
      { label: 'Build a domestic champion', desc: 'Subsidise electronics.', apply: n => { n.subsidies = [...new Set([...n.subsidies, 'electronics' as const])].slice(0, 3); n.budget.subsidies = Math.min(5, n.budget.subsidies + 0.5) } },
    ] },
  { key: 'overtourism', title: 'Tourists Go Home', when: n => share(n, S.tourism) > 0.04,
    text: (n, g) => `Residents of ${someProvince(n, g, p => g.P[p].attraction > 1)} spray water pistols at cruise passengers. Rents are unaffordable and the old town is a theme park.`,
    options: [
      { label: 'Tourist tax & caps', desc: '−Tourism growth, +local happiness.', apply: n => { blocs(n, { middle: 6, business: -5 }); stock(n, 'culture', 1) } },
      { label: 'Build more hotels', desc: 'Tourism is our oil.', apply: n => { blocs(n, { business: 6, progressives: -5 }) } },
      { label: 'Spread them out', desc: 'Promote lesser-known regions.', apply: (n, g) => { money(n, -0.1); for (const p of g.owned(n.id)) g.prov[p].jobs[S.tourism] *= 1.05 } },
    ] },
  { key: 'pensions', title: 'The Pension Time Bomb', when: n => (n.idx.fertility ?? 2) < 1.6,
    text: n => `Actuaries warn that ${n.name}'s pension system will be insolvent within fifteen years: too few babies, too many retirees.`,
    options: [
      { label: 'Raise the retirement age', desc: 'Sustainable, furious workers.', apply: n => { n.policy.pensions = 'late'; blocs(n, { workers: -8 }) } },
      { label: 'Open the doors to immigrants', desc: 'Young workers from abroad.', apply: n => { n.policy.immigration = 'open'; blocs(n, { religious: -6, business: 6 }) } },
      { label: 'Pay people to have babies', desc: 'Natalist incentives.', apply: n => { n.policy.family = 'natalist'; money(n, -0.2) } },
    ] },
]

// ───────── world events ─────────
export function worldMonth(g: Game) {
  const r = Math.random()
  if (r < 0.006) {
    g.prices[S.finance] *= 0.6; g.prices[S.software] *= 0.85; g.prices[S.auto] *= 0.85
    g.pushNews('market', '📉 Global financial crisis! Banks fail from New York to Shanghai; credit freezes worldwide.')
  } else if (r < 0.014) {
    const up = Math.random() < 0.5
    g.prices[S.oil] = clamp(g.prices[S.oil] * (up ? 1.45 : 0.65), 0.25, 4)
    g.pushNews('market', up ? '🛢 Oil shock: crude prices surge on supply fears.' : '🛢 Oil glut: crude prices collapse as new fields come online.')
  } else if (r < 0.018) {
    g.demandShare[S.software] *= 1.12; g.demandShare[S.electronics] *= 1.08
    g.pushNews('market', '🤖 A breakthrough in artificial intelligence sets off a global boom in software and chips.')
  } else if (r < 0.021) {
    g.prices[S.tourism] *= 0.5
    for (const p of g.prov) p.pop *= 0.997
    g.pushNews('disaster', '🦠 A global pandemic spreads. Borders close and tourism collapses.')
  }
  // natural disasters
  if (Math.random() < 0.35) {
    const pid = Math.floor(Math.random() * g.P.length)
    const P = g.P[pid], p = g.prov[pid]
    const tropical = Math.abs(P.lat) < 28
    const kind = P.terrain === 'mountains' || (P.coastal && Math.abs(P.lon) > 120) ? 'earthquake'
      : P.coastal && tropical ? 'hurricane' : ['farmland', 'savanna', 'arid', 'plains'].includes(P.terrain) ? 'drought' : 'flood'
    if (p.pop > 300) {
      const sev = 0.5 + Math.random()
      p.infra = Math.max(1, p.infra - 10 * sev); p.pop *= 1 - 0.002 * sev; p.unrest = clamp(p.unrest + 12 * sev, 0, 100)
      if (kind === 'drought') p.jobs[S.agriculture] *= 0.9
      const icon = { earthquake: '🌋', hurricane: '🌀', drought: '☀', flood: '🌊' }[kind]
      const owner = p.owner >= 0 ? g.nation(p.owner) : null
      g.pushNews('disaster', `${icon} ${kind[0].toUpperCase() + kind.slice(1)} strikes ${P.name}${owner ? ` (${owner.name})` : ''}.`, owner ? [owner.id] : [], pid)
    }
  }
  gamesMonth(g)
}

// ───────── the World Games ─────────
export function gamesMonth(g: Game) {
  const G = g.games
  const monthsTo = Math.round((G.nextTick - g.tick) / DAYS_PER_MONTH)
  if (monthsTo === 30 && !G.bidsOpen && G.host == null) {
    G.bidsOpen = true; G.bids = []
    g.pushNews('games', `🏅 Bidding opens to host the ${ordinal(G.edition)} World Games. Cities have six months to bid.`)
  }
  if (G.bidsOpen) {
    for (const n of g.nations.values()) {
      if (!n.alive || !n.ai || G.bids.some(b => b.nation === n.id)) continue
      const ambition = n.brain?.ambition ?? 0.3
      if (n.gdp * 12 > 300 && n.stability > 50 && Math.random() < 0.08 * ambition) G.bids.push({ nation: n.id, amount: +(n.gdp * (0.5 + Math.random())).toFixed(1) })
    }
  }
  if (G.bidsOpen && monthsTo <= 24) {
    G.bidsOpen = false
    const scored = G.bids.map(b => {
      const n = g.nation(b.nation)
      if (!n || n.treasury + n.gdp * 3 < b.amount) return { b, s: 0 }
      return { b, s: b.amount * (0.5 + n.stocks.infra / 100) * (n.stability / 60) * (0.5 + (n.idx.softPower ?? 30) / 50) * (0.8 + Math.random() * 0.4) }
    }).filter(x => x.s > 0).sort((a, b) => b.s - a.s)
    const win = scored[0]
    if (win) {
      const n = g.nation(win.b.nation)!
      n.treasury -= win.b.amount
      G.host = n.id
      const city = g.P[n.capital].cities.map(c => g.cities[c]).sort((a, b) => b.pop - a.pop)[0]
      G.hostCity = city?.name ?? g.P[n.capital].name
      if (!g.prov[n.capital].projects.some(p => p.id === 'stadium')) g.prov[n.capital].projects.push({ id: 'stadium', progress: 0, done: false })
      g.pushNews('games', `🏟 ${G.hostCity}, ${n.name} wins the right to host the ${ordinal(G.edition)} World Games ($${win.b.amount}B bid).`, [n.id], n.capital)
    } else g.pushNews('games', `🏅 No credible bids: the ${ordinal(G.edition)} World Games will be held on neutral ground.`)
  }
  if (monthsTo <= 0) {
    // the Games themselves: medals by sports power
    const ns = [...g.nations.values()].filter(n => n.alive)
    const weights = ns.map(n => ({ n, w: Math.pow((n.idx.spSports ?? 5) / 10, 2.2) * (n.id === G.host ? 1.6 : 1) * (0.7 + Math.random() * 0.6) }))
    const tot = weights.reduce((a, x) => a + x.w, 0) || 1
    const medals = weights.map(({ n, w }) => {
      const total = Math.round((w / tot) * 340)
      return { nation: n.id, gold: Math.round(total * (0.3 + Math.random() * 0.1)), total }
    }).sort((a, b) => b.gold - a.gold || b.total - a.total).slice(0, 12)
    G.lastMedals = medals
    const top = g.nation(medals[0]?.nation)
    if (G.host != null) { const h = g.nation(G.host); if (h) { h.stocks.sports = clamp(h.stocks.sports + 15, 0, 100); g.gamesHosted.set(h.id, g.tick) } }
    g.pushNews('games', `🥇 The ${ordinal(G.edition)} World Games close${G.hostCity ? ` in ${G.hostCity}` : ''}. ${top ? `${top.name} tops the medal table with ${medals[0].gold} golds.` : ''}`, top ? [top.id] : [])
    for (const m of medals.slice(0, 3)) { const n = g.nation(m.nation); if (n) n.stocks.sports = clamp(n.stocks.sports + 4, 0, 100) }
    G.lastHost = G.host; G.host = null; G.hostCity = null; G.edition++
    G.nextTick = g.tick + 48 * DAYS_PER_MONTH
  }
}
const ordinal = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]) }
