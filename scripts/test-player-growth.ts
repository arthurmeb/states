// `npx jiti scripts/test-player-growth.ts [years] [province…]`: found an untouched player nation in a fresh world
// and compare its growth with the AI nation that held the land, year by year.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Game } from '../server/game/world'
import { SECTORS } from '../shared/sectors'
const years = Number(process.argv[2] ?? 4)
const places = process.argv.slice(3).length ? process.argv.slice(3) : ['Douala', 'Lagos', 'Dhaka', 'Munich']
const dir = mkdtempSync(join(tmpdir(), 'states-pg-'))
const g = new Game(dir, join(process.cwd(), 'public'))
const rows: { place: string; me: number; ai: number }[] = []
for (const [i, place] of places.entries()) {
  const P = g.P.find(p => p.name === place)
  if (!P) { console.log('no province', place); continue }
  // free the province (and its neighbours) the way an unclaimed start would be
  // the AI nation that holds most of the same country is the benchmark
  const count = new Map<number, number>()
  for (const q of g.P) if (q.iso3 === P.iso3 && g.prov[q.id].owner >= 0) count.set(g.prov[q.id].owner, (count.get(g.prov[q.id].owner) ?? 0) + g.prov[q.id].pop)
  const ai = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1
  for (const q of [P.id, ...P.nb]) if (g.prov[q].owner === ai && g.nation(ai)?.capital !== q) { g.prov[q].owner = -1; g.ownedDirty = true }
  const me = g.found('tok' + i, P.id, 'Test ' + place, 'X', '#ff0000', '')
  if (process.env.POL) {
    for (const [id, v] of Object.entries({ tuition: 'free', landReform: 'titling', internalMigration: 'promote', fdiPolicy: 'incentives' })) { me.cooldowns = {}; try { g.setPolicy(me, id, v) } catch (e) { console.log(String(e)) } }
    try { g.setBudget(me, { ...me.budget, education: 5, rnd: 2, infrastructure: 3.5 }) } catch (e) { console.log(String(e)) }
  }
  rows.push({ place, me: me.id, ai })
  console.log(place, '→ benchmark', g.nation(ai)?.name ?? 'none')
}
const pc = (id: number) => { const n = g.nation(id)!; return (n.gdpReal || n.gdp) / Math.max(1, n.pop) }
const start = rows.map(r => [pc(r.me), g.nation(r.ai) ? pc(r.ai) : 1])
for (let y = 1; y <= years; y++) {
  if (y === 1) { for (const r of rows) { const n = g.nation(r.me)!; const ps = g.owned(n.id).map(q => g.prov[q]); console.log(`  start ${r.place}: jobs ${(ps.reduce((a, p) => a + p.jobs.reduce((x, j) => x + j, 0), 0) / 1000).toFixed(2)}M tfp ${(ps.reduce((a, p) => a + p.tfp * p.pop, 0) / n.pop).toFixed(3)} edu ${(ps.reduce((a, p) => a + p.edu * p.pop, 0) / n.pop).toFixed(1)}`) } }
  for (let d = 0; d < 360; d++) {
    if (process.env.PROJ && d % 120 === 0) for (const r of rows) { const me = g.nation(r.me)!; for (const pid of g.owned(me.id).slice(0, 3)) if (!g.prov[pid].projects.some(x => !x.done)) { me.treasury += 50; try { g.build(me, pid, ['university', 'rail', 'port', 'hospital'][(y * 3 + d / 120) % 4]) } catch (e) { console.log(String(e)) } } }
    g.step()
  }
  for (const r of rows) {
    const n = g.nation(r.me)!, ps = g.owned(n.id).map(q => g.prov[q])
    const jobs = ps.reduce((a, p) => a + p.jobs.reduce((x, j) => x + j, 0), 0)
    const vaMix = ps.reduce((a, p) => a + p.jobs.reduce((x, j, s) => x + j * SECTORS[s].va, 0), 0) / jobs
    const tfp = ps.reduce((a, p) => a + p.tfp * p.pop, 0) / n.pop
    const edu = ps.reduce((a, p) => a + p.edu * p.pop, 0) / n.pop, infra = ps.reduce((a, p) => a + p.infra * p.pop, 0) / n.pop
    if (process.env.SECT) console.log('   jobs%', SECTORS.map((sec, i) => `${sec.id}:${(ps.reduce((a, p) => a + p.jobs[i], 0) / jobs * 100).toFixed(1)}(va${sec.va})`).filter(x => !x.includes(':0.0(')).join(' '))
    console.log(`  ${r.place}: pop ${(n.pop / 1000).toFixed(2)}M jobs ${(jobs / 1000).toFixed(2)}M vaMix ${vaMix.toFixed(3)} tfp ${tfp.toFixed(3)} edu ${edu.toFixed(1)} infra ${infra.toFixed(1)} tech ${n.stocks.tech.toFixed(1)} inst ${n.stocks.inst.toFixed(1)} cycle ${n.fin.cycle.toFixed(3)} unemp ${(n.unemployment * 100).toFixed(1)} tfpG ${JSON.stringify(n.drivers?.tfp ?? '')}`)
  }
  console.log(`year ${y}: ` + rows.map((r, i) => {
    const me = g.nation(r.me)!, ai = g.nation(r.ai)
    const gm = (Math.pow(pc(r.me) / start[i][0], 1 / y) - 1) * 100, ga = ai?.alive && start[i][1] !== 1 ? (Math.pow(pc(r.ai) / start[i][1], 1 / y) - 1) * 100 : NaN
    return `${r.place}: player ${gm.toFixed(1)}%/yr (bal ${(me.idx.budgetBalance ?? 0).toFixed(1)}, infra ${me.stocks.infra.toFixed(0)}) vs AI ${ga.toFixed(1)}%/yr`
  }).join(' | '))
}
rmSync(dir, { recursive: true, force: true })
