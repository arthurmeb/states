// Renders a canvas composition frame-by-frame to MP4, with a synthesised soundtrack built from the
// composition's cue list (window.SFX) — no audio samples needed.
// Usage: node scripts/video/render.mjs --page compose-briefing.html --out public/media/states-trailer.mp4 --bed drone
//        node scripts/video/render.mjs --page compose-tutorial.html --out public/media/states-guide.mp4 --bed pad
import puppeteer from 'puppeteer-core'
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync, mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { extname, join, normalize } from 'node:path'

const opt = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const FPS = Number(opt('--fps', 30)), PAGE = opt('--page', 'compose-briefing.html'), OUT = opt('--out', 'public/media/states-trailer.mp4'), BED = opt('--bed', 'drone')
const ROOT = 'video'
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync)
mkdirSync('public/media', { recursive: true })

const TYPES = { '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png', '.js': 'text/javascript', '.json': 'application/json' }
const server = createServer(async (req, res) => {
  const p = normalize(join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)))
  if (!p.startsWith(normalize(ROOT))) { res.writeHead(403).end(); return }
  let body; try { body = await readFile(p) } catch { res.writeHead(404).end(); return }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' }).end(body)
}).listen(4211)

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--window-size=1920,1080', '--force-device-scale-factor=1'], defaultViewport: { width: 1920, height: 1080 } })
const page = await browser.newPage()
await page.goto(`http://localhost:4211/${PAGE}`, { waitUntil: 'networkidle0' })
await page.waitForFunction(() => window.ready, { timeout: 120000 })
const DURATION = await page.evaluate(() => window.DURATION)
const SFX = await page.evaluate(() => window.SFX ?? [])

// ── soundtrack ──
const SR = 48000, N = Math.ceil((DURATION + 0.5) * SR)
const buf = new Float32Array(N)
let s = 7
const noise = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1
const add = (t0, len, f) => { const a = Math.floor(t0 * SR), n = Math.floor(len * SR); for (let i = 0; i < n && a + i < N; i++) if (a + i >= 0) buf[a + i] += f(i / SR) }
if (BED === 'drone') {
  // a low, uneasy bed: detuned A + E fifths, slow swell, a heartbeat that speeds up in the back half
  for (let i = 0; i < N; i++) {
    const t = i / SR, sw = 0.6 + 0.4 * Math.sin(2 * Math.PI * t / 9)
    buf[i] += sw * 0.07 * (Math.sin(2 * Math.PI * 55 * t) + 0.7 * Math.sin(2 * Math.PI * 55.4 * t) + 0.5 * Math.sin(2 * Math.PI * 82.4 * t) + 0.25 * Math.sin(2 * Math.PI * 110.2 * t))
    buf[i] += 0.008 * noise()
  }
  for (let t = 1.5; t < DURATION - 2; ) {
    const beat = t => (u => 0.35 * Math.sin(2 * Math.PI * (52 - 20 * u) * u) * Math.exp(-u / 0.12))(t)
    add(t, 0.4, beat); add(t + 0.22, 0.4, u => 0.6 * beat(u))
    t += t > DURATION * 0.55 ? 0.75 : 1.1
  }
} else {
  // a gentle Am–F–C–G pad for the tutorial
  const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]]
  for (let i = 0; i < N; i++) {
    const t = i / SR, k = Math.floor(t / 8) % 4, e = Math.min(1, (t % 8) * 0.6, (8 - (t % 8)) * 0.8)
    let v = 0
    for (const f of chords[k]) v += Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2 * t)
    buf[i] += v * 0.018 * e * (0.85 + 0.15 * Math.sin(2 * Math.PI * 0.2 * t))
  }
}
for (const c of SFX) {
  const amp = 0.8 + 0.4 * ((c.t * 7919) % 1)
  if (c.k === 'key') add(c.t, 0.05, u => amp * (0.22 * noise() * Math.exp(-u / 0.004) + 0.1 * Math.sin(2 * Math.PI * 1900 * u) * Math.exp(-u / 0.006)))
  else if (c.k === 'stamp') add(c.t, 0.5, u => 0.9 * Math.sin(2 * Math.PI * (90 - 40 * u) * u) * Math.exp(-u / 0.12) + 0.35 * noise() * Math.exp(-u / 0.03))
  else if (c.k === 'static') { let lp = 0; add(c.t, 0.35, u => { lp += 0.35 * (noise() - lp); return 0.16 * lp * Math.min(1, u / 0.02) * Math.max(0, 1 - u / 0.35) }) }
  else if (c.k === 'blip') add(c.t, 0.2, u => 0.12 * Math.sin(2 * Math.PI * (u < 0.08 ? 880 : 1320) * u) * (u < 0.18 ? 1 : 0))
  else if (c.k === 'hit') add(c.t, 2.4, u => 0.8 * Math.sin(2 * Math.PI * (48 - 14 * u) * u) * Math.exp(-u / 0.7) + 0.15 * noise() * Math.exp(-u / 0.15))
  else if (c.k === 'drone') add(c.t, 3, u => 0.18 * Math.sin(2 * Math.PI * 41 * u) * Math.min(1, u / 1.2) * Math.exp(-u / 2.5))
  else if (c.k === 'click') add(c.t, 0.06, u => 0.25 * Math.sin(2 * Math.PI * 2400 * u) * Math.exp(-u / 0.008) + 0.08 * noise() * Math.exp(-u / 0.003))
  else if (c.k === 'whoosh') { let lp = 0; add(c.t, 0.6, u => { lp += 0.08 * (noise() - lp); return 0.25 * lp * Math.sin(Math.PI * u / 0.6) }) }
}
let peak = 0
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(buf[i]))
const gain = 0.89 / (peak || 1)
const wav = Buffer.alloc(44 + N * 2)
wav.write('RIFF', 0); wav.writeUInt32LE(36 + N * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(N * 2, 40)
for (let i = 0; i < N; i++) wav.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(buf[i] * gain * 32767))), 44 + i * 2)
const WAV = `video/${PAGE.replace('.html', '')}.wav`
await writeFile(WAV, wav)
console.log(`soundtrack: ${SFX.length} cues, ${DURATION.toFixed(1)} s`)

// ── video ──
const frames = Math.round(DURATION * FPS)
const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-i', WAV,
  '-filter:a', `afade=t=in:d=0.5,afade=t=out:st=${(DURATION - 2).toFixed(2)}:d=2`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '160k', '-shortest', OUT], { stdio: ['pipe', 'inherit', 'pipe'] })
let ffErr = ''
ff.stderr.on('data', d => { ffErr += d; if (ffErr.length > 20000) ffErr = ffErr.slice(-10000) })
const t0 = Date.now()
for (let f = 0; f < frames; f++) {
  const b64 = await page.evaluate(tt => { window.renderAt(tt); return document.getElementById('c').toDataURL('image/jpeg', 0.92).split(',')[1] }, f / FPS)
  if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await new Promise(r => ff.stdin.once('drain', r))
  if (f % 300 === 0) console.log(`frame ${f}/${frames} (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
}
ff.stdin.end()
const code = await new Promise(r => ff.on('close', r))
await browser.close(); server.close()
if (code !== 0) { console.error(ffErr.slice(-3000)); process.exit(1) }
console.log(`wrote ${OUT} in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
