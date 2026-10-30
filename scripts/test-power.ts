// `npx jiti scripts/test-power.ts`: a player loses an election, the opposition governs, the player wins it back.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Game } from '../server/game/world'
import { BLOCS } from '../shared/policies'
const dir = mkdtempSync(join(tmpdir(), 'states-pw-'))
const g = new Game(dir, join(process.cwd(), 'public'))
const token = 'test-token-000000000000000001'
g.players[token] = null
const pid = g.P.findIndex((p, i) => p.iso3 === 'FRA' && g.prov[i].owner === -1 && p.pop > 1000)
const n = g.found(token, pid, 'Republic of Testland', 'President Test', '#ff0000', 'Test', 'labour')
const say = (s: string) => console.log(`[${g.tick}] ${s} · office ${n.power.office} gov ${n.power.govParty} pc ${n.power.pc.toFixed(0)} poll ${JSON.stringify(n.power.votes)}`)
for (let d = 0; d < 30; d++) g.step()
say('founded')
// 1. a policy change costs political capital
const pc0 = n.power.pc
g.setPolicy(n, 'labor', 'flexible')
console.log(`labour → flexible cost ${(pc0 - n.power.pc).toFixed(1)} PC`)
// 2. the economy tanks and every faction turns against the government; an election is called
for (const b of BLOCS) n.blocs[b.id] = 18
n.nextElection = g.tick + 1
for (let d = 0; d < 31; d++) { for (const b of BLOCS) n.blocs[b.id] = Math.min(n.blocs[b.id], 18); g.step() }
say('after election')
console.log('history', JSON.stringify(n.power.history[0]))
// 3. in opposition, actions are refused
try { g.setPolicy(n, 'minWage', 'living'); console.log('policy change allowed?! (server-side check lives in instance.ts)') } catch (e) { console.log('refused:', (e as Error).message) }
// 4. the opposition government runs the country for a year
const before = JSON.stringify(n.policy)
for (let d = 0; d < 360; d++) g.step()
const changed = Object.keys(n.policy).filter(k => JSON.parse(before)[k] !== n.policy[k])
say(`a year of ${n.power.govParty} government changed: ${changed.join(', ')}`)
// 5. the new government becomes unpopular; the player wins the next election
for (const b of BLOCS) n.blocs[b.id] = 20
n.nextElection = g.tick + 1
for (let d = 0; d < 31; d++) { for (const b of BLOCS) n.blocs[b.id] = Math.min(n.blocs[b.id], 20); g.step() }
say('second election')
console.log('recent news:\n' + g.news.filter(x => x.nations?.includes(n.id)).slice(0, 8).map(x => '  ' + x.text).join('\n'))
// 6. coups: an angry army in a weak autocracy
n.policy.government = 'oneparty'; n.power.office = 'governing'
n.blocs.military = 5; n.stability = 15; n.stocks.inst = 20
let months = 0
while (n.policy.government !== 'junta' && months < 240) { for (let d = 0; d < 30; d++) { n.blocs.military = 5; n.stability = 15; g.step() } months++ }
say(`coup after ${months} months (coup risk ${(n.power.coupRisk * 100).toFixed(1)}%/mo)`)
rmSync(dir, { recursive: true, force: true })
