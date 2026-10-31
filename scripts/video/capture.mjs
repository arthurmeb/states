// Captures footage of the multiplayer showcase world (seed.mjs) for the trailer and the tutorial.
// Each shot is a full 1920×1080 screenshot; for the tutorial we also record where the cursor should go.
// Usage: node scripts/video/capture.mjs http://127.0.0.1:4100
import puppeteer from 'puppeteer-core'
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'

const base = process.argv[2] ?? 'http://127.0.0.1:4100'
const OUT = 'video/assets'
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
const W = 1920, H = 1080
const sleep = ms => new Promise(r => setTimeout(r, ms))
mkdirSync(`${OUT}/spin`, { recursive: true })
const TOK = { kam: 'video-player-kamerun-00000001', nor: 'video-player-nordvik-00000001', pac: 'video-player-pacifica-0000001' }
const meta = { rects: {}, steps: [] }

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: [`--window-size=${W},${H}`, '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11', '--hide-scrollbars'],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
})
async function open(token, needMe = true) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  await page.evaluateOnNewDocument(t => { if (t) localStorage.setItem('states-token', t); else localStorage.removeItem('states-token') }, token)
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(n => window.__map?.style?._loaded && window.__snap?.value && window.__map.getLayer('prov-fill') && (!n || window.__snap.value.me), { timeout: 120000 }, needMe)
  await page.evaluate(() => { window.__map.fire('mousedown'); window.__map.stop() })
  return page
}
async function settle(page, ms = 1000) {
  await page.waitForFunction(() => window.__map.areTilesLoaded(), { timeout: 25000, polling: 200 }).catch(() => console.log('  (tiles still loading)'))
  await sleep(ms)
}
async function view(page, center, zoom, ui = {}) {
  await page.evaluate((c, z, u) => { Object.assign(window.__ui, u); window.__map.jumpTo({ center: c, zoom: z, bearing: 0, pitch: 0 }) }, center, zoom, ui)
  await settle(page)
}
const shot = (page, name, q = 90) => page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: q })
/** Bounding box of the first element matching a selector (optionally containing text). */
const rect = (page, sel, text) => page.evaluate((s, t) => {
  const el = [...document.querySelectorAll(s)].find(e => !t || e.textContent.includes(t))
  if (!el) return null
  el.scrollIntoView({ block: 'nearest' })
  const r = el.getBoundingClientRect()
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
}, sel, text ?? null)
/** A tutorial step: screenshot + where the cursor goes + what to say. */
async function step(page, name, sel, text, title, body, opt = {}) {
  await sleep(opt.wait ?? 700)
  const r = sel ? await rect(page, sel, text) : null
  if (sel && !r) console.log(`  ! no element for ${name}: ${sel} ${text ?? ''}`)
  await shot(page, `tut-${name}`)
  meta.steps.push({ img: `tut-${name}.jpg`, target: r, title, body, zoom: opt.zoom ?? 1.6, click: opt.click ?? true })
}
const ui = (page, patch) => page.evaluate(p => Object.assign(window.__ui, p), patch)
/** Open a conversation the way a player does: open Comms, pick the tab, click the card (this loads its history). */
async function comms(page, kind, titlePrefix) {
  await page.evaluate(() => { window.__ui.comms = true; window.__ui.room = null })
  await sleep(400)
  const tab = { thread: 0, dm: 1, group: 2 }[kind]
  await page.evaluate(i => document.querySelectorAll('.win .tabs button')[i]?.click(), tab)
  await sleep(400)
  const ok = await page.evaluate(t => {
    const card = [...document.querySelectorAll('.win .list .card')].find(c => !t || c.textContent.includes(t)) ?? document.querySelector('.win .list .card')
    card?.click()
    return !!card
  }, titlePrefix ?? null)
  await sleep(1200)
  return ok
}

// ── the world, as seen by the players ──
const kam = await open(TOK.kam)
const capOf = async page => page.evaluate(() => fetch('/world/provinces.json').then(r => r.json()).then(P => { const c = window.__snap.value.me.capital; return { lat: P[c].lat, lon: P[c].lon, id: c } }))
const kcap = await capOf(kam)
console.log('globe…')
await view(kam, [30, 18], 1.75, { mapMode: 'political', basemap: 'day', showTrade: true, panelOpen: false, selected: null })
await shot(kam, 'globe-day')
for (let i = 0; i < 120; i++) {
  await kam.evaluate(lon => window.__map.jumpTo({ center: [lon, 20], zoom: 1.75 }), -10 + i * 0.75)
  await kam.waitForFunction(() => window.__map.areTilesLoaded(), { timeout: 8000, polling: 50 }).catch(() => {})
  await sleep(30)
  await kam.screenshot({ path: `${OUT}/spin/${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 80 })
}
await view(kam, [50, 25], 2.1, { basemap: 'night' }); await sleep(1200); await shot(kam, 'globe-night')
await view(kam, [52, 28], 3.3, { basemap: 'day', mapMode: 'political' }); await shot(kam, 'gulf')
await view(kam, [kcap.lon + 3, kcap.lat + 1], 3.6, { mapMode: 'political', panelOpen: true }); await shot(kam, 'kamerun-home')
await view(kam, [20, 30], 1.9, { mapMode: 'diplomatic', panelOpen: false }); await shot(kam, 'map-diplomatic')
await view(kam, [12, 45], 2.4, { mapMode: 'blocs' }); await shot(kam, 'map-blocs')

console.log('comms…')
const pac = await open(TOK.pac)
await view(pac, [100, 22], 2.2, { mapMode: 'diplomatic', panelOpen: false })
await comms(pac, 'thread', 'OPEC'); await sleep(1500); await shot(pac, 'comms-opec')
meta.rects.opecMsgs = await rect(pac, '.msgs')
await comms(pac, 'dm'); await sleep(1500); await shot(pac, 'comms-dm')
meta.rects.dmMsgs = await rect(pac, '.msgs')
await comms(pac, 'group', 'Coalition'); await sleep(1500); await shot(pac, 'comms-coalition')
meta.rects.coalMsgs = await rect(pac, '.msgs')
await comms(pac, 'thread', 'Is the Straits'); await sleep(1500); await shot(pac, 'comms-straits')
await comms(pac, 'thread', 'Who keeps'); await sleep(1500); await shot(pac, 'comms-cocoa')
await pac.evaluate(() => { window.__ui.room = null }); await pac.click('.tabs button:nth-child(4)').catch(() => {}); await sleep(900); await shot(pac, 'comms-deals')
await ui(pac, { comms: false })

console.log('government…')
await ui(kam, { gov: 'power', panelOpen: true }); await sleep(1300); await shot(kam, 'gov-power')
meta.rects.hemi = await rect(kam, '.hemi')
meta.rects.polls = await rect(kam, '.cols section')
await ui(kam, { gov: 'overview' }); await sleep(1300); await shot(kam, 'gov-overview')
meta.rects.radar = await rect(kam, '.radar')
await ui(kam, { why: 'productivity' }); await sleep(900); await shot(kam, 'why-growth'); await ui(kam, { why: null })
await ui(kam, { gov: 'dynamics' }); await sleep(1300); await shot(kam, 'gov-dynamics')
await ui(kam, { gov: 'trajectory' }); await sleep(2500); await shot(kam, 'gov-trajectory')
await ui(kam, { gov: 'economic' }); await sleep(1000); await shot(kam, 'gov-economic')
const nor = await open(TOK.nor)
await ui(nor, { gov: 'power' }); await sleep(1300); await shot(nor, 'gov-power-nor')
await ui(nor, { gov: 'foreign' }); await sleep(1300); await shot(nor, 'gov-foreign-nor')
await ui(nor, { gov: null })
await ui(kam, { gov: null })
await kam.evaluate(id => { window.__ui.provinceView = id }, kcap.id); await sleep(3500); await shot(kam, 'province-view'); await ui(kam, { provinceView: null })

// ── tutorial: a newcomer founds a nation, then we follow an established one ──
console.log('tutorial…')
const fresh = await open(null, false)
const spot = await fresh.evaluate(() => fetch('/world/provinces.json').then(r => r.json()).then(P => {
  const owner = window.__snap.value.prov.owner
  const p = P.filter(x => owner[x.id] === -1 && x.terrain !== 'ice' && x.coastal && Math.abs(x.lat + 15) < 15 && x.lon < -35 && x.lon > -75).sort((a, b) => b.pop - a.pop)[0] ?? P.find(x => owner[x.id] === -1 && x.terrain !== 'ice')
  return { id: p.id, lat: p.lat, lon: p.lon, name: p.name }
}))
await view(fresh, [spot.lon + 10, spot.lat + 3], 2.6, { mapMode: 'political' })
await step(fresh, 'found-0', '.found h1', null, 'Welcome to STATES', 'Every new player starts here. The world began on 1 January 1999 and runs live: one game month is one real hour.', { click: false, zoom: 1.2 })
await step(fresh, 'found-1', '.found input', null, 'Name your nation', 'Pick a name, a leader, a motto and a colour. This is how the world will know you.')
const tname = await fresh.evaluate(() => ['Republic of Tutoria', 'Tutoria Free State', 'Commonwealth of Tutoria', 'United Tutoria'].find(n => !window.__snap.value.nations.some(x => x.name === n)))
await fresh.type('.found input', tname, { delay: 30 })
const inputs = await fresh.$$('.found input')
if (inputs[1]) await inputs[1].type('President Ana Paz', { delay: 20 })
if (inputs[2]) await inputs[2].type('Learn by doing', { delay: 20 })
await step(fresh, 'found-2', '.parties', null, 'Choose your party', 'Six parties compete for eight factions. Your party decides which voters forgive you most: Labour, Greens, Liberals, Conservatives, National Front or the Regional League.')
await fresh.evaluate(() => [...document.querySelectorAll('.parties button')][0]?.click())
await ui(fresh, { selected: spot.id })
await sleep(1200)
await step(fresh, 'found-3', '.target', null, 'Pick your homeland', 'Click any unclaimed land on the globe. You inherit its real 1999 data: wealth, schooling, health, institutions, oil, farmland and coastline.')
await step(fresh, 'found-4', '.found .go', null, 'Declare independence', 'Found your state. You get two years of protection from attack and a cheap founding era for reforms.')
await fresh.click('.found .go').catch(() => {})
await fresh.waitForFunction(() => window.__snap.value.me, { timeout: 15000 }).catch(() => console.log('  ! tutorial nation not founded'))
await sleep(2500)
await step(fresh, 'top-1', '.pchip', null, 'Political capital ⚡', 'Every reform, budget cut and provincial decree costs political capital. Approval, legitimacy and a parliamentary majority rebuild it.')
await step(fresh, 'top-2', '.pchip', '🗳', 'Your poll and the next election', 'Your party’s vote share and the months until the next election. Lose it and another party governs you until you win it back.')
await step(fresh, 'acct', '.acct button', null, 'Save your nation', 'Choose a username and password to play the same nation on your phone and computer. Keep the recovery code you’re shown.')
await fresh.close()

// switch to an established nation for the rest of the tour
await ui(kam, { gov: null, comms: false, panelOpen: true })
await view(kam, [kcap.lon + 3, kcap.lat + 1], 3.4, { mapMode: 'political' })
await step(kam, 'gov-0', '.govbtn', null, 'A few years later…', 'This is Kamerun, three years in. The Government button opens every ministry.', { zoom: 1.5 })
await ui(kam, { gov: 'overview' }); await sleep(1300)
await step(kam, 'overview', '.risk', null, 'The risk radar', 'Pressures building up in your nation, ranked by urgency: debt, credit bubbles, ageing, elections, coups, climate. Click one to jump to the fix.')
await step(kam, 'why-0', '.kpi.click', null, 'Ask why', 'Click any headline number to see every force pushing it up or down.')
await ui(kam, { why: 'productivity' }); await sleep(900)
await step(kam, 'why-1', '.why', null, 'Cause and effect', 'Productivity growth, broken down: catch-up potential, the technology frontier, your policies, foreign investment, corruption. Every number in STATES is explained this way.', { click: false, zoom: 1.3 })
await ui(kam, { why: null, gov: 'economic' }); await sleep(1100)
const hover = await kam.$$('.opt')
if (hover[3]) await hover[3].hover()
await step(kam, 'policy', '.opt', null, 'Policies depend on your situation', 'Hover an option to see what it would do here, now: its effects, a note on how it plays out in a country like yours, and its ⚡ cost.', { click: false })
await ui(kam, { gov: 'budget' }); await sleep(1100)
await step(kam, 'budget', '.mand', null, 'Taxes, budget and pensions', 'Set taxes and spending as a share of GDP. Pensions are paid automatically and grow as your population ages.')
await ui(kam, { gov: 'power' }); await sleep(1300)
await step(kam, 'power-1', '.hemi', null, 'Power and elections', 'Live polls and a projected parliament. Short of 50 seats you need coalition partners, and they may walk out.')
await step(kam, 'power-2', '.cb button', null, 'Campaign', 'Spend capital to win over a faction before the vote, or call a snap election while you lead the polls.')
await ui(kam, { gov: 'dynamics' }); await sleep(1300)
await step(kam, 'dynamics', '.card', null, 'Long-term forces', 'Your population now and in 20 years, the credit cycle, where your debt is heading, climate, the energy transition and automation. Policies age: what worked in 1999 can hurt in 2020.')
await ui(kam, { gov: 'trajectory' }); await sleep(2500)
await step(kam, 'trajectory', '.chartbox', null, 'Trajectory', 'Every decision you make is pinned on the charts, with what happened over the next six months. Overlay a rival to compare.')
await ui(kam, { gov: null }); await sleep(600)
await step(kam, 'comms-0', '.wire .comms', null, 'Comms', 'Talk to the world: public café threads, private DMs and group rooms for coalitions and summits.')
await comms(kam, 'thread', 'OPEC'); await sleep(1500)
await step(kam, 'comms-1', '.msgs', null, 'The café', 'Public threads anyone can read and join. Every message shows the nation and the player behind it. Try /nation, /compare or /top.', { click: false, zoom: 1.2 })
await comms(kam, 'dm'); await sleep(1500)
await step(kam, 'comms-2', '.deal-btn', null, 'Make a deal', 'In any DM, propose a treaty: payments, loans, tariff caps, supply contracts, technology, provinces, policy promises, alliances or peace.')
await kam.click('.deal-btn').catch(() => {}); await sleep(900)
await kam.evaluate(() => [...document.querySelectorAll('.ed .btn')].find(b => b.textContent.includes('Add clause'))?.click()); await sleep(500)
await step(kam, 'deal', '.cl', null, 'Treaties are enforced', 'Clauses act on the simulation every month. Break one and the whole world sees it, and your victim gains a just cause for war.')
await ui(kam, { comms: false }); await sleep(500)
await step(kam, 'modes', '.modebar', null, 'Map modes', 'Switch the globe between politics, diplomacy, trade blocs, wealth, industry, resources, unrest and more.')
await kam.evaluate(id => { window.__ui.provinceView = id }, kcap.id); await sleep(3500)
await step(kam, 'province', '.pv-head', null, 'Down to every province', 'Every province runs its own economy. Set local policy, special economic zones and projects, and watch the city grow.', { click: false, zoom: 1.2 })
await ui(kam, { provinceView: null }); await sleep(800)
await step(kam, 'end', '.guide', null, 'Read the guide anytime', 'Everything is in the 📖 Guide. Now go found your state.')

writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 1))
await browser.close()
console.log('done', meta.steps.length, 'tutorial steps')
