// Seeds a multiplayer showcase world for the trailer and tutorial: four scripted players with usernames
// found nations, argue in the café, sign treaties, break one, sanction each other, campaign and go to war.
// Usage (fast clock, separate data dir):
//   GAME_MONTH_MS=3000 STATES_DATA_DIR=.data-video npx nuxi dev --port 4100 --host 127.0.0.1
//   node scripts/video/seed.mjs http://127.0.0.1:4100 [months]
const base = process.argv[2] ?? 'http://127.0.0.1:4100'
const MONTHS = Number(process.argv[3] ?? 40)
const P = await (await fetch(`${base}/world/provinces.json`)).json()
const sleep = ms => new Promise(r => setTimeout(r, ms))

export const PLAYERS = [
  { key: 'kam', token: 'video-player-kamerun-00000001', user: 'baobab_boss', name: 'Republic of Kamerun', leader: 'President Ada Nkem', color: '#40c057', motto: 'Paix, travail, cacao', party: 'labour', at: [4.05, 9.7],
    policy: { tuition: 'free', landReform: 'titling', internalMigration: 'promote', fdiPolicy: 'incentives' } },
  { key: 'nor', token: 'video-player-nordvik-00000001', user: 'fjordlord', name: 'Nordvik Union', leader: 'Prime Minister Siri Holm', color: '#4dabf7', motto: 'Cold water, warm hearts', party: 'liberal', at: [60.4, 8.5],
    policy: { swf: 'fund', welfareModel: 'generous', carbonTax: 'high', energyMix: 'renewable', fiscalRule: 'brake' } },
  { key: 'qad', token: 'video-player-qadira-000000001', user: 'oil_whisperer', name: 'Sultanate of Qadira', leader: 'Sultan Rashid al-Qadir', color: '#f59f00', motto: 'The sand remembers', party: 'nationalist', at: [24.3, 54.4],
    policy: { government: 'oneparty', fuelSubsidy: 'heavy', press: 'state', nuclear: 'threshold', intelligence: 'expansive' } },
  { key: 'pac', token: 'video-player-pacifica-0000001', user: 'mei_lin', name: 'Free Republic of Pacifica', leader: 'President Mei Lin', color: '#e64980', motto: 'Small islands, great chips', party: 'green', at: [24.0, 121.0],
    policy: { educationFocus: 'stem', fdiPolicy: 'incentives', universities: 'international', bankingReg: 'strict' } },
]
const PW = 'demo-video-pass-1999'

const state = {}
function connect(p) {
  return new Promise(resolve => {
    const ws = new WebSocket(base.replace('http', 'ws') + '/_ws')
    const s = state[p.key] = { ws, p, snap: null, rooms: [], deals: [], founded: false }
    s.send = m => ws.send(JSON.stringify(m))
    ws.onopen = () => s.send({ t: 'hello', token: p.token })
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data)
      if (m.t === 'error') console.log(`  ! ${p.user}: ${m.msg}`)
      if (m.t === 'rooms') s.rooms = m.rooms
      if (m.t === 'deals') s.deals = m.deals
      if (m.t !== 'state') return
      s.snap = m
      if (!m.me && !s.founded) {
        s.founded = true
        const [lat, lon] = p.at
        const free = P.filter(q => m.prov.owner[q.id] === -1 && q.terrain !== 'ice').sort((a, b) => ((a.lat - lat) ** 2 + (a.lon - lon) ** 2) - ((b.lat - lat) ** 2 + (b.lon - lon) ** 2))[0]
        console.log(`${p.user} founds ${p.name} at ${free.name}`)
        s.send({ t: 'found', province: free.id, name: p.name, leader: p.leader, color: p.color, motto: p.motto, party: p.party })
      }
      if (m.me) resolve(s)
      // answer dilemmas with the first option, accept incoming diplomatic proposals
      if (m.issue) s.send({ t: 'issue', option: 0 })
    }
  })
}
const pl = await Promise.all(PLAYERS.map(connect))
const S = Object.fromEntries(pl.map(s => [s.p.key, s]))
const me = k => S[k].snap.me
const nation = (k, name) => S[k].snap.nations.find(n => n.name.toLowerCase().includes(name.toLowerCase()))
const month = () => Math.floor(S.kam.snap.tick / 30)
const until = async m => { while (month() < m) await sleep(400) }
const room = (k, pred) => S[k].rooms.find(pred)
const say = async (k, roomId, text) => { S[k].send({ t: 'say', room: roomId, text }); await sleep(1900) }

// ── month 0: accounts, constitutions, policies, a little expansion ──
for (const s of pl) {
  s.send({ t: 'register', user: s.p.user, pass: PW })
  for (const [id, value] of Object.entries(s.p.policy)) s.send({ t: 'policy', id, value })
  s.send({ t: 'budget', budget: { ...s.snap.me.budget, education: 5, rnd: 2, infrastructure: 3.5, diplomacy: 0.6 } })
}
await sleep(1500)

// ── month 1: the café wakes up ──
await until(1)
console.log('café…')
S.qad.send({ t: 'thread', title: 'OPEC 2.0 — who’s in? 🛢', text: 'Oil at 1.40 or we turn off the taps. Serious producers only. You know who you are.' })
await sleep(2200)
let opec = room('qad', r => r.title.startsWith('OPEC'))
await say('kam', opec.id, 'Kamerun pumps oil too. What’s our cut, Sultan?')
await say('nor', opec.id, 'Nordvik has a sovereign wealth fund and zero patience. Pass. 🙂')
await say('pac', opec.id, 'Some of us run on chips, not crude. Hard pass.')
await say('qad', opec.id, '@fjordlord your fund is made of OIL, Siri.')
await say('nor', opec.id, 'Old oil. Ethically aged. 🍷')
S.kam.send({ t: 'thread', title: 'Who keeps tariffing my cocoa?? 🍫', text: 'Somebody slapped 35% on Cameroonian cocoa. I have receipts. Come forward.' })
await sleep(2200)
const cocoa = room('kam', r => r.title.startsWith('Who keeps'))
await say('pac', cocoa.id, '/top exports')
await say('qad', cocoa.id, 'Not us. We only tariff people who deserve it.')
await say('kam', cocoa.id, 'That is exactly what a tariffer would say.')
S.pac.send({ t: 'thread', title: 'Is the Straits Republic run by an AI? 👀', text: 'Their premier is called Claude and their motto is literally about straits. Suspicious.' })
await sleep(2200)
const straits = room('pac', r => r.title.startsWith('Is the Straits'))
await say('nor', straits.id, '/nation Straits Republic')
await say('kam', straits.id, 'Honestly their GDP is suspiciously good. I for one welcome our new overlords.')

// ── month 3: treaties ──
await until(3)
console.log('treaties…')
const qad = me('qad'), pac = me('pac'), kam = me('kam'), nor = me('nor')
S.pac.send({ t: 'dm', nation: qad.id }); await sleep(1500)
let dmPQ = room('pac', r => r.kind === 'dm' && r.members.includes(qad.id))
await say('pac', dmPQ.id, 'Sultan. You have oil. We have chips. Let’s not make this weird.')
await say('qad', dmPQ.id, 'Everything is weird in the desert, Madam President. Send terms.')
S.pac.send({ t: 'dealPropose', to: qad.id, title: 'Oil for Chips', text: '', clauses: [
  { kind: 'supply', from: 'b', sector: 'oil', share: 0.2, discount: 0.3, years: 10 },
  { kind: 'tariff', from: 'b', rate: 5, years: 10 },
  { kind: 'tech', from: 'a', years: 6 },
  { kind: 'promise', from: 'b', text: 'Qadira will not enrich uranium past civilian levels', years: 10 },
] })
await sleep(2500)
let oilChips = S.qad.deals.find(d => d.title === 'Oil for Chips')
if (oilChips) S.qad.send({ t: 'dealRespond', id: oilChips.id, accept: true })
await sleep(1500)
S.nor.send({ t: 'dm', nation: kam.id }); await sleep(1500)
const dmNK = room('nor', r => r.kind === 'dm' && r.members.includes(kam.id))
await say('nor', dmNK.id, 'Ada — we’d like to fund your rail network. Cheap money, one condition: keep the rainforest standing.')
await say('kam', dmNK.id, 'Siri you beautiful Nordic angel. Send it.')
S.nor.send({ t: 'dealPropose', to: kam.id, title: 'Rainforest Rail Accord', text: '', clauses: [
  { kind: 'loan', from: 'a', amount: 25, rate: 1.5, years: 8 },
  { kind: 'policy', from: 'b', policy: 'landUse', option: 'protect', years: 8 },
  { kind: 'nonaggression', years: 20 },
] })
await sleep(2500)
const rain = S.kam.deals.find(d => d.title === 'Rainforest Rail Accord')
if (rain) S.kam.send({ t: 'dealRespond', id: rain.id, accept: true })
await sleep(1500)

// ── month 5: the coalition ──
await until(5)
console.log('coalition…')
S.nor.send({ t: 'group', title: 'Coalition of the Reasonable', members: [kam.id, pac.id] }); await sleep(2000)
const coal = room('nor', r => r.kind === 'group' && r.title === 'Coalition of the Reasonable')
await say('nor', coal.id, 'Intel says Qadira is spinning centrifuges. “Medical isotopes”, apparently.')
await say('pac', coal.id, 'Our treaty says no enrichment. If he breaks it, I want sanctions the same day.')
await say('kam', coal.id, 'I’m in. Also can someone explain what a centrifuge is, asking for my defence minister.')
await say('nor', coal.id, '/compare Sultanate of Qadira vs Nordvik Union')

// ── month 8: betrayal ──
await until(8)
console.log('betrayal…')
S.qad.send({ t: 'tariff', nation: pac.id, rate: 45 })
await sleep(1500)
await say('qad', dmPQ.id, 'New tariff schedule. Nothing personal. The sand demanded it.')
await say('pac', dmPQ.id, 'You signed a 5% cap ten months ago. In ink.')
await say('qad', dmPQ.id, 'Ink fades.')
await until(10)
await say('pac', straits.id, 'Unrelated, but @oil_whisperer just broke Oil for Chips. Remember this when he asks you for anything.')
S.pac.send({ t: 'sanction', nation: qad.id, on: true })
S.nor.send({ t: 'sanction', nation: qad.id, on: true })
await sleep(1200)
await say('nor', coal.id, 'Sanctions are in. Welcome to the find-out phase, Sultan.')
await say('qad', opec.id, 'OPEC 2.0 update: membership temporarily limited to me.')

// ── month 13: war in the desert, an election at home ──
await until(13)
console.log('war & elections…')
const victim = S.qad.snap.nations.filter(n => n.ai && n.id !== qad.id).map(n => n).find(n => S.qad.snap.prov.owner.some((o, pid) => o === n.id && P[pid].nb.some(q => S.qad.snap.prov.owner[q] === qad.id)))
if (victim) { S.qad.send({ t: 'declare', nation: victim.id }); console.log('  Qadira attacks', victim.name) }
await sleep(1500)
S.qad.send({ t: 'autodeploy' })
await say('qad', opec.id, `Regional stability operation underway. Very stable. Extremely stable.`)
await say('kam', opec.id, 'Sir this is an oil thread.')
S.kam.send({ t: 'campaign', bloc: 'workers' }); S.kam.send({ t: 'campaign', bloc: 'rural' })
await sleep(800)
S.kam.send({ t: 'snapElection' })
await until(16)
await say('kam', cocoa.id, 'Re-elected (or not, check the news). Either way the cocoa tariffs are still a crime.')

// ── keep the world turning so charts, polls and trajectories fill in ──
let last = -1
while (month() < MONTHS) {
  const m = month()
  if (m !== last && m % 6 === 0) { last = m; console.log(`month ${m}`, pl.map(s => `${s.p.user}:${s.snap.me?.power.office}`).join(' ')) }
  if (m % 4 === 0) for (const s of pl) for (const d of s.snap.myProvinces.slice(0, 3)) if (!d.projects.some(x => !x.done)) s.send({ t: 'build', province: d.id, project: ['university', 'rail', 'port', 'hospital'][m % 4] })
  await sleep(1500)
}
for (const s of pl) for (const p of s.snap.proposals.filter(x => x.to === s.snap.me.id)) s.send({ t: 'respond', proposal: p.id, accept: true })
console.log('READY')
await sleep(500)
process.exit(0)
