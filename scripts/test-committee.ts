// `npx jiti scripts/test-committee.ts [years]`: exercise the World Committee in a fresh headless world.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Game } from '../server/game/world'
import { table, vote, speak } from '../server/game/committee'
const years = Number(process.argv[2] ?? 3)
const dir = mkdtempSync(join(tmpdir(), 'states-cm-'))
const g = new Game(dir, join(process.cwd(), 'public'))
const news: string[] = []
const push = g.pushNews.bind(g)
g.pushNews = (kind, text, nations, province) => { if (/🏛|🛑|⛔ The world|💔 .*World Committee|By order of/.test(text)) news.push(`${Math.floor(g.tick / 30)}m ${text}`); push(kind, text, nations, province) }
for (let d = 0; d < 31; d++) g.step()
console.log('council:', g.committee.council.map(id => g.nation(id)!.name).join(', '))
// a player tables a declaration and a climate accord
const P = g.P.find(p => p.name === 'Douala')!
const me = g.found('tok-test', P.id, 'Test Republic', 'X', '#ff0000', '')
me.power.pc = 100
const decl = table(g, me, { kind: 'declaration', title: 'The Pineapple Accords', text: 'The World Committee declares pineapple on pizza a crime against humanity.' })
speak(g, me, 'tester', decl.id, 'Delegates, the fruit stays off the pie.')
const tally = (r: typeof decl) => Object.values(r.votes).reduce((a, v) => ({ ...a, [v]: (a[v] ?? 0) + 1 }), {} as Record<string, number>)
console.log('declaration opening votes:', tally(decl))
for (let y = 0; y < years; y++) for (let d = 0; d < 360; d++) g.step()
console.log('declaration →', decl.status, decl.tally)
const by: Record<string, number> = {}
for (const r of g.committee.list) by[`${r.kind}:${r.status}`] = (by[`${r.kind}:${r.status}`] ?? 0) + 1
console.log('resolutions by kind/status:', by)
console.log(news.slice(0, 40).join('\n'))
console.log('sanction pressure on targets in force:', g.committee.list.filter(r => r.kind === 'sanctions' && r.status === 'passed').map(r => `${r.targetName} ${g.sanctionPressure(r.target!).toFixed(2)}`).join(', '))
void vote
rmSync(dir, { recursive: true, force: true })
