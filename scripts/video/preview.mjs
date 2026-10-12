// Renders a contact sheet of key moments of the composition (for checking layout before a full render).
import puppeteer from 'puppeteer-core'
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
const TYPES = { '.html': 'text/html', '.jpg': 'image/jpeg' }
const server = createServer(async (req, res) => {
  const p = normalize(join('video', decodeURIComponent(new URL(req.url, 'http://x').pathname)))
  let body; try { body = await readFile(p) } catch { res.writeHead(404).end(); return }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' }).end(body)
}).listen(4211)
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, defaultViewport: { width: 1920, height: 1080 } })
const page = await b.newPage()
await page.goto('http://localhost:4211/compose.html', { waitUntil: 'networkidle0' })
await page.evaluate(() => window.ready)
const times = (process.argv[2] ?? '2.5,8,15,20,25,29,35,41,48,54,59,63').split(',').map(Number)
for (const t of times) {
  const b64 = await page.evaluate(tt => { window.renderAt(tt); return document.getElementById('c').toDataURL('image/jpeg', 0.8).split(',')[1] }, t)
  await writeFile(`video/preview-${String(t).replace('.', '_')}.jpg`, Buffer.from(b64, 'base64'))
}
await b.close(); server.close()
console.log(times.map(t => `video/preview-${String(t).replace('.', '_')}.jpg`).join(' '))
