// `npx jiti scripts/debug-growth.ts <days> <name>`: where a nation's real GDP growth comes from, by sector.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Game } from '../server/game/world'
import { SECTORS } from '../shared/sectors'
const days = Number(process.argv[2] ?? 720), name = (process.argv[3] ?? 'yoruba').toLowerCase()
const dir = mkdtempSync(join(tmpdir(), 'states-gr-'))
const g = new Game(dir, join(process.cwd(), 'public'))
const n = [...g.nations.values()].find(x => x.name.toLowerCase().includes(name))!
let prev: number[] | null = null
for (let d = 0; d <= days; d++) {
  if (d % 180 === 0) {
    const sell = g.sell.get(n.id)
    const real = SECTORS.map((s, i) => (s.tradable ? n.sectorOut[i] / Math.max(0.05, g.prices[i]) : n.sectorOut[i]))
    const jobs = n.sectorJobs
    console.log(`day ${d}: pop ${(n.pop / 1000).toFixed(1)}M gdpReal ${n.gdpReal.toFixed(2)} jobs ${(jobs.reduce((a, b) => a + b, 0) / 1000).toFixed(1)}M laborRatio ${((n.demo.prime + n.demo.mature) / n.demo.w0).toFixed(3)} cycle ${n.fin.cycle.toFixed(3)}`)
    console.log('  real by sector:', SECTORS.map((s, i) => `${s.id} ${real[i].toFixed(2)}${prev ? `(${(((real[i] / Math.max(1e-6, prev[i])) - 1) * 100).toFixed(0)}%)` : ''} st${(sell?.[i] ?? 1).toFixed(2)}`).filter((_, i) => real[i] > 0.05).join(' · '))
    prev = real
  }
  g.step()
}
rmSync(dir, { recursive: true, force: true })
