// `npx jiti scripts/debug-nation.ts <days> <name>`: inspect one nation's finances, programmes and drivers.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Game } from '../server/game/world'
import { POLICIES } from '../shared/policies'

const days = Number(process.argv[2] ?? 360), name = (process.argv[3] ?? 'Lone').toLowerCase()
const dir = mkdtempSync(join(tmpdir(), 'states-dbg-'))
const g = new Game(dir, join(process.cwd(), 'public'))
const n = [...g.nations.values()].find(x => x.name.toLowerCase().includes(name))!
const r = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${k} ${(v / Math.max(0.001, n.gdp) * 100).toFixed(1)}`).join(' · ')
const show = () => {
  console.log(`\n${n.name} day ${g.tick}: gdppc ${n.idx.gdppc?.toFixed(0)} growth ${n.idx.growth?.toFixed(1)} infl ${n.inflation.toFixed(1)} debt ${n.idx.debt?.toFixed(0)} deficit ${n.idx.deficit?.toFixed(1)} interest ${n.interest.toFixed(1)}`)
  console.log('revenue %GDP:', r(n.ledger.revenue))
  console.log('spending %GDP:', r(n.ledger.spending))
  console.log('non-default policies:', POLICIES.filter(p => n.policy[p.id] !== p.default).map(p => `${p.id}=${n.policy[p.id]}`).join(', '))
  console.log('spend mods:', JSON.stringify(n.modSrc.spend ?? []))
  for (const k of ['inflation', 'productivity', 'credit', 'unemployment']) console.log(k, JSON.stringify(n.drivers[k]))
}
show()
for (let d = 0; d < days; d++) { g.step(); if ((d + 1) % 180 === 0) show() }
rmSync(dir, { recursive: true, force: true })
