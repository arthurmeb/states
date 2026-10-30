// `npx jiti scripts/test-deals.ts`: propose deals to an AI, run them, break one.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Game } from '../server/game/world'
import { propose, normalize, renounce, justCause } from '../server/game/deals'
import { describe } from '../shared/deals'
const dir = mkdtempSync(join(tmpdir(), 'states-dl-'))
const g = new Game(dir, join(process.cwd(), 'public'))
const token = 'test-token-deals-0000000000001'
g.players[token] = null
const pid = g.P.findIndex((p, i) => p.iso3 === 'FRA' && g.prov[i].owner === -1 && p.pop > 500)
const me = g.found(token, pid, 'Testland', 'Tester', '#ff0000', '', 'liberal')
const ai = [...g.nations.values()].find(n => n.ai && n.name.includes('Albion'))!
const show = (d: { status: string; title: string; clauses: Parameters<typeof describe>[0][] }) => console.log(`  [${d.status}] ${d.title}: ${d.clauses.map(c => describe(c, me.name, ai.name)).join(' · ')}`)
// a model-style raw draft, including junk the validator must fix
const raw = [
  { kind: 'payment', from: 'a', amount: '30', monthly: false },
  { kind: 'tariff', from: 'b', rate: 2, years: 6 },
  { kind: 'province', from: 'b', province: 'Atlantis' },
  { kind: 'policy', from: 'b', policy: 'carbonTax', option: 'moderate', years: 4 },
  { kind: 'teleport', text: 'vote with us at the Committee' },
]
const clauses = normalize(g, me, ai, raw as Record<string, unknown>[])
console.log('normalised:'); clauses.forEach(c => console.log('  ', describe(c, me.name, ai.name)))
const t0 = me.treasury
const d1 = propose(g, me, ai, 'Channel Accord', '', clauses)
show(d1)
console.log(`treasury change ${(me.treasury - t0).toFixed(1)}; Albion tariff on us ${ai.tariffs[me.id]}; Albion carbon tax ${ai.policy.carbonTax}`)
// a generous loan they should take, and a stingy demand they should refuse
const d2 = propose(g, me, ai, 'Cheap Credit', '', normalize(g, me, ai, [{ kind: 'loan', from: 'a', amount: 40, rate: 1, years: 4 }]))
const d3 = propose(g, me, ai, 'Tribute', '', normalize(g, me, ai, [{ kind: 'payment', from: 'b', amount: 500, monthly: false }]))
show(d2); show(d3)
for (let i = 0; i < 90; i++) g.step()
console.log(`after 3 months: loan balance ${(d2.state[0] ?? 0).toFixed(1)}`)
// a paid commitment Albion is happy with (keep its carbon tax), then Albion drops it → breach
const d4 = propose(g, me, ai, 'Green Pledge', '', normalize(g, me, ai, [{ kind: 'payment', from: 'a', amount: 20 }, { kind: 'policy', from: 'b', policy: 'carbonTax', option: String(ai.policy.carbonTax), years: 5 }]))
show(d4)
ai.policy.carbonTax = 'none'
for (let i = 0; i < 31; i++) g.step()
show(d4); console.log('  breach:', JSON.stringify(d4.breach), '· just cause for us vs Albion:', justCause(g, me.id, ai.id))
renounce(g, me, d2.id); show(d2)
console.log('news:', g.news.filter(n => /Accord|Credit|Tribute|treaty|breaks/.test(n.text)).slice(0, 5).map(n => n.text))
rmSync(dir, { recursive: true, force: true })
