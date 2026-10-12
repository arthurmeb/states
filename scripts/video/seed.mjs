// Plays a showcase nation for a few game years so the demo capture has a developed country to film.
// Usage: node scripts/video/seed.mjs http://localhost:4100 [years]
const base = process.argv[2] ?? 'http://localhost:4100'
const years = Number(process.argv[3] ?? 4)
export const TOKEN = 'demo-video-token-0000000001'
const P = await (await fetch(`${base}/world/provinces.json`)).json()
const ws = new WebSocket(base.replace('http', 'ws') + '/_ws')
const send = m => ws.send(JSON.stringify(m))

const CAPITAL_PLAN = ['techpark', 'airport', 'university', 'stadium', 'studios', 'financial', 'fab', 'hospital', 'heritage']
const OTHER_PLAN = ['port', 'resort', 'rail', 'solar', 'heritage', 'housing', 'hospital', 'industrial']
let me = null, setup = false, lastMonth = -1, done = false

ws.onopen = () => send({ t: 'hello', token: TOKEN })
ws.onmessage = ev => {
  const m = JSON.parse(ev.data)
  if (m.t === 'error') console.log('  ! ', m.msg)
  if (m.t !== 'state') return
  me = m.me
  if (!me) {
    const free = P.filter(p => m.prov.owner[p.id] === -1 && p.terrain !== 'ice')
      .sort((a, b) => ((a.lat - 25.03) ** 2 + (a.lon - 121.5) ** 2) - ((b.lat - 25.03) ** 2 + (b.lon - 121.5) ** 2))[0]
    console.log('founding at', free.name)
    send({ t: 'found', province: free.id, name: 'Commonwealth of Pacifica', leader: 'President Mei Lin', color: '#3bc9db', motto: 'Small islands, great tides' })
    return
  }
  if (!setup) {
    setup = true
    const pol = { tuition: 'free', healthcare: 'universal', culturalDiplomacy: 'broadcaster', universities: 'international', tourismPolicy: 'open', sportsPolicy: 'elite', lgbt: 'equal', carbonTax: 'moderate', energyMix: 'renewable', fdiPolicy: 'incentives', gender: 'parity' }
    for (const [id, value] of Object.entries(pol)) send({ t: 'policy', id, value })
    send({ t: 'budget', budget: { ...me.budget, rnd: 3, education: 5.5, culture: 0.8, sports: 0.4, diplomacy: 0.6, subsidies: 1.2, infrastructure: 3.5 } })
    send({ t: 'subsidies', sectors: ['electronics', 'software', 'media'] })
  }
  const month = Math.floor(m.tick / 30)
  if (month !== lastMonth) {
    lastMonth = month
    // expand into neighbouring unclaimed land
    if (me.provinces < 9) {
      const mine = new Set(m.myProvinces.map(d => d.id))
      const cand = [...mine].flatMap(id => [...P[id].nb, ...P[id].sea]).filter(q => m.prov.owner[q] === -1 && P[q].terrain !== 'ice')
      if (cand.length) send({ t: 'claim', province: cand.sort((a, b) => m.prov.pop[b] - m.prov.pop[a])[0] })
    }
    // keep two projects under way in every province
    for (const d of m.myProvinces) {
      const plan = d.id === me.capital ? CAPITAL_PLAN : OTHER_PLAN
      const underway = d.projects.filter(p => !p.done).length
      const next = plan.filter(id => !d.projects.some(p => p.id === id))
      for (let i = 0; i < Math.min(2 - underway, 1); i++) if (next[i]) send({ t: 'build', province: d.id, project: next[i] })
    }
    // diplomacy
    if (month === 3) for (const p of me.partners.slice(0, 5)) send({ t: 'propose', nation: p.id, kind: 'pact' })
    if (month === 4 && me.bloc == null) send({ t: 'createBloc', name: 'Pacific Economic Community', cet: 6 })
    if (month >= 5 && month % 3 === 0) for (const p of me.partners.slice(0, 3)) send({ t: 'inviteBloc', nation: p.id })
    if (month % 6 === 0) console.log(`month ${month}: ${me.name} prov ${me.provinces} gdp $${(me.idx.gdp ?? 0).toFixed(0)}B projects ${m.myProvinces.reduce((a, d) => a + d.projects.filter(p => p.done).length, 0)}`)
  }
  if (m.issue) send({ t: 'issue', option: 0 })
  for (const p of m.proposals.filter(p => p.to === me.id)) send({ t: 'respond', proposal: p.id, accept: true })
  if (!done && m.tick >= years * 360) { done = true; console.log('READY'); }
}
setTimeout(() => process.exit(0), 1000 * 60 * 20)
