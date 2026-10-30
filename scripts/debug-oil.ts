// `npx jiti scripts/debug-oil.ts <days>`: world oil market over time.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Game } from '../server/game/world'
import { SECTOR_INDEX as S } from '../shared/sectors'
const days = Number(process.argv[2] ?? 720)
const dir = mkdtempSync(join(tmpdir(), 'states-oil-'))
const g = new Game(dir, join(process.cwd(), 'public'))
for (let d = 0; d <= days; d++) {
  if (d % 60 === 0) {
    let jobs = 0, out = 0
    for (const p of g.prov) { jobs += p.jobs[S.oil]; out += p.output[S.oil] }
    console.log(`day ${d}: price ${g.prices[S.oil].toFixed(3)} demandShare ${(g.demandShare[S.oil] * 1000).toFixed(3)}‰ base ${(g.trends.base[S.oil] * 1000).toFixed(3)} boost ${g.trends.boost[S.oil]?.toFixed(3)} jobs ${jobs.toFixed(0)} output ${out.toFixed(1)} green ${g.trends.green.toFixed(3)} news: ${g.news[0]?.text.slice(0, 60)}`)
  }
  g.step()
}
rmSync(dir, { recursive: true, force: true })
