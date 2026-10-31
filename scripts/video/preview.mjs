// Renders chosen moments of a composition to JPEGs for a quick visual check.
// Usage: node scripts/video/preview.mjs compose-briefing.html 3 10 20 …   (no times = one frame per 5 s)
import puppeteer from 'puppeteer-core'
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'

const PAGE = process.argv[2] ?? 'compose-briefing.html'
const ROOT = 'video'
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
const TYPES = { '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json' }
const server = createServer(async (req, res) => {
  const p = normalize(join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)))
  let body; try { body = await readFile(p) } catch { res.writeHead(404).end(); return }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' }).end(body)
}).listen(4212)
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1920, height: 1080 } })
const page = await browser.newPage()
await page.goto(`http://localhost:4212/${PAGE}`, { waitUntil: 'networkidle0' })
await page.waitForFunction(() => window.ready, { timeout: 120000 })
const D = await page.evaluate(() => window.DURATION)
const times = process.argv.slice(3).map(Number)
const list = times.length ? times : Array.from({ length: Math.floor(D / 5) }, (_, i) => i * 5 + 2.5)
console.log('duration', D.toFixed(1))
for (const t of list) {
  const b64 = await page.evaluate(tt => { window.renderAt(tt); return document.getElementById('c').toDataURL('image/jpeg', 0.8).split(',')[1] }, t)
  await writeFile(`video/preview-${PAGE.replace('.html', '')}-${String(t).replace('.', '_')}.jpg`, Buffer.from(b64, 'base64'))
}
await browser.close(); server.close()
console.log('wrote', list.length, 'previews')
