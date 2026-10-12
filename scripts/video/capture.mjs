// Captures real footage of the running game (dev server) for the demo video.
// Usage: node scripts/video/capture.mjs http://localhost:4100
import puppeteer from 'puppeteer-core'
import { mkdirSync, existsSync } from 'node:fs'

const base = process.argv[2] ?? 'http://localhost:4100'
const TOKEN = 'demo-video-token-0000000001'
const OUT = 'video/assets'
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
const W = 1920, H = 1080
const sleep = ms => new Promise(r => setTimeout(r, ms))
mkdirSync(`${OUT}/spin`, { recursive: true }); mkdirSync(`${OUT}/city`, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: [`--window-size=${W},${H}`, '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11', '--hide-scrollbars'],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
})

async function open(token) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  if (token) await page.evaluateOnNewDocument(t => localStorage.setItem('states-token', t), token)
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(needMe => window.__map?.style?._loaded && window.__snap?.value && window.__map.getLayer('prov-fill') && (!needMe || window.__snap.value.me), { timeout: 120000 }, !!token)
  await page.evaluate(() => { window.__map.fire('mousedown'); window.__map.stop() })
  return page
}
async function settle(page, ms = 1200) {
  await page.waitForFunction(() => window.__map.areTilesLoaded(), { timeout: 25000, polling: 200 }).catch(() => console.log('  (tiles still loading)'))
  await sleep(ms)
}
async function view(page, center, zoom, ui = {}) {
  await page.evaluate((c, z, u) => { Object.assign(window.__ui, u); window.__map.jumpTo({ center: c, zoom: z, bearing: 0, pitch: 0 }) }, center, zoom, ui)
  await settle(page)
}
const shot = (page, name, q = 88) => page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: q })

// ── the player's view ──
const page = await open(TOKEN)
const me = await page.evaluate(() => { const s = window.__snap.value; const P = s.me; return P ? { capital: P.capital, name: P.name } : null })
if (!me) throw new Error('demo nation not found — run seed.mjs first')
const cap = await page.evaluate(id => fetch('/world/provinces.json').then(r => r.json()).then(P => ({ lat: P[id].lat, lon: P[id].lon })), me.capital)
console.log('nation', me.name, 'capital', cap)

await view(page, [112, 24], 1.75, { mapMode: 'political', basemap: 'day', showTrade: true, panelOpen: true, selected: null })
await shot(page, 'globe-political')
console.log('globe spin…')
for (let i = 0; i < 150; i++) {
  await page.evaluate(lon => window.__map.jumpTo({ center: [lon, 22], zoom: 1.7 }), 40 + i * 0.6)
  await page.waitForFunction(() => window.__map.areTilesLoaded(), { timeout: 8000, polling: 50 }).catch(() => {})
  await sleep(40)
  await page.screenshot({ path: `${OUT}/spin/${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 82 })
}
await view(page, [100, 28], 2.15, { basemap: 'night' }); await sleep(1500); await shot(page, 'globe-night')
await view(page, [15, 15], 1.8, { basemap: 'day', mapMode: 'wealth' }); await shot(page, 'map-wealth')
await view(page, [60, 30], 1.9, { mapMode: 'industry' }); await shot(page, 'map-industry')
await view(page, [90, 25], 1.9, { mapMode: 'blocs' }); await shot(page, 'map-blocs')
await view(page, [cap.lon + 2, cap.lat], 2.4, { mapMode: 'diplomatic' }); await shot(page, 'map-diplomatic')
await view(page, [8, 48.5], 4.6, { mapMode: 'political' }); await shot(page, 'europe-cities')
await view(page, [cap.lon, cap.lat - 0.5], 4.6, { mapMode: 'political', selected: me.capital }); await sleep(800); await shot(page, 'home-close')

console.log('government…')
for (const s of ['overview', 'budget', 'economy', 'foreign', 'indices', 'society', 'territories', 'culture', 'defense', 'world']) {
  await page.evaluate(sec => { window.__ui.gov = sec }, s)
  await sleep(900)
  await shot(page, `gov-${s}`)
}
await page.evaluate(() => { window.__ui.gov = null; window.__ui.selected = null })

console.log('province view…')
await page.evaluate(id => { window.__ui.provinceView = id }, me.capital)
await sleep(3500)
await shot(page, 'province-view')
for (let i = 0; i < 120; i++) {
  await page.screenshot({ path: `${OUT}/city/${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 85 })
  await sleep(25)
}
await page.evaluate(() => { window.__ui.provinceView = null })

// ── a newcomer choosing a homeland ──
console.log('founding screen…')
const fresh = await open(null)
const lagos = await fresh.evaluate(() => fetch('/world/provinces.json').then(r => r.json()).then(P => {
  const owner = window.__snap.value.prov.owner
  const p = P.filter(x => owner[x.id] === -1 && x.terrain !== 'ice').sort((a, b) => ((a.lat - 6.5) ** 2 + (a.lon - 3.4) ** 2) - ((b.lat - 6.5) ** 2 + (b.lon - 3.4) ** 2))[0]
  return { id: p.id, lat: p.lat, lon: p.lon }
}))
await view(fresh, [lagos.lon + 6, lagos.lat + 2], 3.4, { selected: lagos.id, mapMode: 'political' })
await sleep(800)
await shot(fresh, 'found')

await browser.close()
console.log('done')
