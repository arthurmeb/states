// Headless simulation for balancing: `npx jiti scripts/sim.ts [years] [nation names…]`
// Generates a fresh world in a temp dir, runs it, and prints a yearly table for a few nations.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Game } from '../server/game/world'
import { SECTOR_INDEX } from '../shared/sectors'

const years = Number(process.argv[2] ?? 10)
const watch = process.argv.slice(3)
const dir = mkdtempSync(join(tmpdir(), 'states-sim-'))
const g = new Game(dir, join(process.cwd(), 'public'))
const pick = () => {
  const all = [...g.nations.values()].filter(n => n.alive)
  if (watch.length) return all.filter(n => watch.some(w => n.name.toLowerCase().includes(w.toLowerCase())))
  return all.sort((a, b) => b.gdp - a.gdp).filter((_, i) => i % 6 === 0).slice(0, 7)
}
const f = (v: number | undefined, d = 1) => (v == null || !isFinite(v) ? '—' : v.toFixed(d))
const t0 = Date.now()
// tally world events across the whole run
const tally: Record<string, number> = {}
const push = g.pushNews.bind(g)
g.pushNews = (kind, text, nations, province) => {
  for (const [k, re] of [['govt change', /win the election/], ['re-elected', /re-elected/], ['banking crisis', /Banking crisis/], ['default', /defaults/], ['coup', /coup in/i], ['revolution', /Revolution in/], ['peg broken', /peg/], ['war', /declares war/i], ['new state', /new state is born|declares independence/]] as [string, RegExp][]) if (re.test(text)) tally[k] = (tally[k] ?? 0) + 1
  push(kind, text, nations, province)
}
const COLS = ['gdppc', 'growth', 'inflation', 'unemployment', 'debt', 'approval', 'stability', 'old', 'credit', 'pc'] as const
for (let y = 0; y <= years; y++) {
  if (y > 0) for (let d = 0; d < 360; d++) g.step()
  const ns = pick()
  console.log(`\n── year ${2030 + y} · tick ${g.tick} · ${((Date.now() - t0) / 1000).toFixed(0)}s · temp ${f(g.trends.temp, 2)}°C · green ${f(g.trends.green, 2)} · auto ${f(g.trends.automation, 2)} · oil ${f(g.prices[SECTOR_INDEX.oil], 2)} · nations ${[...g.nations.values()].filter(n => n.alive).length}`)
  console.log('nation'.padEnd(28) + COLS.map(c => c.padStart(9)).join(''))
  for (const n of ns) {
    const I = n.idx
    const row = [I.gdppc, I.growth, I.inflation, I.unemployment, I.debt, I.approval, n.stability, (n.demo?.old ?? 0) * 100, I.privateCredit, n.power?.pc]
    console.log(n.name.slice(0, 27).padEnd(28) + row.map((v, i) => f(v, i === 0 ? 0 : 1).padStart(9)).join(''))
  }
}
console.log('events over the run:', JSON.stringify(tally))
const news = g.news.slice(0, 25).map(x => `  ${x.text}`).join('\n')
console.log(`\nrecent news:\n${news}`)
rmSync(dir, { recursive: true, force: true })
