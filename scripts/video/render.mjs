// Renders video/compose.html frame-by-frame into public/media/states-demo.mp4
// Usage: node scripts/video/render.mjs [--fps 30] [--from 0] [--to 66]
import puppeteer from 'puppeteer-core'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync, mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { extname, join, normalize } from 'node:path'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d }
const FPS = arg('--fps', 30)
const ROOT = 'video'
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
mkdirSync('public/media', { recursive: true })

// static server so the canvas isn't tainted by file:// images
const TYPES = { '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png', '.js': 'text/javascript' }
const server = createServer(async (req, res) => {
  const p = normalize(join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)))
  if (!p.startsWith(normalize(ROOT))) { res.writeHead(403).end(); return }
  let body; try { body = await readFile(p) } catch { res.writeHead(404).end(); return }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' }).end(body)
}).listen(4210)

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--window-size=1920,1080', '--force-device-scale-factor=1'], defaultViewport: { width: 1920, height: 1080 } })
const page = await browser.newPage()
await page.goto('http://localhost:4210/compose.html', { waitUntil: 'networkidle0' })
await page.waitForFunction(() => window.ready).then(() => page.evaluate(() => window.ready))
const DURATION = await page.evaluate(() => window.DURATION)
const from = arg('--from', 0), to = arg('--to', DURATION)
const frames = Math.round((to - from) * FPS)

// soundtrack: a slow Am–F–C–G pad that swells with each scene (synthesised, no samples)
const k = 'mod(floor(t/8),4)'
const root = `if(eq(${k},0),110,if(eq(${k},1),87.31,if(eq(${k},2),130.81,98)))`
const third = `if(eq(${k},0),1.2,1.26)`
const env = 'min(1,min(mod(t,8)*0.7,(8-mod(t,8))*0.9))'
const tone = (mul, amp) => `${amp}*sin(2*PI*${root}*${mul}*t)`
const pad = `(${[tone(1, 0.35), tone(third, 0.22), tone(1.5, 0.22), tone(2, 0.16), tone(`${third}*2`, 0.08), tone(3, 0.05)].join('+')})*${env}*(0.85+0.15*sin(2*PI*0.25*t))*0.22`
const out = 'public/media/states-demo.mp4'
const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
  '-f', 'lavfi', '-i', `aevalsrc='${pad}':s=48000:d=${(to - from).toFixed(2)}`,
  '-filter:a', `lowpass=f=1400,aecho=0.8:0.7:60|120:0.25|0.15,afade=t=in:d=2.5,afade=t=out:st=${(to - from - 4).toFixed(2)}:d=4`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  '-c:a', 'aac', '-b:a', '160k', '-shortest', out], { stdio: ['pipe', 'inherit', 'pipe'] })
let ffErr = ''
ff.stderr.on('data', d => { ffErr += d; if (ffErr.length > 20000) ffErr = ffErr.slice(-10000) })

const t0 = Date.now()
for (let f = 0; f < frames; f++) {
  const t = from + f / FPS
  const b64 = await page.evaluate(tt => { window.renderAt(tt); return document.getElementById('c').toDataURL('image/jpeg', 0.93).split(',')[1] }, t)
  if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await new Promise(r => ff.stdin.once('drain', r))
  if (f % 150 === 0) console.log(`frame ${f}/${frames} (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
}
ff.stdin.end()
const code = await new Promise(r => ff.on('close', r))
await browser.close(); server.close()
if (code !== 0) { console.error(ffErr.slice(-3000)); process.exit(1) }
console.log(`wrote ${out} in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
